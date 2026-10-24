import * as vscode from "vscode";
import { RecentEntry } from "./model";

interface UriParts {
  scheme: string;
  authority?: string;
  path?: string;
  query?: string;
  fragment?: string;
}

interface RecentlyOpened {
  workspaces?: { folderUri?: UriParts; workspace?: { configPath?: UriParts } }[];
}

/**
 * VS Code has no public API for its recent list. The internal command below is what the Open Recent menu uses;
 * if it disappears or changes shape we return nothing and fall back to the projects this extension tracked itself.
 */
export async function vscodeRecent(): Promise<RecentEntry[]> {
  try {
    const result = await vscode.commands.executeCommand<RecentlyOpened>("_workbench.getRecentlyOpened");
    const out: RecentEntry[] = [];
    for (const w of result?.workspaces ?? []) {
      const comps = w.folderUri ?? w.workspace?.configPath;
      if (!comps) continue;
      const uri = vscode.Uri.from(comps);
      if (uri.scheme === "file") out.push({ path: uri.fsPath });
    }
    return out;
  } catch {
    return [];
  }
}
