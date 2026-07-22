/* ============================================================
   FURNITURE CATALOG — 250+ items, generated programmatically
   Each item has: id, name, kind, w, h, price, tier, color, accent,
                  interactable (optional), action (optional)
   Drawing for each `kind` is in graphics.js (drawFurniture).
   ============================================================ */

// Color palettes
const PAL = {
  wood:    ["#7c4a18", "#a16207", "#5b3a17", "#92531c", "#3f2210", "#c08552"],
  fabric:  ["#3b82f6", "#ef4444", "#10b981", "#a855f7", "#ec4899", "#f97316",
            "#eab308", "#06b6d4", "#475569", "#1e293b", "#fef3c7", "#fda4af"],
  metal:   ["#9ca3af", "#6b7280", "#cbd5e1", "#374151", "#fcd34d", "#e5e7eb"],
  stone:   ["#64748b", "#1f2937", "#fafaf9", "#a8a29e"],
  vibrant: ["#f43f5e", "#22d3ee", "#a3e635", "#fb923c", "#c084fc", "#fde047"],
};

let _id = 1;
function nid(prefix) { return `${prefix}_${_id++}`; }

function tierFor(price) {
  if (price < 200) return "common";
  if (price < 800) return "rare";
  return "legendary";
}

const items = [];
function add(item) {
  if (!item.tier) item.tier = tierFor(item.price);
  items.push(item);
}

// ---------- SOFAS (12 colors × 2 sizes × 2 styles ≈ 48) ----------
const sofaStyles = [
  { style: "modern",   nameSuffix: "Modern Sofa" },
  { style: "classic",  nameSuffix: "Classic Sofa" },
];
for (const s of sofaStyles) {
  for (const c of PAL.fabric) {
    for (const sz of [{w:80,h:32,p:180,sn:""},{w:110,h:36,p:280,sn:" XL"}]) {
      add({ id: nid("sofa"), name: capWord(c) + " " + s.nameSuffix + sz.sn,
            kind: "sofa", style: s.style, w: sz.w, h: sz.h, price: sz.p,
            color: c, accent: shade(c, -20) });
    }
  }
}

// ---------- ARMCHAIRS / CHAIRS ----------
for (const c of PAL.fabric) {
  add({ id: nid("armchair"), name: capWord(c) + " Armchair",
        kind: "armchair", w: 50, h: 50, price: 140, color: c, accent: shade(c,-20) });
}
for (const c of PAL.wood) {
  add({ id: nid("chair"), name: capWord(c) + " Wooden Chair",
        kind: "chair", w: 32, h: 32, price: 70, color: c, accent: shade(c,-25) });
}
for (const c of PAL.metal) {
  add({ id: nid("chair"), name: capWord(c) + " Metal Chair",
        kind: "chair", w: 32, h: 32, price: 90, color: c, accent: shade(c,-15) });
}
for (const c of PAL.fabric) {
  add({ id: nid("officechair"), name: capWord(c) + " Office Chair",
        kind: "officechair", w: 36, h: 36, price: 160, color: c, accent: "#1f2937" });
}

// ---------- BEDS ----------
for (const c of PAL.fabric) {
  add({ id: nid("bed"), name: capWord(c) + " Single Bed",
        kind: "bed", w: 60, h: 90, price: 220, color: c, accent: "#fef3c7" });
  add({ id: nid("bed"), name: capWord(c) + " Queen Bed",
        kind: "bed", w: 90, h: 110, price: 380, color: c, accent: "#fef3c7" });
}
add({ id: nid("bed"), name: "Royal Canopy Bed", kind: "canopybed",
      w: 110, h: 130, price: 1500, color: "#7c2d12", accent: "#fcd34d" });

