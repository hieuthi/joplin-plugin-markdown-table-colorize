// Basing on Markdown-it code for table parsion
function isSpace(code) {
	switch (code) {
		case 0x09:
		case 0x20:
			return true;
	}
	return false;
}

function escapedSplit(str) {
	var result = [],
			pos = 0,
			max = str.length,
			ch,
			isEscaped = false,
			lastPos = 0,
			current = '';

	ch  = str.charCodeAt(pos);

	while (pos < max) {
		if (ch === 0x7c/* | */) {
			if (!isEscaped) {
				// pipe separating cells, '|'
				result.push(current + str.substring(lastPos, pos));
				current = '';
				lastPos = pos + 1;
			} else {
				// escaped pipe, '\|'
				current += str.substring(lastPos, pos - 1);
				lastPos = pos;
			}
		}

		isEscaped = (ch === 0x5c/* \ */);
		pos++;
		ch = str.charCodeAt(pos);
	}

	result.push(current + str.substring(lastPos));
	return result;
}

function calcState(line) {
	ret = {src: line, bMark:0, eMark: 0, tShift:0, sCount: 0 };
	s = ret.src;
	indent_found = false;
	for (start = pos = indent = offset = 0, len = s.length; pos < len; pos++) {
		ch = s.charCodeAt(pos);

		if (!indent_found) {
			if (isSpace(ch)) {
				indent++;

				if (ch === 0x09) {
					offset += 4 - offset % 4;
				} else {
					offset++;
				}
				continue;
			} else {
				indent_found = true;
			}
		}

		if (ch === 0x0A || pos === len - 1) {
			if (ch !== 0x0A) { pos++; }
			ret.bMark  = start;
			ret.eMark  = pos;
			ret.tShift = indent;
			ret.sCount = offset;

			indent_found = false;
			indent = 0;
			offset = 0;
			start = pos + 1;
		}
	}
	return ret
}



