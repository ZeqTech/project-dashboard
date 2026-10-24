import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { parseSkillHeader, pathKey, projectName, Skill, SKILL_DIRS } from "./model";

/** Only the front matter is needed, so never read more than this from a SKILL.md. */
const HEADER_BYTES = 8 * 1024;

async function readHead(file: string): Promise<string | undefined> {
  const handle = await fs.open(file, "r").catch(() => undefined);
  if (!handle) return undefined;
  try {
    const buf = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buf, 0, HEADER_BYTES, 0);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

async function scanRoot(root: string, scope: string, project?: string): Promise<Skill[]> {
  const out: Skill[] = [];
  for (const { dir, agent } of SKILL_DIRS) {
    const base = path.join(root, ...dir.split("/"));
    const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
    const found = await Promise.all(
      entries.map(async (e): Promise<Skill | undefined> => {
        // Symlinked skill folders are common, so follow them with stat instead of trusting the dirent.
        const skillDir = path.join(base, e.name);
        const st = await fs.stat(skillDir).catch(() => undefined);
        if (!st?.isDirectory()) return undefined;
        const file = path.join(skillDir, "SKILL.md");
        const head = await readHead(file);
        if (head === undefined) return undefined;
        const { name, description } = parseSkillHeader(head, e.name);
        return { name, description, agent, scope, project, file, dir: skillDir };
      })
    );
    out.push(...found.filter((s): s is Skill => !!s));
  }
  return out;
}

/** Personal skills from the home directory plus the skills of every given project, personal first. */
export async function scanSkills(projects: string[]): Promise<Skill[]> {
  const personal = await scanRoot(os.homedir(), "Personal");
  const perProject = await Promise.all(projects.map((p) => scanRoot(p, projectName(p), p)));
  const byName = (a: Skill, b: Skill) => a.name.localeCompare(b.name);
  const all = [...personal.sort(byName), ...perProject.flatMap((list) => list.sort(byName))];
  // A project that is the home directory would otherwise list its skills twice.
  const seen = new Set<string>();
  return all.filter((s) => {
    const key = pathKey(s.file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
