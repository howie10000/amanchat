// Headless tests for js/item-icons.js (run: node js/item-icons.test.js).
// A stub 2D context records every call; each "canvas" hashes its call log into toDataURL(), so
// determinism is checked on the actual drawing commands, not just on the cache.
"use strict";
const path = require("path");
const ECON = require("./shared/economy.js");
const DEPTHS = require("./shared/depths.js");

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error("FAIL:", msg); } }

// ---- stub canvas ------------------------------------------------------------------------------
function fnv(h, s) { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function makeStubCanvas(px) {
  const cv = { width: px, height: px, _h: 2166136261, _calls: 0 };
  const grad = () => ({ addColorStop(t, c) { if (!(t >= 0 && t <= 1)) throw new Error("bad colour stop " + t); if (typeof c !== "string" || /NaN|undefined/.test(c)) throw new Error("bad colour " + c); } });
  const log = (name, args) => {
    cv._calls++;
    for (const a of args) if (typeof a === "number" && !isFinite(a)) throw new Error(name + " got non-finite arg");
    cv._h = fnv(cv._h, name + ":" + args.map(a => typeof a === "number" ? a.toFixed(3) : typeof a === "string" ? a : typeof a).join(","));
  };
  const target = {
    canvas: cv,
    createLinearGradient: (...a) => { log("lg", a); return grad(); },
    createRadialGradient: (...a) => { log("rg", a); if (a[2] < 0 || a[5] < 0) throw new Error("negative radius"); return grad(); },
    createConicGradient: (...a) => { log("cg", a); return grad(); },
    arc: (...a) => { log("arc", a); if (a[2] < 0) throw new Error("negative arc radius"); },
    ellipse: (...a) => { log("ellipse", a); if (a[2] < 0 || a[3] < 0) throw new Error("negative ellipse radius"); },
    drawImage: (img, ...a) => { if (!img || !img._h) throw new Error("drawImage of non-canvas"); log("drawImage", a.concat([String(img._h)])); },
    measureText: s => ({ width: String(s).length * 6 }),
  };
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === "symbol") return undefined;
      return (...a) => { log(String(k), a); };
    },
    set(t, k, v) {
      if (typeof v === "number" && !isFinite(v)) throw new Error("non-finite " + String(k));
      if (typeof v === "string" && /NaN|undefined/.test(v)) throw new Error("bad style " + String(k) + "=" + v);
      log("set:" + String(k), [typeof v === "object" ? "obj" : v]);
      return true;
    },
  });
  cv.getContext = () => ctx;
  cv.toDataURL = () => "data:image/png;base64,STUB" + (cv._h >>> 0).toString(36) + "x" + cv._calls;
  return cv;
}

// ---- load ------------------------------------------------------------------------------------
global.ECON = ECON; global.DEPTHS = DEPTHS;
const I = require(path.join(__dirname, "item-icons.js"));
ok(I && typeof I.gear === "function" && typeof I.html === "function", "module exports the API");

// Headless without a canvas: everything returns '' and never throws.
I._setCanvasFactory(null);
ok(I.gear("rimefang") === "", "no canvas -> gear() is ''");
ok(I.html("boss", "heart", 32) === "", "no canvas -> html() is ''");
ok(I.box("mat", "dust", 32) === "", "no canvas -> box() is ''");

I._setCanvasFactory(makeStubCanvas);
I._strict(true); // rethrow painter errors so the tests see them

const U = s => typeof s === "string" && s.startsWith("data:image/png");
let n = 0;
const safe = (label, f) => { try { const r = f(); n++; ok(U(r), label + " returned a data URL (" + String(r).slice(0, 30) + ")"); return r; } catch (e) { fail++; console.error("FAIL: " + label + " threw: " + (e && e.stack || e)); return ""; } };

