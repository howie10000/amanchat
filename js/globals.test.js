// Shared-scope collision test.
//
// Every classic <script> in index.html shares ONE global scope. A top-level
// `function refresh()` in two files silently keeps only the last one (that was
// QA-CODE-REVIEW H-1: guild.js's live-refresh called gear.js's refresh); two
// top-level `const`/`let`/`class` of one name throw at load and kill the second
// file outright. This test finds each script's real top-level declarations and
// asserts no name is declared by two scripts.
//
// How a name is proven top-level (no parser dependency): take every
// `function|class|const|let|var NAME` candidate in the file, then compile
// `<file>\nlet NAME;` — V8 raises "already been declared" only when NAME is a
// declaration in that script's top-level scope.
//
// Run: node js/globals.test.js
"use strict";
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "..");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1])
  .filter(s => !/vendor\//.test(s)); // third-party bundles are UMD/IIFE
// Scripts loaded later into the same page (js/sea-assets.js injects them).
for (const lazy of ["js/dungeon-title.js"]) if (fs.existsSync(path.join(root, lazy)) && !scripts.includes(lazy)) scripts.push(lazy);

// Pre-existing duplicates with byte-identical bodies (harmless, not ours to
// touch). Anything else is a failure.
const ALLOWED = new Set(["clamp01", "easeOutCubic"]);

function candidates(src) {
  const names = new Set();
  for (const m of src.matchAll(/\b(?:function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  // destructuring: const { a, b: c } = … / const [x, y] = …
  for (const m of src.matchAll(/\b(?:const|let|var)\s*([{[][^=;]*?[}\]])\s*=/g)) {
    for (const id of m[1].replace(/[\w$]+\s*:/g, "").matchAll(/[A-Za-z_$][\w$]*/g)) names.add(id[0]);
  }
  return names;
}
const compiles = (file, src) => { try { new vm.Script(src, { filename: file }); return null; } catch (e) { return e; } };
function topLevel(file, src) {
  const out = [];
  const e0 = compiles(file, src);
  if (e0) throw new Error(file + " does not compile: " + e0.message);
  for (const name of candidates(src)) {
    const e = compiles(file, src + "\n;let " + name + ";");
    if (!e || !/already been declared/.test(e.message)) continue;
    // `var NAME` may redeclare a function/var but not a const/let/class.
    const lexical = !!compiles(file, src + "\n;var " + name + ";");
    out.push({ name, lexical });
  }
  return out;
}

const owner = new Map(), lexicals = new Map(), sources = new Map();
const dups = [];
let files = 0;
for (const rel of scripts) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  files++;
  const src = fs.readFileSync(file, "utf8");
  sources.set(rel, src);
  for (const { name, lexical } of topLevel(rel, src)) {
    if (lexical) lexicals.set(name, rel);
    if (owner.has(name) && !ALLOWED.has(name)) dups.push(`${name}: ${owner.get(name)} and ${rel}`);
    else if (!owner.has(name)) owner.set(name, rel);
  }
}
if (files < 40) throw new Error("expected to scan index.html's scripts, found only " + files);

// A top-level const/let/class is NOT a property of window: `window.state`
// (QA B1/B2: forge.js, raid-ui.js) is always undefined in the real page.
const viaWindow = [];
for (const [rel, src] of sources) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // `W` counts only where the file aliases window as W.
  const wIsWindow = /\bW\s*=\s*\(?\s*(?:typeof window|window\b)/.test(code);
  for (const m of code.matchAll(/\b(window|globalThis|self|W)\.([A-Za-z_$][\w$]*)\b(?!\s*=[^=])/g)) {
    if (m[1] === "W" && !wIsWindow) continue;
    const name = m[2];
    if (!lexicals.has(name)) continue;
    // `typeof state !== "undefined" ? state : window.state` is a guarded fallback, not a bug.
    const line = code.slice(code.lastIndexOf("\n", m.index) + 1, code.indexOf("\n", m.index));
    if (new RegExp("typeof\\s+" + name.replace(/\$/g, "\\$") + "\\b").test(line)) continue;
    // Files that publish a lexical global onto window themselves are fine.
    const def = sources.get(lexicals.get(name)) || "";
    if (new RegExp("\\b(?:window|globalThis)\\." + name.replace(/\$/g, "\\$") + "\\s*=[^=]").test(def)) continue;
    viaWindow.push(`${rel}: window.${name} (declared with const/let/class in ${lexicals.get(name)})`);
  }
}

let bad = false;
if (dups.length) { bad = true; console.error("Duplicate top-level declarations across index.html scripts:\n  " + dups.join("\n  ")); }
if (viaWindow.length) { bad = true; console.error("Lexical globals read through window (always undefined):\n  " + [...new Set(viaWindow)].join("\n  ")); }
if (bad) process.exit(1);
console.log(`globals.test: OK — ${files} scripts, ${owner.size} top-level names, no collisions, no window.<const> reads`);
