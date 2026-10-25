// Pure logic with no VS Code dependency, so it can be unit tested.

export interface Tracked {
  lastOpened?: number;
  pinned?: boolean;
  hidden?: boolean;
  note?: string;
}

export interface RecentEntry {
  path: string;
  lastOpened?: number;
}

export interface ProjectInfo {
  path: string;
  name: string;
  kinds: string[];
  branch?: string;
  scripts: string[];
  packageManager?: string;
  exists: boolean;
  pinned: boolean;
  note: string;
  lastOpened?: number;
}

export const NOTE_LIMIT = 2000;

/** Key used to compare paths: forward slashes, no trailing slash, case-folded drive letter. */
export function pathKey(p: string): string {
  let k = p.replace(/\\/g, "/").replace(/\/+$/, "");
  if (/^[a-z]:/i.test(k)) k = k[0].toLowerCase() + k.slice(1);
  return k;
}

export function projectName(p: string): string {
  const last = p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? p;
  return last.replace(/\.code-workspace$/i, "") || p;
}

export interface Listed {
  path: string;
  lastOpened?: number;
  pinned: boolean;
  note: string;
}

/**
 * Combine VS Code's recent list with the entries this extension tracks.
 * Hidden entries are dropped unless pinned. Pinned come first, then newest first.
 */
export function mergeProjects(recent: RecentEntry[], tracked: Record<string, Tracked>, maxUnpinned: number): Listed[] {
  const byKey = new Map<string, Listed>();
  const add = (path: string, lastOpened?: number) => {
    const key = pathKey(path);
    const t = tracked[key] ?? {};
    const existing = byKey.get(key);
    const opened = Math.max(lastOpened ?? 0, t.lastOpened ?? 0, existing?.lastOpened ?? 0) || undefined;
    byKey.set(key, { path: existing?.path ?? path, lastOpened: opened, pinned: !!t.pinned, note: t.note ?? "" });
  };
  recent.forEach((r) => add(r.path, r.lastOpened));
  for (const [key, t] of Object.entries(tracked)) if (!byKey.has(key) && (t.lastOpened || t.pinned)) add(key, t.lastOpened);

  const all = [...byKey.entries()].filter(([key, p]) => p.pinned || !tracked[key]?.hidden).map(([, p]) => p);
  const newest = (a: Listed, b: Listed) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0);
  const pinned = all.filter((p) => p.pinned).sort((a, b) => projectName(a.path).localeCompare(projectName(b.path)));
  const rest = all.filter((p) => !p.pinned);
  // VS Code's own list is already newest first; keep that order for entries without a timestamp.
  const order = new Map(recent.map((r, i) => [pathKey(r.path), i]));
  rest.sort((a, b) => newest(a, b) || (order.get(pathKey(a.path)) ?? 1e9) - (order.get(pathKey(b.path)) ?? 1e9));
  return [...pinned, ...rest.slice(0, Math.max(0, maxUnpinned))];
}

const KIND_FILES: [string, string][] = [
  ["package.json", "Node"],
  ["tsconfig.json", "TypeScript"],
  ["Cargo.toml", "Rust"],
  ["go.mod", "Go"],
  ["pyproject.toml", "Python"],
  ["requirements.txt", "Python"],
  ["pom.xml", "Java"],
  ["build.gradle", "Java"],
  ["build.gradle.kts", "Java"],
  ["Gemfile", "Ruby"],
  ["composer.json", "PHP"],
  ["Dockerfile", "Docker"],
  ["docker-compose.yml", "Docker"],
  ["compose.yaml", "Docker"],
  ["CMakeLists.txt", "C/C++"],
  ["project.godot", "Godot"],
  ["tauri.conf.json", "Tauri"],
];

/** Project kinds from the file names found directly in the folder (and in src-tauri/ for Tauri apps). */
export function detectKinds(names: string[]): string[] {
  const set = new Set(names);
  const kinds: string[] = [];
  for (const [file, kind] of KIND_FILES) if (set.has(file) && !kinds.includes(kind)) kinds.push(kind);
  if (names.some((n) => /\.(sln|csproj)$/i.test(n)) && !kinds.includes(".NET")) kinds.push(".NET");
  if (set.has("src-tauri") && !kinds.includes("Tauri")) kinds.push("Tauri");
  // TypeScript implies Node tooling; show the more specific badge only.
  return kinds.includes("TypeScript") ? kinds.filter((k) => k !== "Node") : kinds;
}