function plugin(CodeMirror) {
	if (CodeMirror.cm6) {
		return;
	}

	CodeMirror.defineOption("mdTableColorize", false, async function(cm, val, old) {
			if (old && old != CodeMirror.Init) {
				cm.off("changes", colorizeTable);
				cm.off("viewportChange", colorizeTable);
				clear(cm);
			}
			if (val) {
				cm.on("changes", colorizeTable);
				cm.on("viewportChange", colorizeTable);
				colorizeTable(cm);
			}
	});

	function clear(cm) {
		if (cm.state.coloredTableMarkers) {cm.state.coloredTableMarkers.forEach(marker => marker.clear())};
		cm.state.coloredTableMarkers = [];
	}

	function colorizeRow(cm, idx, nColumns, lineState = null, rclass = null) {
		var doc = cm.getDoc();
		var ret = [];
		var lineState = lineState == null ? calcState(doc.getLine(idx)) : lineState;
		var rowClass = rclass==null ? "cm-tabcolor-row" : rclass;

		ret.push(doc.markText(CodeMirror.Pos(idx,0), 
													CodeMirror.Pos(idx,lineState.src.length), 
													{className: rowClass}))

		var col = 1;
		var firstChPos = lineState.bMark + lineState.tShift;
		var firstCh = lineState.src.charCodeAt(firstChPos);

		// Handle first column seperately
		var colStart = 0, colEnd = 0;
		if (firstCh === 0x7C/* | */ ) {
			colStart = firstChPos;
			pipeIdx  = lineState.src.substring(colStart+1).indexOf("|");
			colEnd   = (pipeIdx<0) ? lineState.eMark : colStart + pipeIdx + 1 ;
		} else {
			colStart = 0;
			colEnd = lineState.src.indexOf("|");
		}
		ret.push( doc.markText( CodeMirror.Pos(idx,colStart), 
							CodeMirror.Pos(idx,colEnd+1), 
							{className: `cm-tabcolor-col${col}`} ) );
		firstChPos = colStart // So we can mark first character later

		// Dealing with other columns
		while (colEnd < lineState.eMark) {
			col++;
			colStart = colEnd + 1;
			pipeIdx = lineState.src.substring(colStart).indexOf("|");
			colEnd  = (pipeIdx<0) ? colEnd = lineState.eMark -1 : colStart + pipeIdx;
			ret.push(doc.markText( CodeMirror.Pos(idx,colStart), 
							CodeMirror.Pos(idx,colEnd+1), 
							{className: `cm-tabcolor-col${col}`} ));
			if (col >= nColumns ) { break;}
		}

		// Mark all pipes
		for (var i = firstChPos; i < lineState.eMark; i++) {
			const c = lineState.src.charCodeAt(i);
			if (c === 0x7C/* | */ ) {
				ret.push(doc.markText( CodeMirror.Pos(idx,i), 
								CodeMirror.Pos(idx,i+1), 
								{className: `cm-tabcolor-pipe`} ));
			}
		}

		// Mark first and last chars
		ret.push(doc.markText(CodeMirror.Pos(idx,firstChPos), 
													CodeMirror.Pos(idx,firstChPos+1), 
													{className: "cm-tabcolor-firstch"}))
		ret.push(doc.markText(CodeMirror.Pos(idx,colEnd), 
													CodeMirror.Pos(idx,colEnd+1), 
													{className: "cm-tabcolor-lastch"}))
		return ret;
	}


	function colorizeTable(cm) {
		cm.operation(function() {
			clear(cm);

			var range = cm.getViewport();
			var doc   = cm.getDoc();

			var firstLineIdx = doc.firstLine();
			var lastLineIdx  = doc.lastLine();

			var startIdx = range.from;
			var endIdx   = Math.min(range.to,lastLineIdx);

			while (true) {
				var line = doc.getLine(startIdx);
				if (line==null) { return; }
				if (line.indexOf("|") >= 0) {
					startIdx = startIdx - 1;
					if (startIdx <= firstLineIdx) {
						startIdx = firstLineIdx;
						break;
					}
				} else {
					break;
				}
			}

			var nColumns = 0;  
			var currLine = null;
			var line = doc.getLine(startIdx);
			if (line==null) { return; };
			var nextLine = calcState(line);

			for (var idx = startIdx; idx <= endIdx; idx++) {
				currLine = nextLine;
				nextLine = idx < endIdx ? calcState(doc.getLine(idx+1)) : null

				if (nColumns < 1) {
					// Last line, not enough line to form table
					if (nextLine === null) {continue;}
					if (nextLine.sCount >= 4) { continue; }

					var pos = nextLine.bMark + nextLine.tShift;
					if (pos >= nextLine.eMark) { continue; }

					firstCh = nextLine.src.charCodeAt(pos++);
					if (firstCh !== 0x7C/* | */ && firstCh !== 0x2D/* - */ && firstCh !== 0x3A/* : */) { continue; }
					if (pos >= nextLine.eMark) { continue; }

					secondCh = nextLine.src.charCodeAt(pos++);
					if (secondCh !== 0x7C/* | */ && secondCh !== 0x2D/* - */ && secondCh !== 0x3A/* : */ && !isSpace(secondCh)) {
							continue;
					}

					if (firstCh === 0x2D/* - */ && isSpace(secondCh)) { continue; }
					cFlag = false
					while (pos < nextLine.eMark) {
						ch = nextLine.src.charCodeAt(pos);
						if (ch !== 0x7C/* | */ && ch !== 0x2D/* - */ && ch !== 0x3A/* : */ && !isSpace(ch)) {
							cFlag = true;
							break;
						}
						pos++;
					}
					if (cFlag) {continue;}

					lineText = nextLine.src.substr(nextLine.bMark + nextLine.tShift, nextLine.eMark)
					columns = lineText.split('|');
					
					for (i = 0; i < columns.length; i++) {
						t = columns[i].trim();
						if (!t) {
							if (i === 0 || i === columns.length - 1) {
								continue;
							} else {
								nColumns = 0;
								break;
							}
						}
						if (!/^:?-+:?$/.test(t)) { 
							nColumns = 0;
							break;
						}
						nColumns++;
					}

					lineText = currLine.src.substr(currLine.bMark + currLine.tShift, currLine.eMark).trim();
					if (lineText.indexOf('|') === -1 || currLine.sCount >= 4) { 
						nColumns = 0;
						continue;
					}

					columns = escapedSplit(lineText);
					if (columns.length && columns[0] === '') columns.shift();
					if (columns.length && columns[columns.length - 1] === '') columns.pop();
					if (columns.length === 0 || columns.length !== nColumns){
						nColumns = 0;
						continue;
					}
					if (nColumns>0 && idx >= range.from){
						cm.state.coloredTableMarkers=cm.state.coloredTableMarkers.concat(colorizeRow(cm, idx, nColumns, currLine, "cm-tabcolor-header"));
					}
				} else {
					lineText = currLine.src.substr(currLine.bMark + currLine.tShift, currLine.eMark);
					if (lineText.indexOf('|') === -1 || currLine.sCount >= 4) { 
						nColumns = 0;
						continue;
					}
					if (nColumns>0 && idx >= range.from){
						cm.state.coloredTableMarkers=cm.state.coloredTableMarkers.concat(colorizeRow(cm, idx, nColumns, currLine));
					}
				}
			}
		});
	}
}

module.exports = {
	default: function(_context) { 
		return {
			plugin: plugin,
			codeMirrorOptions: { 'mdTableColorize': true },
			assets: function() {
				return [ { name: "tabcolor.css" } ];
			}
		}
	},
}