import joplin from 'api';
import { ContentScriptType } from 'api/types';

joplin.plugins.register({
	onStart: async function() {
		console.info('Markdown Table: Colorize started!');
		await joplin.contentScripts.register(
			ContentScriptType.CodeMirrorPlugin,
			'mdTableColorize-cm5',
			'./contentScripts/codeMirror5.js'
		);
		await joplin.contentScripts.register(
			ContentScriptType.CodeMirrorPlugin,
			'mdTableColorize-cm6',
			'./contentScripts/codeMirror6.js'
		);
	},
});