export function packageManagerFor(names: string[]): string {
  const set = new Set(names);
  if (set.has("pnpm-lock.yaml")) return "pnpm";
  if (set.has("yarn.lock")) return "yarn";
  if (set.has("bun.lockb") || set.has("bun.lock")) return "bun";
  return "npm";
}

/** Names of the scripts in a package.json source. Returns [] for anything unparseable. */
export function parseScripts(source: string): string[] {
  try {
    const scripts = (JSON.parse(source) as { scripts?: unknown }).scripts;
    if (!scripts || typeof scripts !== "object") return [];
    return Object.entries(scripts as Record<string, unknown>)
      .filter(([name, cmd]) => typeof cmd === "string" && isSafeScriptName(name))
      .map(([name]) => name);
  } catch {
    return [];
  }
}

/** Script names go into a shell command line, so only accept ordinary npm script characters. */
export function isSafeScriptName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9:_.-]*$/.test(name) && name.length <= 80;
}

/** Branch name from the contents of .git/HEAD, or a short hash for a detached HEAD. */
export function parseGitHead(head: string): string | undefined {
  const t = head.trim();
  const m = /^ref:\s*refs\/heads\/(.+)$/.exec(t);
  if (m) return m[1];
  return /^[0-9a-f]{7,40}$/i.test(t) ? t.slice(0, 7) : undefined;
}

/** Target directory from the contents of a `.git` file (worktrees and submodules). */
export function parseGitdirFile(content: string): string | undefined {
  return /^gitdir:\s*(.+)$/m.exec(content)?.[1].trim();
}

export function relativeTime(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [60 * 60, "hour"],
    [60 * 60 * 24, "day"],
    [60 * 60 * 24 * 7, "week"],
    [60 * 60 * 24 * 30, "month"],
    [60 * 60 * 24 * 365, "year"],
  ];
  let best: [number, string] = units[0];
  for (const u of units) if (s >= u[0]) best = u;
  const n = Math.floor(s / best[0]);
  return `${n} ${best[1]}${n === 1 ? "" : "s"} ago`;
}

export function clampNote(text: string): string {
  return text.slice(0, NOTE_LIMIT);
}

// --- agent skills ---------------------------------------------------------------------------------------------

/** Folders that hold skills, relative to the home directory and to each project. Each skill is <dir>/<name>/SKILL.md. */
export const SKILL_DIRS: { dir: string; agent: string }[] = [
  { dir: ".claude/skills", agent: "Claude" },
  { dir: ".agents/skills", agent: "Agents" },
  { dir: ".codex/skills", agent: "Codex" },
];

export interface Skill {
  name: string;
  description: string;
  agent: string;
  /** "Personal" for the home directory, otherwise the project name. */
  scope: string;
  /** Project the skill lives in; absent for personal skills. */
  project?: string;
  file: string;
  dir: string;
}

/** Where a skill would land under `root`: the same agent folder and the same skill folder name. */
export function skillDestination(root: string, skill: Pick<Skill, "agent" | "dir">): string | undefined {
  const agent = SKILL_DIRS.find((d) => d.agent === skill.agent);
  if (!agent) return undefined;
  return [root.replace(/[\\/]+$/, ""), ...agent.dir.split("/"), projectName(skill.dir)].join("/");
}

const unquote = (v: string) => v.replace(/^(["'])(.*)\1$/, "$2");

/** Name and description from the YAML front matter of a SKILL.md. Handles quoted, folded (>) and literal (|) values. */
export function parseSkillHeader(source: string, fallbackName: string): { name: string; description: string } {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const header = text.startsWith("---\n") ? text.slice(4).split(/\n---[ \t]*(?:\n|$)/)[0] : "";
  const lines = header.split("\n");
  const fields: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const parts = /^[>|][+-]?$/.test(m[2].trim()) || m[2].trim() === "" ? [] : [unquote(m[2].trim())];
    // Continuation lines are indented (or blank inside a block scalar).
    while (i + 1 < lines.length && /^([ \t]+\S|[ \t]*$)/.test(lines[i + 1]) && !/^[A-Za-z][\w-]*:/.test(lines[i + 1])) {
      parts.push(lines[++i].trim());
    }
    fields[m[1]] = parts.join(" ").replace(/\s+/g, " ").trim();
  }
  return { name: fields.name || fallbackName, description: fields.description ?? "" };
}
