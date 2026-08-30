/* Builds dist/ — the static, hostable WebMCP demo.  [new work — WebMCP Challenge]

   Output is a plain directory of files. No server, no build step for the
   visitor, no runtime dependencies. Drop it on any static host.

   Run:  node build-demo.js
*/
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");

/* Everything the editor needs in the browser. Deliberately explicit: the demo
   should not pick up stray files from a working tree. */
const FILES = [
  "index.html", "app.js", "style.css", "webmcp.js", "static-mode.js",
  "meter-worklet.js", "ruler-worker.js", "favicon.svg", "manifest.json",
];
const DIRS = ["icons", "library"];
const LIBRARY_DIRS = ["sfx", "elements", "svg", "fonts"];

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}
function walkFiles(dir, base, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = base ? base + "/" + e.name : e.name;
    if (e.isDirectory()) walkFiles(full, rel, out);
    else out.push({ name: e.name, rel, size: fs.statSync(full).size });
  }
  return out;
}

rmrf(DIST);
fs.mkdirSync(DIST, { recursive: true });

for (const f of FILES) {
  if (!fs.existsSync(path.join(ROOT, f))) throw new Error("missing " + f);
  fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));
}
for (const d of DIRS) copyDir(path.join(ROOT, d), path.join(DIST, d));

/* The demo timeline, regenerated so dist/ can never drift from its source. */
require("./demo/make-demo-project.js");
fs.mkdirSync(path.join(DIST, "demo"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "demo", "demo-project.json"),
  path.join(DIST, "demo-project.json"));

/* Static stand-ins for GET /api/library?dir=… — same JSON the server returns. */
for (const dir of LIBRARY_DIRS) {
  const items = walkFiles(path.join(ROOT, "library", dir), "", []).map((f) => ({
    name: f.name, rel: f.rel, size: f.size,
    src: "/library/" + dir + "/" + f.rel.split("/").map(encodeURIComponent).join("/"),
  }));
  fs.writeFileSync(path.join(DIST, "demo", "library-" + dir + ".json"),
    JSON.stringify(items));
}

/* static-mode.js must run before app.js so its fetch shim is installed by the
   time connectServer() fires. */
const html = path.join(DIST, "index.html");
let src = fs.readFileSync(html, "utf8");
if (!src.includes('src="static-mode.js"')) {
  src = src.replace('<script src="app.js"></script>',
    '<script src="static-mode.js"></script>\n<script src="app.js"></script>');
  fs.writeFileSync(html, src);
}
if (!src.includes('src="static-mode.js"') || src.indexOf('static-mode.js') > src.indexOf('src="app.js"'))
  throw new Error("static-mode.js is not ordered before app.js in dist/index.html");

/* SPA-style hosts need to be told not to rewrite asset paths. */
fs.writeFileSync(path.join(DIST, "_headers"),
  "/*\n  Cache-Control: public, max-age=300\n");
fs.writeFileSync(path.join(DIST, ".nojekyll"), "");

const count = walkFiles(DIST, "", []).length;
const bytes = walkFiles(DIST, "", []).reduce((n, f) => n + f.size, 0);
console.log("built dist/  " + count + " files, " + (bytes / 1024 / 1024).toFixed(1) + " MB");
console.log("serve it with any static host, e.g.  npx serve dist");
