import { describe, expect, it } from "vitest";
import {
  clampNote,
  detectKinds,
  isSafeScriptName,
  mergeProjects,
  NOTE_LIMIT,
  packageManagerFor,
  parseGitdirFile,
  parseGitHead,
  parseScripts,
  parseSkillHeader,
  pathKey,
  projectName,
  relativeTime,
  skillDestination,
} from "./model";

describe("pathKey / projectName", () => {
  it("normalises separators, trailing slash and drive case", () => {
    expect(pathKey("C:\\Programs\\REA\\")).toBe("c:/Programs/REA");
    expect(pathKey("c:/Programs/REA")).toBe("c:/Programs/REA");
  });
  it("names a project from its last segment", () => {
    expect(projectName("C:\\Programs\\REA\\")).toBe("REA");
    expect(projectName("/home/me/app.code-workspace")).toBe("app");
  });
});

describe("mergeProjects", () => {
  it("puts pinned first and the rest newest first", () => {
    const out = mergeProjects(
      [{ path: "/a", lastOpened: 1 }, { path: "/b", lastOpened: 3 }, { path: "/c", lastOpened: 2 }],
      { "/c": { pinned: true } },
      10
    );
    expect(out.map((p) => p.path)).toEqual(["/c", "/b", "/a"]);
  });
  it("keeps VS Code's order when there are no timestamps", () => {
    const out = mergeProjects([{ path: "/x" }, { path: "/y" }, { path: "/z" }], {}, 10);
    expect(out.map((p) => p.path)).toEqual(["/x", "/y", "/z"]);
  });
  it("drops hidden entries but keeps hidden pinned ones", () => {
    const out = mergeProjects(
      [{ path: "/a" }, { path: "/b" }],
      { "/a": { hidden: true }, "/b": { hidden: true, pinned: true } },
      10
    );
    expect(out.map((p) => p.path)).toEqual(["/b"]);
  });
  it("includes tracked projects missing from VS Code's list, matching paths loosely", () => {
    const out = mergeProjects([{ path: "C:\\Dev\\one" }], { "c:/Dev/one": { note: "hi" }, "c:/Dev/two": { lastOpened: 5 } }, 10);
    expect(out.map((p) => p.path)).toEqual(["c:/Dev/two", "C:\\Dev\\one"]);
    expect(out.find((p) => p.path.endsWith("one"))?.note).toBe("hi");
  });
  it("caps unpinned entries only", () => {
    const recent = ["/1", "/2", "/3", "/4"].map((path) => ({ path }));
    const out = mergeProjects(recent, { "/4": { pinned: true } }, 2);
    expect(out.map((p) => p.path)).toEqual(["/4", "/1", "/2"]);
  });
});

describe("detection", () => {
  it("detects kinds and prefers TypeScript over Node", () => {
    expect(detectKinds(["package.json", "tsconfig.json", "src-tauri"])).toEqual(["TypeScript", "Tauri"]);
    expect(detectKinds(["Cargo.toml", "app.csproj"])).toEqual(["Rust", ".NET"]);
    expect(detectKinds(["README.md"])).toEqual([]);
  });
  it("picks the package manager from the lockfile", () => {
    expect(packageManagerFor(["pnpm-lock.yaml", "package-lock.json"])).toBe("pnpm");
    expect(packageManagerFor(["yarn.lock"])).toBe("yarn");
    expect(packageManagerFor(["bun.lockb"])).toBe("bun");
    expect(packageManagerFor(["package.json"])).toBe("npm");
  });
});

describe("scripts", () => {
  it("lists only safe, string-valued scripts", () => {
    const src = JSON.stringify({ scripts: { dev: "vite", "test:unit": "vitest", "bad name": "x", "a;rm": "x", n: 1 } });
    expect(parseScripts(src)).toEqual(["dev", "test:unit"]);
  });
  it("tolerates broken JSON", () => {
    expect(parseScripts("{ nope")).toEqual([]);
    expect(parseScripts("{}")).toEqual([]);
  });
  it("rejects shell metacharacters", () => {
    expect(isSafeScriptName("build")).toBe(true);
    for (const bad of ["a b", "a&b", "$(x)", "-x", "", "a".repeat(81)]) expect(isSafeScriptName(bad)).toBe(false);
  });
});

describe("git", () => {
  it("reads branch names and detached heads", () => {
    expect(parseGitHead("ref: refs/heads/feature/x\n")).toBe("feature/x");
    expect(parseGitHead("0123456789abcdef0123456789abcdef01234567\n")).toBe("0123456");
    expect(parseGitHead("garbage")).toBeUndefined();
  });
  it("follows a .git file", () => {
    expect(parseGitdirFile("gitdir: ../.git/worktrees/x\n")).toBe("../.git/worktrees/x");
    expect(parseGitdirFile("nothing")).toBeUndefined();
  });
});

describe("parseSkillHeader", () => {
  it("reads plain and quoted values", () => {
    const src = "---\nname: my-skill\ndescription: \"Does a thing: well\"\n---\n# Body\n";
    expect(parseSkillHeader(src, "dir")).toEqual({ name: "my-skill", description: "Does a thing: well" });
  });
  it("folds block scalars and plain multi-line values", () => {
    const folded = "---\nname: a\ndescription: >\n  First line\n  second line\nother: x\n---\n";
    expect(parseSkillHeader(folded, "d").description).toBe("First line second line");
    const plain = "---\nname: a\ndescription:\n  wrapped\n  text\n---\n";
    expect(parseSkillHeader(plain, "d").description).toBe("wrapped text");
  });
  it("handles CRLF and a BOM", () => {
    expect(parseSkillHeader("﻿---\r\nname: x\r\ndescription: y\r\n---\r\n", "d")).toEqual({ name: "x", description: "y" });
  });
  it("falls back to the folder name without front matter", () => {
    expect(parseSkillHeader("# Just a heading", "folder")).toEqual({ name: "folder", description: "" });
    expect(parseSkillHeader("---\ndescription: only\n---\n", "folder")).toEqual({ name: "folder", description: "only" });
  });
});

describe("relativeTime / clampNote", () => {
  const now = 1_000_000_000_000;
  it("formats ages", () => {
    expect(relativeTime(now - 5_000, now)).toBe("just now");
    expect(relativeTime(now - 60_000, now)).toBe("1 minute ago");
    expect(relativeTime(now - 3 * 3600_000, now)).toBe("3 hours ago");
    expect(relativeTime(now - 2 * 86400_000, now)).toBe("2 days ago");
    expect(relativeTime(now - 400 * 86400_000, now)).toBe("1 year ago");
  });
  it("limits notes", () => {
    expect(clampNote("x".repeat(NOTE_LIMIT + 50)).length).toBe(NOTE_LIMIT);
  });
});

describe("skillDestination", () => {
  it("keeps the agent folder and skill folder name under the new root", () => {
    const skill = { agent: "Claude", dir: "C:\\work\\app\\.claude\\skills\\my-skill" };
    expect(skillDestination("C:\\Users\\me\\", skill)).toBe("C:\\Users\\me/.claude/skills/my-skill");
    expect(skillDestination("/home/me", { agent: "Codex", dir: "/p/.codex/skills/x" })).toBe("/home/me/.codex/skills/x");
  });
  it("returns nothing for an unknown agent", () => {
    expect(skillDestination("/r", { agent: "Other", dir: "/p/s" })).toBeUndefined();
  });
});
