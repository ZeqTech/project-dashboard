import * as vscode from "vscode";
import { clampNote, pathKey, Tracked } from "./model";

const KEY = "projects";

/** Per-project state the extension owns: pins, notes, hidden entries and when a project was last opened. */
export class ProjectStore {
  constructor(private readonly state: vscode.Memento) {}

  all(): Record<string, Tracked> {
    return this.state.get<Record<string, Tracked>>(KEY, {});
  }

  private async update(path: string, change: (t: Tracked) => Tracked): Promise<void> {
    const all = { ...this.all() };
    const key = pathKey(path);
    const next = change(all[key] ?? {});
    // Drop entries that carry no information.
    if (!next.lastOpened && !next.pinned && !next.hidden && !next.note) delete all[key];
    else all[key] = next;
    await this.state.update(KEY, all);
  }

  touch(path: string, when = Date.now()): Promise<void> {
    return this.update(path, (t) => ({ ...t, lastOpened: when, hidden: false }));
  }
  setPinned(path: string, pinned: boolean): Promise<void> {
    return this.update(path, (t) => ({ ...t, pinned: pinned || undefined, hidden: pinned ? false : t.hidden }));
  }
  setNote(path: string, note: string): Promise<void> {
    return this.update(path, (t) => ({ ...t, note: clampNote(note).trim() || undefined }));
  }
  hide(path: string): Promise<void> {
    return this.update(path, (t) => ({ ...t, hidden: true, pinned: undefined }));
  }
}
