# Zeq's Project Dashboard

A start page for VS Code. When you open VS Code with no folder or workspace, it shows your recent projects so you can jump straight back in. Pin favourites, keep a note for each project, and run a project's `package.json` scripts without opening the folder first.

## Getting started

Install the extension and start VS Code with nothing open. The **Projects** tab opens by itself. You can also open it any time from the Command Palette with **Open Project Dashboard**.

## Features

- **Recent projects:** the folders and workspaces from VS Code's own *Open Recent* list, newest first.
- **Pinned projects:** pin a project with the star and it stays at the top.
- **Project details:** each card shows the git branch (read from `.git/HEAD`, no git process is started), when you last opened it, and badges for what it contains: Node, TypeScript, Rust, Go, Python, .NET, Java, Docker, Tauri, Godot and others.
- **Notes:** a short note per project, saved as you type.
- **Run scripts:** pick a script from the project's `package.json` and run it in a new terminal. The package manager (pnpm, yarn, bun or npm) is chosen from the lockfile.
- **Open and manage:** open in this window or a new window, reveal in the file explorer, copy the path, or remove an entry from the list.
- **Search:** filter by name, path, kind, branch or note. Press `/` to focus the search box and `Enter` to open the first match.
- **Skills tab:** lists the agent skills on your machine, from `~/.claude/skills`, `~/.agents/skills` and `~/.codex/skills` and from the same folders in each listed project, grouped by home folder or project. Each shows its name, description and which agent folder it is in. Each skill carries a **Global** pill (home-folder config, available everywhere) or a **Local** pill (only that project). Search them, open `SKILL.md` beside the dashboard, or copy the path. The ⋮ menu on each skill opens its file location, copies or moves a local skill to the global config, and copies any skill into the folder open in the editor (it asks before replacing an existing one).
- **Tiles or rows:** switch both tabs between a tile grid and compact rows with the actions on the right. On narrow editors the rows stack so nothing is cut off.
- **Collapsible groups:** Pinned, Recent, Personal and each project's skills are groups you can fold with a click, or all at once with **Collapse all** / **Expand all**. Groups are always shown open while you search. Your layout, open tab and folded groups are remembered.
- **Quick actions:** Open Folder, Open Workspace and Clone Repository.
- Follows your VS Code theme and works offline.

A skill is a folder containing a `SKILL.md`. Its name and description come from the YAML front matter at the top of that file; skills without front matter show the folder name and no description. Skills are re-scanned every time you switch to the tab.

Missing folders are dimmed so you can remove them.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `zeqsProjectDashboard.showOnStartup` | `noFolder` | `noFolder` opens the dashboard when VS Code starts with no folder, workspace or editors open. `always` opens it on every start. `never` only opens it from the command. |
| `zeqsProjectDashboard.maxProjects` | `30` | Maximum number of unpinned projects to list. |

## Notes

- Only local folders and `.code-workspace` files are listed. Remote and virtual workspaces are skipped.
- VS Code has no public API for its recent list. The extension reads it through the internal command `_workbench.getRecentlyOpened`. If that ever stops working, the dashboard still lists the projects it has seen you open.
- Pins, notes and removed entries are stored in VS Code's extension storage on your machine. Nothing is sent anywhere.

## Develop

```bash
pnpm install
pnpm run build      # then F5 ("Run Extension")
pnpm test
pnpm run package    # produces a .vsix
```
