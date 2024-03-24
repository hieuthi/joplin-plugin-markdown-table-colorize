
import { RangeSetBuilder } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';


type DecorationDescription = { from: number, to: number, decoration: Decoration };

function plugin(codeMirrorWrapper: any) {
	if (!codeMirrorWrapper.cm6) return;

	const cellDecorations: Decoration[] = [];
	const getCellDecoration = (level: number) => {
		while (level > cellDecorations.length) {
			cellDecorations.push(Decoration.mark({ class: `cm-tabcolor-col${level}`}));
		}
		return cellDecorations[level - 1]; 
	};
	// Use line decorations for full headers and rows to prevent font styles
	// from overriding more-specific styles set for individual cells.
	const headerDecoration = Decoration.line({ class: 'cm-tabcolor-header' });
	const rowDecoration = Decoration.line({ class: 'cm-tabcolor-row' });
	// Use a mark decoration to avoid changing the background color for the full line.
	const delimiterRowDecoration = Decoration.mark({ class: 'cm-tabcolor-delimiter-row' });

	// See https://codemirror.net/examples/zebra/ for more on decorations in
	// CodeMirror 6.
	const decoratorPlugin = ViewPlugin.fromClass(class {
		public decorations: DecorationSet;

		public constructor(editor: EditorView) {
			this.updateDecorations(editor);
		}

		public update(viewUpdate: ViewUpdate) {
			if (viewUpdate.docChanged || viewUpdate.viewportChanged) {
				this.updateDecorations(viewUpdate.view);
			}
		}

		private updateDecorations(view: EditorView) {
			const decorations: DecorationDescription[] = [];
			// Extends the decoration most recently added to `decorations` to
			// extend to `position`.
			// This is intended to allow extending the previous cell on the current
			// line. As such, decorations on previous lines are ignored.
			const extendPreviousCellToInclude = (position: number) => {
				if (decorations.length > 0) {
					const lastDecoration = decorations[decorations.length - 1];
					const doc = view.state.doc;
					const lastLineNumber = doc.lineAt(lastDecoration.to).number;
					const extendToLineNumber = doc.lineAt(position).number;

					// Only extend the previous decoration if it's for a cell
					// on the same line
					if (lastLineNumber === extendToLineNumber) {
						decorations[decorations.length - 1] = {
							from: lastDecoration.from,
							to: position,
							decoration: lastDecoration.decoration,
						};
					}
				}
			}

			for (const { from, to } of view.visibleRanges) {
				let column = 0;
				let nextCellStart = 0;
				let inRowOrHeader = false;

				type NodeType = { from: number, name: string, to: number };
				let previousNode: NodeType|null = null;

				const addCell = (node: NodeType) => {
					column ++;
					const decoration = getCellDecoration(column);
					decorations.push({
						from: nextCellStart,
						to: node.to,
						decoration,
					});
					nextCellStart = node.to;
				};

				ensureSyntaxTree(view.state, to)
					.iterate({
						from, to,
						enter: node => {
							if (node.name === 'TableRow' || node.name === 'TableHeader') {
								column = 0;
								nextCellStart = node.from;
								inRowOrHeader = true;
							}
							else if (node.name === 'TableDelimiter') {
								// When table cells are empty, TableCells are
								// not reported in the CodeMirror syntax tree
								if (previousNode.name === 'TableDelimiter') {
									addCell(previousNode);
								}
								if (previousNode.name !== 'TableRow' && previousNode.name !== 'TableHeader') {
									extendPreviousCellToInclude(node.to);
									nextCellStart = node.to;
								}
							}
							else if (node.name === 'TableCell') {
								addCell(node);
							}

							// node stores a reference to the current syntax tree node,
							// so we need to copy it:
							previousNode = { from: node.from, name: node.name, to: node.to };
						},
						leave: node => {
							if (node.name === 'TableRow' || node.name === 'TableHeader') {
								extendPreviousCellToInclude(node.to);

								decorations.push({
									// We use a full-line decoration, so use the
									// same from and to:
									from: node.from,
									to: node.from,

									decoration: node.name === 'TableRow' ? rowDecoration : headerDecoration,
								});

								inRowOrHeader = false;
							}
							// The table separator just below the header is a single node
							// with name TableDelimiter. Handle this case:
							else if (node.name === 'TableDelimiter' && !inRowOrHeader) {
								decorations.push({
									from: node.from,
									to: node.to,
									decoration: delimiterRowDecoration,
								});
							}
						},
					});
			}
			// To add to a RangeSetBuilder, decorations need to be sorted
			// first by start position, then by length.
			decorations.sort((a, b) => {
				if (a.from !== b.from) {
					return a.from - b.from;
				}
				return a.to - b.to;
			});

			const decorationBuilder = new RangeSetBuilder<Decoration>();
			for (const decorationSpec of decorations) {
				decorationBuilder.add(decorationSpec.from, decorationSpec.to, decorationSpec.decoration);
			}
			this.decorations = decorationBuilder.finish();
		}
	}, { decorations: extension => extension.decorations });

	codeMirrorWrapper.addExtension([
		decoratorPlugin,
	]);  
}

export default function(_context: any) { 
	return {
		plugin: plugin,
		assets: function() {
			return [ { name: "tabcolor.css" } ];
		}
	}
};