// ---------- TABLES ----------
for (const c of PAL.wood) {
  add({ id: nid("table"), name: capWord(c) + " Coffee Table",
        kind: "table", w: 70, h: 40, price: 110, color: c, accent: shade(c,-20) });
  add({ id: nid("table"), name: capWord(c) + " Dining Table",
        kind: "table", w: 110, h: 60, price: 240, color: c, accent: shade(c,-20) });
  add({ id: nid("roundtable"), name: capWord(c) + " Round Table",
        kind: "roundtable", w: 60, h: 60, price: 180, color: c, accent: shade(c,-20) });
}
add({ id: nid("table"), name: "Glass Coffee Table", kind: "glasstable",
      w: 70, h: 40, price: 320, color: "#bae6fd", accent: "#475569" });
add({ id: nid("table"), name: "Marble Dining Table", kind: "table",
      w: 130, h: 70, price: 900, color: "#fafaf9", accent: "#94a3b8" });

// ---------- DESKS ----------
for (const c of PAL.wood) {
  add({ id: nid("desk"), name: capWord(c) + " Desk",
        kind: "desk", w: 90, h: 50, price: 200, color: c, accent: shade(c,-25) });
}
add({ id: nid("desk"), name: "Gaming Desk RGB", kind: "gamingdesk",
      w: 110, h: 55, price: 750, color: "#0f172a", accent: "#22d3ee", interactable: true, action: "computer" });

// ---------- LAMPS ----------
const lampColors = ["#fde047","#fbbf24","#f59e0b","#fef3c7","#fafaf9","#a3e635"];
for (const c of lampColors) {
  add({ id: nid("floorlamp"), name: capWord(c) + " Floor Lamp",
        kind: "floorlamp", w: 24, h: 60, price: 95, color: "#1f2937", accent: c });
  add({ id: nid("tablelamp"), name: capWord(c) + " Table Lamp",
        kind: "tablelamp", w: 22, h: 30, price: 60, color: "#1f2937", accent: c });
}
add({ id: nid("chandelier"), name: "Crystal Chandelier", kind: "chandelier",
      w: 60, h: 50, price: 1200, color: "#fef3c7", accent: "#fcd34d" });

// ---------- PLANTS ----------
const plants = [
  ["Snake Plant",    50, "#16a34a", "#1e293b"],
  ["Monstera",       80, "#15803d", "#7c4a18"],
  ["Cactus",         60, "#65a30d", "#a16207"],
  ["Bonsai Tree",   150, "#166534", "#7c4a18"],
  ["Rubber Tree",   120, "#15803d", "#1e293b"],
  ["Fern",           70, "#22c55e", "#7c4a18"],
  ["Succulent",      40, "#84cc16", "#a16207"],
  ["Bird of Paradise",200,"#16a34a", "#1e293b"],
  ["Palm Tree",     180, "#15803d", "#7c4a18"],
  ["Money Tree",    300, "#22c55e", "#fcd34d"],
];
for (const [n,p,c,a] of plants) {
  add({ id: nid("plant"), name: n, kind: "plant", w: 30, h: 40, price: p, color: c, accent: a });
}

// ---------- RUGS ----------
for (const c of PAL.fabric) {
  add({ id: nid("rug"), name: capWord(c) + " Rug",
        kind: "rug", w: 100, h: 70, price: 90, color: c, accent: shade(c,-30) });
  add({ id: nid("rug"), name: capWord(c) + " Large Rug",
        kind: "rug", w: 160, h: 110, price: 180, color: c, accent: shade(c,-30) });
}
add({ id: nid("rug"), name: "Persian Rug", kind: "persianrug",
      w: 140, h: 95, price: 800, color: "#7f1d1d", accent: "#fcd34d" });

// ---------- TVS / ELECTRONICS ----------
for (const sz of [{w:60,h:18,p:280,n:"32\" TV"},{w:90,h:22,p:500,n:"55\" TV"},{w:130,h:28,p:1000,n:"75\" TV"}]) {
  add({ id: nid("tv"), name: sz.n, kind: "tv", w: sz.w, h: sz.h, price: sz.p,
        color: "#0f172a", accent: "#0ea5e9", interactable: true, action: "tv" });
}
add({ id: nid("computer"), name: "Desktop PC", kind: "computer",
      w: 40, h: 40, price: 600, color: "#0f172a", accent: "#22d3ee", interactable: true, action: "computer" });
