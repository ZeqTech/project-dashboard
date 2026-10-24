const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node18",
    outfile: "dist/extension.js",
    external: ["vscode"],
    // Webview script and stylesheet are inlined into the page as strings.
    loader: { ".txt": "text" },
    minify: production,
    sourcemap: !production,
    logLevel: "info",
  });
  if (watch) await ctx.watch();
  else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
