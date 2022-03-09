// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  NotificationType
} from 'vscode-languageclient/node';

let client: LanguageClient;
const infoNotificationType = new NotificationType(`better-stronger-toml/info`);
const errorNotificationType = new NotificationType(`better-stronger-toml/error`);

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.error('Congratulations, your extension "better-stronger-toml" is now active!');


  let serverModule = context.asAbsolutePath(path.join('dist', 'server.js'));
  let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };
  let serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions
    }
  };

  let clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'toml' }],
    synchronize: {
      fileEvents: [
        vscode.workspace.createFileSystemWatcher('**/*.toml'),
        // FIXME : let the user decide wether or not watch schemas changes
        vscode.workspace.createFileSystemWatcher('**/*.json'),
        vscode.workspace.createFileSystemWatcher('**/*.hjson')
      ]
    }
  };
  client = new LanguageClient(
    'betterStrongerToml',
    'Better Stronger Toml',
    serverOptions,
    clientOptions
  );

  client.onReady().then(() => {
		client.onNotification(infoNotificationType, (event: any) => {
			console.log(event);
		});
    client.onNotification(errorNotificationType, (event: any) => {
			console.error(event);
      vscode.window.showErrorMessage(event);
		});
	});
  client.onTelemetry(x => {
    console.log(x);
  });

  client.start();

  // TODO : add commands here
  // register the command in package.json
  // let disposable = vscode.commands.registerCommand('better-stronger-toml.helloWorld', () => {
  // vscode.languages.registerHoverProvider('toml', { provideHover(document, position, token) { return [ "example" ] } });
  // context.subscriptions.push(disposable);
  
}

// this method is called when your extension is deactivated
export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
