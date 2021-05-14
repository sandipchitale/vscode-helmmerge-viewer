import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Manages webview panels
 */
class HelmMergeViewPanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: HelmMergeViewPanel | undefined;

  private static readonly viewType = 'Helmmerge';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionPath: string;
  private readonly builtAppFolder: string;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionPath: string): HelmMergeViewPanel {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    // If we already have a panel, show it.
    // Otherwise, create Helmmerge panel.
    if (HelmMergeViewPanel.currentPanel) {
      HelmMergeViewPanel.currentPanel.panel.reveal(column);
    } else {
      HelmMergeViewPanel.currentPanel = new HelmMergeViewPanel(extensionPath, column || vscode.ViewColumn.One);
    }
    return HelmMergeViewPanel.currentPanel;
  }

  private constructor(extensionPath: string, column: vscode.ViewColumn) {
    this.extensionPath = extensionPath;
    this.builtAppFolder = 'dist';

    // Create and show a new webview panel
    this.panel = vscode.window.createWebviewPanel(HelmMergeViewPanel.viewType, 'Helmmerge View', column, {
      // Enable javascript in the webview
      enableScripts: true,

      retainContextWhenHidden: true,

      // And restrict the webview to only loading content from our extension's `media` directory.
      localResourceRoots: [vscode.Uri.file(path.join(this.extensionPath, this.builtAppFolder))]
    });

    // Set the webview's initial html content
    this.panel.webview.html = this._getHtmlForWebview();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      (message: any) => {
        switch (message.command) {
          case 'compare':
            compare(message.yamlFileLeft, message.yamlFileRight);
            break;
        }
      },
      null,
      this.disposables
    );

  }

  public dispose() {
    HelmMergeViewPanel.currentPanel = undefined;

    // Clean up our resources
    this.panel.dispose();

    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  /**
   * Returns html of the start page (index.html)
   */
  private _getHtmlForWebview() {
    // path to dist folder
    const appDistPath = path.join(this.extensionPath, 'dist');
    const appDistPathUri = vscode.Uri.file(appDistPath);

    // path as uri
    const baseUri = this.panel.webview.asWebviewUri(appDistPathUri);

    // get path to index.html file from dist folder
    const indexPath = path.join(appDistPath, 'index.html');

    // read index file from file system
    let indexHtml = fs.readFileSync(indexPath, { encoding: 'utf8' });

    // update the base URI tag
    indexHtml = indexHtml.replace('<base href="/">', `<base href="${String(baseUri)}/">`);

    return indexHtml;
  }
}

// // Utility
// const isFile = (fsPath: string) => {
//   try {
//     return fs.statSync(fsPath) && fs.statSync(fsPath).isFile();
//   } catch (e) {
//     return false;
//   }
// };

/**
 * Activates extension
 * @param context vscode extension context
 */
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('vscode-helmmerge-viewer', () => {
      const helmMergeViewPanel = HelmMergeViewPanel.createOrShow(context.extensionPath);
    })
  );
}

interface YamlFile {
  id: number;
  path: string;
  contents: string;
  showWhenSelected: boolean;
  include: boolean;
}

function compare(yamlFileLeft: YamlFile, yamlFileRight: YamlFile) {
  Promise.all([
    vscode.workspace.openTextDocument({
      language: 'yaml',
      content: '# ' + yamlFileLeft.path + '@'  + yamlFileLeft.id  + '\n\n\n' + yamlFileLeft.contents
    }),
    vscode.workspace.openTextDocument({
      language: 'yaml',
      content: '# ' + yamlFileRight.path + '@' + yamlFileRight.id + '\n\n\n' + yamlFileRight.contents
    })
  ])
  .then(yamlFiles => {
      vscode.commands.executeCommand("vscode.diff", yamlFiles[0].uri, yamlFiles[1].uri);
  });
}