// every base, at every rarity, including uniques and set pieces
for (const b of ECON.GEAR_BASES) {
  for (const r of ECON.GEAR_RARITIES) safe(`gear ${b.id} ${r}`, () => I.gear({ base: b.id, slot: b.slot, lvl: b.lvl || 7, rarity: r, uq: b.unique ? b.id : undefined, set: b.set }, 48));
  safe(`gear ${b.id} by id`, () => I.gear(b.id, 64));
}
// every unique through makeUnique, every set piece through makeSetPiece
for (const id of Object.keys(ECON.GEAR_UNIQUES)) {
  const u = ECON.GEAR_UNIQUES[id];
  const it = ECON.makeUnique(id, u.minRarity || "legendary", u.lvl || 8, ECON.mulberry32(7), {});
  safe(`unique ${id}`, () => I.gear(it, 64));
}
for (const sid of Object.keys(ECON.GEAR_SETS)) for (const sl of ECON.SET_SLOTS) {
  const it = ECON.makeSetPiece(sid, sl, "mythic", ECON.mulberry32(3), {});
  safe(`set ${sid} ${sl}`, () => I.gear(it, 64));
}
// families: every base has a real painter family
const FAM = new Set(["sword", "greatsword", "sabre", "fang", "knives", "axe", "hammer", "mace", "spear", "lance", "trident", "glaive", "scythe", "quill", "staff", "bow",
  "helm", "visor", "horned", "cap", "hood", "mask", "crown", "circlet", "bell", "plate", "mail", "robe", "jerkin", "apron", "carapace", "mantle",
  "trousers", "kilt", "greaves", "tassets", "boots", "band", "gemring", "signet", "twist", "amulet", "eyering", "knuckle", "coil", "keyring"]);
for (const b of ECON.GEAR_BASES) ok(FAM.has(I.family(b.id)), `family for ${b.id} (${I.family(b.id)})`);
ok(Object.keys(I._families).filter(k => ECON.GEAR_BASE_BY_ID[k]).length === ECON.GEAR_BASES.length, "every base has an explicit family entry");
// badges: plus, sockets, gems, runes
safe("plus + sockets", () => I.gear({ base: "rimefang", slot: "weapon", lvl: 10, rarity: "arcane", plus: 12, sockets: 3, gems: ["ruby:5", "rune_storm"] }));
safe("legacy item", () => I.gear({ id: "x", base: "tin_band", slot: "ring", lvl: 1, rarity: "worn", stats: { atk: 1 } }));
safe("unknown base", () => I.gear({ base: "no_such_thing", slot: "helmet", rarity: "epic" }));
safe("tome item via gear()", () => I.gear(ECON.makeTome("storms", ECON.mulberry32(1))));
// materials / gems / runes / tomes
for (const id of ECON.MATERIAL_IDS || Object.keys(ECON.MATERIALS)) safe(`mat ${id}`, () => I.mat(id));
for (const t of ECON.GEM_TYPES) for (let g = 1; g <= ECON.GEM_MAX_GRADE; g++) safe(`gem ${t}:${g}`, () => I.gem(ECON.gemId(t, g)));
for (const r of ECON.RUNE_IDS || Object.keys(ECON.RUNES)) safe(`rune ${r}`, () => I.gem(r));
for (const t of ECON.TOME_ORDER) safe(`tome ${t}`, () => I.tome(t));
// chests (tiers + kinds), keys
for (const t of [0, 1, 2, 3]) safe(`chest tier ${t}`, () => I.chest(t));
for (const k of DEPTHS.CHEST_KINDS) safe(`chest kind ${k}`, () => I.chest(k));
for (const k of ["silver", "gold", "shard", "gilded", "gilded_key"]) safe(`key ${k}`, () => I.key(k));
// bosses (old + new + raid + special), trophies
const bosses = Object.keys(ECON.GUILD_BOSSES);
for (const id of [].concat(ECON.GUILD_BOSS_ORDER, ECON.GUILD_MINIS, ECON.GUILD_RAID_MINIS, ECON.GUILD_SPECIAL_BOSSES)) ok(bosses.includes(id), "boss list id exists " + id);
for (const id of bosses) {
  safe(`boss ${id}`, () => I.boss(id));
  for (const tt of ECON.TROPHY_TIERS) safe(`trophy ${id} ${tt.tier}`, () => I.trophy(id, tt.tier));
}
safe("trophy object arg", () => I.trophy({ boss: "khyra", tier: 3 }));
safe("unknown boss", () => I.boss("nobody"));
// achievements, tiers, frames, cosmetics
for (const a of ECON.ACHIEVEMENTS) safe(`achievement ${a.id}`, () => I.achievement(a.id));
for (const t of Object.keys(ECON.GUILD_DUNGEONS)) safe(`tier ${t}`, () => I.tier(t));
for (const r of ECON.GEAR_RARITIES) safe(`frame ${r}`, () => I.rarityFrame(r));
for (const c of (ECON.COSMETICS.hat || []).filter(h => h.unlock)) safe(`cosmetic ${c.id}`, () => I.cosmetic(c.id));