add({ id: nid("speaker"), name: "Floor Speaker", kind: "speaker",
      w: 22, h: 40, price: 220, color: "#1f2937", accent: "#f43f5e" });
add({ id: nid("speaker"), name: "Bookshelf Speaker", kind: "speaker",
      w: 18, h: 26, price: 140, color: "#1f2937", accent: "#94a3b8" });

// ---------- PAINTINGS / WALL ART ----------
const artNames = ["Sunset","Mountain View","Abstract Storm","Ocean Waves","City Lights",
                  "Forest Path","Starry Night","Modern Squares","Portrait","Geometric",
                  "Neon Splash","Vintage Map","Botanical","Skyscraper","Desert","Aurora"];
for (let i = 0; i < artNames.length; i++) {
  const c = PAL.vibrant[i % PAL.vibrant.length];
  add({ id: nid("painting"), name: artNames[i] + " Painting",
        kind: "painting", w: 50, h: 36, price: 200 + i*40, color: c, accent: shade(c,-30) });
}
add({ id: nid("painting"), name: "Mona Lisa Replica", kind: "painting",
      w: 60, h: 80, price: 2000, color: "#854d0e", accent: "#fef3c7" });

// ---------- BOOKSHELVES & STORAGE ----------
for (const c of PAL.wood) {
  add({ id: nid("bookshelf"), name: capWord(c) + " Bookshelf",
        kind: "bookshelf", w: 60, h: 90, price: 240, color: c, accent: "#fef3c7" });
}
add({ id: nid("bookshelf"), name: "Tall Library Shelf", kind: "bookshelf",
      w: 80, h: 130, price: 600, color: "#3f2210", accent: "#fef3c7" });
for (const c of PAL.wood) {
  add({ id: nid("dresser"), name: capWord(c) + " Dresser",
        kind: "dresser", w: 80, h: 40, price: 200, color: c, accent: "#fcd34d" });
  add({ id: nid("wardrobe"), name: capWord(c) + " Wardrobe",
        kind: "wardrobe", w: 70, h: 50, price: 300, color: c, accent: "#1f2937" });
}

// ---------- KITCHEN ----------
for (const c of ["#e5e7eb","#1f2937","#9ca3af","#fcd34d"]) {
  add({ id: nid("fridge"), name: capWord(c) + " Fridge", kind: "fridge",
        w: 45, h: 70, price: 350, color: c, accent: shade(c,-25) });
}
for (const c of ["#1f2937","#e5e7eb","#9ca3af"]) {
  add({ id: nid("stove"), name: capWord(c) + " Stove", kind: "stove",
        w: 50, h: 50, price: 280, color: c, accent: "#ef4444" });
}
for (const c of ["#e5e7eb","#9ca3af"]) {
  add({ id: nid("sink"), name: capWord(c) + " Sink", kind: "sink",
        w: 50, h: 35, price: 180, color: c, accent: "#374151" });
}
add({ id: nid("counter"), name: "Kitchen Counter", kind: "counter",
      w: 100, h: 35, price: 220, color: "#fafaf9", accent: "#475569" });
add({ id: nid("microwave"), name: "Microwave", kind: "microwave",
      w: 35, h: 22, price: 110, color: "#1f2937", accent: "#94a3b8" });
add({ id: nid("toaster"), name: "Toaster", kind: "toaster",
      w: 24, h: 18, price: 60, color: "#9ca3af", accent: "#1f2937" });
add({ id: nid("coffeemachine"), name: "Espresso Machine", kind: "coffeemachine",
      w: 28, h: 32, price: 320, color: "#1f2937", accent: "#fcd34d" });

