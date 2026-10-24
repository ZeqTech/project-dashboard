import * as vscode from "vscode";
import { Dashboard } from "./dashboard";
import { ProjectStore } from "./store";

export function activate(context: vscode.ExtensionContext): void {
  const store = new ProjectStore(context.globalState);
  const dashboard = new Dashboard(context, store);

  context.subscriptions.push(
    vscode.commands.registerCommand("zeqsProjectDashboard.open", () => {
      dashboard.show();
    })
  );

  // Remember what is open now so it ranks first next time, even if VS Code's own list is unavailable.
  const file = vscode.workspace.workspaceFile;
  if (file?.scheme === "file") void store.touch(file.fsPath);
  else
    for (const f of vscode.workspace.workspaceFolders ?? []) if (f.uri.scheme === "file") void store.touch(f.uri.fsPath);

  const mode = vscode.workspace.getConfiguration("zeqsProjectDashboard").get<string>("showOnStartup", "noFolder");
  const nothingOpen = !vscode.workspace.workspaceFolders?.length && !vscode.workspace.workspaceFile;
  // A window that restored editors, or was opened for a single file, is not waiting for a project.
  const noEditors = !vscode.window.tabGroups.all.some((g) => g.tabs.length > 0);
  if (mode === "always" || (mode === "noFolder" && nothingOpen && noEditors)) dashboard.show();
}

export function deactivate(): void {}