// ---- determinism + cache -------------------------------------------------------------------
const s0 = I._stats();
const a1 = I.gear({ base: "deep_winter", slot: "weapon", lvl: 10, rarity: "mythic", uq: "deep_winter", plus: 4, sockets: 1, gems: ["diamond:3"] }, 80);
const s1 = I._stats();
const a2 = I.gear({ base: "deep_winter", slot: "weapon", lvl: 10, rarity: "mythic", uq: "deep_winter", plus: 4, sockets: 1, gems: ["diamond:3"] }, 80);
const s2 = I._stats();
ok(a1 === a2, "same item -> same URL");
ok(s1.draws === s0.draws + 1 && s2.draws === s1.draws && s2.hits === s1.hits + 1, "second call is a cache hit");
I.clearCache();
const a3 = I.gear({ base: "deep_winter", slot: "weapon", lvl: 10, rarity: "mythic", uq: "deep_winter", plus: 4, sockets: 1, gems: ["diamond:3"] }, 80);
ok(a3 === a1, "re-render after clearCache is byte-identical (deterministic drawing)");
ok(I.boss("heart", 40) === (I.clearCache(), I.boss("heart", 40)), "boss portrait deterministic");
ok(I.gear("rimefang", 64) !== I.gear("glacier_cleaver", 64), "different bases -> different icons");
ok(I.gear({ base: "rimefang", rarity: "rare" }) !== I.gear({ base: "rimefang", rarity: "arcane" }), "rarity changes the icon");
ok(I.gear({ base: "rimefang", rarity: "epic", plus: 3 }) !== I.gear({ base: "rimefang", rarity: "epic", plus: 4 }), "+N changes the icon");
ok(I.gem("ruby:1") !== I.gem("ruby:5"), "gem grade changes the icon");
ok(I.gear("rimefang", 32) !== I.gear("rimefang", 64), "size is part of the cache key");

// ---- html ---------------------------------------------------------------------------------
const h = I.html("gear", { base: "orrery_blade", rarity: "mythic", uq: "orrery_blade" }, 40, "adIco");
ok(/^<img class="ii ii-gear ii-r-mythic adIco" src="data:image\/png[^"]*" width="40" height="40" alt="[^"]*"/.test(h), "html() gives a classed <img>: " + h.slice(0, 90));
ok(I.html("boss", "concordant", 20).includes("ii-r-arcane"), "special boss gets the arcane class");
ok(I.html("gem", "ruby:3", 16).includes("ii-r-rare"), "gem grade maps to a rarity class");
ok(I.html("chest", 3, 28).includes("ii-r-arcane"), "arcane chest class");
ok(I.html("tier", "guild_rime", 22).includes("ii-tier"), "tier html");
ok(I.html("achievement", "plus_twelve", 28).includes('alt="Perfected"'), "achievement alt text");
ok(I.html("nope", "x", 20) === "", "unknown kind -> ''");
ok(I.html("mat", '"><script>', 16).indexOf("<script>") < 0, "alt/title is escaped");
ok(/^<span class="iiBox ii-r-ancient/.test(I.box("gear", { base: "rimefang", rarity: "ancient" }, 48)), "box() wraps the img");

// ---- a painter bug must not break callers in non-strict mode --------------------------------
I._strict(false);
I._setCanvasFactory(px => { const cv = makeStubCanvas(px); cv.getContext = () => { throw new Error("boom"); }; return cv; });
ok(I.gear({ base: "tin_band", rarity: "rare", plus: 1 }) === "", "a throwing canvas degrades to ''");
I._setCanvasFactory(makeStubCanvas);

console.log(`item-icons: ${pass} passed, ${fail} failed (${n} icons rendered)`);
if (fail) process.exit(1);