// ---------- BATHROOM ----------
add({ id: nid("toilet"), name: "Toilet", kind: "toilet", w: 32, h: 42, price: 200, color: "#fafaf9", accent: "#cbd5e1" });
add({ id: nid("bathtub"), name: "Bathtub", kind: "bathtub", w: 90, h: 50, price: 600, color: "#fafaf9", accent: "#0ea5e9" });
add({ id: nid("shower"), name: "Shower Stall", kind: "shower", w: 60, h: 60, price: 500, color: "#bae6fd", accent: "#475569" });
add({ id: nid("sink"), name: "Bathroom Sink", kind: "sink", w: 40, h: 28, price: 150, color: "#fafaf9", accent: "#9ca3af" });
add({ id: nid("mirror"), name: "Wall Mirror", kind: "mirror", w: 36, h: 50, price: 140, color: "#bae6fd", accent: "#fcd34d" });

// ---------- DECOR (vases, candles, statues) ----------
for (const c of PAL.vibrant) {
  add({ id: nid("vase"), name: capWord(c) + " Vase", kind: "vase",
        w: 22, h: 30, price: 80, color: c, accent: shade(c,-30) });
}
for (const c of ["#fef3c7","#fb923c","#dc2626","#a855f7"]) {
  add({ id: nid("candle"), name: capWord(c) + " Candle", kind: "candle",
        w: 16, h: 22, price: 30, color: c, accent: "#fcd34d" });
}
for (const c of ["#fcd34d","#9ca3af","#1f2937","#fafaf9","#a16207","#a855f7"]) {
  add({ id: nid("statue"), name: capWord(c) + " Statue", kind: "statue",
        w: 28, h: 50, price: 350, color: c, accent: shade(c,-30) });
}
add({ id: nid("statue"), name: "Golden Trophy", kind: "trophy",
      w: 24, h: 40, price: 1800, color: "#fcd34d", accent: "#92400e" });

// ---------- INTERACTABLES (give money or buffs) ----------
add({ id: nid("arcade"),   name: "Arcade Cabinet",   kind: "arcade",
      w: 38, h: 60, price: 900, color: "#7c3aed", accent: "#fde047",
      interactable: true, action: "arcade" });
add({ id: nid("jukebox"),  name: "Jukebox",          kind: "jukebox",
      w: 36, h: 56, price: 700, color: "#dc2626", accent: "#fcd34d",
      interactable: true, action: "jukebox" });
add({ id: nid("pooltable"),name: "Pool Table",       kind: "pooltable",
      w: 130, h: 70, price: 1400, color: "#15803d", accent: "#7c4a18",
      interactable: true, action: "pool" });
add({ id: nid("dartboard"),name: "Dart Board",       kind: "dartboard",
      w: 36, h: 36, price: 250, color: "#dc2626", accent: "#fef3c7",
      interactable: true, action: "darts" });
add({ id: nid("fishtank"), name: "Aquarium",         kind: "fishtank",
      w: 70, h: 38, price: 800, color: "#0ea5e9", accent: "#fcd34d",
      interactable: true, action: "fishtank" });
add({ id: nid("fireplace"),name: "Stone Fireplace",  kind: "fireplace",
      w: 80, h: 50, price: 1100, color: "#57534e", accent: "#f97316",
      interactable: true, action: "fireplace" });
add({ id: nid("hottub"),   name: "Hot Tub",          kind: "hottub",
      w: 80, h: 80, price: 2200, color: "#0ea5e9", accent: "#94a3b8",
      interactable: true, action: "hottub" });
add({ id: nid("treadmill"),name: "Treadmill",        kind: "treadmill",
      w: 60, h: 36, price: 600, color: "#1f2937", accent: "#9ca3af",
      interactable: true, action: "treadmill" });
add({ id: nid("piano"),    name: "Grand Piano",      kind: "piano",
      w: 100, h: 70, price: 3000, color: "#0a0a0a", accent: "#fafaf9",
      interactable: true, action: "piano" });
