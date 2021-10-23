import joplin from 'api';
import { ContentScriptType } from 'api/types';

joplin.plugins.register({
	onStart: async function() {
		console.info('Markdown Table: Colorize started!');
		await joplin.contentScripts.register(
			ContentScriptType.CodeMirrorPlugin,
			'mdTableColorize',
			'./mdTableColorize.js'
		);
	},
});
