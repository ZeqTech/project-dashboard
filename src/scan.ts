import * as fs from "fs/promises";
import * as path from "path";
import { detectKinds, packageManagerFor, parseGitdirFile, parseGitHead, parseScripts } from "./model";

export interface Scan {
  exists: boolean;
  kinds: string[];
  branch?: string;
  scripts: string[];
  packageManager?: string;
}

const read = (file: string) => fs.readFile(file, "utf8").catch(() => undefined);

async function gitBranch(dir: string): Promise<string | undefined> {
  const dotGit = path.join(dir, ".git");
  const st = await fs.stat(dotGit).catch(() => undefined);
  if (!st) return undefined;
  let gitDir = dotGit;
  if (st.isFile()) {
    const target = parseGitdirFile((await read(dotGit)) ?? "");
    if (!target) return undefined;
    gitDir = path.resolve(dir, target);
  }
  const head = await read(path.join(gitDir, "HEAD"));
  return head ? parseGitHead(head) : undefined;
}

/** Read what the dashboard shows for a project straight from disk, without opening it in VS Code. */
export async function scanProject(target: string): Promise<Scan> {
  const st = await fs.stat(target).catch(() => undefined);
  if (!st) return { exists: false, kinds: [], scripts: [] };
  if (st.isFile()) return { exists: true, kinds: ["Workspace"], scripts: [] };

  const names = await fs.readdir(target).catch(() => [] as string[]);
  const pkg = names.includes("package.json") ? await read(path.join(target, "package.json")) : undefined;
  const scripts = pkg ? parseScripts(pkg) : [];
  return {
    exists: true,
    kinds: detectKinds(names),
    branch: await gitBranch(target),
    scripts,
    packageManager: scripts.length ? packageManagerFor(names) : undefined,
  };
}