add({ id: nid("vending"),  name: "Vending Machine",  kind: "vending",
      w: 40, h: 60, price: 500, color: "#dc2626", accent: "#fef3c7",
      interactable: true, action: "vending" });
add({ id: nid("safe"),     name: "Personal Safe",    kind: "safe",
      w: 36, h: 36, price: 1200, color: "#1f2937", accent: "#fcd34d",
      interactable: true, action: "safe" });
add({ id: nid("slotmachine"),name:"Mini Slot Machine",kind:"slotmachine",
      w: 30, h: 50, price: 1800, color: "#7c2d12", accent: "#fcd34d",
      interactable: true, action: "miniSlot" });
add({ id: nid("punching"), name: "Punching Bag",     kind: "punching",
      w: 28, h: 50, price: 220, color: "#7c2d12", accent: "#1f2937",
      interactable: true, action: "punching" });
add({ id: nid("xbox"),     name: "Game Console",     kind: "console",
      w: 30, h: 18, price: 450, color: "#0f172a", accent: "#22d3ee",
      interactable: true, action: "console" });
add({ id: nid("clock"),    name: "Grandfather Clock",kind: "grandfatherclock",
      w: 30, h: 90, price: 700, color: "#5b3a17", accent: "#fcd34d" });

// ---------- WINDOWS / MISC ----------
add({ id: nid("curtain"),  name: "Red Curtains",    kind: "curtain", w: 50, h: 90, price: 130, color: "#dc2626", accent: "#fcd34d" });
add({ id: nid("curtain"),  name: "Blue Curtains",   kind: "curtain", w: 50, h: 90, price: 130, color: "#1e40af", accent: "#fef3c7" });
add({ id: nid("curtain"),  name: "Velvet Curtains", kind: "curtain", w: 50, h: 90, price: 280, color: "#7c2d12", accent: "#fcd34d" });
add({ id: nid("globe"),    name: "World Globe",     kind: "globe",   w: 28, h: 36, price: 240, color: "#1d4ed8", accent: "#16a34a" });
add({ id: nid("trash"),    name: "Trash Can",       kind: "trash",   w: 22, h: 30, price: 30, color: "#374151", accent: "#9ca3af" });

// ---------- helpers ----------
function capWord(s) {
  // Translate hex color code to a friendly adjective
  const map = {
    "#3b82f6":"Blue","#ef4444":"Red","#10b981":"Emerald","#a855f7":"Purple",
    "#ec4899":"Pink","#f97316":"Orange","#eab308":"Gold","#06b6d4":"Cyan",
    "#475569":"Slate","#1e293b":"Midnight","#fef3c7":"Cream","#fda4af":"Rose",
    "#7c4a18":"Walnut","#a16207":"Oak","#5b3a17":"Mahogany","#92531c":"Cedar",
    "#3f2210":"Ebony","#c08552":"Birch",
    "#9ca3af":"Steel","#6b7280":"Iron","#cbd5e1":"Silver","#374151":"Gunmetal",
    "#fcd34d":"Brass","#e5e7eb":"Chrome",
    "#64748b":"Granite","#1f2937":"Obsidian","#fafaf9":"Marble","#a8a29e":"Stone",
    "#f43f5e":"Crimson","#22d3ee":"Aqua","#a3e635":"Lime","#fb923c":"Tangerine",
    "#c084fc":"Lavender","#fde047":"Sun","#dc2626":"Ruby","#bae6fd":"Sky",
  };
  return map[s] || "Custom";
}
function shade(hex, amt) {
  // amt -100..100
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 0xff) + amt, b = (n & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

// ---------- Build catalog ----------
const FURNITURE_CATALOG = {};
for (const it of items) FURNITURE_CATALOG[it.id] = it;

window.FURNITURE_CATALOG = FURNITURE_CATALOG;
window.FURNITURE_LIST = items;
console.log(`[furniture] catalog built — ${items.length} items`);
