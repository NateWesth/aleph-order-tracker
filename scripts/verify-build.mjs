// Build with the real project config, without esbuild's config-file bundling step.
// Useful in restricted Windows environments; no alternate app/PWA settings to drift.
import { build } from "vite";
import ts from "typescript";
import { readFile } from "node:fs/promises";

const root = process.cwd();
const source = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from\s+(["'])([^"']+)\1/g, (_, quote, specifier) =>
  "from " + JSON.stringify(import.meta.resolve(specifier)));
const module = await import("data:text/javascript;base64," +
  Buffer.from("const __dirname = " + JSON.stringify(root) + ";\n" + compiled).toString("base64"));
const config = typeof module.default === "function"
  ? await module.default({ command: "build", mode: "production", isSsrBuild: false, isPreview: false })
  : module.default;
await build({ ...config, root, configFile: false, mode: "production" });
