// Packs the built app (dist/) into worker/static/ so it ships inside the worker
// itself (no separate asset upload needed). Run after `vite build`.
import fs from "fs";
import path from "path";

const out = "worker/static";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json", ".ico": "image/x-icon" };
const TEXT = new Set([".html", ".js", ".css", ".svg", ".webmanifest", ".json"]);
const imports = [], entries = [];
let n = 0;
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    const ext = path.extname(f);
    const name = `f${n++}${TEXT.has(ext) ? ".txt" : ".bin"}`;
    fs.copyFileSync(p, path.join(out, name));
    const url = "/" + path.relative("dist", p).split(path.sep).join("/");
    imports.push(`import ${name.split(".")[0]} from "./${name}";`);
    entries.push(`  ${JSON.stringify(url)}: { body: ${name.split(".")[0]}, type: ${JSON.stringify(TYPES[ext] || "application/octet-stream")}, immutable: ${url.startsWith("/assets/")} },`);
  }
})("dist");
fs.writeFileSync(path.join(out, "index.js"), `${imports.join("\n")}\n\nexport const FILES = {\n${entries.join("\n")}\n};\n`);
console.log(`packed ${n} files`);
