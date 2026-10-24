import * as crypto from "crypto";
import * as vscode from "vscode";
import css from "./webview/dashboard.css.txt";
import script from "./webview/dashboard.js.txt";
import { clampNote, isSafeScriptName, mergeProjects, pathKey, projectName, ProjectInfo } from "./model";
import { vscodeRecent } from "./recent";
import { scanProject } from "./scan";
import { scanSkills } from "./skills";
import { ProjectStore } from "./store";

function html(): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  return /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style nonce="${nonce}">${css}</style></head>
<body><main class="page">
  <header>
    <div><h1>Dashboard</h1><p class="sub">Pick up where you left off.</p></div>
    <div class="actions">
      <button id="openFolder" class="primary" type="button">Open Folder&hellip;</button>
      <button id="openWorkspace" type="button">Open Workspace&hellip;</button>
      <button id="clone" type="button">Clone Repository&hellip;</button>
    </div>
  </header>
  <div id="tabs" class="tabs" role="tablist" aria-label="Dashboard sections">
    <button id="tab-projects" class="tab" role="tab" aria-selected="true" aria-controls="projects" type="button">Projects</button>
    <button id="tab-skills" class="tab" role="tab" aria-selected="false" aria-controls="skills" type="button">Skills</button>
  </div>
  <div class="toolbar">
    <input id="q" type="search" placeholder="Search projects (press / to focus, Enter to open the first match)" aria-label="Search">
    <button id="toggleAll" class="ghost" type="button">Collapse all</button>
    <div class="seg" role="group" aria-label="Layout">
      <button id="view-tiles" type="button" aria-pressed="true" title="Show as tiles">Tiles</button>
      <button id="view-list" type="button" aria-pressed="false" title="Show as rows">Rows</button>
    </div>
  </div>
  <div id="projects" role="tabpanel" aria-labelledby="tab-projects"></div>
  <div id="skills" class="hidden" role="tabpanel" aria-labelledby="tab-skills"></div>
</main>
<script nonce="${nonce}">${script}</script>
</body></html>`;
}

/** The dashboard tab. One panel at a time; showing it again reveals the existing one. */
export class Dashboard {
  private panel?: vscode.WebviewPanel;
  /** Paths the webview may act on: only what was last listed to it. */
  private known = new Map<string, string>();
  /** SKILL.md files the webview may open, keyed like `known`. */
  private knownSkills = new Map<string, string>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: ProjectStore
  ) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel("zeqsProjectDashboard", "Project Dashboard", vscode.ViewColumn.Active, {
      enableScripts: true,
    });
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "media", "icon.png");
    panel.webview.html = html();
    panel.onDidDispose(() => (this.panel = undefined), null, this.context.subscriptions);
    panel.onDidChangeViewState((e) => e.webviewPanel.visible && void this.refresh(), null, this.context.subscriptions);
    panel.webview.onDidReceiveMessage((m) => this.onMessage(m), null, this.context.subscriptions);
    this.panel = panel;
  }

  async refresh(): Promise<void> {
    if (!this.panel) return;
    const max = vscode.workspace.getConfiguration("zeqsProjectDashboard").get<number>("maxProjects", 30);
    const listed = mergeProjects(await vscodeRecent(), this.store.all(), max);
    this.known = new Map(listed.map((p) => [pathKey(p.path), p.path]));
    const projects: ProjectInfo[] = await Promise.all(
      listed.map(async (p) => ({ ...p, name: projectName(p.path), ...(await scanProject(p.path)) }))
    );
    void this.panel?.webview.postMessage({ type: "projects", projects, now: Date.now() });
  }

  /** Scan personal skills and the skills of every listed project, then send them to the webview. */
  async loadSkills(): Promise<void> {
    if (!this.panel) return;
    if (!this.known.size) await this.refresh();
    const skills = await scanSkills([...this.known.values()]);
    this.knownSkills = new Map(skills.map((s) => [pathKey(s.file), s.file]));
    void this.panel?.webview.postMessage({ type: "skills", skills });
  }

  private async onSkillMessage(m: { type?: string; file?: unknown }): Promise<void> {
    const file = typeof m.file === "string" ? this.knownSkills.get(pathKey(m.file)) : undefined;
    if (!file) return;
    const uri = vscode.Uri.file(file);
    switch (m.type) {
      case "skillOpen":
        await vscode.window.showTextDocument(uri, { preview: false, viewColumn: vscode.ViewColumn.Beside });
        break;
      case "skillReveal":
        await vscode.commands.executeCommand("revealFileInOS", uri);
        break;
      case "skillCopy":
        await vscode.env.clipboard.writeText(file);
        void vscode.window.setStatusBarMessage("Path copied", 2000);
        break;
    }
  }

  /** Resolve a path from the webview to a listed project, or undefined if it is not one. */
  private resolve(raw: unknown): string | undefined {
    return typeof raw === "string" ? this.known.get(pathKey(raw)) : undefined;
  }

  private async onMessage(m: { type?: string; [k: string]: unknown }): Promise<void> {
    try {
      switch (m.type) {
        case "ready":
          return await this.refresh();
        case "openFolder":
          return void (await vscode.commands.executeCommand("workbench.action.files.openFolder"));
        case "openWorkspace":
          return void (await vscode.commands.executeCommand("workbench.action.openWorkspace"));
        case "clone":
          return void (await vscode.commands.executeCommand("git.clone"));
        case "loadSkills":
          return await this.loadSkills();
        case "skillOpen":
        case "skillReveal":
        case "skillCopy":
          return await this.onSkillMessage(m);
      }

      const target = this.resolve(m.path);
      if (!target) return;
      switch (m.type) {
        case "open":
          await this.store.touch(target);
          await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(target), { forceNewWindow: m.newWindow === true });
          break;
        case "pin":
          await this.store.setPinned(target, m.pinned === true);
          await this.refresh();
          break;
        case "hide": {
          // Asked here, not in the webview: confirm() is blocked inside webviews.
          const remove = "Remove";
          const answer = await vscode.window.showWarningMessage(
            `Remove "${projectName(target)}" from the dashboard?`,
            { modal: true, detail: "Your files are not touched. The pin is cleared and the note is kept. Opening the project again adds it back." },
            remove
          );
          if (answer !== remove) break;
          await this.store.hide(target);
          await this.refresh();
          break;
        }
        case "note":
          if (typeof m.text === "string") await this.store.setNote(target, clampNote(m.text));
          break;
        case "reveal":
          await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(target));
          break;
        case "copy":
          await vscode.env.clipboard.writeText(target);
          void vscode.window.setStatusBarMessage("Path copied", 2000);
          break;
        case "run":
          await this.runScript(target, m.script);
          break;
      }
    } catch (e) {
      void vscode.window.showErrorMessage(`Project Dashboard: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Run a package.json script in a new terminal. The name must exist in the project's own package.json. */
  private async runScript(dir: string, script: unknown): Promise<void> {
    if (typeof script !== "string" || !isSafeScriptName(script)) return;
    const scan = await scanProject(dir);
    if (!scan.scripts.includes(script)) return;
    const term = vscode.window.createTerminal({ name: `${projectName(dir)}: ${script}`, cwd: dir });
    term.show();
    term.sendText(`${scan.packageManager ?? "npm"} run ${script}`);
  }
}
