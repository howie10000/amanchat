/* item-icons.js - THE ARCANE DEPTHS procedural icon library (owned by the icons agent).
 *
 * window.ItemIcons renders every loot/progression icon on a 2D canvas at >= 2x DPR and hands back a
 * cached PNG data URL. Everything is deterministic (seeded by id) and pure client-side; with no canvas
 * (headless / old browser) every call returns '' so callers fall back to their emoji.
 *
 *   ItemIcons.gear(item|baseId, size=64)        ItemIcons.mat(id)          ItemIcons.gem('ruby:3' | 'rune_storm')
 *   ItemIcons.tome(id)   .chest(tier|kind)       .key('silver'|'gold'|'shard'|'gilded')
 *   ItemIcons.trophy(bossId, tier 1..4)          .achievement(id)           .boss(bossId)   .tier(tierKey)
 *   ItemIcons.rarityFrame(rarity)                .cosmetic(id)
 *   ItemIcons.html(kind, arg, size, extraClass)  -> '<img ...>' string (or '' when no canvas)
 *   ItemIcons.box(kind, arg, size, extraClass)   -> '<span class="iiBox ..."><img></span>' (hover shimmer)
 *
 * Drawing space: every painter works in a 100x100 box; the canvas is scaled to it.
 */
(function (root) {
  "use strict";

  // ------------------------------------------------------------------ utilities
  const EC = () => (root && root.ECON) || null;
  function hash(s) {
    s = String(s);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {
    let a = (typeof seed === "number" ? seed : hash(seed)) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const PI = Math.PI, TAU = PI * 2;
  function hx(c) {
    c = String(c || "#888").replace("#", "");
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    const n = parseInt(c.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toHex(r) { return "#" + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join(""); }
  function mix(a, b, t) { const A = hx(a), B = hx(b); return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
  function al(c, a) { const A = hx(c); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; }
  const lt = (c, t) => mix(c, "#ffffff", t), dk = (c, t) => mix(c, "#000000", t);
  const OUT = "rgba(9,6,14,.94)";

  function lg(c, x0, y0, x1, y1, stops) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    const n = stops.length;
    stops.forEach((s, i) => Array.isArray(s) ? g.addColorStop(s[0], s[1]) : g.addColorStop(n === 1 ? 0 : i / (n - 1), s));
    return g;
  }
  function rg(c, x, y, r0, r1, stops) {
    const g = c.createRadialGradient(x, y, r0, x, y, r1);
    const n = stops.length;
    stops.forEach((s, i) => Array.isArray(s) ? g.addColorStop(s[0], s[1]) : g.addColorStop(n === 1 ? 0 : i / (n - 1), s));
    return g;
  }
  function rr(c, x, y, w, h, r) {
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function circ(c, x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
  function ell(c, x, y, rx, ry, rot) { c.moveTo(x + rx * Math.cos(rot || 0), y + rx * Math.sin(rot || 0)); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function poly(c, pts) { c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); }
  function mirror(c, half) { // half = [x,y,...] right side from top to bottom; mirrored to the left
    const pts = half.slice();
    for (let i = half.length - 2; i >= 0; i -= 2) pts.push(-half[i], half[i + 1]);
    poly(c, pts);
  }
  function star4(c, x, y, r, w) { c.moveTo(x, y - r); c.quadraticCurveTo(x + w, y - w, x + r, y); c.quadraticCurveTo(x + w, y + w, x, y + r); c.quadraticCurveTo(x - w, y + w, x - r, y); c.quadraticCurveTo(x - w, y - w, x, y - r); c.closePath(); }
  function starN(c, x, y, n, r1, r2, rot) {
    for (let i = 0; i < n * 2; i++) { const a = (rot || -PI / 2) + i * PI / n, r = i % 2 ? r2 : r1; i ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.closePath();
  }
  function fillP(c, style, build) { c.beginPath(); build(c); c.fillStyle = style; c.fill(); }
  function strokeP(c, style, lw, build) { c.beginPath(); build(c); c.strokeStyle = style; c.lineWidth = lw; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(); }

  // A shaded part: fill, clipped bevel + scratches, dark outline.
  function part(c, build, fill, o) {
    o = o || {};
    c.beginPath(); build(c); c.fillStyle = fill; c.fill();
    if (o.rn) {
      c.save(); c.beginPath(); build(c); c.clip();
      c.beginPath(); build(c); c.lineWidth = o.bev || 3.2; c.strokeStyle = o.bevc || "rgba(0,0,0,.30)"; c.stroke();
      c.save(); c.translate(-0.9, -0.9); c.beginPath(); build(c); c.lineWidth = 1.3; c.strokeStyle = o.hic || "rgba(255,255,255,.22)"; c.stroke(); c.restore();
      const b = o.box || [-50, -50, 50, 50], n = o.tex == null ? 16 : o.tex, rn = o.rn;
      for (let i = 0; i < n; i++) {
        const x = b[0] + rn() * (b[2] - b[0]), y = b[1] + rn() * (b[3] - b[1]), l = 1 + rn() * 4, a = rn() * PI;
        c.strokeStyle = rn() < 0.5 ? "rgba(255,255,255,.10)" : "rgba(0,0,0,.16)"; c.lineWidth = 0.5;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
      }
      c.restore();
    }
    if (o.lw !== 0) { c.beginPath(); build(c); c.lineJoin = "round"; c.lineWidth = o.lw || 1.5; c.strokeStyle = o.stroke || OUT; c.stroke(); }
  }
  function glowDot(c, x, y, r, col, core) {
    c.fillStyle = rg(c, x, y, 0, r, [al(core || "#ffffff", 1), al(col, 0.85), al(col, 0)]);
    c.beginPath(); circ(c, x, y, r); c.fill();
  }
  function sparkle(c, x, y, r, col) {
    c.fillStyle = al(col || "#ffffff", 0.95); c.beginPath(); star4(c, x, y, r, r * 0.16); c.fill();
    glowDot(c, x, y, r * 0.55, col || "#ffffff");
  }
  // horizontal "cylinder" metal gradient across [x0,x1]
  function metal(c, x0, x1, p) { if (p.length < 4) p = [p[0], p[1], p[2], dk(p[2], 0.5)]; return lg(c, x0, 0, x1, 0, [[0, p[2]], [0.28, p[0]], [0.5, p[1]], [0.78, p[2]], [1, p[3]]]); }
  function metalV(c, y0, y1, p) { if (p.length < 4) p = [p[0], p[1], p[2], dk(p[2], 0.5)]; return lg(c, 0, y0, 0, y1, [[0, p[0]], [0.45, p[1]], [0.8, p[2]], [1, p[3]]]); }
  function gemFill(c, x, y, r, col) { return rg(c, x - r * 0.35, y - r * 0.4, r * 0.1, r * 1.3, [lt(col, 0.75), col, dk(col, 0.55), dk(col, 0.8)]); }
  function gem(c, x, y, r, col, shape) {
    part(c, cc => shape === "d" ? poly(cc, [x, y - r * 1.25, x + r, y, x, y + r * 1.25, x - r, y]) : circ(cc, x, y, r), gemFill(c, x, y, r, col), { lw: 1.1 });
    c.fillStyle = "rgba(255,255,255,.85)"; c.beginPath(); ell(c, x - r * 0.32, y - r * 0.38, r * 0.3, r * 0.18, -0.6); c.fill();
  }
  function bolt(c, x, y, s, col) { part(c, cc => poly(cc, [x + 2 * s, y - 9 * s, x - 4 * s, y + 1 * s, x, y + 1 * s, x - 2 * s, y + 9 * s, x + 5 * s, y - 2 * s, x + 1 * s, y - 2 * s]), col, { lw: 0.9 }); }

  // ------------------------------------------------------------------ canvas plumbing
  let factory = null;
  // CPU-backed canvases: every icon ends in toDataURL, which on a GPU canvas forces a
  // synchronous readback (~10 ms per icon); software canvases encode ~6x faster.
  const CTX2D = { willReadFrequently: true };
  function newCanvas(px) {
    if (factory) return factory(px);
    if (typeof document === "undefined" || !document || !document.createElement) return null;
    const cv = document.createElement("canvas");
    if (!cv || !cv.getContext) return null;
    cv.width = cv.height = px;
    return cv;
  }
  function dpr() { const d = (typeof root.devicePixelRatio === "number" && root.devicePixelRatio) || 1; return Math.min(3, Math.max(2, d)); }
  const cache = new Map();
  const stats = { draws: 0, hits: 0 };
  let strict = false;
  function render(key, size, draw) {
    size = Math.max(8, Math.min(512, Math.round(+size || 64)));
    const k = key + "@" + size;
    if (cache.has(k)) { stats.hits++; return cache.get(k); }
    let url = "";
    try {
      const px = Math.round(size * dpr());
      const cv = newCanvas(px);
      const c = cv && cv.getContext("2d", CTX2D);
      if (c) {
        c.save(); c.scale(px / 100, px / 100);
        draw(c, px, rng(key));
        c.restore();
        url = cv.toDataURL("image/png") || "";
        stats.draws++;
      }
    } catch (e) {
      if (strict) throw e;
      url = "";
    }
    cache.set(k, url);
    return url;
  }
  // Paint `fn` (100-space) on its own layer; return the canvas (or null).
  function layer(px, fn) {
    const cv = newCanvas(px); const c = cv && cv.getContext("2d", CTX2D);
    if (!c) return null;
    c.save(); c.scale(px / 100, px / 100); fn(c); c.restore();
    return cv;
  }
  function tint(src, px, col) {
    const cv = newCanvas(px); const c = cv && cv.getContext("2d", CTX2D);
    if (!c) return null;
    c.drawImage(src, 0, 0); c.globalCompositeOperation = "source-in"; c.fillStyle = col; c.fillRect(0, 0, px, px);
    return cv;
  }
  // Draw an object with a drop shadow, a thick dark outline, a coloured aura and a top-left rim light.
  function composite(c, px, fn, o) {
    o = o || {};
    const L = layer(px, fn);
    if (!L) { fn(c); return; }
    const S = tint(L, px, "#05030a");
    if (o.glow) {
      const G = tint(L, px, o.glow);
      c.save(); c.shadowColor = o.glow; c.shadowBlur = px * (o.blur || 0.07); c.globalAlpha = o.glowA == null ? 0.9 : o.glowA;
      c.drawImage(G, 0, 0, 100, 100); if (o.glowA > 0.6) c.drawImage(G, 0, 0, 100, 100);
      c.restore();
    }
    c.save(); c.globalAlpha = 0.5; c.drawImage(S, 2, 3, 100, 100); c.restore();
    const w = o.ow == null ? 1.25 : o.ow;
    for (let i = 0; i < 8; i++) { const a = i * PI / 4; c.drawImage(S, Math.cos(a) * w, Math.sin(a) * w, 100, 100); }
    if (o.rim) { const R = tint(L, px, o.rim); c.save(); c.globalAlpha = 0.85; c.drawImage(R, -w * 0.75, -w * 0.75, 100, 100); c.restore(); }
    c.drawImage(L, 0, 0, 100, 100);
  }

  // ------------------------------------------------------------------ palettes
  const RARITY = {
    worn: { col: "#94a3b8", glow: "#cbd5e1", st: 0 }, fine: { col: "#22c55e", glow: "#86efac", st: 1 },
    rare: { col: "#3b82f6", glow: "#93c5fd", st: 2 }, epic: { col: "#a855f7", glow: "#d8b4fe", st: 3 },
    legendary: { col: "#fbbf24", glow: "#fde68a", st: 4 }, mythic: { col: "#e879f9", glow: "#f5d0fe", st: 5 },
    ancient: { col: "#2dd4bf", glow: "#99f6e4", st: 6 }, arcane: { col: "#a78bfa", glow: "#c4b5fd", st: 7 },
  };
  const PRISM = ["#f472b6", "#a78bfa", "#38bdf8", "#34d399", "#fde047"];
  function rinfo(r) {
    const E = EC(), base = RARITY[r] || RARITY.fine, info = E && E.GEAR_RARITY_INFO && E.GEAR_RARITY_INFO[r];
    return info ? { col: info.color || base.col, glow: info.glow || base.glow, st: base.st, prism: info.prism } : base;
  }
  const WOOD = ["#c08a52", "#8a5a2e", "#5a3517", "#2c170a"];
  const LEATHER = ["#b7793d", "#7c4a1e", "#4a2a10", "#24130a"];
  // metal: [hi, mid, lo, deep]; trim: [hi, mid, lo]; cloth: [hi, lo]
  const THEMES = {
    1: { metal: ["#d9d4cc", "#948a7e", "#5b5249", "#2b2520"], trim: ["#d8b38a", "#9c6b3c", "#553518"], cloth: ["#a8a29e", "#57534e"], gem: "#a3a3a3", glow: null, motif: null },
    2: { metal: ["#eef2f7", "#a4afbd", "#5b6676", "#262d38"], trim: ["#e5c07b", "#a3742f", "#5a3c14"], cloth: ["#7f8ea3", "#3b4656"], gem: "#60a5fa", glow: null, motif: null },
    3: { metal: ["#f8fafc", "#b8c2cf", "#66717f", "#2a313b"], trim: ["#e9c98f", "#b0823d", "#5f4119"], cloth: ["#65743e", "#2c3419"], gem: "#ef4444", glow: null, motif: null },
    4: { metal: ["#c9f5ec", "#6fb3a6", "#2f6a62", "#0f2d2a"], trim: ["#eccb88", "#a8773a", "#4f3514"], cloth: ["#4d7c3a", "#1d3413"], gem: "#67e8f9", glow: "#22d3ee", motif: "waves" },
    5: { metal: ["#dcd6d0", "#7d746c", "#403933", "#1b1714"], trim: ["#fde28a", "#d98a1a", "#7a3b0c"], cloth: ["#7c4a22", "#3a1f0c"], gem: "#fb923c", glow: "#f97316", motif: "ember" },
    6: { metal: ["#e2d8ff", "#8a76b8", "#3f2d63", "#150c26"], trim: ["#f1dcff", "#b16cf2", "#4c1d95"], cloth: ["#4c2a7a", "#1d0f33"], gem: "#c084fc", glow: "#a855f7", motif: "void" },
    7: { metal: ["#f3c9bd", "#a2513f", "#4d1f17", "#1d0a07"], trim: ["#ffdcae", "#ec6a16", "#7c2d12"], cloth: ["#7f1d1d", "#2d0a0a"], gem: "#fb923c", glow: "#f97316", motif: "ash" },
    8: { metal: ["#e8ecff", "#98a2d8", "#3d3a9c", "#1a1747"], trim: ["#fff4c7", "#e8b90c", "#865012"], cloth: ["#29307a", "#0f1236"], gem: "#fde68a", glow: "#fde68a", motif: "stars" },
    9: { metal: ["#fbe3ff", "#cd8ff7", "#7e22ce", "#35074f"], trim: ["#d4fbff", "#22d3ee", "#0e6a86"], cloth: ["#5b2182", "#240a3a"], gem: "#22d3ee", glow: "#67e8f9", motif: "crystal" },
    10: { metal: ["#f4fbff", "#a9d9f2", "#3d7fb1", "#0d2b49"], trim: ["#ffffff", "#bfe6fb", "#1f6aa3"], cloth: ["#1e4d78", "#0a1d33"], gem: "#5eead4", glow: "#bae6fd", motif: "frost" },
  };
  function theme(lvl) { return THEMES[Math.max(1, Math.min(10, lvl | 0 || 1))]; }
  function pal(t, over) { return Object.assign({}, t, over || {}); }

  // ------------------------------------------------------------------ base -> family + look
  const FAMILY = {
    // weapons
    chipped_sword: "sword", iron_cleaver: "axe", hunters_edge: "sabre", crypt_fang: "fang", emberbrand: "sword", hollow_glaive: "glaive",
    ashen_maw: "axe", brinehook_sabre: "sabre", chapel_maul: "hammer", bellows_hammer: "hammer", rivet_knives: "knives", riftpiercer: "spear",
    sigil_scythe: "scythe", emberwing_lance: "lance", cinderfang: "fang", starwrit_blade: "sword", comet_quill: "quill", orrery_mace: "mace",
    resonant_edge: "sword", shardspitter: "bow", geode_maul: "hammer", rimefang: "greatsword", glacier_cleaver: "axe", oathkeeper_blade: "greatsword",
    tidebreaker: "trident", quenchblade: "sword", polite_knock: "mace", kingsfire: "greatsword", orrery_blade: "sword", eighth_leg: "spear",
    deep_winter: "greatsword", ley_sunderer: "axe",
    warden_vigil_weapon: "trident", emberwright_weapon: "hammer", hollow_regalia_weapon: "staff", ashen_mantle_weapon: "fang",
    starlit_codex_weapon: "quill", choir_of_stone_weapon: "hammer", rimeveil_oath_weapon: "glaive",
    // helmets
    leather_cap: "cap", iron_helm: "helm", warden_visor: "visor", drowned_crown: "crown", forge_mask: "mask", hollow_diadem: "circlet",
    roost_helm: "horned", kelp_hood: "hood", bell_helm: "bell", soot_hood: "hood", crucible_helm: "helm", faceless_veil: "mask",
    keystone_helm: "helm", pyre_crown: "crown", scalebound_helm: "horned", astrolabe_helm: "helm", seers_circlet: "circlet",
    vaultwarden_visor: "visor", prism_helm: "helm", chorus_crown: "crown", bedrock_helm: "helm", frostwarden_helm: "horned",
    rime_mask: "mask", abyssal_helm: "visor", drowned_bell: "bell", sixth_door_crown: "crown", ash_crown: "crown", storm_eye: "hood",
    eclipse_diadem: "circlet", prism_lens: "circlet", broken_ice_crown: "crown",
    warden_vigil_helmet: "visor", emberwright_helmet: "visor", hollow_regalia_helmet: "crown", ashen_mantle_helmet: "horned",
    starlit_codex_helmet: "hood", choir_of_stone_helmet: "crown", rimeveil_oath_helmet: "helm",
    // chest
    padded_vest: "jerkin", iron_chestplate: "plate", bandit_mail: "mail", crypt_plate: "plate", ember_cuirass: "plate", void_carapace: "carapace",
    dragonscale: "plate", barnacle_hauberk: "mail", sexton_coat: "robe", smith_apron: "apron", clinker_plate: "plate", hollowmail: "mail",
    throne_vestments: "robe", wyrmhide: "jerkin", kingsguard_plate: "plate", starchart_robe: "robe", librarians_mail: "mail", folio_plate: "plate",
    amethyst_hauberk: "mail", songweave_vest: "jerkin", bedrock_plate: "plate", floe_cuirass: "plate", drowned_king_coat: "robe", glacier_plate: "plate",
    anvilheart: "plate", choir_heart: "carapace", cinder_egg: "carapace", nexus_mantle: "mantle",
    warden_vigil_chest: "robe", emberwright_chest: "apron", hollow_regalia_chest: "robe", ashen_mantle_chest: "mantle",
    starlit_codex_chest: "robe", choir_of_stone_chest: "carapace", rimeveil_oath_chest: "plate",
    // legs
    cloth_leggings: "trousers", iron_greaves: "greaves", stalker_legs: "boots", tidewalkers: "greaves", slag_greaves: "greaves", throne_legs: "tassets",
    ashen_greaves: "greaves", silt_striders: "boots", ossuary_tassets: "tassets", bellows_kilt: "kilt", tongmail_greaves: "greaves",
    nullstep_greaves: "greaves", doorwarden_legs: "tassets", updraft_greaves: "greaves", ashfall_tassets: "tassets", stacksteppers: "boots",
    ink_greaves: "greaves", lectern_guards: "tassets", crystal_greaves: "greaves", echo_striders: "boots", basalt_tassets: "tassets",
    permafrost_greaves: "greaves", whiteout_striders: "boots", abyss_tassets: "tassets", bellows_of_the_deep: "kilt", last_flight: "greaves",
    frozen_oath: "greaves",
    warden_vigil_legs: "greaves", emberwright_legs: "boots", hollow_regalia_legs: "boots", ashen_mantle_legs: "boots",
    starlit_codex_legs: "boots", choir_of_stone_legs: "greaves", rimeveil_oath_legs: "tassets",
    // rings
    tin_band: "band", signet: "signet", bloodstone: "gemring", drowned_seal: "signet", forge_ring: "gemring", void_loop: "twist",
    dragon_sigil: "signet", undertow_pearl: "amulet", tidebound_band: "band", cinder_coil: "coil", anvil_knuckle: "knuckle",
    sixfold_loop: "twist", door_eye: "eyering", roost_heart: "amulet", talon_signet: "signet", zodiac_ring: "gemring", meteor_signet: "signet",
    binders_loop: "twist", tuning_ring: "gemring", fracture_band: "band", quartz_loop: "twist", frost_signet: "signet", hoarfrost_band: "band",
    abyss_pearl: "amulet", wardens_last_key: "keyring", hollow_loop: "twist", ogre_knuckle: "knuckle", overdue_notice: "signet",
    last_knell: "amulet", heartstring: "amulet", concord_band: "band",
    warden_vigil_ring: "signet", emberwright_ring: "band", hollow_regalia_ring: "signet", ashen_mantle_ring: "eyering",
    starlit_codex_ring: "amulet", choir_of_stone_ring: "gemring", rimeveil_oath_ring: "band",
  };
  // Per-base look tweaks (variant flags passed to the painter).
  const VARIANT = {
    chipped_sword: { chipped: 1 }, emberbrand: { flame: 1 }, ashen_maw: { jag: 1 }, crypt_fang: { bone: 1 }, cinderfang: { flame: 1 },
    starwrit_blade: { runes: 1 }, resonant_edge: { crystal: 1 }, geode_maul: { crystal: 1 }, rimefang: { ice: 1 }, glacier_cleaver: { ice: 1, big: 1 },
    oathkeeper_blade: { runes: 1 }, hollow_glaive: { hollow: 1 }, sigil_scythe: { runes: 1 }, iron_cleaver: { cleaver: 1 },
    quenchblade: { quench: 1 }, kingsfire: { bone: 1, flame: 1 }, orrery_blade: { runes: 1 }, deep_winter: { ice: 1, bone: 1 },
    ley_sunderer: { big: 1, ley: 1 }, eighth_leg: { chitin: 1 }, polite_knock: { knocker: 1 }, orrery_mace: { orrery: 1 },
    dragonscale: { scales: 1 }, wyrmhide: { scales: 1 }, void_carapace: { chitin: 1 }, bedrock_plate: { heavy: 1 }, glacier_plate: { ice: 1 },
    floe_cuirass: { ice: 1 }, clinker_plate: { heavy: 1 }, kingsguard_plate: { heavy: 1 }, folio_plate: { runes: 1 },
    hollow_diadem: { hollow: 1 }, pyre_crown: { flame: 1 }, chorus_crown: { crystal: 1 }, prism_helm: { crystal: 1 }, rime_mask: { ice: 1 },
    frostwarden_helm: { ice: 1 }, astrolabe_helm: { orrery: 1 }, sixth_door_crown: { door: 1 }, broken_ice_crown: { ice: 1, broken: 1 },
    ash_crown: { flame: 1 }, eclipse_diadem: { eclipse: 1 }, prism_lens: { lens: 1 }, storm_eye: { eye: 1 }, faceless_veil: { veil: 1 },
    crystal_greaves: { crystal: 1 }, permafrost_greaves: { ice: 1 }, last_flight: { wings: 1 }, frozen_oath: { ice: 1 },
    bloodstone: { gemc: "#dc2626" }, forge_ring: { gemc: "#f97316" }, zodiac_ring: { gemc: "#fde68a", runes: 1 }, tuning_ring: { gemc: "#22d3ee", fork: 1 },
    undertow_pearl: { pearl: "#e0f2fe" }, abyss_pearl: { pearl: "#1e293b" }, roost_heart: { heart: "#f97316" }, heartstring: { heart: "#f0abfc", ley: 1 },
    last_knell: { bell: 1 }, starlit_codex_ring: { astro: 1 }, overdue_notice: { notice: 1 }, concord_band: { six: 1 }, fracture_band: { crack: 1 },
    hoarfrost_band: { ice: 1 }, choir_heart: { heart: "#67e8f9", crystal: 1 }, cinder_egg: { egg: 1 }, anvilheart: { heartAnvil: 1 },
    nexus_mantle: { ley: 1 }, songweave_vest: { crystal: 1 }, amethyst_hauberk: { crystal: 1 },
  };
  // Unique signature colours + motif (bespoke look).
  const UNIQUE_LOOK = {
    tidebreaker: { gem: "#67e8f9", glow: "#22d3ee", motif: "waves" },
    wardens_last_key: { gem: "#67e8f9", glow: "#5eead4", motif: "waves" },
    drowned_bell: { gem: "#67e8f9", glow: "#22d3ee", motif: "waves" },
    anvilheart: { gem: "#fb923c", glow: "#f97316", motif: "ember" },
    quenchblade: { gem: "#38bdf8", glow: "#fb923c", motif: "steam" },
    bellows_of_the_deep: { gem: "#fb923c", glow: "#f97316", motif: "ember" },
    sixth_door_crown: { gem: "#c084fc", glow: "#a855f7", motif: "void" },
    hollow_loop: { gem: "#1e0b36", glow: "#c084fc", motif: "void" },
    polite_knock: { gem: "#c084fc", glow: "#a855f7", motif: "void" },
    kingsfire: { gem: "#fb923c", glow: "#f97316", motif: "flames", metal: ["#fffbeb", "#e7dcc3", "#a8987a", "#4a3f2c"] },
    last_flight: { gem: "#fb923c", glow: "#fdba74", motif: "ember" },
    ash_crown: { gem: "#f97316", glow: "#f97316", motif: "flames" },
    ogre_knuckle: { gem: "#a3e635", glow: "#84cc16", motif: null, metal: ["#e2f0c4", "#8fa35a", "#4a5a26", "#1c240c"] },
    storm_eye: { gem: "#7dd3fc", glow: "#38bdf8", motif: "lightning" },
    orrery_blade: { gem: "#fde68a", glow: "#fde68a", motif: "orbit" },
    eclipse_diadem: { gem: "#111827", glow: "#fde68a", motif: "stars" },
    overdue_notice: { gem: "#b91c1c", glow: "#fcd34d", motif: "pages" },
    choir_heart: { gem: "#67e8f9", glow: "#67e8f9", motif: "crystal" },
    eighth_leg: { gem: "#67e8f9", glow: "#c084fc", motif: "crystal", metal: ["#f1d4ff", "#8b4fb5", "#3f1463", "#170526"] },
    prism_lens: { gem: "#e0f2fe", glow: "#67e8f9", motif: "prism" },
    deep_winter: { gem: "#7dd3fc", glow: "#7dd3fc", motif: "frost", metal: ["#ffffff", "#cdeeff", "#72b6e0", "#1d4f7d"] },
    broken_ice_crown: { gem: "#7dd3fc", glow: "#bae6fd", motif: "frost" },
    frozen_oath: { gem: "#bae6fd", glow: "#bae6fd", motif: "frost" },
    last_knell: { gem: "#d8b4fe", glow: "#a855f7", motif: "void" },
    cinder_egg: { gem: "#fdba74", glow: "#fb923c", motif: "ember" },
    heartstring: { gem: "#f0abfc", glow: "#f0abfc", motif: "ley" },
    ley_sunderer: { gem: "#f0abfc", glow: "#a78bfa", motif: "ley", metal: ["#f5eaff", "#a58bd8", "#4c2d8f", "#1b0c3a"] },
    concord_band: { gem: "#c4b5fd", glow: "#a78bfa", motif: "ley" },
    nexus_mantle: { gem: "#c4b5fd", glow: "#a78bfa", motif: "ley" },
  };
  const SET_GLYPH = { warden_vigil: "trident", emberwright: "anvil", hollow_regalia: "door", ashen_mantle: "eye", starlit_codex: "star", choir_of_stone: "fork", rimeveil_oath: "snow" };
  const SET_SLOTS_ORDER = ["weapon", "helmet", "chest", "legs", "ring"];

  function nameGuess(id, slot) {
    const s = String(id || "").toLowerCase();
    const T = [
      [/scythe/, "scythe"], [/glaive|halberd/, "glaive"], [/trident/, "trident"], [/lance/, "lance"], [/spear|pierc/, "spear"], [/axe|cleaver|maw/, "axe"],
      [/maul|hammer/, "hammer"], [/mace|club/, "mace"], [/knife|knives/, "knives"], [/dagger|fang/, "fang"], [/sabre|saber|edge|hook/, "sabre"],
      [/staff|scepter|rod/, "staff"], [/quill|wand|stylus/, "quill"], [/bow|spitter/, "bow"], [/great|claymore/, "greatsword"], [/sword|blade|brand/, "sword"],
      [/crown|tiara/, "crown"], [/circlet|diadem/, "circlet"], [/hood|cowl/, "hood"], [/mask|veil/, "mask"], [/visor|barbute/, "visor"], [/cap/, "cap"], [/horn/, "horned"],
      [/robe|coat|vest(ment)?s?$|mantle/, "robe"], [/mail|hauberk/, "mail"], [/carapace|shell/, "carapace"], [/apron/, "apron"], [/jerkin|hide/, "jerkin"],
      [/plate|cuirass/, "plate"], [/kilt/, "kilt"], [/tasset|legguard/, "tassets"], [/strider|boot|slipper|sabaton|tread|talon|stepper/, "boots"],
      [/legging|trouser/, "trousers"], [/greave/, "greaves"], [/pearl|heart|amulet|pendant/, "amulet"], [/signet|seal|sigil/, "signet"], [/loop/, "twist"], [/eye/, "eyering"],
    ];
    for (const [re, f] of T) if (re.test(s)) return f;
    return { weapon: "sword", helmet: "helm", chest: "plate", legs: "greaves", ring: "band" }[slot] || "sword";
  }
  function lookFor(baseId, slot, lvl) {
    const E = EC();
    const b = E && E.GEAR_BASE_BY_ID ? E.GEAR_BASE_BY_ID[baseId] : null;
    const sl = slot || (b && b.slot) || "weapon";
    let L = lvl || (b && b.lvl) || 1;
    const setId = b && b.set;
    const uq = (b && b.unique) || !!UNIQUE_LOOK[baseId];
    if (uq && (!b || !b.lvl)) { // "any level" uniques read their boss's dungeon level
      const u = E && E.GEAR_UNIQUES && E.GEAR_UNIQUES[baseId];
      const bossLvl = { ogrelord: 4, tempest: 5, curator: 8, prismgolem: 9, halvard: 10, herald: 6, broodmother: 7 };
      L = (u && bossLvl[u.boss]) || L;
    }
    const fam = FAMILY[baseId] || nameGuess(baseId + " " + ((b && b.name) || ""), sl);
    let p = pal(theme(L));
    if (UNIQUE_LOOK[baseId]) { const U = UNIQUE_LOOK[baseId]; p = pal(p, U); p.motif = U.motif; }
    return { fam, slot: sl, lvl: L, p, v: Object.assign({}, VARIANT[baseId] || {}), set: setId || null, uq: !!uq };
  }

  // ------------------------------------------------------------------ WEAPONS (drawn vertical, tip at y=-50, rotated 45deg)
  function haft(c, p, y0, y1, w, rn, wood) {
    const W = wood || WOOD;
    part(c, cc => rr(cc, -w / 2, y0, w, y1 - y0, w / 2), metal(c, -w / 2, w / 2, W), { rn, tex: 10, box: [-w, y0, w, y1] });
    for (let y = y0 + 6; y < y1 - 4; y += 7) strokeP(c, "rgba(0,0,0,.25)", 0.7, cc => { cc.moveTo(-w / 2 + 0.6, y); cc.lineTo(w / 2 - 0.6, y + 1.5); });
  }
  function grip(c, p, y0, y1, w, rn) {
    part(c, cc => rr(cc, -w / 2, y0, w, y1 - y0, 1.5), metal(c, -w / 2, w / 2, LEATHER), { rn, tex: 6, box: [-w, y0, w, y1] });
    for (let y = y0 + 2.5; y < y1 - 1; y += 3.2) strokeP(c, "rgba(20,10,4,.7)", 0.9, cc => { cc.moveTo(-w / 2, y); cc.lineTo(w / 2, y + 2); });
    for (let y = y0 + 2.5; y < y1 - 1; y += 3.2) strokeP(c, "rgba(255,220,170,.18)", 0.5, cc => { cc.moveTo(-w / 2, y - 0.8); cc.lineTo(w / 2, y + 1.2); });
  }
  function pommel(c, p, y, r, rn) {
    part(c, cc => circ(cc, 0, y, r), rg(c, -r * 0.3, y - r * 0.3, 0.5, r * 1.2, [p.trim[0], p.trim[1], p.trim[2]]), { rn, tex: 4 });
    gem(c, 0, y, r * 0.48, p.gem);
  }
  function guard(c, p, y, hw, h, rn, style) {
    const f = lg(c, 0, y - h / 2, 0, y + h / 2, [p.trim[0], p.trim[1], p.trim[2]]);
    if (style === "wing") part(c, cc => { cc.moveTo(-hw, y - h * 1.3); cc.quadraticCurveTo(-hw * 0.4, y - h * 0.1, 0, y - h / 2); cc.quadraticCurveTo(hw * 0.4, y - h * 0.1, hw, y - h * 1.3); cc.quadraticCurveTo(hw * 0.6, y + h * 0.9, 0, y + h / 2 + 1); cc.quadraticCurveTo(-hw * 0.6, y + h * 0.9, -hw, y - h * 1.3); cc.closePath(); }, f, { rn, tex: 6 });
    else part(c, cc => { cc.moveTo(-hw, y - h / 2 + 1); cc.quadraticCurveTo(0, y - h, hw, y - h / 2 + 1); cc.lineTo(hw + 1.5, y + h / 2); cc.quadraticCurveTo(0, y + h * 0.1, -hw - 1.5, y + h / 2); cc.closePath(); }, f, { rn, tex: 6 });
    gem(c, 0, y, h * 0.42, p.gem, "d");
  }
  function bladeFill(c, hw, p, v) {
    if (v.quench) return lg(c, 0, -50, 0, 12, [[0, "#e0f2fe"], [0.45, "#94c9e8"], [0.62, "#fb923c"], [1, "#7c2d12"]]);
    if (v.bone) return lg(c, -hw, 0, hw, 0, [[0, "#b8a88a"], [0.45, "#fbf6e8"], [0.55, "#ded2b6"], [1, "#6d5f45"]]);
    const m = p.metal;
    return lg(c, -hw, 0, hw, 0, [[0, m[1]], [0.46, m[0]], [0.54, m[2]], [1, m[3]]]);
  }
  function bladeDeco(c, p, v, rn, y0, y1, hw) {
    if (v.runes || v.ley) for (let y = y0 + 8; y < y1 - 3; y += 6) {
      c.strokeStyle = al(v.ley ? "#f0abfc" : p.glow || p.gem, 0.95); c.lineWidth = 0.9;
      c.beginPath(); const k = (rn() * 4) | 0;
      if (k === 0) { c.moveTo(-1.5, y); c.lineTo(1.5, y + 2.5); c.moveTo(1.5, y); c.lineTo(-1.5, y + 2.5); }
      else if (k === 1) { c.moveTo(0, y); c.lineTo(0, y + 3); c.moveTo(-1.5, y + 1); c.lineTo(1.5, y + 1); }
      else if (k === 2) { c.arc(0, y + 1.3, 1.4, 0, TAU); }
      else { c.moveTo(-1.5, y + 2.5); c.lineTo(0, y); c.lineTo(1.5, y + 2.5); }
      c.stroke();
    }
    if (v.crystal || v.ice) { // facet lines
      c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 0.6;
      for (let y = y0 + 6; y < y1; y += 7) { c.beginPath(); c.moveTo(-hw * 0.9, y + 3); c.lineTo(0, y); c.lineTo(hw * 0.9, y + 3); c.stroke(); }
    }
    if (v.flame) for (let i = 0; i < 7; i++) {
      const y = y0 + 6 + rn() * (y1 - y0 - 8), s = rn() < 0.5 ? -1 : 1;
      c.fillStyle = al(rn() < 0.5 ? "#fde047" : "#fb923c", 0.9);
      c.beginPath(); c.moveTo(s * hw * 0.2, y); c.quadraticCurveTo(s * hw * 0.8, y - 1, s * hw * 0.5, y - 5); c.quadraticCurveTo(s * hw * 0.2, y - 2, s * hw * 0.2, y); c.fill();
    }
  }
  function straightBlade(c, p, v, rn, o) {
    const hw = o.hw, y0 = o.tip, y1 = o.base;
    const build = cc => {
      if (v.flame && !v.bone) { // wavy flamberge edge
        cc.moveTo(0, y0);
        for (let y = y0 + 6, i = 0; y <= y1; y += 6, i++) cc.quadraticCurveTo(hw + (i % 2 ? 2 : -0.5), y - 3, hw * (0.75 + 0.25 * Math.min(1, (y - y0) / 20)), y);
        cc.lineTo(-hw, y1);
        for (let y = y1 - 6, i = 0; y >= y0 + 6; y -= 6, i++) cc.quadraticCurveTo(-hw - (i % 2 ? 2 : -0.5), y + 3, -hw * (0.75 + 0.25 * Math.min(1, (y - y0) / 20)), y);
        cc.closePath();
      } else if (v.bone) { // tooth: curved fang
        cc.moveTo(hw * 0.2, y0); cc.quadraticCurveTo(hw * 1.5, (y0 + y1) / 2, hw, y1); cc.lineTo(-hw, y1); cc.quadraticCurveTo(-hw * 0.6, (y0 + y1) / 2, hw * 0.2, y0); cc.closePath();
      } else if (v.chipped) {
        mirror(cc, [0, y0, hw * 0.8, y0 + 8, hw, y0 + 14, hw, y0 + 26, hw - 1.8, y0 + 29, hw, y0 + 32, hw, y1]);
      } else {
        mirror(cc, [0, y0, hw * 0.55, y0 + 5, hw, y0 + 14, hw, y1 - 3, hw * 1.05, y1]);
      }
    };
    part(c, build, bladeFill(c, hw, p, v), { rn, tex: 22, box: [-hw, y0, hw, y1], lw: 1.4 });
    // fuller + edge light
    if (!v.bone) {
      c.save(); c.beginPath(); build(c); c.clip();
      c.fillStyle = "rgba(0,0,0,.28)"; c.beginPath(); rr(c, -hw * 0.18, y0 + 12, hw * 0.36, y1 - y0 - 16, 1); c.fill();
      c.fillStyle = "rgba(255,255,255,.35)"; c.beginPath(); rr(c, -hw * 0.18, y0 + 12, hw * 0.12, y1 - y0 - 16, 0.5); c.fill();
      c.restore();
    }
    strokeP(c, "rgba(255,255,255,.7)", 0.7, cc => { cc.moveTo(-hw * 0.2, y0 + 5); cc.lineTo(-hw * 0.95, y0 + 16); });
    if (v.chipped) { c.fillStyle = "rgba(120,53,15,.45)"; for (let i = 0; i < 6; i++) { c.beginPath(); circ(c, (rn() - 0.5) * hw * 1.4, y0 + 10 + rn() * (y1 - y0 - 12), 0.8 + rn() * 1.4); c.fill(); } }
    bladeDeco(c, p, v, rn, y0, y1, hw);
  }
  const W = {};
  W.sword = function (c, p, v, rn) {
    straightBlade(c, p, v, rn, { hw: 5.2, tip: -50, base: 14 });
    guard(c, p, 17, 15, 6, rn, v.flame ? "wing" : null);
    grip(c, p, 20, 36, 5.4, rn);
    pommel(c, p, 40.5, 4.8, rn);
  };
  W.greatsword = function (c, p, v, rn) {
    straightBlade(c, p, v, rn, { hw: 7.5, tip: -52, base: 12 });
    guard(c, p, 15.5, 21, 7.5, rn, "wing");
    grip(c, p, 19.5, 38, 6, rn);
    pommel(c, p, 43, 5.6, rn);
    if (v.ice) { c.fillStyle = "rgba(255,255,255,.9)"; for (let i = 0; i < 5; i++) { const y = -44 + i * 11; c.beginPath(); poly(c, [7.5, y, 11.5, y + 2.5, 7.3, y + 4.5]); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.6; c.stroke(); } }
  };
  W.sabre = function (c, p, v, rn) {
    const build = cc => { cc.moveTo(4, -50); cc.quadraticCurveTo(12, -18, 5, 14); cc.lineTo(-4, 14); cc.quadraticCurveTo(0, -18, 4, -50); cc.closePath(); };
    part(c, build, lg(c, -4, 0, 10, 0, [p.metal[3], p.metal[1], p.metal[0], p.metal[2]]), { rn, tex: 18, box: [-6, -50, 12, 14] });
    strokeP(c, "rgba(255,255,255,.75)", 0.8, cc => { cc.moveTo(4.6, -46); cc.quadraticCurveTo(10.5, -18, 4.6, 10); });
    bladeDeco(c, p, v, rn, -46, 12, 3);
    // knuckle-bow guard
    part(c, cc => { cc.moveTo(-8, 15); cc.quadraticCurveTo(-13, 30, -2, 38); cc.lineTo(-1, 35.5); cc.quadraticCurveTo(-9.5, 29, -5.5, 17.5); cc.closePath(); }, p.trim[1], { lw: 1.1 });
    part(c, cc => rr(cc, -9, 13.5, 17, 4.5, 2), lg(c, 0, 13, 0, 18, p.trim), { rn, tex: 3 });
    grip(c, p, 18, 34, 5, rn);
    pommel(c, p, 38, 4, rn);
  };
  W.fang = function (c, p, v, rn) {
    const bone = v.bone || v.flame;
    const build = cc => { cc.moveTo(-1, -30); cc.quadraticCurveTo(9, -10, 6, 8); cc.lineTo(-5, 8); cc.quadraticCurveTo(-6, -12, -1, -30); cc.closePath(); };
    part(c, build, bone ? lg(c, -5, 0, 8, 0, ["#8d7c5c", "#fdf8ea", "#d9ccaf", "#6b5c41"]) : bladeFill(c, 6, p, v), { rn, tex: 14, box: [-6, -30, 9, 8] });
    strokeP(c, "rgba(255,255,255,.7)", 0.7, cc => { cc.moveTo(-0.5, -26); cc.quadraticCurveTo(6.5, -10, 5, 4); });
    if (v.flame) bladeDeco(c, p, { flame: 1 }, rn, -26, 6, 5);
    part(c, cc => { cc.moveTo(-12, 8); cc.quadraticCurveTo(0, 4, 12, 8); cc.quadraticCurveTo(13, 12, 10, 13); cc.quadraticCurveTo(0, 10, -10, 13); cc.quadraticCurveTo(-13, 12, -12, 8); cc.closePath(); }, lg(c, 0, 5, 0, 13, p.trim), { rn, tex: 4 });
    gem(c, 0, 10, 2.3, p.gem, "d");
    grip(c, p, 13, 30, 5.4, rn);
    pommel(c, p, 34, 4.4, rn);
  };
  W.knives = function (c, p, v, rn) {
    for (const s of [-1, 1]) {
      c.save(); c.translate(s * 10, 6); c.rotate(s * 0.42); c.scale(0.82, 0.82);
      const build = cc => mirror(cc, [0, -40, 4.2, -30, 4.6, 4]);
      part(c, build, bladeFill(c, 4.6, p, v), { rn, tex: 10, box: [-5, -40, 5, 4] });
      strokeP(c, "rgba(255,255,255,.7)", 0.7, cc => { cc.moveTo(-0.8, -36); cc.lineTo(-3.4, -24); });
      part(c, cc => rr(cc, -8, 3, 16, 4, 1.5), lg(c, 0, 3, 0, 7, p.trim), { tex: 2 });
      c.fillStyle = p.trim[2]; for (const rx of [-5, 0, 5]) { c.beginPath(); circ(c, rx, 5, 0.9); c.fill(); }
      grip(c, p, 7, 22, 4.4, rn);
      pommel(c, p, 25, 3.2, rn);
      c.restore();
    }
  };
  W.axe = function (c, p, v, rn) {
    haft(c, p, -44, 50, 5.6, rn);
    const big = v.big || v.jag;
    const hy = -38, bh = big ? 34 : 28;
    const build = cc => {
      if (v.cleaver) { cc.moveTo(2, hy - 6); cc.lineTo(24, hy - 8); cc.quadraticCurveTo(27, hy + 10, 24, hy + bh - 4); cc.lineTo(2, hy + bh - 10); cc.closePath(); return; }
      cc.moveTo(2, hy); cc.quadraticCurveTo(12, hy - 2, 18, hy - 10);
      if (v.jag) { cc.lineTo(21, hy - 6); cc.lineTo(26, hy - 4); cc.lineTo(27, hy + 3); cc.lineTo(30, hy + 9); cc.lineTo(27, hy + 15); cc.lineTo(29, hy + 22); cc.lineTo(24, hy + bh - 4); }
      else cc.quadraticCurveTo(32, hy + bh / 2 - 4, 20, hy + bh);
      cc.quadraticCurveTo(12, hy + bh * 0.62, 2, hy + bh * 0.56); cc.closePath();
    };
    part(c, build, lg(c, 2, 0, 30, 0, [p.metal[2], p.metal[1], p.metal[0], p.metal[1]]), { rn, tex: 18, box: [0, hy - 12, 32, hy + bh + 2] });
    strokeP(c, "rgba(255,255,255,.8)", 0.9, cc => { if (v.cleaver) { cc.moveTo(24, hy - 6); cc.quadraticCurveTo(26.5, hy + 10, 23.5, hy + bh - 6); } else { cc.moveTo(19, hy - 8); cc.quadraticCurveTo(29.5, hy + bh / 2 - 4, 20.5, hy + bh - 2); } });
    if (v.ice || v.crystal) bladeDeco(c, p, { crystal: 1 }, rn, hy, hy + bh - 6, 10);
    if (!v.cleaver) part(c, cc => { cc.moveTo(-2, hy + 2); cc.lineTo(-14, hy + 6); cc.lineTo(-2, hy + 12); cc.closePath(); }, lg(c, -14, 0, -2, 0, [p.metal[2], p.metal[0]]), { tex: 0, lw: 1.2 });
    part(c, cc => rr(cc, -4.2, hy - 2, 8.4, 18, 2), lg(c, -4, 0, 4, 0, [p.trim[2], p.trim[0], p.trim[1]]), { rn, tex: 4 });
    gem(c, 0, hy + 7, 2.6, p.gem);
    if (v.ley) { c.strokeStyle = al("#f0abfc", 0.95); c.lineWidth = 1.1; c.beginPath(); c.moveTo(6, hy + 3); c.lineTo(12, hy + 8); c.lineTo(9, hy + 13); c.lineTo(17, hy + 20); c.stroke(); }
    part(c, cc => rr(cc, -3.8, 44, 7.6, 6, 2), p.trim[1], { tex: 0 });
    grip(c, p, 24, 38, 6.2, rn);
  };
  W.hammer = function (c, p, v, rn) {
    haft(c, p, -30, 48, 5.2, rn);
    grip(c, p, 24, 40, 6, rn);
    const heavy = !!v.crystal;
    const y0 = -50, h = 22, hw = heavy ? 19 : 17;
    const face = lg(c, -hw, 0, hw, 0, [p.metal[3], p.metal[1], p.metal[0], p.metal[1], p.metal[3]]);
    part(c, cc => { cc.moveTo(-hw, y0 + 3); cc.lineTo(-hw + 3, y0); cc.lineTo(hw - 3, y0); cc.lineTo(hw, y0 + 3); cc.lineTo(hw, y0 + h - 3); cc.lineTo(hw - 3, y0 + h); cc.lineTo(-hw + 3, y0 + h); cc.lineTo(-hw, y0 + h - 3); cc.closePath(); }, face, { rn, tex: 22, box: [-hw, y0, hw, y0 + h] });
    for (const s of [-1, 1]) part(c, cc => rr(cc, s > 0 ? hw - 6 : -hw, y0 - 1.5, 6, h + 3, 1.2), lg(c, 0, y0, 0, y0 + h, p.trim), { tex: 0, lw: 1.1 });
    part(c, cc => rr(cc, -5, y0 - 2, 10, h + 4, 2), lg(c, -5, 0, 5, 0, [p.trim[2], p.trim[0], p.trim[1]]), { tex: 0, lw: 1.1 });
    gem(c, 0, y0 + h / 2, 3.2, p.gem);
    if (v.crystal) { for (const [x, y, s] of [[-8, y0 - 1, 6], [9, y0 - 2, 7], [0, y0 - 4, 5]]) part(c, cc => poly(cc, [x - s * 0.4, y + 2, x, y - s, x + s * 0.4, y + 2]), lg(c, x - 2, 0, x + 2, 0, [lt(p.trim[1], 0.6), p.trim[1], p.trim[2]]), { lw: 0.9 }); }
    c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(-hw + 2, y0 + 2, 2 * hw - 4, 1.5);
    part(c, cc => rr(cc, -3.6, 45, 7.2, 5, 2), p.trim[1], { tex: 0 });
  };
  W.mace = function (c, p, v, rn) {
    haft(c, p, -28, 46, 5, rn, p.metal);
    grip(c, p, 22, 38, 6, rn);
    const cy = -36;
    if (v.orrery) {
      part(c, cc => circ(cc, 0, cy, 11), rg(c, -4, cy - 4, 1, 13, [p.trim[0], p.trim[1], p.trim[2]]), { rn, tex: 10 });
      c.strokeStyle = p.gem; c.lineWidth = 1.6;
      for (const r of [0.4, -0.7, 1.4]) { c.beginPath(); c.ellipse(0, cy, 17, 5, r, 0, TAU); c.stroke(); }
      for (const [a, r] of [[0.4, 17], [2.6, 17], [4.5, 17]]) glowDot(c, Math.cos(a) * r * 0.95, cy + Math.sin(a) * 5, 2.8, p.glow || p.gem);
      gem(c, 0, cy, 4, p.gem);
    } else if (v.knocker) {
      part(c, cc => circ(cc, 0, cy, 12), rg(c, -4, cy - 4, 1, 14, [p.metal[0], p.metal[1], p.metal[3]]), { rn, tex: 10 });
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6; part(c, cc => poly(cc, [Math.cos(a) * 10, cy + Math.sin(a) * 10, Math.cos(a) * 17, cy + Math.sin(a) * 17, Math.cos(a + 0.35) * 10, cy + Math.sin(a + 0.35) * 10]), p.metal[1], { lw: 1 }); }
      strokeP(c, OUT, 4.2, cc => cc.arc(0, cy + 7, 8, 0.1, PI - 0.1));
      strokeP(c, p.trim[0], 2.2, cc => cc.arc(0, cy + 7, 8, 0.1, PI - 0.1));
      gem(c, 0, cy - 1, 3.5, p.gem);
    } else {
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8;
        part(c, cc => poly(cc, [Math.cos(a - 0.22) * 7, cy + Math.sin(a - 0.22) * 7, Math.cos(a) * 16, cy + Math.sin(a) * 16, Math.cos(a + 0.22) * 7, cy + Math.sin(a + 0.22) * 7]), lg(c, 0, cy - 16, 0, cy + 16, [p.metal[0], p.metal[2]]), { lw: 1 });
      }
      part(c, cc => circ(cc, 0, cy, 9), rg(c, -3, cy - 3, 1, 11, [p.metal[0], p.metal[1], p.metal[3]]), { rn, tex: 8 });
      gem(c, 0, cy, 3.4, p.gem);
    }
  };
  function poleHead(c, p, v, rn, kind) {
    if (kind === "spear") {
      if (v.chitin) {
        for (let i = 0; i < 3; i++) part(c, cc => ell(cc, 0, -18 + i * 13, 4.4, 7, 0), lg(c, -4, 0, 4, 0, [p.metal[2], p.metal[0], p.metal[3]]), { rn, tex: 4 });
        part(c, cc => mirror(cc, [0, -54, 3, -40, 5, -28]), lg(c, -5, 0, 5, 0, [lt(p.gem, 0.3), "#ffffff", p.gem, dk(p.gem, 0.5)]), { lw: 1.2 });
        c.strokeStyle = "rgba(0,0,0,.6)"; c.lineWidth = 0.8; for (let y = -26; y < 40; y += 13) { c.beginPath(); c.moveTo(-4, y); c.lineTo(4, y); c.stroke(); }
        return;
      }
      part(c, cc => mirror(cc, [0, -54, 5, -44, 7.5, -34, 3, -24]), bladeFill(c, 7, p, v), { rn, tex: 10, box: [-8, -54, 8, -24] });
      strokeP(c, "rgba(255,255,255,.7)", 0.7, cc => { cc.moveTo(-0.4, -51); cc.lineTo(-6, -35); });
      strokeP(c, "rgba(0,0,0,.35)", 0.8, cc => { cc.moveTo(0, -52); cc.lineTo(0, -26); });
      part(c, cc => rr(cc, -3.8, -26, 7.6, 7, 1.5), lg(c, -4, 0, 4, 0, p.trim), { tex: 0 });
      for (const s of [-1, 1]) { c.strokeStyle = p.gem; c.lineWidth = 1.2; c.beginPath(); c.moveTo(s * 3, -21); c.quadraticCurveTo(s * 9, -14, s * 5, -6); c.stroke(); }
      if (v.hollow) glowDot(c, 0, -40, 3.5, p.glow || p.gem);
    }
    if (kind === "lance") {
      part(c, cc => { cc.moveTo(0, -54); cc.lineTo(7, -8); cc.quadraticCurveTo(0, -4, -7, -8); cc.closePath(); }, lg(c, -7, 0, 7, 0, [p.metal[1], p.metal[0], p.metal[2], p.metal[3]]), { rn, tex: 14, box: [-7, -54, 7, -4] });
      for (let y = -44; y < -10; y += 8) strokeP(c, "rgba(0,0,0,.35)", 0.7, cc => { const w = (y + 54) / 46 * 7; cc.moveTo(-w, y); cc.quadraticCurveTo(0, y + 2, w, y); });
      part(c, cc => { cc.moveTo(-13, -4); cc.quadraticCurveTo(0, -12, 13, -4); cc.lineTo(9, 4); cc.quadraticCurveTo(0, 0, -9, 4); cc.closePath(); }, lg(c, 0, -10, 0, 4, p.trim), { rn, tex: 4 });
      for (const s of [-1, 1]) part(c, cc => { cc.moveTo(s * 10, -6); cc.quadraticCurveTo(s * 20, -16, s * 16, -26); cc.quadraticCurveTo(s * 15, -14, s * 7, -10); cc.closePath(); }, lg(c, 0, -26, 0, -4, [p.gem, dk(p.gem, 0.4)]), { lw: 1 });
      gem(c, 0, -2, 2.6, p.gem);
    }
  }
  W.spear = function (c, p, v, rn) { haft(c, p, -26, 50, 4.4, rn, v.chitin ? p.metal : WOOD); if (!v.chitin) grip(c, p, 18, 30, 5, rn); poleHead(c, p, v, rn, "spear"); };
  W.lance = function (c, p, v, rn) { haft(c, p, 0, 50, 5, rn); grip(c, p, 16, 30, 6, rn); poleHead(c, p, v, rn, "lance"); };
  W.trident = function (c, p, v, rn) {
    haft(c, p, -28, 50, 4.6, rn, p.metal);
    grip(c, p, 18, 32, 5.4, rn);
    const f = bladeFill(c, 3, p, v);
    part(c, cc => { cc.moveTo(-14, -34); cc.quadraticCurveTo(-14, -22, 0, -22); cc.quadraticCurveTo(14, -22, 14, -34); cc.lineTo(11, -34); cc.quadraticCurveTo(10, -26, 0, -26); cc.quadraticCurveTo(-10, -26, -11, -34); cc.closePath(); }, lg(c, 0, -34, 0, -22, p.trim), { rn, tex: 3 });
    for (const x of [-12.5, 0, 12.5]) {
      const top = x === 0 ? -54 : -46;
      part(c, cc => { cc.moveTo(x, top); cc.lineTo(x + 2.6, top + 7); cc.lineTo(x + 1.6, top + 6); cc.lineTo(x + 1.6, x === 0 ? -24 : -32); cc.lineTo(x - 1.6, x === 0 ? -24 : -32); cc.lineTo(x - 1.6, top + 6); cc.lineTo(x - 2.6, top + 7); cc.closePath(); }, f, { lw: 1.1 });
      strokeP(c, "rgba(255,255,255,.7)", 0.5, cc => { cc.moveTo(x - 0.5, top + 2); cc.lineTo(x - 0.5, top + 14); });
    }
    gem(c, 0, -24, 3, p.gem);
  };
  W.glaive = function (c, p, v, rn) {
    haft(c, p, -22, 50, 4.6, rn, v.hollow ? p.metal : WOOD);
    grip(c, p, 16, 30, 5.4, rn);
    const build = cc => { cc.moveTo(-2, -20); cc.quadraticCurveTo(-4, -40, 4, -56); cc.quadraticCurveTo(14, -38, 7, -20); cc.quadraticCurveTo(3, -24, -2, -20); cc.closePath(); };
    part(c, build, lg(c, -3, 0, 12, 0, [p.metal[2], p.metal[0], p.metal[1], p.metal[3]]), { rn, tex: 16, box: [-4, -56, 14, -18] });
    strokeP(c, "rgba(255,255,255,.75)", 0.8, cc => { cc.moveTo(5, -52); cc.quadraticCurveTo(12.5, -38, 7.5, -24); });
    part(c, cc => { cc.moveTo(-3, -24); cc.lineTo(-10, -30); cc.lineTo(-4, -30); cc.closePath(); }, p.metal[1], { lw: 1 });
    bladeDeco(c, p, v, rn, -50, -24, 3);
    if (v.hollow) { c.save(); c.beginPath(); build(c); c.clip(); c.fillStyle = rg(c, 5, -38, 0, 6, ["#000", al(p.glow || p.gem, 0.9), al(p.glow || p.gem, 0)]); c.beginPath(); circ(c, 5, -38, 6); c.fill(); c.restore(); }
    part(c, cc => rr(cc, -4.2, -22, 8.4, 6, 1.5), lg(c, -4, 0, 4, 0, p.trim), { tex: 0 });
    gem(c, 0, -19, 2.4, p.gem);
  };
  W.scythe = function (c, p, v, rn) {
    haft(c, p, -48, 50, 4.4, rn, v.runes ? p.metal : WOOD);
    grip(c, p, 12, 26, 5.2, rn);
    const build = cc => { cc.moveTo(0, -46); cc.quadraticCurveTo(-30, -52, -40, -24); cc.quadraticCurveTo(-24, -40, 2, -38); cc.closePath(); };
    part(c, build, lg(c, -40, -50, -5, -30, [p.metal[0], p.metal[1], p.metal[2]]), { rn, tex: 16, box: [-40, -52, 2, -24] });
    strokeP(c, "rgba(255,255,255,.8)", 0.8, cc => { cc.moveTo(-38, -26); cc.quadraticCurveTo(-26, -42, -2, -39); });
    if (v.runes) for (let i = 0; i < 4; i++) glowDot(c, -30 + i * 7, -44 + i * 1.6, 1.6, p.glow || p.gem);
    part(c, cc => rr(cc, -4, -50, 8, 12, 2), lg(c, -4, 0, 4, 0, p.trim), { tex: 0 });
    gem(c, 0, -44, 2.6, p.gem);
  };
  W.quill = function (c, p, v, rn) {
    // a feather-quill wand: shaft + glowing feather vane + nib
    part(c, cc => { cc.moveTo(0, -52); cc.quadraticCurveTo(14, -38, 8, -8); cc.quadraticCurveTo(3, -2, 0, 4); cc.quadraticCurveTo(-3, -2, -8, -8); cc.quadraticCurveTo(-14, -38, 0, -52); cc.closePath(); },
      lg(c, -12, 0, 12, 0, [dk(p.cloth[0], 0.2), lt(p.trim[1], 0.35), p.cloth[0], dk(p.cloth[1], 0.2)]), { rn, tex: 8, box: [-14, -52, 14, 4] });
    c.strokeStyle = "rgba(0,0,0,.4)"; c.lineWidth = 0.6;
    for (let y = -44; y < -4; y += 4) { c.beginPath(); c.moveTo(0, y); c.lineTo(-9 + Math.abs(y + 24) * 0.15, y + 5); c.moveTo(0, y); c.lineTo(9 - Math.abs(y + 24) * 0.15, y + 5); c.stroke(); }
    strokeP(c, lt(p.trim[0], 0.3), 1.4, cc => { cc.moveTo(0, -50); cc.lineTo(0, 30); });
    part(c, cc => rr(cc, -3, 4, 6, 26, 2), metal(c, -3, 3, p.trim), { tex: 0 });
    part(c, cc => mirror(cc, [0, 44, 2.5, 36, 3, 30]), lg(c, -3, 0, 3, 0, [p.metal[1], p.metal[0], p.metal[2]]), { lw: 1 });
    glowDot(c, 0, 44, 5, p.glow || p.gem);
    for (let i = 0; i < 4; i++) sparkle(c, (rn() - 0.5) * 22, -40 + rn() * 34, 2 + rn() * 1.5, p.glow || "#fff");
  };
  W.staff = function (c, p, v, rn) {
    haft(c, p, -30, 52, 4.4, rn, p.metal);
    grip(c, p, 8, 22, 5.2, rn);
    // crown-claws holding an orb
    const cy = -40;
    for (const s of [-1, 1]) part(c, cc => { cc.moveTo(s * 2, -28); cc.quadraticCurveTo(s * 16, -34, s * 11, cy - 10); cc.lineTo(s * 8.5, cy - 8); cc.quadraticCurveTo(s * 11, -33, s * 1, -30); cc.closePath(); }, lg(c, 0, -52, 0, -28, p.trim), { lw: 1.1 });
    c.fillStyle = rg(c, 0, cy, 0, 13, [al(p.glow || p.gem, 0.9), al(p.glow || p.gem, 0)]); c.beginPath(); circ(c, 0, cy, 13); c.fill();
    part(c, cc => circ(cc, 0, cy, 7.5), rg(c, -2.5, cy - 3, 0.5, 9, ["#000000", dk(p.gem, 0.3), p.gem]), { lw: 1.2 });
    c.fillStyle = "rgba(255,255,255,.8)"; c.beginPath(); ell(c, -2.6, cy - 3, 2.2, 1.3, -0.6); c.fill();
    part(c, cc => poly(cc, [0, -54, 2.5, -49, 0, -46, -2.5, -49]), p.trim[0], { lw: 0.9 });
  };
  W.bow = function (c, p, v, rn) {
    // crystal crossbow-ish bow: a recurved limb + string + crystal shards
    const limb = cc => { cc.moveTo(2, -50); cc.quadraticCurveTo(26, -30, 16, 0); cc.quadraticCurveTo(26, 30, 2, 50); cc.quadraticCurveTo(20, 30, 11, 0); cc.quadraticCurveTo(20, -30, 2, -50); cc.closePath(); };
    strokeP(c, "rgba(255,255,255,.85)", 0.8, cc => { cc.moveTo(2, -49); cc.lineTo(-6, 0); cc.lineTo(2, 49); });
    part(c, limb, lg(c, 0, -50, 0, 50, [p.metal[0], p.metal[1], p.metal[2], p.metal[1], p.metal[0]]), { rn, tex: 14, box: [0, -50, 26, 50] });
    part(c, cc => rr(cc, 9.5, -8, 8, 16, 2), metal(c, 9, 18, LEATHER), { tex: 0 });
    for (const [y, s] of [[-50, 1], [50, -1]]) part(c, cc => poly(cc, [2, y, 6, y + s * 6, -1, y + s * 3]), p.trim[1], { lw: 0.9 });
    // arrow + shard head
    part(c, cc => rr(cc, -30, -1, 44, 2.2, 1), WOOD[1], { lw: 0.8 });
    part(c, cc => poly(cc, [-40, 0, -30, -4.5, -27, 0, -30, 4.5]), lg(c, -40, 0, -27, 0, ["#ffffff", p.trim[1], dk(p.trim[1], 0.4)]), { lw: 1 });
    for (const s of [-1, 1]) part(c, cc => poly(cc, [11, 0, 16, s * 5, 18, s * 4, 14, 0]), p.gem, { lw: 0.7 });
    for (const [x, y] of [[20, -26], [20, 26], [15, 0]]) part(c, cc => poly(cc, [x, y - 5, x + 3, y, x, y + 5, x - 2, y]), lg(c, x - 2, 0, x + 3, 0, [lt(p.trim[1], 0.6), p.trim[1], p.trim[2]]), { lw: 0.8 });
  };

  // ------------------------------------------------------------------ HELMETS (front, ~x 18..82, y 14..86)
  const H = {};
  function helmShell(c, p, rn, o) {
    o = o || {};
    const build = cc => { cc.moveTo(22, 72); cc.lineTo(22, 46); cc.bezierCurveTo(22, 20, 36, 14, 50, 14); cc.bezierCurveTo(64, 14, 78, 20, 78, 46); cc.lineTo(78, 72); cc.quadraticCurveTo(50, 80, 22, 72); cc.closePath(); };
    part(c, build, metal(c, 22, 78, p.metal), { rn, tex: 26, box: [20, 12, 80, 80], bev: 4 });
    return build;
  }
  H.helm = function (c, p, v, rn) {
    const build = helmShell(c, p, rn);
    // crest ridge
    part(c, cc => rr(cc, 47, 13, 6, 34, 3), metal(c, 47, 53, p.trim), { tex: 0, lw: 1.1 });
    // eye slit
    c.save(); c.beginPath(); build(c); c.clip();
    part(c, cc => rr(cc, 26, 44, 48, 6, 2), "#07040a", { lw: 1 });
    if (p.glow) { glowDot(c, 40, 47, 4.5, p.glow); glowDot(c, 60, 47, 4.5, p.glow); }
    c.fillStyle = "#07040a"; for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { c.beginPath(); circ(c, 50 + s * (6 + i * 3.2), 60 + (i % 2) * 3.5, 0.9); c.fill(); }
    c.restore();
    part(c, cc => rr(cc, 21, 68, 58, 7, 2.5), lg(c, 0, 68, 0, 75, p.trim), { rn, tex: 4 });
    for (const x of [27, 50, 73]) { c.fillStyle = p.trim[0]; c.beginPath(); circ(c, x, 71.5, 1.3); c.fill(); }
    if (v.crystal) for (const [x, s] of [[34, 9], [50, 13], [66, 9]]) part(c, cc => poly(cc, [x - 4, 26, x, 26 - s, x + 4, 26]), lg(c, x - 4, 0, x + 4, 0, [lt(p.trim[1], 0.6), p.trim[1], p.trim[2]]), { lw: 1 });
    if (v.orrery) { c.strokeStyle = p.trim[1]; c.lineWidth = 1.6; c.beginPath(); c.ellipse(50, 30, 30, 8, -0.2, 0, TAU); c.stroke(); glowDot(c, 22, 35, 3, p.glow || p.gem); glowDot(c, 78, 24, 2.5, p.glow || p.gem); }
    gem(c, 50, 22, 3.4, p.gem);
  };
  H.visor = function (c, p, v, rn) {
    const build = helmShell(c, p, rn);
    c.save(); c.beginPath(); build(c); c.clip();
    // T / Y opening
    part(c, cc => { cc.moveTo(30, 40); cc.lineTo(70, 40); cc.lineTo(70, 47); cc.lineTo(54, 47); cc.lineTo(54, 74); cc.lineTo(46, 74); cc.lineTo(46, 47); cc.lineTo(30, 47); cc.closePath(); }, "#07040a", { lw: 1.2 });
    if (p.glow) { glowDot(c, 40, 43.5, 4, p.glow); glowDot(c, 60, 43.5, 4, p.glow); }
    c.restore();
    part(c, cc => { cc.moveTo(25, 36); cc.quadraticCurveTo(50, 28, 75, 36); cc.lineTo(75, 39); cc.quadraticCurveTo(50, 32, 25, 39); cc.closePath(); }, lg(c, 0, 30, 0, 39, p.trim), { tex: 0, lw: 1 });
    for (const s of [-1, 1]) part(c, cc => ell(cc, 50 + s * 25, 60, 4, 8, 0), rg(c, 50 + s * 25, 57, 0.5, 8, [p.trim[0], p.trim[2]]), { lw: 1 });
    // plume
    part(c, cc => { cc.moveTo(50, 16); cc.bezierCurveTo(56, 2, 74, 2, 84, 16); cc.bezierCurveTo(72, 10, 62, 12, 53, 20); cc.closePath(); }, lg(c, 50, 4, 84, 16, [lt(p.gem, 0.2), p.gem, dk(p.gem, 0.5)]), { rn, tex: 6, box: [50, 2, 85, 20] });
    gem(c, 50, 24, 3, p.gem);
  };
  H.horned = function (c, p, v, rn) {
    for (const s of [-1, 1]) {
      const build = cc => { cc.moveTo(50 + s * 22, 40); cc.bezierCurveTo(50 + s * 40, 36, 50 + s * 46, 20, 50 + s * 40, 4); cc.bezierCurveTo(50 + s * 38, 20, 50 + s * 32, 28, 50 + s * 20, 30); cc.closePath(); };
      part(c, build, v.ice ? lg(c, 50, 4, 50 + s * 46, 40, ["#ffffff", "#bae6fd", "#3b82b6"]) : lg(c, 50 + s * 20, 40, 50 + s * 40, 4, ["#3a2c22", "#b89a78", "#f5ead7"]), { rn, tex: 6, box: [0, 0, 100, 42] });
      for (let i = 1; i < 5; i++) strokeP(c, "rgba(0,0,0,.35)", 0.7, cc => { const t = i / 5; cc.moveTo(50 + s * (22 + 16 * t), 38 - 18 * t); cc.lineTo(50 + s * (32 + 8 * t), 32 - 20 * t); });
    }
    H.helm(c, p, v, rn);
  };
  H.cap = function (c, p, v, rn) {
    // the starter cap is the first helm anyone wears: ear flaps on a laced chin strap, stitched panels, a brass buckle
    for (const s of [-1, 1]) {
      part(c, cc => { cc.moveTo(50 + s * 18, 58); cc.lineTo(50 + s * 31, 56); cc.quadraticCurveTo(50 + s * 33, 74, 50 + s * 27, 84); cc.quadraticCurveTo(50 + s * 20, 86, 50 + s * 17, 78); cc.closePath(); },
        lg(c, 50 + s * 16, 0, 50 + s * 33, 0, [LEATHER[2], LEATHER[1], LEATHER[3]]), { lw: 1.1 });
      c.save(); c.setLineDash([1.6, 1.8]);
      strokeP(c, "rgba(245,222,179,.55)", 0.7, cc => { cc.moveTo(50 + s * 29, 59); cc.quadraticCurveTo(50 + s * 30, 73, 50 + s * 25, 81); });
      c.restore();
      strokeP(c, LEATHER[2], 1.6, cc => { cc.moveTo(50 + s * 22, 83); cc.quadraticCurveTo(50 + s * 10, 91, 50, 90); });
    }
    part(c, cc => rr(cc, 45, 86.5, 10, 6, 1.2), lg(c, 0, 86, 0, 93, [p.trim[0], p.trim[2]]), { lw: 0.8 });
    const build = cc => { cc.moveTo(20, 66); cc.bezierCurveTo(18, 24, 36, 16, 50, 16); cc.bezierCurveTo(64, 16, 82, 24, 80, 66); cc.quadraticCurveTo(50, 60, 20, 66); cc.closePath(); };
    part(c, build, metal(c, 20, 80, LEATHER), { rn, tex: 26, box: [18, 14, 82, 68] });
    strokeP(c, "rgba(255,226,170,.28)", 3, cc => { cc.moveTo(28, 50); cc.bezierCurveTo(27, 32, 36, 22, 46, 20); });
    for (const x of [36, 50, 64]) {
      strokeP(c, "rgba(40,20,6,.7)", 0.9, cc => { cc.moveTo(x, 17); cc.quadraticCurveTo(x + (x - 50) * 0.5, 40, x + (x - 50) * 0.6, 62); });
      c.save(); c.setLineDash([1.4, 2]);
      strokeP(c, "rgba(245,222,179,.5)", 0.6, cc => { cc.moveTo(x + 2, 19); cc.quadraticCurveTo(x + 2 + (x - 50) * 0.5, 40, x + 2 + (x - 50) * 0.6, 61); });
      c.restore();
    }
    part(c, cc => { cc.moveTo(16, 66); cc.quadraticCurveTo(50, 56, 84, 66); cc.lineTo(84, 72); cc.quadraticCurveTo(50, 63, 16, 72); cc.closePath(); }, lg(c, 0, 58, 0, 72, [LEATHER[1], LEATHER[3]]), { tex: 0 });
    c.fillStyle = p.trim[0]; for (let x = 22; x < 80; x += 7) { c.beginPath(); circ(c, x, 67 - Math.sin((x - 16) / 68 * PI) * 5, 0.9); c.fill(); }
    part(c, cc => circ(cc, 50, 17, 3), p.trim[1], { lw: 1 });
  };
  H.hood = function (c, p, v, rn) {
    const cl = p.cloth;
    const build = cc => { cc.moveTo(50, 10); cc.bezierCurveTo(70, 12, 84, 34, 82, 60); cc.quadraticCurveTo(86, 76, 92, 86); cc.lineTo(8, 86); cc.quadraticCurveTo(14, 76, 18, 60); cc.bezierCurveTo(16, 34, 30, 12, 50, 10); cc.closePath(); };
    part(c, build, lg(c, 10, 0, 90, 0, [dk(cl[0], 0.3), lt(cl[0], 0.15), cl[0], cl[1], dk(cl[1], 0.4)]), { rn, tex: 20, box: [8, 10, 92, 86] });
    // face opening
    part(c, cc => { cc.moveTo(50, 26); cc.bezierCurveTo(64, 28, 70, 44, 68, 62); cc.quadraticCurveTo(50, 72, 32, 62); cc.bezierCurveTo(30, 44, 36, 28, 50, 26); cc.closePath(); }, rg(c, 50, 50, 2, 24, ["#140b1c", "#040206"]), { lw: 1.2 });
    const eye = p.glow || p.gem;
    if (v.eye) {
      glowDot(c, 50, 47, 10, eye); part(c, cc => ell(cc, 50, 47, 7, 4.2, 0), "#f0f9ff", { lw: 1 }); part(c, cc => circ(cc, 50, 47, 2.8), eye, { lw: 0.8 });
      bolt(c, 30, 30, 1.1, "#fde047"); bolt(c, 72, 34, 0.9, "#fde047");
    } else { glowDot(c, 43, 48, 4.2, eye); glowDot(c, 57, 48, 4.2, eye); }
    // folds + trim
    for (const s of [-1, 1]) strokeP(c, "rgba(0,0,0,.35)", 1.2, cc => { cc.moveTo(50 + s * 22, 30); cc.quadraticCurveTo(50 + s * 30, 58, 50 + s * 28, 84); });
    part(c, cc => { cc.moveTo(10, 82); cc.quadraticCurveTo(50, 74, 90, 82); cc.lineTo(92, 88); cc.quadraticCurveTo(50, 80, 8, 88); cc.closePath(); }, lg(c, 0, 76, 0, 88, p.trim), { tex: 0 });
    gem(c, 50, 80, 3, p.gem);
  };
  H.mask = function (c, p, v, rn) {
    const face = cc => { cc.moveTo(50, 14); cc.bezierCurveTo(72, 14, 80, 30, 78, 48); cc.bezierCurveTo(76, 70, 62, 86, 50, 88); cc.bezierCurveTo(38, 86, 24, 70, 22, 48); cc.bezierCurveTo(20, 30, 28, 14, 50, 14); cc.closePath(); };
    const fill = v.veil ? lg(c, 22, 0, 78, 0, ["#cbd5e1", "#ffffff", "#e2e8f0", "#64748b"]) : metal(c, 22, 78, v.ice ? ["#ffffff", "#bfe6fb", "#5b9bc9", "#16395f"] : p.metal);
    part(c, face, fill, { rn, tex: 20, box: [20, 12, 80, 90], bev: 4 });
    for (const s of [-1, 1]) part(c, cc => { cc.moveTo(50 + s * 5, 44); cc.quadraticCurveTo(50 + s * 14, 36, 50 + s * 22, 42); cc.quadraticCurveTo(50 + s * 14, 50, 50 + s * 5, 44); cc.closePath(); }, "#06030a", { lw: 1 });
    const eye = p.glow || p.gem;
    glowDot(c, 36, 43, 4.5, eye); glowDot(c, 64, 43, 4.5, eye);
    strokeP(c, "rgba(0,0,0,.45)", 1.3, cc => { cc.moveTo(50, 44); cc.lineTo(50, 64); });
    part(c, cc => { cc.moveTo(40, 72); cc.quadraticCurveTo(50, 76, 60, 72); cc.lineTo(58, 74); cc.quadraticCurveTo(50, 78, 42, 74); cc.closePath(); }, "#06030a", { lw: 0.8 });
    if (v.veil) { c.strokeStyle = "rgba(76,29,149,.5)"; c.lineWidth = 0.7; for (let x = 28; x < 74; x += 5) { c.beginPath(); c.moveTo(x, 56); c.quadraticCurveTo(x + 1, 74, x - 1, 90); c.stroke(); } }
    else if (v.ice) { c.fillStyle = "rgba(255,255,255,.9)"; for (const x of [30, 44, 58, 70]) { c.beginPath(); poly(c, [x - 2, 80 - Math.abs(x - 50) * 0.4, x, 90 - Math.abs(x - 50) * 0.3, x + 2, 80 - Math.abs(x - 50) * 0.4]); c.fill(); } }
    else { part(c, cc => { cc.moveTo(24, 30); cc.quadraticCurveTo(50, 18, 76, 30); cc.lineTo(76, 34); cc.quadraticCurveTo(50, 22, 24, 34); cc.closePath(); }, lg(c, 0, 20, 0, 34, p.trim), { tex: 0, lw: 1 }); gem(c, 50, 25, 3, p.gem); }
  };
  H.crown = function (c, p, v, rn) {
    const n = 5, top = 22, band = 56, bh = 16;
    const spikes = [];
    for (let i = 0; i <= n * 2; i++) { const x = 18 + i * (64 / (n * 2)); spikes.push(x, i % 2 ? band - 4 : (i === n ? top - 6 : top + Math.abs(i - n) * 1.2)); }
    const build = cc => {
      if (v.broken) { cc.moveTo(18, band + bh); cc.lineTo(18, band - 2); for (let i = 0; i < spikes.length; i += 2) cc.lineTo(spikes[i], spikes[i + 1] + ((i / 2) % 3 === 1 ? 10 : 0)); cc.lineTo(82, band + bh); cc.closePath(); return; }
      cc.moveTo(18, band + bh); cc.lineTo(18, band); for (let i = 0; i < spikes.length; i += 2) cc.lineTo(spikes[i], spikes[i + 1]); cc.lineTo(82, band + bh); cc.closePath();
    };
    const f = v.ice || v.crystal ? lg(c, 18, 0, 82, 0, [p.trim[2], lt(p.trim[1], 0.6), p.trim[1], "#ffffff", p.trim[2]]) : metal(c, 18, 82, [p.trim[0], p.trim[1], p.trim[2], dk(p.trim[2], 0.5)]);
    part(c, build, f, { rn, tex: 18, box: [16, 10, 84, 74] });
    part(c, cc => rr(cc, 16, band, 68, bh, 3), metal(c, 16, 84, [p.trim[0], p.trim[1], p.trim[2], dk(p.trim[2], 0.5)]), { rn, tex: 8, box: [16, band, 84, band + bh] });
    for (let i = 0; i < spikes.length; i += 4) { if (v.broken && ((i / 2) % 3 === 1)) continue; glowDot(c, spikes[i], spikes[i + 1] + 1, 2.4, p.glow || p.gem); }
    for (const x of [30, 50, 70]) gem(c, x, band + bh / 2, x === 50 ? 4.6 : 3.2, p.gem, x === 50 ? "d" : null);
    if (v.door) { part(c, cc => { cc.moveTo(44, 50); cc.lineTo(44, 34); cc.quadraticCurveTo(50, 26, 56, 34); cc.lineTo(56, 50); cc.closePath(); }, "#08040f", { lw: 1.2 }); glowDot(c, 50, 42, 4.5, p.glow); }
    if (v.flame) for (let i = 0; i < 6; i++) { const x = 22 + rn() * 56; c.fillStyle = al(rn() < 0.5 ? "#fde047" : "#fb923c", 0.95); c.beginPath(); c.moveTo(x - 2, band); c.quadraticCurveTo(x - 3, band - 7, x, band - 12 - rn() * 6); c.quadraticCurveTo(x + 3, band - 7, x + 2, band); c.fill(); }
  };
  H.circlet = function (c, p, v, rn) {
    // a thin band seen in perspective with a centrepiece
    strokeP(c, OUT, 7.5, cc => cc.ellipse(50, 56, 32, 13, 0, PI * 0.05, PI * 0.95, true));
    strokeP(c, lg(c, 18, 0, 82, 0, [p.trim[2], p.trim[0], p.trim[1], p.trim[2]]), 4.2, cc => cc.ellipse(50, 56, 32, 13, 0, PI * 0.05, PI * 0.95, true));
    strokeP(c, OUT, 7.5, cc => cc.ellipse(50, 56, 32, 13, 0, PI * 0.05, PI * 0.95));
    strokeP(c, lg(c, 18, 0, 82, 0, [p.trim[1], p.trim[0], p.trim[1], p.trim[2]]), 4.2, cc => cc.ellipse(50, 56, 32, 13, 0, PI * 0.05, PI * 0.95));
    const cx = 50, cy = 64;
    part(c, cc => { cc.moveTo(cx, cy - 26); cc.quadraticCurveTo(cx + 14, cy - 12, cx + 12, cy + 2); cc.lineTo(cx, cy + 8); cc.lineTo(cx - 12, cy + 2); cc.quadraticCurveTo(cx - 14, cy - 12, cx, cy - 26); cc.closePath(); }, lg(c, cx - 12, 0, cx + 12, 0, [p.trim[2], p.trim[0], p.trim[1]]), { rn, tex: 6, box: [cx - 14, cy - 26, cx + 14, cy + 8] });
    if (v.eclipse) {
      c.fillStyle = rg(c, cx, cy - 8, 5, 14, [al("#fde68a", 1), al("#f59e0b", 0.6), al("#f59e0b", 0)]); c.beginPath(); circ(c, cx, cy - 8, 14); c.fill();
      part(c, cc => circ(cc, cx, cy - 8, 6.5), "#050308", { lw: 1 });
      strokeP(c, "#fff7d6", 0.9, cc => cc.arc(cx, cy - 8, 6.8, -2.4, -0.6));
    } else if (v.lens) {
      part(c, cc => circ(cc, cx, cy - 8, 8.5), rg(c, cx - 3, cy - 11, 0.5, 10, ["#ffffff", "#bff4ff", "#5eb9d6"]), { lw: 1.3 });
      PRISM.forEach((col, i) => { c.strokeStyle = al(col, 0.9); c.lineWidth = 1.3; c.beginPath(); c.moveTo(cx + 5, cy - 6); c.lineTo(cx + 30, cy - 18 + i * 3.5); c.stroke(); });
    } else gem(c, cx, cy - 8, 6.5, p.gem, "d");
    if (v.hollow) glowDot(c, cx, cy - 8, 8, p.glow);
    for (const s of [-1, 1]) gem(c, 50 + s * 22, 67, 2.2, p.gem);
  };
  H.bell = function (c, p, v, rn) {
    const build = cc => { cc.moveTo(50, 12); cc.bezierCurveTo(66, 12, 70, 26, 70, 44); cc.bezierCurveTo(70, 60, 80, 66, 84, 74); cc.quadraticCurveTo(50, 86, 16, 74); cc.bezierCurveTo(20, 66, 30, 60, 30, 44); cc.bezierCurveTo(30, 26, 34, 12, 50, 12); cc.closePath(); };
    part(c, build, metal(c, 16, 84, ["#f0d59a", "#b0853f", "#5b3f18", "#23180a"]), { rn, tex: 28, box: [14, 10, 86, 86], bev: 4 });
    // verdigris
    c.save(); c.beginPath(); build(c); c.clip(); for (let i = 0; i < 14; i++) { c.fillStyle = al("#5eead4", 0.35 + rn() * 0.25); c.beginPath(); circ(c, 20 + rn() * 60, 30 + rn() * 50, 1.5 + rn() * 3.5); c.fill(); } c.restore();
    part(c, cc => { cc.moveTo(22, 70); cc.quadraticCurveTo(50, 78, 78, 70); cc.lineTo(80, 74); cc.quadraticCurveTo(50, 83, 20, 74); cc.closePath(); }, p.trim[1], { tex: 0, lw: 1 });
    part(c, cc => rr(cc, 36, 40, 28, 5, 2), "#07040a", { lw: 1 });
    glowDot(c, 43, 42.5, 4, p.glow || "#67e8f9"); glowDot(c, 57, 42.5, 4, p.glow || "#67e8f9");
    part(c, cc => circ(cc, 50, 11, 4), p.trim[1], { lw: 1 });
  };

  // ------------------------------------------------------------------ CHEST ARMOUR (front)
  const C = {};
  function torso(c, p, fill, rn, o) {
    o = o || {};
    const build = cc => { cc.moveTo(34, 16); cc.quadraticCurveTo(50, 24, 66, 16); cc.lineTo(80, 24); cc.lineTo(76, 50); cc.quadraticCurveTo(72, 70, 70, 86); cc.quadraticCurveTo(50, 92, 30, 86); cc.quadraticCurveTo(28, 70, 24, 50); cc.lineTo(20, 24); cc.closePath(); };
    part(c, build, fill, { rn, tex: o.tex == null ? 30 : o.tex, box: [18, 14, 82, 92], bev: 4 });
    return build;
  }
  function pauldron(c, p, s, rn, big) {
    const x = 50 + s * 30, r = big ? 15 : 12;
    part(c, cc => { cc.moveTo(x - s * r, 30); cc.bezierCurveTo(x - s * r, 10, x + s * r * 0.9, 8, x + s * r, 30); cc.quadraticCurveTo(x, 36, x - s * r, 30); cc.closePath(); }, rg(c, x - s * 3, 16, 1, r * 1.5, [p.metal[0], p.metal[1], p.metal[3]]), { rn, tex: 8, box: [x - r, 8, x + r, 36] });
    for (let i = 1; i < 3; i++) strokeP(c, "rgba(0,0,0,.4)", 0.9, cc => { cc.moveTo(x - s * r * 0.95, 30 - i * 5); cc.quadraticCurveTo(x, 34 - i * 7, x + s * r * 0.95, 30 - i * 5); });
    strokeP(c, lt(p.trim[1], 0.2), 1.4, cc => { cc.moveTo(x - s * r, 30); cc.quadraticCurveTo(x, 36, x + s * r, 30); });
  }
  C.plate = function (c, p, v, rn) {
    const m = v.ice ? ["#ffffff", "#bfe6fb", "#5b9bc9", "#16395f"] : p.metal;
    const pp = pal(p, { metal: m });
    const build = torso(c, pp, metal(c, 20, 80, m), rn);
    c.save(); c.beginPath(); build(c); c.clip();
    strokeP(c, "rgba(0,0,0,.35)", 1.4, cc => { cc.moveTo(50, 22); cc.lineTo(50, 66); });
    strokeP(c, "rgba(255,255,255,.35)", 1, cc => { cc.moveTo(48.8, 22); cc.lineTo(48.8, 64); });
    for (let i = 0; i < 3; i++) { const y = 66 + i * 7; part(c, cc => { cc.moveTo(22, y); cc.quadraticCurveTo(50, y + 5, 78, y); cc.lineTo(78, y + 7); cc.quadraticCurveTo(50, y + 12, 22, y + 7); cc.closePath(); }, lg(c, 0, y, 0, y + 8, [m[1], m[2]]), { lw: 1 }); }
    if (v.scales) { c.strokeStyle = "rgba(0,0,0,.4)"; c.lineWidth = 0.8; for (let y = 28; y < 64; y += 6) for (let x = 24 + ((y / 6) % 2) * 3; x < 78; x += 6) { c.beginPath(); c.arc(x, y, 3, 0.1, PI - 0.1); c.stroke(); } }
    c.restore();
    part(c, cc => { cc.moveTo(34, 16); cc.quadraticCurveTo(50, 24, 66, 16); cc.lineTo(64, 21); cc.quadraticCurveTo(50, 28, 36, 21); cc.closePath(); }, p.trim[1], { lw: 1 });
    pauldron(c, pp, -1, rn, v.heavy); pauldron(c, pp, 1, rn, v.heavy);
    if (v.heartAnvil) {
      part(c, cc => { cc.moveTo(38, 40); cc.lineTo(62, 40); cc.lineTo(58, 45); cc.lineTo(56, 52); cc.lineTo(44, 52); cc.lineTo(42, 45); cc.closePath(); }, lg(c, 0, 40, 0, 52, ["#57534e", "#1c1917"]), { lw: 1 });
      glowDot(c, 50, 46, 7, "#f97316", "#fde047");
    } else gem(c, 50, 42, 5.2, p.gem, "d");
    if (v.runes) { c.strokeStyle = al(p.glow || p.gem, 0.9); c.lineWidth = 0.8; for (let i = 0; i < 4; i++) { const y = 30 + i * 8; c.beginPath(); c.moveTo(30, y); c.lineTo(40, y + 1); c.moveTo(60, y + 1); c.lineTo(70, y); c.stroke(); } }
  };
  C.mail = function (c, p, v, rn) {
    const build = torso(c, p, metal(c, 20, 80, p.metal), rn, { tex: 6 });
    c.save(); c.beginPath(); build(c); c.clip();
    c.lineWidth = 0.7;
    for (let y = 18; y < 92; y += 3.2) for (let x = 18 + ((y / 3.2) % 2) * 1.8; x < 82; x += 3.6) { c.strokeStyle = "rgba(0,0,0,.45)"; c.beginPath(); c.arc(x, y, 1.6, 0, PI); c.stroke(); c.strokeStyle = "rgba(255,255,255,.18)"; c.beginPath(); c.arc(x, y - 0.4, 1.6, PI * 1.1, PI * 1.9); c.stroke(); }
    if (v.crystal) for (let i = 0; i < 6; i++) { c.fillStyle = al(p.gem, 0.45); c.beginPath(); circ(c, 26 + rn() * 48, 26 + rn() * 50, 2 + rn() * 3); c.fill(); }
    c.restore();
    part(c, cc => rr(cc, 22, 60, 56, 7, 2), metal(c, 22, 78, LEATHER), { tex: 0 });
    part(c, cc => rr(cc, 45, 58.5, 10, 10, 2), lg(c, 0, 58, 0, 69, p.trim), { lw: 1 });
    strokeP(c, "rgba(0,0,0,.8)", 1.2, cc => rr(cc, 47.5, 61, 5, 5, 1));
    pauldron(c, p, -1, rn); pauldron(c, p, 1, rn);
    part(c, cc => { cc.moveTo(34, 16); cc.quadraticCurveTo(50, 30, 66, 16); cc.lineTo(62, 14); cc.quadraticCurveTo(50, 24, 38, 14); cc.closePath(); }, p.cloth[0], { lw: 1 });
  };
  C.robe = function (c, p, v, rn) {
    const cl = p.cloth;
    const build = cc => { cc.moveTo(36, 14); cc.quadraticCurveTo(50, 22, 64, 14); cc.lineTo(84, 26); cc.lineTo(90, 58); cc.lineTo(78, 60); cc.lineTo(74, 42); cc.quadraticCurveTo(76, 70, 82, 92); cc.quadraticCurveTo(50, 96, 18, 92); cc.quadraticCurveTo(24, 70, 26, 42); cc.lineTo(22, 60); cc.lineTo(10, 58); cc.lineTo(16, 26); cc.closePath(); };
    part(c, build, lg(c, 10, 0, 90, 0, [dk(cl[1], 0.3), cl[0], lt(cl[0], 0.15), cl[0], cl[1], dk(cl[1], 0.4)]), { rn, tex: 22, box: [10, 12, 90, 96] });
    c.save(); c.beginPath(); build(c); c.clip();
    for (const x of [38, 62]) strokeP(c, "rgba(0,0,0,.3)", 1.3, cc => { cc.moveTo(x, 50); cc.quadraticCurveTo(x + (x - 50) * 0.3, 74, x + (x - 50) * 0.5, 96); });
    if (p.motif === "stars" || v.runes) for (let i = 0; i < 9; i++) sparkle(c, 22 + rn() * 56, 30 + rn() * 60, 1.3 + rn() * 1.3, p.trim[0]);
    c.restore();
    // trim down the middle + collar
    part(c, cc => { cc.moveTo(45, 20); cc.lineTo(55, 20); cc.lineTo(57, 94); cc.lineTo(43, 94); cc.closePath(); }, lg(c, 43, 0, 57, 0, [p.trim[2], p.trim[0], p.trim[1], p.trim[2]]), { rn, tex: 4, box: [43, 20, 57, 94] });
    for (let y = 30; y < 90; y += 12) gem(c, 50, y, 1.8, p.gem);
    part(c, cc => { cc.moveTo(34, 12); cc.quadraticCurveTo(50, 30, 66, 12); cc.lineTo(70, 16); cc.quadraticCurveTo(50, 38, 30, 16); cc.closePath(); }, lg(c, 0, 12, 0, 30, p.trim), { tex: 0 });
    part(c, cc => rr(cc, 26, 50, 48, 6, 2), lg(c, 0, 50, 0, 56, [p.gem, dk(p.gem, 0.5)]), { lw: 1 });
    gem(c, 50, 53, 3.4, p.gem, "d");
    for (const s of [-1, 1]) part(c, cc => poly(cc, [50 + s * 40, 58, 50 + s * 29, 60, 50 + s * 28, 56, 50 + s * 39, 54]), p.trim[1], { lw: 0.9 });
  };
  C.jerkin = function (c, p, v, rn) {
    const Lp = v.scales ? [lt(p.metal[1], 0.2), p.metal[1], p.metal[2], p.metal[3]] : LEATHER;
    const build = torso(c, p, metal(c, 20, 80, Lp), rn);
    c.save(); c.beginPath(); build(c); c.clip();
    if (v.scales) { c.strokeStyle = "rgba(0,0,0,.45)"; c.lineWidth = 0.8; for (let y = 22; y < 92; y += 5) for (let x = 20 + ((y / 5) % 2) * 2.5; x < 82; x += 5) { c.beginPath(); c.arc(x, y, 2.5, 0.1, PI - 0.1); c.stroke(); } }
    if (v.crystal) for (let i = 0; i < 5; i++) { const x = 28 + rn() * 44, y = 30 + rn() * 50; part(c, cc => poly(cc, [x, y - 5, x + 2.5, y, x, y + 3, x - 2.5, y]), p.gem, { lw: 0.8 }); }
    c.restore();
    // quilting / stitches
    strokeP(c, "rgba(0,0,0,.45)", 1.1, cc => { cc.moveTo(50, 22); cc.lineTo(50, 90); });
    c.fillStyle = p.trim[0]; for (let y = 28; y < 84; y += 8) for (const s of [-1, 1]) { c.beginPath(); circ(c, 50 + s * 3, y, 1.1); c.fill(); }
    c.strokeStyle = al(p.trim[0], 0.9); c.lineWidth = 0.8; for (let y = 28; y < 80; y += 8) { c.beginPath(); c.moveTo(47, y); c.lineTo(53, y + 8); c.moveTo(53, y); c.lineTo(47, y + 8); c.stroke(); }
    part(c, cc => rr(cc, 22, 64, 56, 6, 2), metal(c, 22, 78, [LEATHER[2], LEATHER[1], LEATHER[3], "#000"]), { tex: 0 });
    part(c, cc => rr(cc, 45, 62.5, 10, 9, 2), lg(c, 0, 62, 0, 72, p.trim), { lw: 1 });
    for (const s of [-1, 1]) part(c, cc => { cc.moveTo(50 + s * 16, 17); cc.lineTo(50 + s * 31, 23); cc.lineTo(50 + s * 30, 34); cc.lineTo(50 + s * 18, 27); cc.closePath(); }, lg(c, 0, 17, 0, 34, [LEATHER[0], LEATHER[2]]), { lw: 1 });
  };
  C.apron = function (c, p, v, rn) {
    for (const s of [-1, 1]) strokeP(c, OUT, 5, cc => { cc.moveTo(50 + s * 14, 30); cc.quadraticCurveTo(50 + s * 22, 10, 50 + s * 6, 8); });
    for (const s of [-1, 1]) strokeP(c, LEATHER[1], 3, cc => { cc.moveTo(50 + s * 14, 30); cc.quadraticCurveTo(50 + s * 22, 10, 50 + s * 6, 8); });
    const build = cc => { cc.moveTo(32, 28); cc.lineTo(68, 28); cc.lineTo(68, 44); cc.quadraticCurveTo(82, 46, 80, 58); cc.lineTo(76, 90); cc.quadraticCurveTo(50, 94, 24, 90); cc.lineTo(20, 58); cc.quadraticCurveTo(18, 46, 32, 44); cc.closePath(); };
    part(c, build, metal(c, 20, 80, LEATHER), { rn, tex: 36, box: [18, 26, 82, 94] });
    c.save(); c.beginPath(); build(c); c.clip();
    for (let i = 0; i < 8; i++) { c.fillStyle = al("#000", 0.25); c.beginPath(); circ(c, 24 + rn() * 52, 40 + rn() * 50, 1 + rn() * 3); c.fill(); }
    for (let i = 0; i < 6; i++) glowDot(c, 26 + rn() * 48, 50 + rn() * 40, 1.6, p.glow || "#fb923c", "#fde047");
    c.restore();
    part(c, cc => rr(cc, 34, 58, 32, 16, 3), lg(c, 0, 58, 0, 74, [LEATHER[2], LEATHER[3]]), { lw: 1 });
    c.strokeStyle = al(p.trim[0], 0.9); c.lineWidth = 0.7; c.setLineDash && c.setLineDash([1.5, 1.5]); c.beginPath(); rr(c, 35.5, 59.5, 29, 13, 2.5); c.stroke(); c.setLineDash && c.setLineDash([]);
    for (const [x, y] of [[32, 30], [68, 30]]) part(c, cc => circ(cc, x, y, 2.6), p.trim[1], { lw: 1 });
    // anvil badge
    part(c, cc => poly(cc, [40, 40, 60, 40, 56, 44, 55, 49, 45, 49, 44, 44]), lg(c, 0, 40, 0, 49, p.trim), { lw: 1 });
  };
  C.carapace = function (c, p, v, rn) {
    if (v.egg) {
      const build = cc => { cc.moveTo(50, 10); cc.bezierCurveTo(74, 10, 84, 50, 80, 68); cc.bezierCurveTo(76, 88, 62, 94, 50, 94); cc.bezierCurveTo(38, 94, 24, 88, 20, 68); cc.bezierCurveTo(16, 50, 26, 10, 50, 10); cc.closePath(); };
      part(c, build, rg(c, 40, 34, 2, 60, ["#57534e", "#292524", "#0c0a09"]), { rn, tex: 30, box: [16, 10, 84, 94], bev: 4 });
      c.save(); c.beginPath(); build(c); c.clip();
      c.strokeStyle = "#fb923c"; c.lineWidth = 2; c.shadowColor = "#f97316"; c.shadowBlur = 6;
      const cracks = [[50, 14, 46, 30, 54, 42, 48, 56], [30, 40, 38, 50, 34, 64], [70, 36, 62, 48, 68, 60, 60, 74], [42, 74, 50, 82, 58, 90]];
      for (const k of cracks) { c.beginPath(); c.moveTo(k[0], k[1]); for (let i = 2; i < k.length; i += 2) c.lineTo(k[i], k[i + 1]); c.stroke(); }
      c.shadowBlur = 0; c.strokeStyle = "#fde68a"; c.lineWidth = 0.7;
      for (const k of cracks) { c.beginPath(); c.moveTo(k[0], k[1]); for (let i = 2; i < k.length; i += 2) c.lineTo(k[i], k[i + 1]); c.stroke(); }
      c.restore();
      glowDot(c, 50, 52, 9, "#f97316", "#fde047");
      return;
    }
    const segs = cc => { cc.moveTo(50, 12); cc.bezierCurveTo(70, 12, 84, 26, 82, 46); cc.bezierCurveTo(80, 70, 66, 90, 50, 94); cc.bezierCurveTo(34, 90, 20, 70, 18, 46); cc.bezierCurveTo(16, 26, 30, 12, 50, 12); cc.closePath(); };
    part(c, segs, rg(c, 42, 30, 2, 60, [p.metal[0], p.metal[1], p.metal[2], p.metal[3]]), { rn, tex: 20, box: [16, 10, 84, 96], bev: 4 });
    c.save(); c.beginPath(); segs(c); c.clip();
    for (let i = 0; i < 6; i++) { const y = 26 + i * 11; strokeP(c, "rgba(0,0,0,.5)", 1.6, cc => { cc.moveTo(14, y); cc.quadraticCurveTo(50, y + 10, 86, y); }); strokeP(c, "rgba(255,255,255,.22)", 0.8, cc => { cc.moveTo(14, y + 1.8); cc.quadraticCurveTo(50, y + 11.8, 86, y + 1.8); }); }
    strokeP(c, "rgba(0,0,0,.5)", 1.4, cc => { cc.moveTo(50, 12); cc.lineTo(50, 96); });
    c.restore();
    for (const s of [-1, 1]) part(c, cc => { cc.moveTo(50 + s * 18, 22); cc.quadraticCurveTo(50 + s * 38, 8, 50 + s * 44, 22); cc.quadraticCurveTo(50 + s * 34, 20, 50 + s * 28, 30); cc.closePath(); }, lg(c, 0, 8, 0, 30, [p.metal[0], p.metal[2]]), { lw: 1 });
    if (v.heart) {
      c.fillStyle = rg(c, 50, 48, 1, 16, [al(v.heart, 0.95), al(v.heart, 0)]); c.beginPath(); circ(c, 50, 48, 16); c.fill();
      part(c, cc => { cc.moveTo(50, 60); cc.bezierCurveTo(36, 50, 38, 38, 45, 38); cc.quadraticCurveTo(49, 38, 50, 43); cc.quadraticCurveTo(51, 38, 55, 38); cc.bezierCurveTo(62, 38, 64, 50, 50, 60); cc.closePath(); }, gemFill(c, 50, 47, 10, v.heart), { lw: 1.2 });
      c.strokeStyle = "rgba(255,255,255,.7)"; c.lineWidth = 0.6; c.beginPath(); c.moveTo(44, 42); c.lineTo(50, 50); c.lineTo(56, 42); c.stroke();
    } else { glowDot(c, 50, 44, 8, p.glow || p.gem); gem(c, 50, 44, 4.5, p.gem, "d"); }
  };
  C.mantle = function (c, p, v, rn) {
    C.robe(c, p, v, rn);
    const cl = v.ley ? ["#3b1d6e", "#140a2c"] : ["#57534e", "#1c1917"];
    const build = cc => { cc.moveTo(14, 30); cc.quadraticCurveTo(50, 6, 86, 30); cc.lineTo(92, 50); cc.quadraticCurveTo(50, 40, 8, 50); cc.closePath(); };
    part(c, build, lg(c, 0, 10, 0, 50, [lt(cl[0], 0.2), cl[0], cl[1]]), { rn, tex: 20, box: [8, 8, 92, 52] });
    c.save(); c.beginPath(); build(c); c.clip();
    if (v.ley) { PRISM.forEach((col, i) => strokeP(c, al(col, 0.85), 0.9, cc => { cc.moveTo(12 + i * 4, 48); cc.quadraticCurveTo(50, 14 + i * 3, 88 - i * 4, 48); })); }
    else for (let i = 0; i < 16; i++) { c.fillStyle = al(rn() < 0.5 ? "#fb923c" : "#78716c", 0.8); c.beginPath(); circ(c, 12 + rn() * 76, 16 + rn() * 32, 0.6 + rn() * 1.2); c.fill(); }
    c.restore();
    part(c, cc => circ(cc, 50, 30, 6.5), rg(c, 48, 28, 0.5, 7, [p.trim[0], p.trim[1], p.trim[2]]), { lw: 1.2 });
    gem(c, 50, 30, 3.4, p.gem, "d");
  };

  // ------------------------------------------------------------------ LEGS
  const LG = {};
  function legPair(c, draw) { for (const s of [-1, 1]) { c.save(); c.translate(50 + s * 13, 0); if (s < 0) c.scale(-1, 1); draw(c, s); c.restore(); } }
  LG.trousers = function (c, p, v, rn) {
    const cl = p.cloth;
    const build = cc => { cc.moveTo(22, 14); cc.lineTo(78, 14); cc.lineTo(80, 50); cc.lineTo(76, 90); cc.lineTo(56, 90); cc.lineTo(51, 38); cc.lineTo(49, 38); cc.lineTo(44, 90); cc.lineTo(24, 90); cc.lineTo(20, 50); cc.closePath(); };
    part(c, build, lg(c, 20, 0, 80, 0, [cl[1], lt(cl[0], 0.15), cl[1], lt(cl[0], 0.1), dk(cl[1], 0.3)]), { rn, tex: 30, box: [20, 12, 80, 92] });
    for (const x of [32, 68]) strokeP(c, "rgba(0,0,0,.3)", 1.1, cc => { cc.moveTo(x, 30); cc.quadraticCurveTo(x + (x - 50) * 0.1, 60, x + (x - 50) * 0.05, 88); });
    part(c, cc => rr(cc, 20, 12, 60, 8, 2), metal(c, 20, 80, LEATHER), { tex: 0 });
    part(c, cc => rr(cc, 45, 11, 10, 10, 2), lg(c, 0, 11, 0, 21, p.trim), { lw: 1 });
    for (const x of [24, 56]) part(c, cc => rr(cc, x, 84, 20, 6, 2), p.trim[2], { lw: 1 });
    for (const s of [-1, 1]) part(c, cc => ell(cc, 50 + s * 16, 54, 6, 5, 0), lg(c, 0, 49, 0, 59, [LEATHER[0], LEATHER[2]]), { lw: 1 });
  };
  LG.kilt = function (c, p, v, rn) {
    // belt + hanging leather/plate strips
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x = 20 + i * (60 / n), w = 60 / n + 1, len = 58 + ((i % 2) ? -4 : 2);
      part(c, cc => { cc.moveTo(x, 24); cc.lineTo(x + w, 24); cc.lineTo(x + w - 0.5, 24 + len); cc.quadraticCurveTo(x + w / 2, 24 + len + 4, x + 0.5, 24 + len); cc.closePath(); }, lg(c, x, 0, x + w, 0, i % 2 ? [LEATHER[1], LEATHER[2]] : [p.metal[0], p.metal[2]]), { rn, tex: 6, box: [x, 24, x + w, 90] });
      c.fillStyle = p.trim[0]; c.beginPath(); circ(c, x + w / 2, 30 + len * 0.7, 1); c.fill();
    }
    c.save(); for (let i = 0; i < 6; i++) glowDot(c, 26 + rn() * 48, 60 + rn() * 26, 1.6, p.glow || "#fb923c", "#fde047"); c.restore();
    part(c, cc => rr(cc, 16, 16, 68, 11, 3), metal(c, 16, 84, [p.trim[0], p.trim[1], p.trim[2], dk(p.trim[2], 0.4)]), { rn, tex: 6, box: [16, 16, 84, 27] });
    part(c, cc => rr(cc, 42, 13, 16, 17, 3), lg(c, 42, 13, 58, 30, [p.trim[0], p.trim[2]]), { lw: 1.1 });
    gem(c, 50, 21.5, 4, p.gem, "d");
  };
  LG.greaves = function (c, p, v, rn) {
    const m = v.ice ? ["#ffffff", "#bfe6fb", "#5b9bc9", "#16395f"] : p.metal;
    legPair(c, (cc, s) => {
      const shin = k => { k.moveTo(-9, 34); k.quadraticCurveTo(-11, 58, -8, 80); k.lineTo(10, 80); k.quadraticCurveTo(12, 56, 10, 34); k.closePath(); };
      part(cc, shin, metal(cc, -11, 12, m), { rn, tex: 14, box: [-12, 32, 12, 82] });
      strokeP(cc, "rgba(255,255,255,.35)", 1, k => { k.moveTo(-1, 40); k.lineTo(-1, 76); });
      // knee cop
      part(cc, k => { k.moveTo(-11, 32); k.bezierCurveTo(-12, 16, 12, 16, 11, 32); k.quadraticCurveTo(0, 38, -11, 32); k.closePath(); }, rg(cc, -2, 24, 0.5, 13, [m[0], m[1], m[3]]), { rn, tex: 4, box: [-12, 16, 12, 38] });
      gem(cc, 0, 27, 2.6, p.gem);
      // thigh
      part(cc, k => rr(k, -10, 6, 20, 12, 3), metal(cc, -10, 10, m), { rn, tex: 6, box: [-10, 6, 10, 18] });
      // sabaton
      part(cc, k => { k.moveTo(-9, 80); k.lineTo(10, 80); k.quadraticCurveTo(22, 84, 24, 92); k.lineTo(-9, 92); k.closePath(); }, lg(cc, 0, 80, 0, 92, [m[0], m[2]]), { lw: 1.2 });
      for (let i = 1; i < 3; i++) strokeP(cc, "rgba(0,0,0,.4)", 0.8, k => { k.moveTo(-9, 80 + i * 4); k.lineTo(10 + i * 4, 80 + i * 4); });
      if (v.wings) part(cc, k => { k.moveTo(9, 46); k.bezierCurveTo(22, 36, 30, 44, 28, 58); k.quadraticCurveTo(22, 50, 20, 60); k.quadraticCurveTo(16, 52, 10, 58); k.closePath(); }, lg(cc, 10, 40, 28, 60, ["#fff7ed", "#fdba74", "#c2410c"]), { lw: 1 });
      if (v.crystal) part(cc, k => poly(k, [-3, 48, 0, 40, 3, 48, 0, 56]), lg(cc, -3, 0, 3, 0, [lt(p.gem, 0.6), p.gem, dk(p.gem, 0.4)]), { lw: 0.9 });
      if (v.ice) { cc.fillStyle = "rgba(255,255,255,.9)"; for (const y of [44, 58, 70]) { cc.beginPath(); poly(cc, [10, y, 15, y + 2, 10, y + 4]); cc.fill(); } }
    });
  };
  LG.tassets = function (c, p, v, rn) {
    const m = p.metal;
    // belt with overlapping lames hanging in two panels, plus a mail skirt behind
    part(c, cc => { cc.moveTo(24, 30); cc.lineTo(76, 30); cc.lineTo(74, 84); cc.lineTo(26, 84); cc.closePath(); }, metal(c, 24, 76, [p.metal[1], p.metal[2], p.metal[3], "#000"]), { rn, tex: 6 });
    c.save(); c.beginPath(); rr(c, 24, 30, 52, 54, 0); c.clip(); c.lineWidth = 0.6; c.strokeStyle = "rgba(255,255,255,.2)"; for (let y = 32; y < 86; y += 3) for (let x = 24 + ((y / 3) % 2) * 1.5; x < 78; x += 3) { c.beginPath(); c.arc(x, y, 1.2, 0, PI); c.stroke(); } c.restore();
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const y = 24 + i * 12, x0 = 50 + s * 3, x1 = 50 + s * 34;
      part(c, cc => { cc.moveTo(x0, y); cc.lineTo(x1, y + 3); cc.lineTo(x1 - s * 2, y + 15); cc.lineTo(x0, y + 12); cc.closePath(); }, lg(c, 0, y, 0, y + 15, [m[0], m[1], m[2]]), { rn, tex: 4, box: [Math.min(x0, x1), y, Math.max(x0, x1), y + 15] });
      strokeP(c, lt(p.trim[1], 0.1), 1, cc => { cc.moveTo(x0, y + 12); cc.lineTo(x1 - s * 2, y + 15); });
      c.fillStyle = p.trim[0]; c.beginPath(); circ(c, 50 + s * 8, y + 5, 1.1); c.fill();
    }
    part(c, cc => rr(cc, 16, 16, 68, 10, 3), metal(c, 16, 84, [p.trim[0], p.trim[1], p.trim[2], dk(p.trim[2], 0.4)]), { rn, tex: 6, box: [16, 16, 84, 26] });
    part(c, cc => { cc.moveTo(40, 14); cc.lineTo(60, 14); cc.lineTo(58, 30); cc.lineTo(50, 34); cc.lineTo(42, 30); cc.closePath(); }, lg(c, 40, 14, 60, 34, [p.trim[0], p.trim[1], p.trim[2]]), { lw: 1.2 });
    gem(c, 50, 23, 4, p.gem, "d");
  };
  LG.boots = function (c, p, v, rn) {
    const cl = v.runes || p.motif === "stars" ? [p.cloth[0], p.cloth[1], dk(p.cloth[1], 0.4), "#000"] : LEATHER;
    for (const s of [-1, 1]) {
      c.save(); c.translate(50 + s * 14 - 6, s < 0 ? 0 : 6);
      const build = cc => { cc.moveTo(-6, 12); cc.lineTo(14, 12); cc.lineTo(15, 56); cc.quadraticCurveTo(30, 60, 32, 72); cc.lineTo(32, 78); cc.lineTo(-8, 78); cc.lineTo(-8, 56); cc.closePath(); };
      part(c, build, metal(c, -8, 32, cl), { rn, tex: 16, box: [-8, 12, 32, 78] });
      part(c, cc => { cc.moveTo(-9, 10); cc.lineTo(16, 10); cc.quadraticCurveTo(18, 18, 15, 24); cc.lineTo(-7, 24); cc.quadraticCurveTo(-11, 18, -9, 10); cc.closePath(); }, metal(c, -9, 16, [lt(cl[0], 0.2), cl[0], cl[1], cl[2]]), { tex: 0 });
      part(c, cc => rr(cc, -9, 74, 42, 5, 2), "#1c1410", { lw: 1 });
      part(c, cc => { cc.moveTo(-8, 56); cc.lineTo(15, 56); cc.quadraticCurveTo(30, 60, 32, 72); cc.lineTo(-8, 72); cc.closePath(); }, lg(c, 0, 56, 0, 72, [p.metal[0], p.metal[2]]), { lw: 1 });
      for (let y = 30; y < 54; y += 6) { strokeP(c, p.trim[0], 0.9, cc => { cc.moveTo(0, y); cc.lineTo(8, y + 3); cc.moveTo(8, y); cc.lineTo(0, y + 3); }); }
      part(c, cc => rr(cc, -8, 38, 23, 4, 1), p.trim[1], { lw: 0.8 });
      if (p.glow) glowDot(c, 20, 66, 2.4, p.glow);
      c.restore();
    }
  };

  // ------------------------------------------------------------------ RINGS
  const R = {};
  function ringBand(c, p, cx, cy, rx, ry, th, o) {
    o = o || {};
    const m = o.metal || [p.trim[0], p.trim[1], p.trim[2], dk(p.trim[2], 0.5)];
    // back half
    strokeP(c, OUT, th + 2.6, cc => cc.ellipse(cx, cy, rx, ry, 0, PI, TAU));
    strokeP(c, lg(c, cx - rx, 0, cx + rx, 0, [m[3], m[2], m[3]]), th, cc => cc.ellipse(cx, cy, rx, ry, 0, PI, TAU));
    return () => { // front half (call after the setting)
      strokeP(c, OUT, th + 2.6, cc => cc.ellipse(cx, cy, rx, ry, 0, 0, PI));
      strokeP(c, lg(c, cx - rx, 0, cx + rx, 0, [m[2], m[0], m[1], m[0], m[2]]), th, cc => cc.ellipse(cx, cy, rx, ry, 0, 0, PI));
      strokeP(c, "rgba(255,255,255,.55)", th * 0.25, cc => cc.ellipse(cx, cy - th * 0.2, rx, ry, 0, PI * 0.2, PI * 0.8));
    };
  }
  R.band = function (c, p, v, rn) {
    const front = ringBand(c, p, 50, 58, 30, 17, 9, v.ice ? { metal: ["#ffffff", "#bfe6fb", "#5b9bc9", "#16395f"] } : null);
    front();
    if (v.six) for (let i = 0; i < 6; i++) { const a = PI * (0.12 + i * 0.152); gem(c, 50 + Math.cos(a) * 30, 58 + Math.sin(a) * 17, 2.4, PRISM[i % 5]); }
    else if (v.crack) { strokeP(c, p.gem, 1.2, cc => { cc.moveTo(34, 70); cc.lineTo(38, 72); cc.lineTo(36, 75); cc.lineTo(41, 76); }); glowDot(c, 38, 73, 3, p.gem); gem(c, 60, 74, 3, p.gem, "d"); }
    else { c.strokeStyle = al(p.glow || p.gem, 0.9); c.lineWidth = 0.9; for (let i = 0; i < 5; i++) { const a = PI * (0.2 + i * 0.15); const x = 50 + Math.cos(a) * 30, y = 58 + Math.sin(a) * 17; c.beginPath(); c.moveTo(x - 1.5, y - 1.5); c.lineTo(x + 1.5, y + 1.5); c.moveTo(x + 1.5, y - 1.5); c.lineTo(x - 1.5, y + 1.5); c.stroke(); } gem(c, 50, 75, 3.4, p.gem, "d"); }
    if (v.ice) { c.fillStyle = "#fff"; for (const x of [30, 44, 58, 70]) { c.beginPath(); poly(c, [x - 1.6, 72 + (x > 50 ? 0 : 1), x, 80, x + 1.6, 72 + (x > 50 ? 0 : 1)]); c.fill(); } }
  };
  R.gemring = function (c, p, v, rn) {
    const front = ringBand(c, p, 50, 64, 26, 14, 7);
    const col = v.gemc || p.gem;
    front();
    // prongs + stone
    for (const s of [-1, 0, 1]) strokeP(c, p.trim[1], 2, cc => { cc.moveTo(50 + s * 6, 52); cc.lineTo(50 + s * 11, 36); });
    part(c, cc => poly(cc, [50, 18, 64, 30, 60, 46, 40, 46, 36, 30]), gemFill(c, 50, 32, 15, col), { lw: 1.4 });
    c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 0.7; c.beginPath(); c.moveTo(36, 30); c.lineTo(64, 30); c.moveTo(43, 30); c.lineTo(50, 18); c.lineTo(57, 30); c.moveTo(43, 30); c.lineTo(46, 46); c.moveTo(57, 30); c.lineTo(54, 46); c.stroke();
    c.fillStyle = "rgba(255,255,255,.8)"; c.beginPath(); poly(c, [44, 26, 49, 21, 47, 28]); c.fill();
    if (v.fork) { strokeP(c, OUT, 3.5, cc => { cc.moveTo(72, 18); cc.lineTo(72, 32); cc.moveTo(78, 18); cc.lineTo(78, 32); cc.moveTo(72, 32); cc.quadraticCurveTo(75, 38, 78, 32); cc.moveTo(75, 35); cc.lineTo(75, 44); }); strokeP(c, p.trim[0], 1.6, cc => { cc.moveTo(72, 18); cc.lineTo(72, 32); cc.moveTo(78, 18); cc.lineTo(78, 32); cc.moveTo(72, 32); cc.quadraticCurveTo(75, 38, 78, 32); cc.moveTo(75, 35); cc.lineTo(75, 44); }); for (const r of [4, 7]) strokeP(c, al(p.gem, 0.7), 0.8, cc => cc.arc(75, 24, r + 4, -0.9, 0.9)); }
    if (v.runes) for (let i = 0; i < 5; i++) sparkle(c, 20 + rn() * 60, 14 + rn() * 20, 1.6, "#fde68a");
  };
  R.signet = function (c, p, v, rn) {
    const front = ringBand(c, p, 50, 64, 26, 14, 8);
    front();
    part(c, cc => ell(cc, 50, 42, 19, 13, 0), rg(c, 44, 36, 1, 22, [p.trim[0], p.trim[1], p.trim[2]]), { rn, tex: 6, box: [30, 28, 70, 56], lw: 1.6 });
    part(c, cc => ell(cc, 50, 42, 14, 9, 0), v.notice ? "#b91c1c" : rg(c, 46, 38, 1, 16, [lt(p.gem, 0.3), p.gem, dk(p.gem, 0.6)]), { lw: 1 });
    const g = v.notice ? null : (SIGIL_GLYPH[p._id] || "star");
    if (v.notice) {
      // parchment scroll with wax seal
      part(c, cc => { cc.moveTo(20, 14); cc.lineTo(64, 10); cc.quadraticCurveTo(70, 18, 64, 26); cc.lineTo(22, 30); cc.quadraticCurveTo(16, 22, 20, 14); cc.closePath(); }, lg(c, 0, 10, 0, 30, ["#fef3c7", "#e7c98a", "#b88a45"]), { rn, tex: 10, box: [16, 8, 70, 32] });
      c.strokeStyle = "rgba(90,50,10,.6)"; c.lineWidth = 0.7; for (let y = 16; y < 27; y += 3.5) { c.beginPath(); c.moveTo(26, y + 1); c.lineTo(58, y - 2); c.stroke(); }
      part(c, cc => circ(cc, 50, 42, 7.5), rg(c, 48, 40, 1, 8, ["#f87171", "#b91c1c", "#5f0f0f"]), { lw: 1 });
      glyph(c, "book", 50, 42, 8, "#fecaca");
    } else glyph(c, g, 50, 42, 13, lt(p.trim[0], 0.5));
  };
  const SIGIL_GLYPH = { signet: "sword", drowned_seal: "wave", dragon_sigil: "eye", talon_signet: "claw", meteor_signet: "star", frost_signet: "snow", warden_vigil_ring: "trident", hollow_regalia_ring: "door" };
  R.twist = function (c, p, v, rn) {
    const cx = 50, cy = 56;
    const m = [p.trim[0], p.trim[1], p.trim[2], dk(p.trim[2], 0.5)], m2 = p.metal;
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < 2; k++) {
      const ph = k * PI;
      c.beginPath();
      for (let i = 0; i <= 64; i++) { const t = i / 64 * TAU; const x = cx + Math.cos(t) * 28, y = cy + Math.sin(t) * 16 + Math.sin(t * 6 + ph) * 3.2; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.strokeStyle = pass ? lg(c, 22, 0, 78, 0, k ? [m2[2], m2[0], m2[2]] : [m[2], m[0], m[1], m[2]]) : OUT; c.lineWidth = pass ? 3.4 : 6; c.stroke();
    }
    if (v.crystal || p.motif === "crystal") part(c, cc => poly(cc, [50, 24, 58, 36, 50, 50, 42, 36]), gemFill(c, 50, 36, 12, p.gem), { lw: 1.2 });
    else if (p._id === "hollow_loop" || p.motif === "void") { c.fillStyle = rg(c, 50, 56, 1, 16, ["#000", "#000", al(p.glow || "#a855f7", 0.8), al(p.glow || "#a855f7", 0)]); c.beginPath(); ell(c, 50, 56, 22, 12, 0); c.fill(); }
    else if (p._id === "binders_loop") { part(c, cc => rr(cc, 38, 26, 24, 18, 2), lg(c, 0, 26, 0, 44, [p.cloth[0], p.cloth[1]]), { lw: 1.2 }); strokeP(c, p.trim[0], 1, cc => { cc.moveTo(50, 26); cc.lineTo(50, 44); }); gem(c, 50, 35, 2.4, p.gem); }
    else gem(c, 50, 40, 5, p.gem, "d");
  };
  R.amulet = function (c, p, v, rn) {
    // chain
    for (let i = 0; i < 16; i++) { const t = i / 15, a = PI * (1.1 + 0.8 * t); const x = 50 + Math.cos(a) * 34, y = 44 + Math.sin(a) * 30; c.strokeStyle = OUT; c.lineWidth = 2.4; c.beginPath(); ell(c, x, y, 2.4, 1.5, a + PI / 2); c.stroke(); c.strokeStyle = p.trim[1]; c.lineWidth = 1.1; c.beginPath(); ell(c, x, y, 2.4, 1.5, a + PI / 2); c.stroke(); }
    const cx = 50, cy = 60;
    if (v.pearl) {
      part(c, cc => { cc.moveTo(cx - 16, cy - 10); cc.quadraticCurveTo(cx, cy - 22, cx + 16, cy - 10); cc.quadraticCurveTo(cx + 20, cy + 14, cx, cy + 20); cc.quadraticCurveTo(cx - 20, cy + 14, cx - 16, cy - 10); cc.closePath(); }, lg(c, 0, cy - 20, 0, cy + 20, [p.trim[0], p.trim[1], p.trim[2]]), { rn, tex: 6, box: [cx - 20, cy - 22, cx + 20, cy + 20] });
      part(c, cc => circ(cc, cx, cy, 11), rg(c, cx - 4, cy - 4, 1, 13, v.pearl === "#1e293b" ? ["#94a3b8", "#334155", "#020617"] : ["#ffffff", "#e0f2fe", "#94b8cc"]), { lw: 1.2 });
      c.fillStyle = "rgba(255,255,255,.9)"; c.beginPath(); ell(c, cx - 4, cy - 5, 3.5, 2, -0.6); c.fill();
      if (v.pearl === "#1e293b") glowDot(c, cx + 3, cy + 3, 4, p.glow || "#5eead4");
    } else if (v.heart) {
      c.fillStyle = rg(c, cx, cy, 1, 20, [al(v.heart, 0.9), al(v.heart, 0)]); c.beginPath(); circ(c, cx, cy, 20); c.fill();
      part(c, cc => { cc.moveTo(cx, cy + 16); cc.bezierCurveTo(cx - 22, cy + 2, cx - 16, cy - 16, cx - 6, cy - 14); cc.quadraticCurveTo(cx - 1, cy - 13, cx, cy - 8); cc.quadraticCurveTo(cx + 1, cy - 13, cx + 6, cy - 14); cc.bezierCurveTo(cx + 16, cy - 16, cx + 22, cy + 2, cx, cy + 16); cc.closePath(); }, gemFill(c, cx, cy, 16, v.heart), { lw: 1.4 });
      c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 0.7; c.beginPath(); c.moveTo(cx - 9, cy - 6); c.lineTo(cx, cy + 6); c.lineTo(cx + 9, cy - 6); c.stroke();
      if (v.ley) PRISM.forEach((col, i) => strokeP(c, al(col, 0.8), 0.8, cc => { cc.moveTo(cx, cy + 14); cc.bezierCurveTo(cx - 30 + i * 12, cy + 26, cx - 20 + i * 10, cy + 34, cx - 26 + i * 13, cy + 40); }));
    } else if (v.bell) {
      part(c, cc => { cc.moveTo(cx, cy - 16); cc.bezierCurveTo(cx + 10, cy - 16, cx + 10, cy - 4, cx + 11, cy + 4); cc.quadraticCurveTo(cx + 14, cy + 12, cx + 17, cy + 14); cc.lineTo(cx - 17, cy + 14); cc.quadraticCurveTo(cx - 14, cy + 12, cx - 11, cy + 4); cc.bezierCurveTo(cx - 10, cy - 4, cx - 10, cy - 16, cx, cy - 16); cc.closePath(); }, metal(c, cx - 17, cx + 17, ["#e9d5ff", "#8b5cf6", "#3b0764", "#12021f"]), { rn, tex: 10, box: [cx - 17, cy - 16, cx + 17, cy + 14] });
      part(c, cc => circ(cc, cx, cy + 17, 3.5), p.trim[1], { lw: 1 });
      for (const r of [22, 28]) strokeP(c, al(p.glow, 0.6), 1, cc => cc.arc(cx, cy + 4, r, -0.5, 0.5));
      for (const r of [22, 28]) strokeP(c, al(p.glow, 0.6), 1, cc => cc.arc(cx, cy + 4, r, PI - 0.5, PI + 0.5));
    } else if (v.astro) {
      part(c, cc => circ(cc, cx, cy, 17), rg(c, cx - 5, cy - 5, 1, 19, [p.trim[0], p.trim[1], p.trim[2]]), { rn, tex: 8, box: [cx - 17, cy - 17, cx + 17, cy + 17] });
      part(c, cc => circ(cc, cx, cy, 12.5), rg(c, cx, cy, 1, 13, ["#312e81", "#0b0a2a"]), { lw: 1 });
      for (let i = 0; i < 6; i++) sparkle(c, cx + (rn() - 0.5) * 18, cy + (rn() - 0.5) * 18, 1.4, "#fde68a");
      strokeP(c, p.trim[0], 1.1, cc => { cc.moveTo(cx - 12, cy); cc.lineTo(cx + 12, cy); cc.moveTo(cx, cy - 12); cc.lineTo(cx, cy + 12); });
      strokeP(c, p.trim[0], 1.3, cc => { cc.moveTo(cx - 10, cy + 8); cc.lineTo(cx + 10, cy - 8); });
      glowDot(c, cx, cy, 3, "#fde68a");
    } else { part(c, cc => poly(cc, [cx, cy - 16, cx + 12, cy, cx, cy + 18, cx - 12, cy]), lg(c, 0, cy - 16, 0, cy + 18, p.trim), { lw: 1.2 }); gem(c, cx, cy + 1, 6, p.gem, "d"); }
    part(c, cc => circ(cc, 50, cy - (v.astro ? 19 : 17), 2.4), p.trim[1], { lw: 1 });
  };
  R.eyering = function (c, p, v, rn) {
    const front = ringBand(c, p, 50, 64, 26, 14, 7);
    front();
    part(c, cc => { cc.moveTo(28, 38); cc.quadraticCurveTo(50, 18, 72, 38); cc.quadraticCurveTo(50, 58, 28, 38); cc.closePath(); }, lg(c, 0, 24, 0, 52, [p.trim[0], p.trim[2]]), { lw: 1.4 });
    part(c, cc => { cc.moveTo(33, 38); cc.quadraticCurveTo(50, 24, 67, 38); cc.quadraticCurveTo(50, 52, 33, 38); cc.closePath(); }, rg(c, 50, 38, 1, 16, ["#fff7d6", lt(p.gem, 0.3), p.gem, dk(p.gem, 0.6)]), { lw: 1 });
    part(c, cc => ell(cc, 50, 38, 2.4, 8, 0), "#07040a", { lw: 0 });
    c.fillStyle = "rgba(255,255,255,.9)"; c.beginPath(); circ(c, 46, 34, 1.6); c.fill();
  };
  R.knuckle = function (c, p, v, rn) {
    const m = p.metal;
    const build = cc => { cc.moveTo(16, 40); cc.quadraticCurveTo(16, 26, 30, 26); cc.lineTo(70, 26); cc.quadraticCurveTo(84, 26, 84, 40); cc.lineTo(84, 50); cc.quadraticCurveTo(80, 64, 64, 70); cc.lineTo(36, 70); cc.quadraticCurveTo(20, 64, 16, 50); cc.closePath(); };
    part(c, build, lg(c, 0, 26, 0, 70, [m[0], m[1], m[2], m[3]]), { rn, tex: 20, box: [16, 26, 84, 70] });
    for (let i = 0; i < 4; i++) part(c, cc => ell(cc, 26 + i * 16, 42, 6.2, 7, 0), "#07040a", { lw: 1 });
    for (let i = 0; i < 4; i++) part(c, cc => poly(cc, [20 + i * 16, 26, 26 + i * 16, 12, 32 + i * 16, 26]), lg(c, 0, 12, 0, 26, [m[0], m[2]]), { lw: 1.1 });
    part(c, cc => rr(cc, 30, 58, 40, 7, 3), lg(c, 0, 58, 0, 65, p.trim), { lw: 1 });
    gem(c, 50, 61.5, 3, p.gem, "d");
    if (p._id === "ogre_knuckle") { c.fillStyle = "rgba(127,29,29,.55)"; for (let i = 0; i < 5; i++) { c.beginPath(); circ(c, 24 + rn() * 52, 16 + rn() * 12, 1 + rn() * 1.5); c.fill(); } }
  };
  R.coil = function (c, p, v, rn) {
    for (let pass = 0; pass < 2; pass++) {
      c.beginPath();
      for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * TAU * 3.2; const x = 50 + Math.cos(a) * 26, y = 32 + t * 40 + Math.sin(a) * 9; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.strokeStyle = pass ? lg(c, 24, 0, 76, 0, [p.trim[2], p.trim[0], p.trim[1], p.trim[2]]) : OUT; c.lineWidth = pass ? 4.2 : 7; c.lineCap = "round"; c.stroke();
    }
    glowDot(c, 76, 34, 5, p.glow || "#fb923c", "#fde047"); glowDot(c, 24, 70, 4, p.glow || "#fb923c", "#fde047");
    for (let i = 0; i < 6; i++) glowDot(c, 30 + rn() * 40, 20 + rn() * 60, 1.4, "#fb923c", "#fde047");
  };
  R.keyring = function (c, p, v, rn) {
    ringBand(c, p, 34, 36, 18, 18, 5)();
    key(c, "verdigris", 58, 58, 1, rn, p);
  };

  // ------------------------------------------------------------------ small glyph library (emblems on sigils, trophies, sets, medals)
  function glyph(c, g, x, y, s, col, out) {
    const k = s / 20; // designed in a 20-unit box centred at (0,0)
    c.save(); c.translate(x, y); c.scale(k, k);
    c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 2; c.lineCap = "round"; c.lineJoin = "round";
    const F = build => { c.beginPath(); build(c); if (out !== false) { c.save(); c.strokeStyle = "rgba(0,0,0,.75)"; c.lineWidth = 3.2; c.stroke(); c.restore(); } c.fill(); };
    const S = build => { c.beginPath(); build(c); if (out !== false) { c.save(); c.strokeStyle = "rgba(0,0,0,.75)"; c.lineWidth = 4; c.stroke(); c.restore(); } c.stroke(); };
    switch (g) {
      case "trident": S(cc => { cc.moveTo(0, -9); cc.lineTo(0, 9); cc.moveTo(-6, -7); cc.quadraticCurveTo(-6, -1, 0, -1); cc.quadraticCurveTo(6, -1, 6, -7); }); F(cc => { poly(cc, [0, -10, 1.8, -6, -1.8, -6]); poly(cc, [-6, -9, -4.5, -5.5, -7.5, -5.5]); poly(cc, [6, -9, 7.5, -5.5, 4.5, -5.5]); }); break;
      case "anvil": F(cc => poly(cc, [-9, -5, 8, -5, 5, -1, 3, 1, 3, 4, 6, 7, -6, 7, -3, 4, -3, 1, -6, -1, -9, -2])); break;
      case "door": F(cc => { cc.moveTo(-6, 9); cc.lineTo(-6, -3); cc.quadraticCurveTo(0, -12, 6, -3); cc.lineTo(6, 9); cc.closePath(); }); c.fillStyle = "rgba(0,0,0,.65)"; c.beginPath(); c.moveTo(-3, 9); c.lineTo(-3, -2); c.quadraticCurveTo(0, -7, 3, -2); c.lineTo(3, 9); c.fill(); break;
      case "eye": F(cc => { cc.moveTo(-10, 0); cc.quadraticCurveTo(0, -9, 10, 0); cc.quadraticCurveTo(0, 9, -10, 0); cc.closePath(); }); c.fillStyle = "rgba(0,0,0,.85)"; c.beginPath(); ell(c, 0, 0, 1.6, 5, 0); c.fill(); break;
      case "star": F(cc => starN(cc, 0, 0, 5, 10, 4.2)); break;
      case "fork": S(cc => { cc.moveTo(-4, -9); cc.lineTo(-4, 0); cc.quadraticCurveTo(0, 5, 4, 0); cc.lineTo(4, -9); cc.moveTo(0, 3); cc.lineTo(0, 10); }); break;
      case "snow": S(cc => { for (let i = 0; i < 3; i++) { const a = i * PI / 3; cc.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); cc.lineTo(-Math.cos(a) * 9, -Math.sin(a) * 9); } for (let i = 0; i < 6; i++) { const a = i * PI / 3, bx = Math.cos(a) * 5.5, by = Math.sin(a) * 5.5; cc.moveTo(bx, by); cc.lineTo(bx + Math.cos(a + 0.8) * 3, by + Math.sin(a + 0.8) * 3); cc.moveTo(bx, by); cc.lineTo(bx + Math.cos(a - 0.8) * 3, by + Math.sin(a - 0.8) * 3); } }); break;
      case "tusk": F(cc => { cc.moveTo(-8, 8); cc.quadraticCurveTo(-10, -4, -2, -10); cc.quadraticCurveTo(-6, -2, -4, 8); cc.closePath(); cc.moveTo(8, 8); cc.quadraticCurveTo(10, -4, 2, -10); cc.quadraticCurveTo(6, -2, 4, 8); cc.closePath(); }); break;
      case "bolt": F(cc => poly(cc, [3, -10, -6, 1, -1, 1, -3, 10, 6, -2, 1, -2])); break;
      case "book": F(cc => { cc.moveTo(0, -5); cc.quadraticCurveTo(-5, -8, -10, -6); cc.lineTo(-10, 7); cc.quadraticCurveTo(-5, 5, 0, 8); cc.quadraticCurveTo(5, 5, 10, 7); cc.lineTo(10, -6); cc.quadraticCurveTo(5, -8, 0, -5); cc.closePath(); }); c.strokeStyle = "rgba(0,0,0,.6)"; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -5); c.lineTo(0, 8); c.stroke(); break;
      case "prism": F(cc => poly(cc, [0, -10, 9, 7, -9, 7])); c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); poly(c, [0, -10, 9, 7, 0, 7]); c.fill(); break;
      case "shield": F(cc => { cc.moveTo(0, -10); cc.lineTo(8, -7); cc.quadraticCurveTo(8, 5, 0, 10); cc.quadraticCurveTo(-8, 5, -8, -7); cc.closePath(); }); break;
      case "horn": F(cc => { cc.moveTo(-9, 4); cc.lineTo(3, -2); cc.quadraticCurveTo(8, -8, 10, -9); cc.lineTo(10, 7); cc.quadraticCurveTo(8, 5, 3, 3); cc.lineTo(-9, 7); cc.closePath(); }); break;
      case "egg": F(cc => { cc.moveTo(0, -10); cc.bezierCurveTo(7, -10, 8, 3, 7, 5); cc.bezierCurveTo(6, 9, 3, 10, 0, 10); cc.bezierCurveTo(-3, 10, -6, 9, -7, 5); cc.bezierCurveTo(-8, 3, -7, -10, 0, -10); cc.closePath(); }); c.strokeStyle = "rgba(0,0,0,.6)"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-5, -1); c.lineTo(-1, 2); c.lineTo(2, -2); c.lineTo(5, 1); c.stroke(); break;
      case "heart": F(cc => { cc.moveTo(0, 9); cc.bezierCurveTo(-12, 1, -9, -10, -3, -9); cc.quadraticCurveTo(-1, -8.5, 0, -5); cc.quadraticCurveTo(1, -8.5, 3, -9); cc.bezierCurveTo(9, -10, 12, 1, 0, 9); cc.closePath(); }); break;
      case "rings": S(cc => { for (let i = 0; i < 3; i++) { const a = -PI / 2 + i * TAU / 3; cc.moveTo(Math.cos(a) * 4 + 5, Math.sin(a) * 4); cc.arc(Math.cos(a) * 4, Math.sin(a) * 4, 5, 0, TAU); } }); break;
      case "flame": F(cc => { cc.moveTo(0, 10); cc.bezierCurveTo(-9, 9, -9, 0, -4, -4); cc.quadraticCurveTo(-3, 1, 0, 2); cc.quadraticCurveTo(-2, -5, 3, -10); cc.quadraticCurveTo(3, -4, 7, 0); cc.bezierCurveTo(10, 5, 6, 10, 0, 10); cc.closePath(); }); break;
      case "wave": S(cc => { for (const yy of [-4, 3]) { cc.moveTo(-10, yy); cc.quadraticCurveTo(-5, yy - 5, 0, yy); cc.quadraticCurveTo(5, yy + 5, 10, yy); } }); break;
      case "skull": F(cc => { cc.moveTo(-8, -1); cc.bezierCurveTo(-8, -12, 8, -12, 8, -1); cc.lineTo(6, 3); cc.lineTo(5, 8); cc.lineTo(-5, 8); cc.lineTo(-6, 3); cc.closePath(); }); c.fillStyle = "rgba(0,0,0,.85)"; c.beginPath(); circ(c, -3.2, -1.5, 2.3); circ(c, 3.2, -1.5, 2.3); c.fill(); c.beginPath(); poly(c, [0, 1.5, 1.2, 4, -1.2, 4]); c.fill(); break;
      case "crystal": F(cc => { poly(cc, [0, -10, 4, -3, 3, 9, -3, 9, -4, -3]); poly(cc, [-7, -3, -4, 1, -5, 9, -8, 9, -9, 2]); poly(cc, [7, -5, 9, 1, 8, 9, 5, 9, 4, 0]); }); break;
      case "key": S(cc => { cc.moveTo(-3, -5); cc.arc(-5, -5, 3.8, 0, TAU); cc.moveTo(-2, -2); cc.lineTo(8, 8); cc.moveTo(5, 5); cc.lineTo(8, 2); cc.moveTo(7, 7); cc.lineTo(9, 5); }); break;
      case "spiral": S(cc => { for (let i = 0; i <= 40; i++) { const a = i * 0.42, r = 1 + i * 0.22; i ? cc.lineTo(Math.cos(a) * r, Math.sin(a) * r) : cc.moveTo(Math.cos(a) * r, Math.sin(a) * r); } }); break;
      case "stairs": F(cc => poly(cc, [-10, 9, -10, 4, -5, 4, -5, -1, 0, -1, 0, -6, 5, -6, 5, -10, 10, -10, 10, 9])); break;
      case "sword": S(cc => { cc.moveTo(0, -10); cc.lineTo(0, 5); cc.moveTo(-5, 4); cc.lineTo(5, 4); cc.moveTo(0, 5); cc.lineTo(0, 9); }); break;
      case "swords": S(cc => { cc.moveTo(-8, -8); cc.lineTo(7, 7); cc.moveTo(8, -8); cc.lineTo(-7, 7); cc.moveTo(-8, 3); cc.lineTo(-3, 8); cc.moveTo(8, 3); cc.lineTo(3, 8); }); break;
      case "hourglass": F(cc => poly(cc, [-7, -10, 7, -10, 7, -8, 1.5, 0, 7, 8, 7, 10, -7, 10, -7, 8, -1.5, 0, -7, -8])); break;
      case "coin": F(cc => circ(cc, 0, 0, 8.5)); c.fillStyle = "rgba(0,0,0,.5)"; c.font = "bold 12px Georgia, serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("$", 0, 1); break;
      case "bag": F(cc => { cc.moveTo(-3, -7); cc.lineTo(3, -7); cc.lineTo(1.5, -4); cc.bezierCurveTo(10, -1, 10, 9, 0, 9); cc.bezierCurveTo(-10, 9, -10, -1, -1.5, -4); cc.closePath(); }); break;
      case "beam": F(cc => poly(cc, [-3, 10, -1.5, -10, 1.5, -10, 3, 10])); c.globalAlpha = 0.6; F(cc => poly(cc, [-7, 10, -3, -4, 3, -4, 7, 10])); c.globalAlpha = 1; break;
      case "rune": S(cc => { cc.moveTo(-4, -9); cc.lineTo(-4, 9); cc.moveTo(-4, -9); cc.lineTo(5, -3); cc.lineTo(-4, 2); cc.lineTo(6, 9); }); break;
      case "crown": F(cc => poly(cc, [-9, 7, -9, -6, -4.5, -1, 0, -9, 4.5, -1, 9, -6, 9, 7])); break;
      case "claw": S(cc => { for (const dx of [-5, 0, 5]) { cc.moveTo(dx - 2, 8); cc.quadraticCurveTo(dx + 3, 0, dx, -9); } }); break;
      case "hammer": F(cc => { rr(cc, -8, -9, 16, 7, 1.5); rr(cc, -1.5, -2, 3, 12, 1); }); break;
      case "numeral": break;
      default: F(cc => starN(cc, 0, 0, 4, 9, 3));
    }
    c.restore();
  }
  const BOSS_GLYPH = { warden: "trident", smith: "anvil", tyrant: "door", dragon: "eye", astraea: "star", khyra: "fork", iskarra: "snow", ogrelord: "tusk", tempest: "bolt", curator: "book", prismgolem: "prism", halvard: "shield", herald: "horn", broodmother: "egg", heart: "heart", concordant: "rings", ley_ember: "flame", ley_tide: "wave", ley_star: "star" };

  // ------------------------------------------------------------------ motifs (aura effects around an item)
  function motifBack(c, m, p, rn) {
    if (!m) return;
    const g = p.glow || p.gem;
    if (m === "orbit") { c.strokeStyle = al(g, 0.7); c.lineWidth = 1.2; for (const r of [-0.6, 0.5]) { c.beginPath(); c.ellipse(50, 50, 40, 12, r, 0, TAU); c.stroke(); } }
    if (m === "ley" || m === "prism") PRISM.forEach((col, i) => { c.strokeStyle = al(col, 0.55); c.lineWidth = 1.4; c.beginPath(); c.arc(50, 50, 30 + i * 3.2, -2.6 + i * 0.3, -0.6 + i * 0.3); c.stroke(); });
    if (m === "void") { c.fillStyle = rg(c, 50, 50, 2, 40, [al("#000000", 0.7), al(g, 0.35), al(g, 0)]); c.beginPath(); circ(c, 50, 50, 40); c.fill(); }
  }
  function motifFront(c, m, p, rn) {
    if (!m) return;
    const g = p.glow || p.gem;
    const N = 9;
    if (m === "waves") { for (let i = 0; i < 3; i++) { const y = 80 + i * 3.5; strokeP(c, al("#a5f3fc", 0.75 - i * 0.2), 1.3, cc => { cc.moveTo(10, y); for (let x = 10; x <= 90; x += 10) cc.quadraticCurveTo(x + 5, y - 4, x + 10, y); }); } for (let i = 0; i < 6; i++) { c.fillStyle = al("#e0f2fe", 0.7); c.beginPath(); circ(c, 14 + rn() * 72, 16 + rn() * 60, 0.8 + rn() * 1.4); c.fill(); } }
    if (m === "ember" || m === "ash" || m === "flames") for (let i = 0; i < N; i++) glowDot(c, 12 + rn() * 76, 12 + rn() * 76, 1 + rn() * 1.6, m === "ash" ? "#fb923c" : g, "#fde047");
    if (m === "flames") for (let i = 0; i < 5; i++) { const x = 16 + rn() * 68, y = 70 + rn() * 16; c.fillStyle = al(i % 2 ? "#fde047" : "#f97316", 0.8); c.beginPath(); c.moveTo(x - 3, y); c.quadraticCurveTo(x - 4, y - 8, x, y - 14 - rn() * 6); c.quadraticCurveTo(x + 4, y - 8, x + 3, y); c.fill(); }
    if (m === "stars" || m === "orbit") for (let i = 0; i < 6; i++) sparkle(c, 12 + rn() * 76, 12 + rn() * 76, 1.4 + rn() * 1.8, i % 2 ? "#fff7d6" : g);
    if (m === "frost") { for (let i = 0; i < 5; i++) glyph(c, "snow", 12 + rn() * 76, 12 + rn() * 76, 4 + rn() * 4, al("#e0f2fe", 0.85), false); }
    if (m === "crystal") for (let i = 0; i < 5; i++) { const x = 12 + rn() * 76, y = 12 + rn() * 76, s = 2 + rn() * 2.5; part(c, cc => poly(cc, [x, y - s * 1.6, x + s * 0.6, y, x, y + s, x - s * 0.6, y]), lg(c, x - s, 0, x + s, 0, [lt(g, 0.6), g, dk(g, 0.4)]), { lw: 0.6 }); }
    if (m === "void") for (let i = 0; i < 7; i++) { c.fillStyle = al(i % 2 ? g : "#1e0b36", 0.8); c.beginPath(); circ(c, 12 + rn() * 76, 12 + rn() * 76, 0.8 + rn() * 1.6); c.fill(); }
    if (m === "lightning") { bolt(c, 16, 22, 0.9, "#fde047"); bolt(c, 84, 76, 0.8, "#bae6fd"); }
    if (m === "steam") for (let i = 0; i < 4; i++) { c.strokeStyle = al("#e2e8f0", 0.45); c.lineWidth = 1.3; const x = 20 + rn() * 60; c.beginPath(); c.moveTo(x, 30); c.bezierCurveTo(x - 5, 24, x + 5, 18, x, 12); c.stroke(); }
    if (m === "pages") for (let i = 0; i < 3; i++) { const x = 14 + rn() * 70, y = 14 + rn() * 70, a = rn() - 0.5; c.save(); c.translate(x, y); c.rotate(a); part(c, cc => rr(cc, -4, -5, 8, 10, 0.8), "#fef3c7", { lw: 0.7 }); c.restore(); }
    if (m === "ley" || m === "prism") for (let i = 0; i < 5; i++) sparkle(c, 12 + rn() * 76, 12 + rn() * 76, 1.6 + rn() * 1.6, PRISM[i % 5]);
  }

  // ------------------------------------------------------------------ rarity frames
  // style 0..7 (worn..arcane); col/glow override (bosses/tiers reuse frames with their own colours)
  function frameBack(c, st, col, glow, rn, o) {
    o = o || {};
    const bg0 = mix(col, "#0a0812", st >= 6 ? 0.55 : 0.72), bg1 = st >= 7 ? "#07051a" : "#07060b";
    c.fillStyle = rg(c, 50, 46, 4, 70, [bg0, mix(bg0, bg1, 0.55), bg1]);
    c.beginPath(); rr(c, 3, 3, 94, 94, 12); c.fill();
    c.save(); c.beginPath(); rr(c, 3, 3, 94, 94, 12); c.clip();
    if (st >= 7) { // starfield + nebula
      const P = o.prism || PRISM;
      for (let i = 0; i < 5; i++) { const x = 10 + rn() * 80, y = 10 + rn() * 80; c.fillStyle = rg(c, x, y, 1, 26, [al(P[i % P.length], 0.3), al(P[i % P.length], 0)]); c.beginPath(); circ(c, x, y, 26); c.fill(); }
      for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,255,255,${0.25 + rn() * 0.6})`; c.beginPath(); circ(c, 5 + rn() * 90, 5 + rn() * 90, 0.25 + rn() * 0.55); c.fill(); }
      c.strokeStyle = al("#e9d5ff", 0.16); c.lineWidth = 0.8; c.beginPath(); circ(c, 50, 50, 38); c.stroke(); c.beginPath(); circ(c, 50, 50, 31); c.stroke();
      for (let i = 0; i < 12; i++) { const a = i * TAU / 12; c.save(); c.translate(50 + Math.cos(a) * 34.5, 50 + Math.sin(a) * 34.5); c.rotate(a + PI / 2); runeMark(c, (rn() * 6) | 0, 2.2, al("#e9d5ff", 0.35)); c.restore(); }
    } else if (st === 6) { // carved stone + glyph ring
      for (let i = 0; i < 26; i++) { c.fillStyle = rn() < 0.5 ? "rgba(153,246,228,.05)" : "rgba(0,0,0,.2)"; c.beginPath(); circ(c, 5 + rn() * 90, 5 + rn() * 90, 1 + rn() * 5); c.fill(); }
      c.strokeStyle = al(glow, 0.22); c.lineWidth = 0.9; c.beginPath(); circ(c, 50, 50, 36); c.stroke();
      for (let i = 0; i < 16; i++) { const a = i * TAU / 16; c.save(); c.translate(50 + Math.cos(a) * 36, 50 + Math.sin(a) * 36); c.rotate(a + PI / 2); runeMark(c, (rn() * 6) | 0, 2, al(glow, 0.35)); c.restore(); }
    } else if (st === 5) { c.strokeStyle = al(glow, 0.18); c.lineWidth = 1; c.beginPath(); circ(c, 50, 50, 36); c.stroke(); c.beginPath(); starN(c, 50, 50, 6, 36, 20, 0); c.stroke(); }
    if (st >= 4) { // god rays
      const n = st >= 7 ? 12 : 8;
      for (let i = 0; i < n; i++) {
        const a = i * TAU / n + 0.2, w = 0.13;
        c.fillStyle = lg(c, 50, 50, 50 + Math.cos(a) * 60, 50 + Math.sin(a) * 60, [al(st >= 7 ? (o.prism || PRISM)[i % 5] : glow, 0.24), al(glow, 0)]);
        c.beginPath(); c.moveTo(50, 50); c.lineTo(50 + Math.cos(a - w) * 70, 50 + Math.sin(a - w) * 70); c.lineTo(50 + Math.cos(a + w) * 70, 50 + Math.sin(a + w) * 70); c.closePath(); c.fill();
      }
    }
    // central bloom behind the item
    c.fillStyle = rg(c, 50, 50, 2, 40, [al(glow, st === 0 ? 0.08 : 0.12 + st * 0.045), al(glow, 0)]);
    c.beginPath(); circ(c, 50, 50, 42); c.fill();
    c.restore();
  }
  function runeMark(c, k, s, col) {
    c.strokeStyle = col; c.lineWidth = 0.7; c.beginPath();
    if (k === 0) { c.moveTo(0, -s); c.lineTo(0, s); c.moveTo(0, -s); c.lineTo(s * 0.8, -s * 0.2); }
    else if (k === 1) { c.moveTo(-s * 0.7, s); c.lineTo(0, -s); c.lineTo(s * 0.7, s); }
    else if (k === 2) { c.moveTo(-s * 0.7, -s); c.lineTo(s * 0.7, s); c.moveTo(s * 0.7, -s); c.lineTo(-s * 0.7, s); }
    else if (k === 3) { c.moveTo(0, -s); c.lineTo(0, s); c.moveTo(-s * 0.7, -s * 0.3); c.lineTo(s * 0.7, s * 0.3); }
    else if (k === 4) { c.arc(0, 0, s * 0.7, 0, TAU); }
    else { c.moveTo(-s * 0.6, -s); c.lineTo(-s * 0.6, s); c.lineTo(s * 0.6, -s * 0.2); }
    c.stroke();
  }
  function frameRim(c, st, col, glow, rn, o) {
    o = o || {};
    const P = o.prism || PRISM;
    const outer = cc => rr(cc, 3, 3, 94, 94, 12), inner = cc => rr(cc, 7.5, 7.5, 85, 85, 9);
    // vignette
    c.save(); c.beginPath(); outer(c); c.clip();
    c.strokeStyle = "rgba(0,0,0,.45)"; c.lineWidth = 10; c.beginPath(); rr(c, 1, 1, 98, 98, 13); c.stroke(); c.restore();
    let rimFill;
    const w = [2, 2.4, 3, 3.6, 4.4, 4.6, 5.2, 5.4][st];
    if (st >= 7) {
      if (c.createConicGradient) { rimFill = c.createConicGradient(-PI / 4, 50, 50); P.concat([P[0]]).forEach((q, i, arr) => rimFill.addColorStop(i / (arr.length - 1), q)); }
      else rimFill = lg(c, 0, 0, 100, 100, P);
    } else if (st === 6) rimFill = lg(c, 0, 0, 100, 100, ["#ccfbf1", "#2dd4bf", "#115e59", "#5eead4", "#134e4a"]);
    else if (st >= 4) rimFill = lg(c, 0, 0, 100, 100, [lt(col, 0.7), col, dk(col, 0.45), lt(col, 0.35), dk(col, 0.55)]);
    else if (st >= 2) rimFill = lg(c, 0, 0, 100, 100, [lt(col, 0.45), col, dk(col, 0.35)]);
    else rimFill = lg(c, 0, 0, 100, 100, [lt(col, 0.2), dk(col, 0.25)]);
    c.lineJoin = "round";
    c.strokeStyle = "rgba(0,0,0,.85)"; c.lineWidth = w + 2.2; c.beginPath(); rr(c, 3 + w / 2, 3 + w / 2, 94 - w, 94 - w, 12 - w / 3); c.stroke();
    c.strokeStyle = rimFill; c.lineWidth = w; c.beginPath(); rr(c, 3 + w / 2, 3 + w / 2, 94 - w, 94 - w, 12 - w / 3); c.stroke();
    // bevel highlights on the rim
    c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 0.6; c.beginPath(); rr(c, 3.4, 3.4, 93.2, 93.2, 11.8); c.stroke();
    if (st >= 2) { c.strokeStyle = al(dk(col, 0.6), 0.9); c.lineWidth = 0.8; c.beginPath(); rr(c, 3 + w + 0.4, 3 + w + 0.4, 94 - 2 * w - 0.8, 94 - 2 * w - 0.8, 10 - w / 3); c.stroke(); }
    if (st >= 3) { c.strokeStyle = al(glow, 0.55); c.lineWidth = 0.7; c.beginPath(); rr(c, 3 + w + 2, 3 + w + 2, 94 - 2 * w - 4, 94 - 2 * w - 4, 8); c.stroke(); }
    // corners
    const corners = [[9, 9, 1, 1], [91, 9, -1, 1], [9, 91, 1, -1], [91, 91, -1, -1]];
    if (st === 2) for (const [x, y] of corners) { part(c, cc => circ(cc, x - (x > 50 ? 1 : -1) * 0.5, y - (y > 50 ? 1 : -1) * 0.5, 2.1), rg(c, x - 0.6, y - 0.6, 0.2, 2.4, ["#ffffff", col, dk(col, 0.5)]), { lw: 0.8 }); }
    if (st === 3) for (const [x, y, sx, sy] of corners) {
      strokeP(c, "rgba(0,0,0,.8)", 3.2, cc => { cc.moveTo(x + sx * 12, y - sy * 1); cc.lineTo(x, y); cc.lineTo(x - sx * 1, y + sy * 12); });
      strokeP(c, lt(col, 0.35), 1.6, cc => { cc.moveTo(x + sx * 12, y - sy * 1); cc.lineTo(x, y); cc.lineTo(x - sx * 1, y + sy * 12); });
      part(c, cc => poly(cc, [x, y - 2.4, x + 2.4, y, x, y + 2.4, x - 2.4, y]), lt(col, 0.5), { lw: 0.8 });
    }
    if (st === 4 || st === 5) for (const [x, y, sx, sy] of corners) {
      part(c, cc => { cc.moveTo(x - sx * 3, y - sy * 3); cc.lineTo(x + sx * 13, y - sy * 3); cc.quadraticCurveTo(x + sx * 5, y + sy * 1, x + sx * 3, y + sy * 3); cc.quadraticCurveTo(x + sx * 1, y + sy * 5, x - sx * 3, y + sy * 13); cc.closePath(); }, lg(c, x - 3, y - 3, x + 10, y + 10, [lt(col, 0.7), col, dk(col, 0.5)]), { lw: 1 });
      if (st === 5) part(c, cc => poly(cc, [x - sx * 5, y - sy * 5, x + sx * 5, y - sy * 1, x + sx * 1, y + sy * 1, x - sx * 1, y + sy * 5]), lg(c, x - 5, y - 5, x + 5, y + 5, [lt(col, 0.8), col]), { lw: 0.9 });
      gem(c, x + sx * 1.8, y + sy * 1.8, 2.1, st === 5 ? "#f0abfc" : "#fef3c7", "d");
    }
    if (st >= 4) { // crest on top edge
      part(c, cc => poly(cc, [50, 0.5, 55, 5, 50, 9.5, 45, 5]), lg(c, 45, 0, 55, 10, st >= 7 ? [P[0], P[2], P[4]] : st === 6 ? ["#ccfbf1", "#0f766e"] : [lt(col, 0.7), dk(col, 0.4)]), { lw: 1 });
      gem(c, 50, 5, 1.8, st >= 7 ? "#ffffff" : glow, "d");
      if (st >= 5) part(c, cc => poly(cc, [50, 90.5, 54, 95, 50, 99, 46, 95]), lg(c, 46, 90, 54, 99, st >= 7 ? [P[3], P[1]] : [lt(col, 0.7), dk(col, 0.4)]), { lw: 0.9 });
    }
    if (st === 6) for (const [x, y] of corners) { part(c, cc => rr(cc, x - 4.5, y - 4.5, 9, 9, 2), lg(c, x - 4, y - 4, x + 4, y + 4, ["#99f6e4", "#0f766e", "#042f2e"]), { lw: 1 }); c.save(); c.translate(x, y); runeMark(c, (rn() * 6) | 0, 2.4, "#ccfbf1"); c.restore(); }
    if (st >= 7) {
      for (const [x, y] of corners) { sparkle(c, x, y, 6.5, "#ffffff"); }
      for (const [x, y, i] of [[3.5, 50, 0], [96.5, 50, 1], [50, 96.5, 2]]) { part(c, cc => circ(cc, x, y, 3.4), rg(c, x - 1, y - 1, 0.2, 3.8, ["#ffffff", P[i + 1], dk(P[i + 1], 0.5)]), { lw: 0.9 }); }
      c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 0.5; c.beginPath(); rr(c, 1.6, 1.6, 96.8, 96.8, 13); c.stroke();
    }
  }
  function frame(c, rarity) { const I = rinfo(rarity); return { st: I.st, col: I.col, glow: I.glow, prism: I.prism }; }

  // ------------------------------------------------------------------ badges
  function plusBadge(c, n) {
    const col = n >= 12 ? "#f472b6" : n >= 10 ? "#f87171" : n >= 7 ? "#fbbf24" : "#e2e8f0";
    const txt = "+" + n, w = 9 + txt.length * 5.2;
    part(c, cc => rr(cc, 94 - w, 5, w, 13, 6), lg(c, 0, 5, 0, 18, [dk(col, 0.35), dk(col, 0.75)]), { lw: 1.2 });
    c.strokeStyle = al(col, 0.9); c.lineWidth = 0.8; c.beginPath(); rr(c, 95 - w, 6, w - 2, 11, 5); c.stroke();
    c.font = "900 11px Georgia, 'Times New Roman', serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.lineWidth = 2.4; c.strokeStyle = "rgba(0,0,0,.9)"; c.strokeText(txt, 94 - w / 2, 12);
    c.fillStyle = lt(col, 0.4); c.fillText(txt, 94 - w / 2, 12);
  }
  function sockets(c, n, gems) {
    const gap = 9.5, x0 = 50 - (n - 1) * gap / 2, y = 90;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap, id = gems && gems[i];
      part(c, cc => circ(cc, x, y, 4.2), rg(c, x - 1, y - 1, 0.3, 4.6, ["#6b7280", "#1f2937", "#030712"]), { lw: 1.1 });
      if (id) {
        const g = gemInfo(id);
        if (g.rune) { part(c, cc => poly(cc, [x, y - 3.4, x + 3.1, y, x, y + 3.4, x - 3.1, y]), gemFill(c, x, y, 3.4, g.color), { lw: 0.8 }); }
        else { c.fillStyle = gemFill(c, x, y, 3.2, g.color); c.beginPath(); circ(c, x, y, 3.1); c.fill(); c.fillStyle = "rgba(255,255,255,.85)"; c.beginPath(); circ(c, x - 1, y - 1.1, 0.9); c.fill(); }
      } else { c.fillStyle = "rgba(0,0,0,.9)"; c.beginPath(); circ(c, x, y, 2.4); c.fill(); }
    }
  }
  function setPip(c, setId) {
    const g = SET_GLYPH[setId] || "star";
    part(c, cc => { cc.moveTo(6, 74); cc.lineTo(22, 74); cc.lineTo(22, 86); cc.quadraticCurveTo(22, 92, 14, 96); cc.quadraticCurveTo(6, 92, 6, 86); cc.closePath(); }, lg(c, 6, 74, 22, 96, ["#6ee7b7", "#059669", "#064e3b"]), { lw: 1.2 });
    c.strokeStyle = "rgba(209,250,229,.8)"; c.lineWidth = 0.6; c.beginPath(); c.moveTo(7.5, 75.5); c.lineTo(20.5, 75.5); c.stroke();
    glyph(c, g, 14, 84, 10, "#ecfdf5");
  }
  function uniqueMark(c) {
    // orange-gold double-border corners + a star in the top-left
    for (const [x, y, sx, sy] of [[10, 10, 1, 1], [90, 10, -1, 1], [10, 90, 1, -1], [90, 90, -1, -1]]) {
      strokeP(c, "rgba(0,0,0,.8)", 2.6, cc => { cc.moveTo(x + sx * 9, y); cc.lineTo(x, y); cc.lineTo(x, y + sy * 9); });
      strokeP(c, "#fb923c", 1.2, cc => { cc.moveTo(x + sx * 9, y); cc.lineTo(x, y); cc.lineTo(x, y + sy * 9); });
    }
    part(c, cc => starN(cc, 13, 13, 5, 6.5, 2.8), lg(c, 7, 7, 19, 19, ["#fff7ed", "#fb923c", "#9a3412"]), { lw: 1.1 });
  }

  // ------------------------------------------------------------------ public painters
  const ICON_BOX = 0.84; // item art scale inside frames
  const WEAPON_BOX = 0.88, WEAPON_W = 1.3; // weapons: bigger along the diagonal, and chunkier across it
  function paintGearArt(c, look, rn) {
    const p = look.p, v = look.v;
    p._id = look.id;
    const fam = look.fam;
    c.save();
    c.translate(50, 50);
    if (look.slot === "weapon") { c.rotate(PI / 4); c.scale(WEAPON_W * WEAPON_BOX, WEAPON_BOX); (W[fam] || W.sword)(c, p, v, rn); }
    else { c.scale(ICON_BOX, ICON_BOX); c.translate(-50, -50); const tbl = look.slot === "helmet" ? H : look.slot === "chest" ? C : look.slot === "legs" ? LG : R; (tbl[fam] || tbl[Object.keys(tbl)[0]])(c, p, v, rn); }
    c.restore();
  }
  function normItem(item) {
    if (typeof item === "string") return { base: item };
    return item || {};
  }
  function gearKey(it, size) {
    const g = (it.gems || []).join(",");
    return ["gear", it.base || it.tome || "?", it.rarity || "", it.uq ? 1 : 0, it.set || "", it.plus | 0, it.sockets | 0, g, it.lvl | 0].join("|");
  }
  function gear(item, size) {
    const it = normItem(item);
    if (it.slot === "tome" || it.tome) return tome(it.tome || it.base, size, it.rarity);
    const E = EC();
    const b = E && E.GEAR_BASE_BY_ID ? E.GEAR_BASE_BY_ID[it.base] : null;
    const rarity = it.rarity || (b && (b.unique || b.set) ? "legendary" : "fine");
    const isUq = !!(it.uq || (b && b.unique));
    const setId = it.set || (b && b.set) || null;
    return render(gearKey(Object.assign({}, it, { rarity, uq: isUq, set: setId }), size), size || 64, (c, px, rn) => {
      const look = lookFor(it.base || "", it.slot, b ? b.lvl || it.lvl : it.lvl);
      look.id = it.base || "";
      const F = frame(c, rarity);
      frameBack(c, F.st, F.col, F.glow, rn, F);
      motifBack(c, look.p.motif, look.p, rn);
      const artRn = rng("art:" + (it.base || ""));
      composite(c, px, lc => paintGearArt(lc, look, artRn), { glow: F.st >= 2 ? F.glow : null, glowA: 0.35 + F.st * 0.08, rim: F.st >= 1 ? lt(F.glow, 0.3) : "rgba(255,255,255,.5)" });
      motifFront(c, (isUq || F.st >= 4) ? look.p.motif : null, look.p, rng("motif:" + (it.base || "")));
      frameRim(c, F.st, F.col, F.glow, rn, F);
      if (isUq) uniqueMark(c);
      if (setId) setPip(c, setId);
      if ((it.plus | 0) > 0) plusBadge(c, it.plus | 0);
      if ((it.sockets | 0) > 0) sockets(c, it.sockets | 0, it.gems || []);
    });
  }
  function rarityFrame(rarity, size) {
    return render("frame|" + rarity, size || 64, (c, px, rn) => { const F = frame(c, rarity); frameBack(c, F.st, F.col, F.glow, rn, F); frameRim(c, F.st, F.col, F.glow, rn, F); });
  }

  // ---- gems & runes
  function gemInfo(id) {
    const E = EC();
    const s = String(id || "");
    if (/^rune_/.test(s)) { const r = E && E.RUNES && E.RUNES[s]; return { rune: true, id: s, color: (r && r.color) || RUNE_COL[s] || "#a78bfa", grade: 1 }; }
    const parsed = E && E.parseGem ? E.parseGem(s) : null;
    const type = parsed ? parsed.type : s.split(":")[0];
    const grade = parsed ? parsed.grade : Math.max(1, Math.min(5, +(s.split(":")[1] || 1) | 0));
    const g = E && E.GEMS && E.GEMS[type];
    return { rune: false, type, grade, color: (g && g.color) || GEM_COL[type] || "#e5e7eb" };
  }
  const GEM_COL = { ruby: "#ef4444", sapphire: "#3b82f6", emerald: "#22c55e", topaz: "#f59e0b", amethyst: "#a855f7", onyx: "#334155", diamond: "#e0f2fe" };
  const RUNE_COL = { rune_storm: "#38bdf8", rune_haste: "#22d3ee", rune_greed: "#fde047", rune_tide: "#0ea5e9" };
  const RUNE_GLYPH = { rune_storm: "bolt", rune_haste: "hourglass", rune_greed: "coin", rune_tide: "wave" };
  const GRADE_RARITY = ["worn", "fine", "rare", "epic", "legendary"];
  function gemShape(c, type, cx, cy, s, col) {
    const f = gemFill(c, cx, cy, s, col);
    const facet = (pts) => { c.strokeStyle = "rgba(255,255,255,.5)"; c.lineWidth = 0.7; c.beginPath(); for (let i = 0; i < pts.length; i += 4) { c.moveTo(pts[i], pts[i + 1]); c.lineTo(pts[i + 2], pts[i + 3]); } c.stroke(); };
    if (type === "ruby") { // cushion oval
      part(c, cc => ell(cc, cx, cy, s, s * 0.82, 0), f, { lw: 1.4 });
      part(c, cc => ell(cc, cx, cy, s * 0.52, s * 0.42, 0), rg(c, cx - s * 0.2, cy - s * 0.2, 0.2, s * 0.6, [lt(col, 0.6), col]), { lw: 0.7, stroke: "rgba(255,255,255,.45)" });
      facet([cx - s, cy, cx - s * 0.52, cy, cx + s, cy, cx + s * 0.52, cy, cx, cy - s * 0.82, cx, cy - s * 0.42, cx, cy + s * 0.82, cx, cy + s * 0.42]);
    } else if (type === "sapphire") { // emerald-cut octagon
      const o = s * 0.3;
      part(c, cc => poly(cc, [cx - s + o, cy - s * 0.8, cx + s - o, cy - s * 0.8, cx + s, cy - s * 0.8 + o, cx + s, cy + s * 0.8 - o, cx + s - o, cy + s * 0.8, cx - s + o, cy + s * 0.8, cx - s, cy + s * 0.8 - o, cx - s, cy - s * 0.8 + o]), f, { lw: 1.4 });
      for (const k of [0.66, 0.36]) { c.strokeStyle = "rgba(255,255,255,.4)"; c.lineWidth = 0.7; c.beginPath(); rr(c, cx - s * k, cy - s * 0.8 * k, s * 2 * k, s * 1.6 * k, s * 0.12); c.stroke(); }
    } else if (type === "emerald") { // long step cut
      part(c, cc => poly(cc, [cx - s * 0.6, cy - s, cx + s * 0.6, cy - s, cx + s * 0.8, cy - s * 0.8, cx + s * 0.8, cy + s * 0.8, cx + s * 0.6, cy + s, cx - s * 0.6, cy + s, cx - s * 0.8, cy + s * 0.8, cx - s * 0.8, cy - s * 0.8]), f, { lw: 1.4 });
      for (const k of [0.7, 0.4]) { c.strokeStyle = "rgba(255,255,255,.4)"; c.lineWidth = 0.7; c.beginPath(); c.rect(cx - s * 0.8 * k, cy - s * k, s * 1.6 * k, s * 2 * k); c.stroke(); }
    } else if (type === "topaz") { // pear / teardrop
      part(c, cc => { cc.moveTo(cx, cy - s * 1.1); cc.bezierCurveTo(cx + s * 0.4, cy - s * 0.5, cx + s * 0.9, cy - s * 0.1, cx + s * 0.9, cy + s * 0.3); cc.arc(cx, cy + s * 0.3, s * 0.9, 0, PI); cc.bezierCurveTo(cx - s * 0.9, cy - s * 0.1, cx - s * 0.4, cy - s * 0.5, cx, cy - s * 1.1); cc.closePath(); }, f, { lw: 1.4 });
      facet([cx, cy - s * 1.1, cx, cy + s * 0.3, cx - s * 0.9, cy + s * 0.3, cx, cy + s * 0.3, cx + s * 0.9, cy + s * 0.3, cx, cy + s * 0.3, cx, cy + s * 1.2, cx, cy + s * 0.3]);
    } else if (type === "amethyst") { // crystal cluster point
      for (const [dx, h, w] of [[-s * 0.55, s * 1.3, s * 0.36], [s * 0.55, s * 1.2, s * 0.34], [0, s * 1.75, s * 0.46]]) {
        part(c, cc => poly(cc, [cx + dx - w, cy + s, cx + dx - w, cy + s - h * 0.7, cx + dx, cy + s - h, cx + dx + w, cy + s - h * 0.7, cx + dx + w, cy + s]), lg(c, cx + dx - w, 0, cx + dx + w, 0, [lt(col, 0.55), col, dk(col, 0.5)]), { lw: 1.2 });
        strokeP(c, "rgba(255,255,255,.5)", 0.6, cc => { cc.moveTo(cx + dx, cy + s - h); cc.lineTo(cx + dx, cy + s); });
      }
    } else if (type === "onyx") { // banded cabochon
      part(c, cc => ell(cc, cx, cy, s, s * 0.8, 0), rg(c, cx - s * 0.3, cy - s * 0.35, 0.2, s * 1.2, ["#64748b", "#1e293b", "#020617"]), { lw: 1.4 });
      c.save(); c.beginPath(); ell(c, cx, cy, s, s * 0.8, 0); c.clip(); for (const k of [-0.35, 0.05, 0.45]) strokeP(c, "rgba(226,232,240,.55)", 0.9, cc => { cc.moveTo(cx - s, cy + s * k); cc.quadraticCurveTo(cx, cy + s * (k - 0.3), cx + s, cy + s * k); }); c.restore();
      c.fillStyle = "rgba(255,255,255,.75)"; c.beginPath(); ell(c, cx - s * 0.35, cy - s * 0.4, s * 0.3, s * 0.14, -0.5); c.fill();
    } else { // diamond brilliant
      part(c, cc => poly(cc, [cx - s, cy - s * 0.25, cx - s * 0.55, cy - s * 0.75, cx + s * 0.55, cy - s * 0.75, cx + s, cy - s * 0.25, cx, cy + s * 1.05]), lg(c, cx - s, cy - s, cx + s, cy + s, ["#ffffff", "#dbeafe", "#93c5fd", "#e0f2fe", "#7dd3fc"]), { lw: 1.4 });
      facet([cx - s, cy - s * 0.25, cx + s, cy - s * 0.25, cx - s * 0.55, cy - s * 0.75, cx - s * 0.2, cy - s * 0.25, cx + s * 0.55, cy - s * 0.75, cx + s * 0.2, cy - s * 0.25, cx - s * 0.2, cy - s * 0.25, cx, cy + s * 1.05, cx + s * 0.2, cy - s * 0.25, cx, cy + s * 1.05, cx - s * 0.6, cy - s * 0.25, cx, cy + s * 1.05, cx + s * 0.6, cy - s * 0.25, cx, cy + s * 1.05]);
      for (const [a, b] of [[0.3, 0.2], [0.75, 0.5]]) { c.fillStyle = "rgba(180,220,255,.25)"; c.beginPath(); poly(c, [cx, cy + s * 1.05, cx - s * a, cy - s * 0.25, cx - s * b, cy - s * 0.25]); c.fill(); }
    }
    c.fillStyle = "rgba(255,255,255,.85)"; c.beginPath(); star4(c, cx - s * 0.35, cy - s * 0.45, s * 0.28, s * 0.05); c.fill();
  }
  function gemIcon(id, size) {
    const gi = gemInfo(id);
    return render("gem|" + (gi.rune ? gi.id : gi.type + ":" + gi.grade), size || 64, (c, px, rn) => {
      const rarity = gi.rune ? "mythic" : GRADE_RARITY[gi.grade - 1] || "fine";
      const F = frame(c, rarity);
      frameBack(c, F.st, gi.color, lt(gi.color, 0.35), rn, F);
      composite(c, px, lc => {
        if (gi.rune) {
          lc.save(); lc.translate(50, 52);
          part(lc, cc => { cc.moveTo(-18, -26); cc.lineTo(16, -30); cc.lineTo(22, 24); cc.lineTo(-20, 28); cc.closePath(); }, rg(lc, -6, -10, 2, 40, ["#9ca3af", "#4b5563", "#1f2937"]), { rn: rng("runestone"), tex: 26, box: [-22, -30, 22, 30], bev: 4 });
          lc.shadowColor = gi.color; lc.shadowBlur = px * 0.05;
          glyph(lc, "rune", 0, -1, 30, lt(gi.color, 0.2), false);
          glyph(lc, RUNE_GLYPH[gi.id] || "star", 0, -1, 14, "#ffffff", false);
          lc.shadowBlur = 0; lc.restore();
        } else {
          const s = 15 + gi.grade * 3.2;
          if (gi.grade >= 4) { // gold setting
            for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + PI / 6; strokeP(lc, OUT, 4.5, cc => { cc.moveTo(50, 52); cc.lineTo(50 + Math.cos(a) * (s + 4), 52 + Math.sin(a) * (s + 4)); }); strokeP(lc, "#fbbf24", 2.4, cc => { cc.moveTo(50, 52); cc.lineTo(50 + Math.cos(a) * (s + 4), 52 + Math.sin(a) * (s + 4)); }); }
          }
          gemShape(lc, gi.type, 50, 52, s, gi.color);
          if (gi.grade === 1) { lc.strokeStyle = "rgba(0,0,0,.5)"; lc.lineWidth = 1; lc.beginPath(); lc.moveTo(50 - s * 0.5, 52 - s * 0.2); lc.lineTo(50 - s * 0.1, 52 + s * 0.3); lc.lineTo(50 + s * 0.2, 52 + s * 0.1); lc.stroke(); }
        }
      }, { glow: lt(gi.color, 0.2), glowA: 0.4 + (gi.rune ? 0.4 : gi.grade * 0.1), rim: "rgba(255,255,255,.6)" });
      if (!gi.rune && gi.grade >= 3) for (let i = 0; i < gi.grade; i++) sparkle(c, 18 + rn() * 64, 16 + rn() * 64, 1.8 + rn() * 2, "#ffffff");
      frameRim(c, F.st, gi.color, lt(gi.color, 0.35), rn, F);
      if (!gi.rune) { // grade pips
        for (let i = 0; i < gi.grade; i++) { const x = 50 - (gi.grade - 1) * 3.5 + i * 7; part(c, cc => poly(cc, [x, 86, x + 2.6, 89, x, 92, x - 2.6, 89]), lt(gi.color, 0.4), { lw: 0.9 }); }
      }
    });
  }

  // ---- materials, keys
  function key(c, kind, x, y, s, rn, p) {
    const M = kind === "gold" || kind === "gilded" ? ["#fff7c2", "#fbbf24", "#a16207", "#422006"] : kind === "verdigris" ? ["#e7f5e9", "#9fbfa8", "#4a6b58", "#17261d"] : kind === "shard" ? ["#f5d0fe", "#c084fc", "#6b21a8", "#2e1065"] : ["#ffffff", "#cbd5e1", "#64748b", "#1e293b"];
    c.save(); c.translate(x, y); c.rotate(-PI / 4); c.scale(s, s);
    // bow
    if (kind === "gilded") {
      part(c, cc => { starN(cc, 0, -22, 8, 14, 10, 0); }, rg(c, -4, -26, 1, 16, [M[0], M[1], M[2]]), { rn, tex: 8, box: [-14, -36, 14, -8] });
      part(c, cc => circ(cc, 0, -22, 6), "#0b0710", { lw: 1 }); gem(c, 0, -22, 4.2, "#ef4444");
    } else if (kind === "shard") {
      part(c, cc => poly(cc, [0, -38, 10, -24, 6, -10, -6, -10, -10, -24]), lg(c, -10, 0, 10, 0, [M[0], M[1], M[2]]), { lw: 1.3 });
      glowDot(c, 0, -24, 5, "#f0abfc");
      c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 0.7; c.beginPath(); c.moveTo(0, -38); c.lineTo(0, -10); c.moveTo(-10, -24); c.lineTo(10, -24); c.stroke();
    } else {
      part(c, cc => { circ(cc, 0, -22, 12); }, rg(c, -4, -26, 1, 14, [M[0], M[1], M[2]]), { rn, tex: 8, box: [-12, -34, 12, -10] });
      part(c, cc => circ(cc, 0, -22, 6), "#0b0710", { lw: 1 });
      if (p) gem(c, 0, -30, 2.4, p.gem);
    }
    // shaft + bit
    part(c, cc => rr(cc, -3, -11, 6, 44, 2), metal(c, -3, 3, M), { lw: 1.3 });
    part(c, cc => poly(cc, [3, 18, 13, 18, 13, 22, 9, 22, 9, 26, 13, 26, 13, 31, 3, 31]), lg(c, 3, 0, 13, 0, [M[0], M[2]]), { lw: 1.2 });
    part(c, cc => rr(cc, -6, -12, 12, 4, 1.5), M[1], { lw: 1 });
    c.restore();
  }
  function matIcon(id, size) {
    const E = EC();
    const m = (E && E.MATERIALS && E.MATERIALS[id]) || null;
    const col = (m && m.color) || "#c4b5fd";
    const kind = m ? m.kind : /^sigil_/.test(id) ? "sigil" : "mat";
    const rar = id === "dust" ? "rare" : id === "shard" ? "epic" : id === "ember" ? "mythic" : kind === "key" ? "legendary" : kind === "sigil" ? "legendary" : "fine";
    return render("mat|" + id, size || 64, (c, px, rn) => {
      const F = frame(c, rar);
      frameBack(c, F.st, col, lt(col, 0.3), rn, F);
      composite(c, px, lc => {
        if (id === "dust") {
          // glass vial of glittering dust + a spilled heap
          part(lc, cc => { cc.moveTo(20, 80); cc.quadraticCurveTo(50, 56, 84, 80); cc.quadraticCurveTo(52, 90, 20, 80); cc.closePath(); }, rg(lc, 52, 72, 1, 30, [lt(col, 0.5), col, dk(col, 0.5)]), { rn, tex: 30, box: [20, 60, 84, 90] });
          lc.save(); lc.translate(46, 44); lc.rotate(-0.35);
          part(lc, cc => { cc.moveTo(-8, -26); cc.lineTo(8, -26); cc.lineTo(8, -18); cc.bezierCurveTo(20, -12, 20, 22, 0, 24); cc.bezierCurveTo(-20, 22, -20, -12, -8, -18); cc.closePath(); }, "rgba(220,230,255,.22)", { lw: 1.3 });
          part(lc, cc => { cc.moveTo(-15.5, 2); cc.quadraticCurveTo(0, -3, 15.5, 2); cc.bezierCurveTo(15, 18, 8, 23, 0, 23); cc.bezierCurveTo(-8, 23, -15, 18, -15.5, 2); cc.closePath(); }, rg(lc, 0, 12, 1, 16, [lt(col, 0.6), col, dk(col, 0.4)]), { lw: 0 });
          part(lc, cc => rr(cc, -9.5, -32, 19, 7, 2), metal(lc, -9, 9, WOOD), { lw: 1.1 });
          strokeP(lc, "rgba(255,255,255,.55)", 1.2, cc => { cc.moveTo(-11, -8); cc.quadraticCurveTo(-14, 6, -9, 16); });
          lc.restore();
          for (let i = 0; i < 14; i++) sparkle(lc, 18 + rn() * 66, 20 + rn() * 64, 0.8 + rn() * 1.8, i % 3 ? "#ffffff" : col);
        } else if (id === "shard") {
          for (const [x, y, h, w, a] of [[50, 54, 60, 15, 0.15], [30, 66, 30, 9, -0.5], [70, 68, 26, 8, 0.6]]) {
            lc.save(); lc.translate(x, y); lc.rotate(a);
            part(lc, cc => poly(cc, [0, -h / 2, w, -h / 6, w * 0.6, h / 2, -w * 0.7, h / 2, -w, -h / 8]), lg(lc, -w, 0, w, 0, [lt(col, 0.6), col, dk(col, 0.35), dk(col, 0.7)]), { lw: 1.4 });
            lc.strokeStyle = "rgba(255,255,255,.55)"; lc.lineWidth = 0.7; lc.beginPath(); lc.moveTo(0, -h / 2); lc.lineTo(-w * 0.1, h / 2); lc.moveTo(0, -h / 2); lc.lineTo(w * 0.6, h / 2); lc.stroke();
            lc.fillStyle = "rgba(10,5,30,.55)"; lc.beginPath(); poly(lc, [0, -h / 2, w, -h / 6, w * 0.6, h / 2, w * 0.2, h / 2]); lc.fill();
            lc.restore();
          }
          glowDot(lc, 50, 40, 6, "#e0e7ff");
        } else if (id === "ember") {
          lc.fillStyle = rg(lc, 50, 54, 2, 34, [al("#fde047", 0.9), al(col, 0.75), al(col, 0)]); lc.beginPath(); circ(lc, 50, 54, 34); lc.fill();
          part(lc, cc => { cc.moveTo(50, 18); cc.bezierCurveTo(60, 32, 74, 42, 70, 62); cc.bezierCurveTo(67, 78, 58, 84, 50, 84); cc.bezierCurveTo(40, 84, 30, 78, 30, 62); cc.bezierCurveTo(28, 50, 38, 44, 40, 32); cc.quadraticCurveTo(46, 42, 46, 48); cc.quadraticCurveTo(50, 36, 50, 18); cc.closePath(); }, lg(lc, 0, 18, 0, 84, ["#fff7ed", "#fde047", col, dk(col, 0.4)]), { lw: 1.4 });
          part(lc, cc => { cc.moveTo(50, 50); cc.bezierCurveTo(58, 58, 60, 66, 56, 74); cc.quadraticCurveTo(50, 80, 44, 74); cc.bezierCurveTo(40, 66, 46, 60, 50, 50); cc.closePath(); }, "#ffffff", { lw: 0 });
          // iron cage
          for (const k of [-1, 0, 1]) strokeP(lc, "#1c1917", 2.2, cc => { cc.moveTo(50 + k * 16, 20); cc.quadraticCurveTo(50 + k * 34, 56, 50 + k * 16, 88); });
          strokeP(lc, "#1c1917", 3, cc => { cc.moveTo(36, 88); cc.lineTo(64, 88); cc.moveTo(40, 20); cc.lineTo(60, 20); });
          for (let i = 0; i < 6; i++) glowDot(lc, 26 + rn() * 48, 14 + rn() * 30, 1.3, "#fb923c", "#fde047");
        } else if (id === "gilded_key" || kind === "key") {
          key(lc, "gilded", 50, 50, 1.05, rn);
        } else { // boss sigil stone
          const boss = (m && m.boss) || String(id).replace(/^sigil_/, "");
          part(lc, cc => starN(cc, 50, 52, 8, 34, 29, -PI / 8), rg(lc, 44, 44, 2, 40, [lt(col, 0.35), dk(col, 0.35), dk(col, 0.75)]), { rn, tex: 24, box: [16, 18, 84, 86] });
          part(lc, cc => circ(cc, 50, 52, 23), rg(lc, 46, 46, 1, 26, ["#1f1a2e", "#0a0712"]), { lw: 1.3 });
          lc.save(); lc.shadowColor = col; lc.shadowBlur = px * 0.05; glyph(lc, BOSS_GLYPH[boss] || "star", 50, 52, 30, lt(col, 0.35), false); lc.restore();
          lc.strokeStyle = al(col, 0.6); lc.lineWidth = 0.8; lc.beginPath(); circ(lc, 50, 52, 27); lc.stroke();
          for (let i = 0; i < 8; i++) { const a = i * TAU / 8; lc.save(); lc.translate(50 + Math.cos(a) * 27, 52 + Math.sin(a) * 27); lc.rotate(a + PI / 2); runeMark(lc, i % 6, 1.8, lt(col, 0.4)); lc.restore(); }
        }
      }, { glow: lt(col, 0.2), glowA: 0.55, rim: "rgba(255,255,255,.55)" });
      frameRim(c, F.st, col, lt(col, 0.3), rn, F);
    });
  }
  function keyIcon(kind, size) {
    const k = String(kind || "silver").replace(/_key$/, "");
    const kk = k === "gilded" || k === "gold" || k === "silver" || k === "shard" ? k : "silver";
    const col = { silver: "#cbd5e1", gold: "#fbbf24", gilded: "#fde047", shard: "#c084fc" }[kk];
    const rar = { silver: "rare", gold: "legendary", gilded: "legendary", shard: "mythic" }[kk];
    return render("key|" + kk, size || 64, (c, px, rn) => {
      const F = frame(c, rar);
      frameBack(c, F.st, col, lt(col, 0.3), rn, F);
      composite(c, px, lc => key(lc, kk, 52, 50, 1.05, rn), { glow: lt(col, 0.2), glowA: 0.6, rim: "rgba(255,255,255,.6)" });
      frameRim(c, F.st, col, lt(col, 0.3), rn, F);
    });
  }

  // ---- tomes
  const TOME_GLYPH = { burst: "flame", heal: "heart", ward: "shield", rage: "swords", chainburst: "bolt", haste: "hourglass" };
  function tome(id, size, rarityOverride) {
    const E = EC();
    const t = (E && E.TOMES && E.TOMES[id]) || null;
    const col = (t && t.color) || "#a78bfa", acc = (t && t.accent) || "#e9d5ff";
    const rarity = rarityOverride || (t && t.rarity) || "legendary";
    return render("tome|" + id + "|" + rarity, size || 64, (c, px, rn) => {
      const F = frame(c, rarity);
      frameBack(c, F.st, F.col, F.glow, rn, F);
      composite(c, px, lc => {
        lc.save(); lc.translate(50, 50); lc.rotate(-0.12); lc.translate(-50, -50);
        // pages block (side)
        part(lc, cc => { cc.moveTo(26, 20); cc.lineTo(76, 16); cc.lineTo(80, 20); cc.lineTo(80, 84); cc.lineTo(30, 88); cc.closePath(); }, lg(lc, 76, 0, 82, 0, ["#fef3c7", "#d6b77a"]), { lw: 1.3 });
        lc.strokeStyle = "rgba(120,80,30,.5)"; lc.lineWidth = 0.5; for (let y = 22; y < 84; y += 2.4) { lc.beginPath(); lc.moveTo(77, y - 2); lc.lineTo(80, y); lc.stroke(); }
        // cover
        const cover = cc => { cc.moveTo(20, 18); cc.lineTo(74, 14); cc.lineTo(76, 82); cc.lineTo(22, 86); cc.closePath(); };
        part(lc, cover, lg(lc, 20, 14, 76, 86, [lt(col, 0.2), col, dk(col, 0.45), dk(col, 0.7)]), { rn: rng("tome:" + id), tex: 30, box: [20, 14, 76, 86], bev: 4 });
        // spine
        part(lc, cc => { cc.moveTo(16, 19); cc.lineTo(24, 18); cc.lineTo(26, 86); cc.lineTo(18, 87); cc.closePath(); }, lg(lc, 16, 0, 26, 0, [dk(col, 0.6), dk(col, 0.2), dk(col, 0.6)]), { lw: 1.2 });
        for (const y of [30, 52, 74]) strokeP(lc, acc, 1.6, cc => { cc.moveTo(17, y); cc.lineTo(25, y - 0.4); });
        // gilt corners + border
        lc.strokeStyle = al("#fcd34d", 0.9); lc.lineWidth = 1; lc.beginPath(); poly(lc, [29, 24, 68, 21, 70, 77, 31, 80]); lc.stroke();
        for (const [x, y, a] of [[24, 21, 0], [72, 17, PI / 2], [74, 80, PI], [25, 83, -PI / 2]]) { lc.save(); lc.translate(x, y); lc.rotate(a); part(lc, cc => poly(cc, [-2, -2, 9, -2, -2, 9]), lg(lc, -2, -2, 9, 9, ["#fef3c7", "#d97706"]), { lw: 0.9 }); lc.restore(); }
        // emblem medallion
        part(lc, cc => circ(cc, 49, 50, 15), rg(lc, 45, 46, 1, 17, ["#fef3c7", "#d4a017", "#6b4a0b"]), { lw: 1.3 });
        part(lc, cc => circ(cc, 49, 50, 11.5), rg(lc, 49, 50, 1, 12, [lt(col, 0.2), dk(col, 0.55)]), { lw: 1 });
        lc.save(); lc.shadowColor = acc; lc.shadowBlur = px * 0.04; glyph(lc, TOME_GLYPH[t && t.kind] || "star", 49, 50, 15, lt(acc, 0.3)); lc.restore();
        // clasp
        part(lc, cc => rr(cc, 70, 44, 12, 11, 2), lg(lc, 0, 44, 0, 55, ["#fef3c7", "#b45309"]), { lw: 1.1 });
        lc.restore();
      }, { glow: F.glow, glowA: 0.5 + F.st * 0.05, rim: lt(acc, 0.3) });
      motifFront(c, t && t.kind === "chainburst" ? "lightning" : t && t.kind === "burst" ? "ember" : t && t.kind === "haste" ? "steam" : null, { glow: col, gem: col }, rn);
      frameRim(c, F.st, F.col, F.glow, rn, F);
    });
  }

  // ---- chests
  const CHEST_LOOK = {
    bronze: { wood: WOOD, band: ["#f3c58b", "#b87333", "#5c3517", "#2b1609"], rar: "rare", glow: "#fdba74" },
    silver: { wood: ["#8a6a52", "#5a4130", "#382618", "#1b120a"], band: ["#ffffff", "#cbd5e1", "#64748b", "#1e293b"], rar: "epic", glow: "#e2e8f0" },
    gold: { wood: ["#7a3b1d", "#56260f", "#3a1706", "#1c0a02"], band: ["#fff7c2", "#fbbf24", "#a16207", "#422006"], rar: "legendary", glow: "#fde68a" },
    arcane: { wood: ["#3f2d6b", "#2a1b4d", "#180e30", "#0a0518"], band: ["#f5eaff", "#c4b5fd", "#6d28d9", "#2e1065"], rar: "arcane", glow: "#c4b5fd", prism: 1 },
    plain: { wood: WOOD, band: ["#d4d4d8", "#71717a", "#3f3f46", "#18181b"], rar: "fine", glow: "#d4d4d8" },
    trial: { wood: ["#a8a29e", "#78716c", "#44403c", "#1c1917"], band: ["#fecaca", "#ef4444", "#7f1d1d", "#2d0a0a"], rar: "epic", glow: "#f87171", stone: 1 },
    cache: { wood: ["#a3824f", "#6b5230", "#3f2f18", "#1d150a"], band: ["#d1fae5", "#34d399", "#065f46", "#022c22"], rar: "rare", glow: "#6ee7b7" },
    vault: { wood: ["#94a3b8", "#475569", "#1e293b", "#0f172a"], band: ["#fff7c2", "#fbbf24", "#a16207", "#422006"], rar: "mythic", glow: "#fde68a", iron: 1 },
    sanctuary: { wood: ["#3f2d6b", "#2a1b4d", "#180e30", "#0a0518"], band: ["#f0abfc", "#a78bfa", "#4c1d95", "#1e1036"], rar: "ancient", glow: "#f0abfc", prism: 1 },
  };
  function chestIcon(tier, size) {
    const E = EC();
    let kind = tier;
    if (typeof tier === "number" || /^\d+$/.test(String(tier))) { const T = E && E.CHEST_TIERS ? E.CHEST_TIERS[+tier] : null; kind = (T && T.id) || ["bronze", "silver", "gold", "arcane"][+tier] || "bronze"; }
    kind = String(kind || "bronze").replace(/^chest:/, "");
    const L = CHEST_LOOK[kind] || CHEST_LOOK.bronze;
    return render("chest|" + kind, size || 64, (c, px, rn) => {
      const F = frame(c, L.rar);
      frameBack(c, F.st, F.col, L.glow, rn, F);
      composite(c, px, lc => {
        const Wd = L.wood, B = L.band;
        // light spilling from the seam
        lc.fillStyle = rg(lc, 50, 46, 1, 36, [al(L.glow, 0.85), al(L.glow, 0)]); lc.beginPath(); lc.moveTo(22, 46); lc.lineTo(78, 46); lc.lineTo(96, 4); lc.lineTo(4, 4); lc.closePath(); lc.fill();
        // body
        const body = cc => rr(cc, 16, 46, 68, 36, 3);
        part(lc, body, lg(lc, 0, 46, 0, 82, [Wd[0], Wd[1], Wd[2]]), { rn, tex: 26, box: [16, 46, 84, 82], bev: 3 });
        if (!L.iron && !L.stone) { lc.strokeStyle = "rgba(0,0,0,.35)"; lc.lineWidth = 0.8; for (const y of [55, 64, 73]) { lc.beginPath(); lc.moveTo(17, y); lc.lineTo(83, y); lc.stroke(); } }
        // lid (curved)
        const lid = cc => { cc.moveTo(14, 48); cc.lineTo(14, 36); cc.bezierCurveTo(14, 18, 86, 18, 86, 36); cc.lineTo(86, 48); cc.closePath(); };
        part(lc, lid, lg(lc, 0, 20, 0, 48, [lt(Wd[0], 0.15), Wd[1], Wd[2]]), { rn, tex: 22, box: [14, 18, 86, 48], bev: 3 });
        // bands
        for (const x of [24, 70]) { part(lc, cc => { cc.moveTo(x, 48); cc.lineTo(x, 26); cc.quadraticCurveTo(x + 3, 23, x + 6, 24); cc.lineTo(x + 6, 48); cc.closePath(); }, metal(lc, x, x + 6, B), { lw: 1 }); part(lc, cc => rr(cc, x, 47, 6, 35, 1), metal(lc, x, x + 6, B), { lw: 1 }); }
        part(lc, cc => rr(cc, 13, 44, 74, 5, 1.5), lg(lc, 0, 44, 0, 49, [B[0], B[2]]), { lw: 1.1 });
        for (const x of [27, 73]) for (const y of [56, 66, 76]) { lc.fillStyle = B[0]; lc.beginPath(); circ(lc, x, y, 0.9); lc.fill(); }
        // lock plate
        part(lc, cc => { cc.moveTo(42, 42); cc.lineTo(58, 42); cc.lineTo(58, 56); cc.quadraticCurveTo(50, 62, 42, 56); cc.closePath(); }, lg(lc, 42, 42, 58, 60, [B[0], B[1], B[2]]), { lw: 1.2 });
        if (L.prism) { lc.save(); lc.shadowColor = L.glow; lc.shadowBlur = px * 0.05; glyph(lc, "rune", 50, 50, 10, "#ffffff", false); lc.restore(); }
        else if (L.stone) glyph(lc, "swords", 50, 50, 11, "#fee2e2");
        else if (L.iron) { part(lc, cc => circ(cc, 50, 50, 4.5), rg(lc, 49, 49, 0.5, 5, ["#fff", "#94a3b8", "#1e293b"]), { lw: 1 }); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; lc.fillStyle = "#0f172a"; lc.beginPath(); circ(lc, 50 + Math.cos(a) * 3.2, 50 + Math.sin(a) * 3.2, 0.5); lc.fill(); } }
        else { part(lc, cc => { circ(cc, 50, 48, 2.2); }, "#0b0710", { lw: 0 }); lc.fillStyle = "#0b0710"; lc.fillRect(49.2, 48, 1.6, 5); }
        if (L.prism) PRISM.forEach((q, i) => { lc.strokeStyle = al(q, 0.85); lc.lineWidth = 1; lc.beginPath(); lc.moveTo(20 + i * 13, 32); lc.lineTo(22 + i * 13, 28); lc.stroke(); });
        // gem on lid for gold+
        if (F.st >= 4) gem(lc, 50, 30, 3.2, L.prism ? "#f0abfc" : "#ef4444", "d");
      }, { glow: L.glow, glowA: 0.45 + F.st * 0.06, rim: lt(L.glow, 0.4) });
      for (let i = 0; i < 2 + F.st; i++) sparkle(c, 16 + rn() * 68, 10 + rn() * 32, 1.4 + rn() * 2, L.prism ? PRISM[i % 5] : "#fff7d6");
      frameRim(c, F.st, F.col, L.glow, rn, F);
    });
  }

  // ---- boss portraits
  function bossDef(id) { const E = EC(); return (E && E.GUILD_BOSSES && E.GUILD_BOSSES[id]) || null; }
  const BOSS_FALLBACK = {
    warden: ["#0e7490", "#67e8f9"], smith: ["#b45309", "#fbbf24"], tyrant: ["#4c1d95", "#c084fc"], dragon: ["#7f1d1d", "#fb923c"], ogrelord: ["#3f6212", "#a3e635"],
    tempest: ["#1e40af", "#7dd3fc"], curator: ["#78350f", "#fcd34d"], astraea: ["#312e81", "#fde68a"], prismgolem: ["#6b21a8", "#67e8f9"], khyra: ["#581c87", "#67e8f9"],
    halvard: ["#1e3a5f", "#bae6fd"], iskarra: ["#0c4a6e", "#bae6fd"], herald: ["#3b0764", "#d8b4fe"], broodmother: ["#7c2d12", "#fdba74"], heart: ["#4c1d95", "#f0abfc"],
    ley_ember: ["#9a3412", "#fdba74"], ley_tide: ["#155e75", "#67e8f9"], ley_star: ["#312e81", "#fde68a"], concordant: ["#1e1b4b", "#c4b5fd"],
  };
  function bossColors(id) { const d = bossDef(id); const f = BOSS_FALLBACK[id] || ["#334155", "#e2e8f0"]; return { col: (d && d.color) || f[0], acc: (d && d.accent) || f[1], tier: d ? d.tier : (/^ley_/.test(id) || ["ogrelord", "tempest", "curator", "prismgolem", "halvard", "herald", "broodmother"].includes(id) ? "mini" : "boss") }; }
  function eyes(c, x, y, sep, r, col) { glowDot(c, x - sep, y, r, col); glowDot(c, x + sep, y, r, col); }
  const BUST = {};
  BUST.warden = (c, col, acc, rn) => {
    const p = pal(theme(4));
    // kelp strands behind
    for (let i = 0; i < 5; i++) strokeP(c, al("#4d7c0f", 0.9), 2.2, cc => { const x = 22 + i * 14; cc.moveTo(x, 96); cc.bezierCurveTo(x - 8, 70, x + 8, 50, x - 2, 26 + rn() * 10); });
    H.helm(c, pal(p, { glow: acc }), {}, rn);
    for (const [x, y] of [[30, 30], [66, 24], [72, 60], [28, 64]]) part(c, cc => circ(cc, x, y, 2.6), rg(c, x - 0.6, y - 0.6, 0.2, 3, ["#f5f5f4", "#a8a29e"]), { lw: 0.7 });
    part(c, cc => { cc.moveTo(12, 96); cc.quadraticCurveTo(20, 76, 36, 76); cc.lineTo(64, 76); cc.quadraticCurveTo(80, 76, 88, 96); cc.closePath(); }, metal(c, 12, 88, p.metal), { rn, tex: 14, box: [12, 76, 88, 96] });
  };
  BUST.smith = (c, col, acc, rn) => {
    part(c, cc => { cc.moveTo(10, 98); cc.quadraticCurveTo(14, 70, 34, 66); cc.lineTo(66, 66); cc.quadraticCurveTo(86, 70, 90, 98); cc.closePath(); }, metal(c, 10, 90, LEATHER), { rn, tex: 16, box: [10, 66, 90, 98] });
    part(c, cc => ell(cc, 50, 44, 20, 24, 0), rg(c, 44, 36, 2, 28, ["#c08457", "#7c4a26", "#3b2011"]), { rn, tex: 10, box: [30, 20, 70, 68] });
    // beard of flame
    part(c, cc => { cc.moveTo(30, 48); cc.quadraticCurveTo(28, 76, 42, 88); cc.quadraticCurveTo(46, 80, 50, 92); cc.quadraticCurveTo(54, 80, 58, 88); cc.quadraticCurveTo(72, 76, 70, 48); cc.quadraticCurveTo(50, 60, 30, 48); cc.closePath(); }, lg(c, 0, 48, 0, 92, ["#fde047", "#f97316", "#b91c1c"]), { lw: 1.3 });
    // goggles
    part(c, cc => rr(cc, 26, 34, 48, 6, 3), "#292524", { lw: 1 });
    for (const x of [40, 60]) { part(c, cc => circ(cc, x, 38, 7), rg(c, x, 38, 1, 7, ["#fef3c7", acc, "#78350f"]), { lw: 1.4 }); glowDot(c, x, 38, 5, acc); }
    part(c, cc => { cc.moveTo(30, 28); cc.quadraticCurveTo(50, 12, 70, 28); cc.lineTo(70, 32); cc.quadraticCurveTo(50, 22, 30, 32); cc.closePath(); }, "#1c1917", { lw: 1 });
    c.save(); c.translate(80, 40); c.rotate(0.5); c.scale(0.55, 0.55); W.hammer(c, pal(theme(5)), {}, rn); c.restore();
  };
  BUST.tyrant = (c, col, acc, rn) => {
    H.hood(c, pal(theme(6), { cloth: ["#3b1d6e", "#12061f"], glow: acc }), {}, rn);
    c.save(); c.translate(50, 10); c.scale(0.55, 0.45); c.translate(-50, -20); H.crown(c, pal(theme(6)), { door: 1 }, rn); c.restore();
  };
  BUST.dragon = (c, col, acc, rn) => {
    const sc = ["#fca5a5", "#b91c1c", "#5f1414", "#1f0606"];
    // horns
    for (const [x, y, s] of [[58, 28, 1], [66, 34, 0.8]]) part(c, cc => { cc.moveTo(x, y); cc.bezierCurveTo(x + 10 * s, y - 14, x + 24 * s, y - 20, x + 34 * s, y - 16); cc.bezierCurveTo(x + 22 * s, y - 12, x + 16 * s, y - 2, x + 10 * s, y + 6); cc.closePath(); }, lg(c, x, y, x + 34, y - 16, ["#3a2c22", "#d6c3a3", "#fbf6e8"]), { lw: 1.2 });
    // head (profile facing left)
    const head = cc => { cc.moveTo(84, 60); cc.bezierCurveTo(82, 34, 64, 26, 48, 32); cc.lineTo(16, 44); cc.quadraticCurveTo(8, 48, 12, 54); cc.lineTo(40, 58); cc.lineTo(14, 66); cc.quadraticCurveTo(12, 74, 20, 74); cc.lineTo(50, 70); cc.bezierCurveTo(60, 80, 76, 84, 84, 96); cc.lineTo(96, 96); cc.bezierCurveTo(92, 80, 86, 70, 84, 60); cc.closePath(); };
    part(c, head, lg(c, 10, 30, 90, 90, sc), { rn, tex: 24, box: [8, 26, 96, 96], bev: 4 });
    c.save(); c.beginPath(); head(c); c.clip(); c.strokeStyle = "rgba(0,0,0,.35)"; c.lineWidth = 0.7; for (let y = 30; y < 96; y += 5) for (let x = 40 + ((y / 5) % 2) * 2.5; x < 96; x += 5) { c.beginPath(); c.arc(x, y, 2.5, 0.1, PI - 0.1); c.stroke(); } c.restore();
    // mouth glow + teeth
    c.fillStyle = rg(c, 30, 60, 1, 18, [al("#fde047", 0.95), al("#f97316", 0.7), al("#f97316", 0)]); c.beginPath(); poly(c, [14, 56, 42, 58, 40, 64, 16, 66]); c.fill();
    c.fillStyle = "#fbf6e8"; for (let x = 18; x < 40; x += 5) { c.beginPath(); poly(c, [x, 55, x + 2, 59, x + 4, 55.5]); c.fill(); c.beginPath(); poly(c, [x + 1, 66, x + 3, 62, x + 5, 65.5]); c.fill(); }
    part(c, cc => { cc.moveTo(46, 40); cc.quadraticCurveTo(54, 34, 62, 40); cc.quadraticCurveTo(54, 44, 46, 40); cc.closePath(); }, "#fde047", { lw: 1 });
    part(c, cc => ell(cc, 54, 40, 1.2, 3.2, 0), "#1c0a02", { lw: 0 }); glowDot(c, 54, 40, 7, acc);
    for (let i = 0; i < 8; i++) glowDot(c, 10 + rn() * 30, 20 + rn() * 70, 1.2, "#fb923c", "#fde047");
  };
  BUST.ogrelord = (c, col, acc, rn) => {
    part(c, cc => { cc.moveTo(4, 98); cc.quadraticCurveTo(8, 66, 30, 64); cc.lineTo(70, 64); cc.quadraticCurveTo(92, 66, 96, 98); cc.closePath(); }, metal(c, 4, 96, ["#a3a3a3", "#57534e", "#292524", "#0c0a09"]), { rn, tex: 16, box: [4, 64, 96, 98] });
    part(c, cc => { cc.moveTo(50, 16); cc.bezierCurveTo(76, 16, 82, 40, 78, 58); cc.bezierCurveTo(74, 76, 62, 80, 50, 80); cc.bezierCurveTo(38, 80, 26, 76, 22, 58); cc.bezierCurveTo(18, 40, 24, 16, 50, 16); cc.closePath(); }, rg(c, 42, 34, 2, 44, ["#bef264", "#65a30d", "#365314", "#1a2e05"]), { rn, tex: 16, box: [18, 16, 82, 82] });
    part(c, cc => { cc.moveTo(28, 38); cc.quadraticCurveTo(50, 30, 72, 38); cc.lineTo(70, 44); cc.quadraticCurveTo(50, 38, 30, 44); cc.closePath(); }, "#1a2e05", { lw: 1 });
    eyes(c, 50, 46, 11, 4.5, "#ef4444");
    part(c, cc => { cc.moveTo(34, 64); cc.quadraticCurveTo(50, 74, 66, 64); cc.quadraticCurveTo(50, 68, 34, 64); cc.closePath(); }, "#1a0a05", { lw: 1 });
    for (const s of [-1, 1]) part(c, cc => { cc.moveTo(50 + s * 10, 66); cc.quadraticCurveTo(50 + s * 14, 54, 50 + s * 10, 48); cc.quadraticCurveTo(50 + s * 16, 56, 50 + s * 16, 66); cc.closePath(); }, lg(c, 0, 48, 0, 66, ["#fffbeb", "#d6c3a3"]), { lw: 1.1 });
    c.save(); c.translate(50, 2); c.scale(0.5, 0.36); c.translate(-50, 0); H.crown(c, pal(theme(1)), {}, rn); c.restore();
  };
  BUST.tempest = (c, col, acc, rn) => {
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, r = 18 + rn() * 6; part(c, cc => circ(cc, 50 + Math.cos(a) * r, 52 + Math.sin(a) * r * 0.8, 14 + rn() * 5), rg(c, 50 + Math.cos(a) * r - 4, 46 + Math.sin(a) * r * 0.8, 1, 20, ["#e0f2fe", "#64748b", "#1e293b"]), { lw: 1.1 }); }
    part(c, cc => circ(cc, 50, 50, 22), rg(c, 46, 44, 2, 26, ["#cbd5e1", "#475569", "#0f172a"]), { lw: 1.2 });
    for (let i = 0; i < 3; i++) strokeP(c, al("#e0f2fe", 0.5), 1.2, cc => cc.arc(50, 50, 8 + i * 5, i, i + 3.6));
    eyes(c, 50, 48, 8, 5, acc);
    bolt(c, 20, 76, 1.3, "#fde047"); bolt(c, 80, 78, 1.1, "#fde047"); bolt(c, 76, 20, 0.9, "#fde047");
  };
  BUST.curator = (c, col, acc, rn) => {
    H.hood(c, pal(theme(8), { cloth: ["#78350f", "#2a1106"], glow: acc }), {}, rn);
    for (const x of [43, 57]) { strokeP(c, "#fcd34d", 1.3, cc => cc.arc(x, 48, 5.5, 0, TAU)); }
    strokeP(c, "#fcd34d", 1, cc => { cc.moveTo(48.5, 48); cc.lineTo(51.5, 48); });
    motifFront(c, "pages", { glow: acc, gem: acc }, rn);
    c.save(); c.translate(18, 74); part(c, cc => rr(cc, -3, -10, 6, 14, 1), "#fef3c7", { lw: 1 }); glowDot(c, 0, -13, 4.5, "#fde047"); c.restore();
  };
  BUST.astraea = (c, col, acc, rn) => {
    strokeP(c, al(acc, 0.8), 1.6, cc => cc.ellipse(50, 50, 42, 13, -0.35, 0, TAU));
    strokeP(c, al(acc, 0.55), 1.2, cc => cc.ellipse(50, 50, 38, 20, 0.5, 0, TAU));
    part(c, cc => { cc.moveTo(50, 20); cc.bezierCurveTo(66, 20, 72, 34, 70, 48); cc.bezierCurveTo(68, 66, 58, 78, 50, 80); cc.bezierCurveTo(42, 78, 32, 66, 30, 48); cc.bezierCurveTo(28, 34, 34, 20, 50, 20); cc.closePath(); }, rg(c, 44, 38, 2, 34, ["#fffbeb", "#fde68a", "#b88a1c", "#4a3406"]), { rn, tex: 8, box: [28, 18, 72, 82], bev: 4 });
    for (const s of [-1, 1]) part(c, cc => { cc.moveTo(50 + s * 4, 46); cc.quadraticCurveTo(50 + s * 11, 40, 50 + s * 16, 45); cc.quadraticCurveTo(50 + s * 11, 50, 50 + s * 4, 46); cc.closePath(); }, "#0b0a2a", { lw: 1 });
    eyes(c, 50, 45.5, 10, 3.6, "#ffffff");
    strokeP(c, "rgba(74,52,6,.6)", 1, cc => { cc.moveTo(44, 66); cc.quadraticCurveTo(50, 68, 56, 66); });
    for (let i = 0; i < 7; i++) { const a = -PI / 2 + (i - 3) * 0.32; part(c, cc => starN(cc, 50 + Math.cos(a) * 38, 58 + Math.sin(a) * 42, 4, 4.2, 1.4), "#fef3c7", { lw: 0.8 }); }
    for (const [a, r] of [[0.3, 42], [3.5, 42], [2.1, 38]]) glowDot(c, 50 + Math.cos(a) * r, 50 + Math.sin(a) * 13, 3.4, acc);
  };
  BUST.prismgolem = (c, col, acc, rn) => {
    part(c, cc => poly(cc, [8, 98, 20, 68, 38, 62, 62, 62, 80, 68, 92, 98]), lg(c, 8, 60, 92, 98, ["#e9d5ff", "#9333ea", "#3b0764"]), { rn, tex: 8, box: [8, 60, 92, 98] });
    const head = [50, 12, 74, 26, 78, 52, 64, 72, 36, 72, 22, 52, 26, 26];
    part(c, cc => poly(cc, head), lg(c, 22, 12, 78, 72, ["#f5d0fe", "#c084fc", "#6b21a8", "#2e1065"]), { lw: 1.6 });
    c.strokeStyle = "rgba(255,255,255,.5)"; c.lineWidth = 0.8; c.beginPath(); c.moveTo(50, 12); c.lineTo(50, 40); c.lineTo(22, 52); c.moveTo(50, 40); c.lineTo(78, 52); c.moveTo(50, 40); c.lineTo(36, 72); c.moveTo(50, 40); c.lineTo(64, 72); c.moveTo(26, 26); c.lineTo(50, 40); c.lineTo(74, 26); c.stroke();
    c.fillStyle = "rgba(20,0,40,.35)"; c.beginPath(); poly(c, [50, 40, 78, 52, 64, 72]); c.fill();
    glowDot(c, 50, 42, 11, acc); part(c, cc => poly(cc, [50, 35, 56, 42, 50, 49, 44, 42]), "#ecfeff", { lw: 1 });
    for (const [x, y, s] of [[20, 20, 8], [82, 24, 9], [14, 60, 6]]) part(c, cc => poly(cc, [x, y - s, x + s * 0.45, y, x, y + s * 0.6, x - s * 0.45, y]), lg(c, x - 4, 0, x + 4, 0, ["#cffafe", acc, "#0e7490"]), { lw: 0.9 });
  };
  BUST.khyra = (c, col, acc, rn) => {
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const a0 = -0.9 + i * 0.5;
      strokeP(c, OUT, 5.2, cc => { cc.moveTo(50 + s * 14, 58); cc.quadraticCurveTo(50 + s * (34 + i * 3), 58 - 30 * Math.cos(a0) , 50 + s * (42 + i * 2), 64 + i * 10); });
      strokeP(c, lg(c, 0, 20, 0, 96, ["#e9d5ff", "#7e22ce", "#3b0764"]), 2.8, cc => { cc.moveTo(50 + s * 14, 58); cc.quadraticCurveTo(50 + s * (34 + i * 3), 58 - 30 * Math.cos(a0), 50 + s * (42 + i * 2), 64 + i * 10); });
    }
    part(c, cc => ell(cc, 50, 74, 20, 17, 0), rg(c, 44, 68, 2, 22, ["#a5f3fc", "#7e22ce", "#2e1065"]), { rn, tex: 12, box: [30, 57, 70, 92] });
    for (let i = 0; i < 5; i++) { const x = 38 + rn() * 24, y = 66 + rn() * 16; part(c, cc => poly(cc, [x, y - 5, x + 2, y, x, y + 2, x - 2, y]), acc, { lw: 0.7 }); }
    part(c, cc => ell(cc, 50, 46, 15, 14, 0), rg(c, 46, 42, 1, 16, ["#c084fc", "#581c87", "#1e0536"]), { lw: 1.5 });
    for (const [x, y, r] of [[44, 44, 2.8], [56, 44, 2.8], [40, 50, 1.9], [60, 50, 1.9], [47, 38, 1.8], [53, 38, 1.8], [50, 50, 1.6], [50, 43, 1.4]]) glowDot(c, x, y, r * 1.6, acc);
    for (const r of [22, 28, 34]) strokeP(c, al(acc, 0.45), 1, cc => cc.arc(50, 46, r, -2.4, -0.8));
  };
  BUST.halvard = (c, col, acc, rn) => {
    H.visor(c, pal(theme(10), { glow: acc, gem: "#bae6fd" }), {}, rn);
    c.fillStyle = "rgba(255,255,255,.9)"; for (const x of [26, 34, 66, 74]) { c.beginPath(); poly(c, [x - 2, 72, x, 80 + rn() * 4, x + 2, 72]); c.fill(); }
    motifFront(c, "frost", { glow: acc }, rn);
  };
  BUST.iskarra = (c, col, acc, rn) => {
    for (const s of [-1, 1]) part(c, cc => { cc.moveTo(50 + s * 14, 34); cc.quadraticCurveTo(50 + s * 44, 14, 50 + s * 46, 44); cc.quadraticCurveTo(50 + s * 36, 36, 50 + s * 34, 52); cc.quadraticCurveTo(50 + s * 26, 40, 50 + s * 16, 48); cc.closePath(); }, lg(c, 50, 14, 50 + s * 46, 50, ["#f0f9ff", "#7dd3fc", "#0c4a6e"]), { rn, tex: 8, box: [0, 10, 100, 56] });
    const head = cc => { cc.moveTo(50, 14); cc.bezierCurveTo(66, 16, 70, 34, 66, 52); cc.quadraticCurveTo(62, 76, 50, 92); cc.quadraticCurveTo(38, 76, 34, 52); cc.bezierCurveTo(30, 34, 34, 16, 50, 14); cc.closePath(); };
    part(c, head, metal(c, 32, 68, ["#ffffff", "#9fd6f2", "#2c6c9c", "#0b2540"]), { rn, tex: 20, box: [30, 12, 70, 94], bev: 4 });
    c.save(); c.beginPath(); head(c); c.clip(); c.strokeStyle = "rgba(12,74,110,.5)"; c.lineWidth = 0.8; for (let y = 20; y < 92; y += 6) { c.beginPath(); c.moveTo(30, y); c.quadraticCurveTo(50, y + 5, 70, y); c.stroke(); } c.restore();
    for (const s of [-1, 1]) { part(c, cc => { cc.moveTo(50 + s * 6, 40); cc.quadraticCurveTo(50 + s * 12, 36, 50 + s * 15, 42); cc.quadraticCurveTo(50 + s * 10, 44, 50 + s * 6, 40); cc.closePath(); }, "#0b1d2e", { lw: 1 }); glowDot(c, 50 + s * 10.5, 40.5, 4.5, acc); }
    c.fillStyle = "#f0f9ff"; for (const s of [-1, 1]) { c.beginPath(); poly(c, [50 + s * 4, 78, 50 + s * 6, 92, 50 + s * 8, 76]); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke(); }
    motifFront(c, "frost", { glow: acc }, rn);
  };
  BUST.herald = (c, col, acc, rn) => {
    H.hood(c, pal(theme(6), { cloth: ["#4c1d95", "#14061f"], glow: acc }), {}, rn);
    part(c, cc => { cc.moveTo(50, 28); cc.bezierCurveTo(62, 30, 66, 44, 64, 58); cc.quadraticCurveTo(50, 70, 36, 58); cc.bezierCurveTo(34, 44, 38, 30, 50, 28); cc.closePath(); }, lg(c, 36, 0, 64, 0, ["#cbd5e1", "#f8fafc", "#94a3b8"]), { lw: 1.2 });
    for (const s of [-1, 1]) { part(c, cc => ell(cc, 50 + s * 7, 45, 3.6, 2.2, s * 0.2), "#07040a", { lw: 0.6 }); glowDot(c, 50 + s * 7, 45, 3, acc); }
    part(c, cc => { cc.moveTo(64, 72); cc.lineTo(88, 58); cc.quadraticCurveTo(94, 50, 96, 42); cc.lineTo(98, 70); cc.quadraticCurveTo(92, 66, 88, 66); cc.lineTo(66, 78); cc.closePath(); }, lg(c, 64, 40, 98, 78, ["#fef3c7", "#d4a017", "#6b4a0b"]), { lw: 1.2 });
    for (const r of [8, 14]) strokeP(c, al(acc, 0.6), 1, cc => cc.arc(97, 56, r, PI * 0.6, PI * 1.4));
  };
  BUST.broodmother = (c, col, acc, rn) => {
    for (const [x, y, r] of [[18, 80, 9], [82, 82, 10], [14, 58, 7], [86, 60, 7]]) { part(c, cc => ell(cc, x, y, r * 0.8, r, 0), rg(c, x - 2, y - 3, 1, r, ["#fde68a", "#f97316", "#7c2d12"]), { lw: 1.1 }); glowDot(c, x, y, r * 0.7, "#fb923c", "#fde047"); }
    const head = cc => { cc.moveTo(50, 12); cc.bezierCurveTo(78, 14, 86, 40, 80, 62); cc.quadraticCurveTo(72, 88, 50, 92); cc.quadraticCurveTo(28, 88, 20, 62); cc.bezierCurveTo(14, 40, 22, 14, 50, 12); cc.closePath(); };
    part(c, head, rg(c, 44, 30, 2, 50, ["#78716c", "#44403c", "#1c1917", "#0c0a09"]), { rn, tex: 24, box: [14, 12, 86, 92], bev: 4 });
    part(c, cc => ell(cc, 50, 62, 20, 18, 0), rg(c, 50, 66, 1, 20, ["#fef08a", "#f97316", "#7c2d12", "#1c0a02"]), { lw: 1.4 });
    c.fillStyle = "#fef3c7"; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; const x = 50 + Math.cos(a) * 18, y = 62 + Math.sin(a) * 16; c.beginPath(); poly(c, [x, y, x - Math.cos(a) * 6 + Math.sin(a) * 1.8, y - Math.sin(a) * 6 - Math.cos(a) * 1.8, x - Math.cos(a) * 6 - Math.sin(a) * 1.8, y - Math.sin(a) * 6 + Math.cos(a) * 1.8]); c.fill(); }
    for (const [x, y, r] of [[36, 30, 3.2], [64, 30, 3.2], [42, 22, 2.2], [58, 22, 2.2], [30, 38, 2], [70, 38, 2]]) glowDot(c, x, y, r * 1.5, acc, "#fff7ed");
  };
  BUST.heart = (c, col, acc, rn) => {
    PRISM.forEach((q, i) => strokeP(c, al(q, 0.7), 1.4, cc => { const a = -PI / 2 + i * TAU / 5; cc.moveTo(50, 52); cc.bezierCurveTo(50 + Math.cos(a) * 20, 52 + Math.sin(a) * 40, 50 + Math.cos(a + 0.8) * 44, 52 + Math.sin(a + 0.8) * 30, 50 + Math.cos(a + 0.6) * 48, 52 + Math.sin(a + 0.6) * 48); }));
    c.fillStyle = rg(c, 50, 52, 2, 40, [al(acc, 0.8), al(col, 0.5), al(col, 0)]); c.beginPath(); circ(c, 50, 52, 40); c.fill();
    const h = cc => { cc.moveTo(50, 86); cc.bezierCurveTo(14, 64, 14, 26, 34, 22); cc.quadraticCurveTo(46, 20, 50, 34); cc.quadraticCurveTo(54, 20, 66, 22); cc.bezierCurveTo(86, 26, 86, 64, 50, 86); cc.closePath(); };
    part(c, h, rg(c, 42, 36, 2, 50, ["#fdf4ff", "#f0abfc", "#a21caf", "#3b0764"]), { rn, tex: 14, box: [14, 18, 86, 88], bev: 5 });
    c.save(); c.beginPath(); h(c); c.clip();
    c.strokeStyle = al("#fdf4ff", 0.85); c.lineWidth = 1.1; c.shadowColor = "#f0abfc"; c.shadowBlur = 5;
    for (const k of [[50, 34, 44, 50, 50, 62, 46, 78], [38, 30, 32, 44, 40, 56], [64, 30, 66, 44, 58, 54, 62, 66]]) { c.beginPath(); c.moveTo(k[0], k[1]); for (let i = 2; i < k.length; i += 2) c.lineTo(k[i], k[i + 1]); c.stroke(); }
    c.restore();
    part(c, cc => poly(cc, [50, 46, 57, 56, 50, 66, 43, 56]), "#ffffff", { lw: 1 });
    glowDot(c, 50, 56, 9, "#f0abfc");
    for (const s of [-1, 1]) part(c, cc => rr(cc, 50 + s * 9 - 3, 8, 6, 16, 2), lg(c, 0, 8, 0, 24, ["#f5d0fe", "#7e22ce"]), { lw: 1 });
  };
  function wardenObelisk(c, col, acc, rn, glyphName) {
    part(c, cc => poly(cc, [30, 96, 34, 80, 66, 80, 70, 96]), lg(c, 0, 80, 0, 96, ["#57534e", "#1c1917"]), { lw: 1.2 });
    const ob = [50, 6, 66, 24, 62, 82, 38, 82, 34, 24];
    part(c, cc => poly(cc, ob), lg(c, 34, 0, 66, 0, [dk(col, 0.4), lt(col, 0.2), col, dk(col, 0.6)]), { rn, tex: 24, box: [34, 6, 66, 82], bev: 4 });
    c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 0.8; c.beginPath(); c.moveTo(50, 6); c.lineTo(50, 82); c.stroke();
    c.save(); c.shadowColor = acc; c.shadowBlur = 8; glyph(c, glyphName, 50, 42, 22, lt(acc, 0.3), false); c.restore();
    for (let i = 0; i < 6; i++) { const y = 20 + i * 10; c.save(); c.translate(i % 2 ? 60 : 40, y); runeMark(c, i % 6, 2, al(acc, 0.8)); c.restore(); }
    for (const s of [-1, 1]) part(c, cc => poly(cc, [50 + s * 22, 34, 50 + s * 30, 26, 50 + s * 34, 44, 50 + s * 26, 56]), lg(c, 50 + s * 22, 26, 50 + s * 34, 56, [lt(acc, 0.5), acc, dk(col, 0.4)]), { lw: 1 });
  }
  BUST.ley_ember = (c, col, acc, rn) => { wardenObelisk(c, col, acc, rn, "flame"); motifFront(c, "ember", { glow: acc }, rn); };
  BUST.ley_tide = (c, col, acc, rn) => { wardenObelisk(c, col, acc, rn, "wave"); motifFront(c, "waves", { glow: acc }, rn); };
  BUST.ley_star = (c, col, acc, rn) => { wardenObelisk(c, col, acc, rn, "star"); motifFront(c, "stars", { glow: acc, gem: acc }, rn); };
  BUST.concordant = (c, col, acc, rn) => {
    for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; part(c, cc => poly(cc, [50 + Math.cos(a) * 44, 50 + Math.sin(a) * 44 - 7, 50 + Math.cos(a) * 44 + 4, 50 + Math.sin(a) * 44, 50 + Math.cos(a) * 44, 50 + Math.sin(a) * 44 + 7, 50 + Math.cos(a) * 44 - 4, 50 + Math.sin(a) * 44]), lg(c, 0, 0, 100, 100, ["#f5eaff", acc, "#312e81"]), { lw: 1 }); strokeP(c, al(PRISM[i], 0.7), 1.2, cc => { cc.moveTo(50, 50); cc.lineTo(50 + Math.cos(a) * 40, 50 + Math.sin(a) * 40); }); }
    for (const [r, w, k] of [[36, 3.2, 0], [27, 2.6, 1], [18, 2.2, 2]]) { strokeP(c, OUT, w + 2.4, cc => cc.arc(50, 50, r, 0, TAU)); strokeP(c, lg(c, 14, 14, 86, 86, [PRISM[k], acc, PRISM[k + 2]]), w, cc => cc.arc(50, 50, r, 0, TAU)); }
    for (let i = 0; i < 6; i++) { const a = -PI / 2 + i * TAU / 6; part(c, cc => circ(cc, 50 + Math.cos(a) * 36, 50 + Math.sin(a) * 36, 4.2), rg(c, 50 + Math.cos(a) * 36 - 1, 50 + Math.sin(a) * 36 - 1, 0.3, 4.6, ["#ffffff", PRISM[i % 5], dk(PRISM[i % 5], 0.5)]), { lw: 1 }); }
    part(c, cc => { cc.moveTo(34, 50); cc.quadraticCurveTo(50, 36, 66, 50); cc.quadraticCurveTo(50, 64, 34, 50); cc.closePath(); }, rg(c, 50, 50, 1, 16, ["#ffffff", acc, "#1e1b4b"]), { lw: 1.3 });
    part(c, cc => ell(cc, 50, 50, 2.6, 7, 0), "#05030b", { lw: 0 }); glowDot(c, 50, 50, 5, "#ffffff");
  };
  function paintBust(c, id, col, acc, rn) {
    const art = BUST[id] ? id : (() => { const E = EC(); const a = E && E.bossArt ? E.bossArt(id) : id; return BUST[a] ? a : null; })();
    if (art) BUST[art](c, col, acc, rn);
    else { H.hood(c, pal(theme(6), { glow: acc }), {}, rn); }
  }
  function bossIcon(id, size) {
    const bc = bossColors(id);
    const st = id === "heart" || id === "concordant" ? 7 : bc.tier === "boss" ? 5 : 3;
    return render("boss|" + id, size || 64, (c, px, rn) => {
      frameBack(c, st, bc.acc, bc.acc, rn);
      c.save(); c.beginPath(); rr(c, 3, 3, 94, 94, 12); c.clip();
      c.fillStyle = rg(c, 50, 60, 4, 60, [al(bc.col, 0.9), al(dk(bc.col, 0.5), 0.6), "rgba(0,0,0,0)"]); c.beginPath(); circ(c, 50, 60, 60); c.fill();
      composite(c, px, lc => { lc.save(); lc.translate(50, 54); lc.scale(0.86, 0.86); lc.translate(-50, -50); paintBust(lc, id, bc.col, bc.acc, rng("bust:" + id)); lc.restore(); }, { glow: bc.acc, glowA: 0.55, rim: lt(bc.acc, 0.35) });
      c.restore();
      frameRim(c, st, st === 3 ? "#cbd5e1" : st === 5 ? "#fbbf24" : bc.acc, bc.acc, rn);
      // tier crest: skull for bosses, dot for minis
      if (bc.tier === "mini") { part(c, cc => poly(cc, [50, 88, 55, 93, 50, 98, 45, 93]), lg(c, 45, 88, 55, 98, ["#f1f5f9", "#64748b"]), { lw: 1 }); }
    });
  }

  // ---- trophies
  const TROPHY_METAL = {
    1: ["#f7d1a4", "#c07b3c", "#6d3b14", "#2d1606"], 2: ["#ffffff", "#cbd5e1", "#64748b", "#1e293b"],
    3: ["#fff7c2", "#fbbf24", "#a16207", "#422006"], 4: ["#f5eaff", "#c4b5fd", "#6d28d9", "#2e1065"],
  };
  function trophyIcon(bossId, tier, size) {
    if (bossId && typeof bossId === "object") { tier = bossId.tier; bossId = bossId.boss || bossId.bossId || bossId.id; }
    if (typeof bossId === "string" && bossId.indexOf(":") > 0 && tier == null) { const s = bossId.split(":"); bossId = s[0]; tier = +s[1]; }
    tier = Math.max(1, Math.min(4, (+tier | 0) || 1));
    const M = TROPHY_METAL[tier], bc = bossColors(bossId);
    const rar = ["rare", "epic", "legendary", "arcane"][tier - 1];
    return render("trophy|" + bossId + "|" + tier, size || 64, (c, px, rn) => {
      const F = frame(c, rar);
      frameBack(c, F.st, M[1], lt(M[1], 0.3), rn, F);
      composite(c, px, lc => {
        // cup
        part(lc, cc => { cc.moveTo(24, 16); cc.lineTo(76, 16); cc.bezierCurveTo(76, 44, 66, 56, 50, 58); cc.bezierCurveTo(34, 56, 24, 44, 24, 16); cc.closePath(); }, metal(lc, 24, 76, M), { rn, tex: 16, box: [24, 16, 76, 58], bev: 3.5 });
        part(lc, cc => ell(cc, 50, 16, 26, 4.5, 0), lg(lc, 0, 12, 0, 21, [M[3], M[2]]), { lw: 1.3 });
        for (const s of [-1, 1]) { strokeP(lc, OUT, 6.5, cc => { cc.moveTo(50 + s * 25, 22); cc.bezierCurveTo(50 + s * 40, 20, 50 + s * 40, 42, 50 + s * 18, 48); }); strokeP(lc, lg(lc, 0, 20, 0, 48, [M[0], M[2]]), 3.6, cc => { cc.moveTo(50 + s * 25, 22); cc.bezierCurveTo(50 + s * 40, 20, 50 + s * 40, 42, 50 + s * 18, 48); }); }
        part(lc, cc => poly(cc, [46, 57, 54, 57, 56, 70, 44, 70]), metal(lc, 44, 56, M), { lw: 1.2 });
        part(lc, cc => { cc.moveTo(30, 82); cc.lineTo(34, 70); cc.lineTo(66, 70); cc.lineTo(70, 82); cc.closePath(); }, metal(lc, 30, 70, M), { rn, tex: 6, box: [30, 70, 70, 82] });
        part(lc, cc => rr(cc, 26, 81, 48, 8, 2), lg(lc, 0, 81, 0, 89, ["#3f2a1a", "#1c120a"]), { lw: 1.2 });
        // boss emblem medallion on the cup
        part(lc, cc => circ(cc, 50, 34, 11), rg(lc, 50, 34, 1, 11, [lt(bc.col, 0.2), dk(bc.col, 0.5)]), { lw: 1.2 });
        lc.save(); lc.shadowColor = bc.acc; lc.shadowBlur = px * 0.03; glyph(lc, BOSS_GLYPH[bossId] || "skull", 50, 34, 14, lt(bc.acc, 0.3)); lc.restore();
        for (let i = 0; i < tier; i++) { const x = 50 - (tier - 1) * 4 + i * 8; part(lc, cc => starN(cc, x, 85, 5, 3, 1.3), "#fef3c7", { lw: 0.7 }); }
      }, { glow: lt(M[1], 0.2), glowA: 0.45 + tier * 0.1, rim: "rgba(255,255,255,.6)" });
      if (tier >= 3) for (let i = 0; i < tier; i++) sparkle(c, 16 + rn() * 68, 12 + rn() * 50, 1.6 + rn() * 1.6, tier === 4 ? PRISM[i % 5] : "#fff7d6");
      frameRim(c, F.st, F.col, F.glow, rn, F);
    });
  }

  // ---- achievements (medals)
  function achInfo(id) {
    const E = EC();
    const a = (E && E.ACHIEVEMENT_BY_ID && E.ACHIEVEMENT_BY_ID[id]) || (E && E.ACHIEVEMENTS && E.ACHIEVEMENTS.find(x => x.id === id)) || null;
    const s = String(id || "");
    let g = "star", level = 1, col = "#a78bfa";
    const m = s.match(/_(\d+)$/);
    if (m) { const n = +m[1]; level = n >= 30 || n === 3 || n === 50 ? 3 : n >= 20 || n === 2 || n === 25 || n === 300 ? 2 : 1; }
    const cat = a ? a.cat : (s.split("_")[0]);
    if (/^bane_/.test(s)) { const boss = s.split("_")[1]; g = BOSS_GLYPH[boss] || "skull"; col = bossColors(boss).acc; }
    else {
      const T = { unbroken: ["shield", "#86efac"], swift_as_ash: ["hourglass", "#fb923c"], beam_me_up: ["beam", "#fde68a"], first_ancient: ["rune", "#2dd4bf"], full_regalia: ["crown", "#34d399"],
        collector_100: ["book", "#fcd34d"], collector_300: ["book", "#fde68a"], delve_10: ["stairs", "#a78bfa"], delve_20: ["stairs", "#c4b5fd"], delve_30: ["stairs", "#f0abfc"],
        depths_10: ["spiral", "#8b5cf6"], depths_25: ["spiral", "#a78bfa"], depths_50: ["heart", "#f0abfc"], concord_1: ["rings", "#c4b5fd"], concord_2: ["rings", "#c4b5fd"], concord_3: ["rings", "#f5d0fe"],
        goblin_slayer: ["bag", "#fde047"], vaultbreaker: ["key", "#fbbf24"], trialmaster: ["swords", "#f87171"], secret_keeper: ["eye", "#67e8f9"], plus_ten: ["hammer", "#fbbf24"], plus_twelve: ["hammer", "#f472b6"] };
      const t = T[s]; if (t) { g = t[0]; col = t[1]; }
      else { const CT = { feat: "star", loot: "beam", codex: "book", delve: "stairs", depths: "spiral", raid: "rings", forge: "hammer", bane: "skull" }; g = CT[cat] || "star"; }
      if (s === "plus_twelve" || s === "depths_50" || s === "concord_3" || s === "collector_300" || s === "first_ancient") level = 3;
      if (s === "plus_ten" || s === "full_regalia" || s === "beam_me_up") level = Math.max(level, 2);
    }
    return { g, level, col, cat };
  }
  function achievementIcon(id, size) {
    const A = achInfo(id);
    const M = TROPHY_METAL[A.level] || TROPHY_METAL[1];
    const rar = ["rare", "epic", "legendary"][A.level - 1] || "rare";
    return render("ach|" + id, size || 64, (c, px, rn) => {
      const F = frame(c, rar);
      frameBack(c, F.st, A.col, lt(A.col, 0.3), rn, F);
      composite(c, px, lc => {
        // ribbons
        for (const s of [-1, 1]) part(lc, cc => poly(cc, [50 + s * 4, 50, 50 + s * 20, 50, 50 + s * 22, 94, 50 + s * 14, 86, 50 + s * 8, 94]), lg(lc, 50, 50, 50 + s * 22, 94, [lt(A.col, 0.2), dk(A.col, 0.45)]), { lw: 1.2 });
        // medal rim: laurel-ish notches
        part(lc, cc => starN(cc, 50, 42, 20, 32, 29.5, 0), metal(lc, 18, 82, M), { rn, tex: 12, box: [18, 10, 82, 74], bev: 3 });
        part(lc, cc => circ(cc, 50, 42, 24), rg(lc, 44, 36, 1, 26, [lt(A.col, 0.2), dk(A.col, 0.35), dk(A.col, 0.75)]), { lw: 1.4 });
        lc.strokeStyle = al(M[0], 0.7); lc.lineWidth = 0.8; lc.beginPath(); circ(lc, 50, 42, 21); lc.stroke();
        lc.save(); lc.shadowColor = A.col; lc.shadowBlur = px * 0.04; glyph(lc, A.g, 50, 42, 28, lt(A.col, 0.55)); lc.restore();
        for (let i = 0; i < A.level; i++) { const x = 50 - (A.level - 1) * 5 + i * 10; part(lc, cc => starN(cc, x, 70, 5, 4, 1.7), lg(lc, x - 4, 66, x + 4, 74, [M[0], M[1]]), { lw: 0.8 }); }
      }, { glow: lt(A.col, 0.2), glowA: 0.4 + A.level * 0.12, rim: "rgba(255,255,255,.6)" });
      frameRim(c, F.st, F.col, lt(A.col, 0.3), rn, F);
    });
  }

  // ---- dungeon tier emblems
  const TIER_GLYPH = { guild_crypt: "skull", guild_forge: "anvil", guild_void: "door", guild_dragon: "eye", guild_archive: "book", guild_geode: "crystal", guild_rime: "snow", raid_nexus: "rings", arcane_depths: "spiral" };
  const THEME_FALLBACK = { crypt: ["#33403f", "#67e8f9"], forge: ["#3f2a20", "#f97316"], void: ["#2a2140", "#c084fc"], dragon: ["#3b3733", "#fb923c"], archive: ["#1e1b4b", "#fde68a"], geode: ["#3b0764", "#22d3ee"], rime: ["#0c1a2e", "#5eead4"], depths: ["#1e1036", "#8b5cf6"], nexus: ["#1e1036", "#a78bfa"] };
  function tierIcon(tierKey, size) {
    const E = EC();
    const d = E && E.GUILD_DUNGEONS && E.GUILD_DUNGEONS[tierKey];
    const themeKey = (d && d.theme) || String(tierKey || "").replace(/^guild_|^raid_/, "");
    const D = root.DEPTHS, th = D && D.DUNGEON_THEMES && D.DUNGEON_THEMES[themeKey];
    const f = THEME_FALLBACK[themeKey] || ["#1f2937", "#e5e7eb"];
    const wall = (th && th.wall) || f[0], torch = (th && th.torch) || f[1], cap = (th && th.cap) || torch;
    const lvl = (d && d.gearLvl) || 0;
    const st = tierKey === "arcane_depths" ? 7 : tierKey === "raid_nexus" ? 6 : lvl >= 8 ? 5 : 4;
    return render("tier|" + tierKey, size || 64, (c, px, rn) => {
      frameBack(c, st, torch, torch, rn);
      composite(c, px, lc => {
        const shield = cc => { cc.moveTo(50, 8); cc.lineTo(84, 18); cc.bezierCurveTo(84, 56, 72, 80, 50, 94); cc.bezierCurveTo(28, 80, 16, 56, 16, 18); cc.closePath(); };
        part(lc, shield, lg(lc, 16, 8, 84, 94, [lt(cap, 0.35), cap, dk(cap, 0.55)]), { rn, tex: 16, box: [16, 8, 84, 94], bev: 3 });
        const inner = cc => { cc.moveTo(50, 15); cc.lineTo(77, 23); cc.bezierCurveTo(77, 55, 67, 74, 50, 86); cc.bezierCurveTo(33, 74, 23, 55, 23, 23); cc.closePath(); };
        part(lc, inner, rg(lc, 50, 44, 2, 44, [lt(wall, 0.25), wall, dk(wall, 0.6)]), { rn, tex: 20, box: [23, 15, 77, 86] });
        lc.save(); lc.beginPath(); inner(lc); lc.clip();
        lc.fillStyle = rg(lc, 50, 46, 1, 30, [al(torch, 0.55), al(torch, 0)]); lc.beginPath(); circ(lc, 50, 46, 30); lc.fill();
        if (st >= 7) for (let i = 0; i < 16; i++) { lc.fillStyle = "rgba(255,255,255,.7)"; lc.beginPath(); circ(lc, 24 + rn() * 52, 18 + rn() * 64, 0.4 + rn() * 0.5); lc.fill(); }
        lc.restore();
        lc.save(); lc.shadowColor = torch; lc.shadowBlur = px * 0.05; glyph(lc, TIER_GLYPH[tierKey] || "star", 50, 44, 32, lt(torch, 0.45)); lc.restore();
        // level numeral banner
        if (lvl) {
          const txt = tierKey === "arcane_depths" ? "∞" : ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][lvl] || String(lvl);
          part(lc, cc => { cc.moveTo(28, 66); cc.lineTo(72, 66); cc.lineTo(68, 72); cc.lineTo(72, 78); cc.lineTo(28, 78); cc.lineTo(32, 72); cc.closePath(); }, lg(lc, 0, 66, 0, 78, [lt(torch, 0.2), dk(torch, 0.45)]), { lw: 1.1 });
          lc.font = "900 10px Georgia, 'Times New Roman', serif"; lc.textAlign = "center"; lc.textBaseline = "middle"; lc.lineWidth = 2.2; lc.strokeStyle = "rgba(0,0,0,.85)"; lc.strokeText(txt, 50, 72.5); lc.fillStyle = "#fffbeb"; lc.fillText(txt, 50, 72.5);
        }
      }, { glow: torch, glowA: 0.5, rim: lt(torch, 0.35) });
      frameRim(c, st, st === 4 ? "#94a3b8" : st === 5 ? "#fbbf24" : torch, torch, rn);
    });
  }

  // ---- cosmetics (the unlockable dungeon hats; others fall back to a crown silhouette)
  const COSMETIC_LOOK = {
    drowned_crown_hat: ["crown", 4], forgemaster_goggles: ["mask", 5], hollow_diadem_hat: ["circlet", 6], ember_crown: ["crown", 7],
    star_circlet: ["circlet", 8], geode_tiara: ["crown", 9], rime_crown: ["crown", 10],
  };
  function cosmeticIcon(id, size) {
    const L = COSMETIC_LOOK[id] || ["crown", 3];
    return render("cos|" + id, size || 64, (c, px, rn) => {
      const p = theme(L[1]);
      const F = frame(c, "legendary");
      frameBack(c, F.st, F.col, F.glow, rn, F);
      composite(c, px, lc => { lc.save(); lc.translate(50, 50); lc.scale(ICON_BOX, ICON_BOX); lc.translate(-50, -50); H[L[0]](lc, pal(p), { crystal: L[1] === 9, ice: L[1] === 10, flame: L[1] === 7 }, rn); lc.restore(); }, { glow: p.glow || F.glow, glowA: 0.5, rim: lt(F.glow, 0.3) });
      frameRim(c, F.st, F.col, F.glow, rn, F);
    });
  }

  // ------------------------------------------------------------------ html helpers
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]); }
  function rarityOf(kind, arg) {
    if (kind === "gear" || kind === "item") { const it = normItem(arg); if (it.rarity) return it.rarity; const E = EC(); const b = E && E.GEAR_BASE_BY_ID && E.GEAR_BASE_BY_ID[it.base]; return b && (b.unique || b.set) ? "legendary" : "fine"; }
    if (kind === "tome") { const E = EC(); const t = E && E.TOMES && E.TOMES[arg]; return (t && t.rarity) || "legendary"; }
    if (kind === "gem") { const g = gemInfo(arg); return g.rune ? "mythic" : GRADE_RARITY[g.grade - 1]; }
    if (kind === "chest") { const k = typeof arg === "number" || /^\d+$/.test(String(arg)) ? ["bronze", "silver", "gold", "arcane"][+arg] : String(arg); return (CHEST_LOOK[k] || CHEST_LOOK.bronze).rar; }
    if (kind === "frame") return arg;
    if (kind === "trophy") { const t = arg && typeof arg === "object" ? arg.tier : String(arg).split(":")[1]; return ["rare", "epic", "legendary", "arcane"][(+t || 1) - 1]; }
    if (kind === "tier") return arg === "arcane_depths" ? "arcane" : arg === "raid_nexus" ? "ancient" : "legendary";
    if (kind === "boss") return arg === "heart" || arg === "concordant" ? "arcane" : bossColors(arg).tier === "boss" ? "mythic" : "epic";
    return "";
  }
  function urlFor(kind, arg, size) {
    switch (kind) {
      case "gear": case "item": return gear(arg, size);
      case "mat": case "material": return /^rune_|:/.test(String(arg)) ? gemIcon(arg, size) : matIcon(arg, size);
      case "gem": case "rune": return gemIcon(arg, size);
      case "tome": return tome(arg && arg.tome ? arg.tome : arg, size);
      case "chest": return chestIcon(arg, size);
      case "key": return keyIcon(arg, size);
      case "trophy": return Array.isArray(arg) ? trophyIcon(arg[0], arg[1], size) : trophyIcon(arg, null, size);
      case "achievement": case "ach": return achievementIcon(arg, size);
      case "boss": return bossIcon(arg, size);
      case "tier": case "dungeon": return tierIcon(arg, size);
      case "frame": case "rarity": return rarityFrame(arg, size);
      case "cosmetic": return cosmeticIcon(arg, size);
      default: return "";
    }
  }
  function titleFor(kind, arg) {
    const E = EC();
    try {
      if (kind === "gear" || kind === "item") { const it = normItem(arg); return E && E.gearName && it.rarity ? E.gearName(it) : ((E && E.GEAR_BASE_BY_ID && E.GEAR_BASE_BY_ID[it.base]) || {}).name || it.base || ""; }
      if (kind === "mat") return ((E && E.MATERIALS && E.MATERIALS[arg]) || {}).name || arg;
      if (kind === "tome") return ((E && E.TOMES && E.TOMES[arg]) || {}).name || arg;
      if (kind === "boss") return ((E && E.GUILD_BOSSES && E.GUILD_BOSSES[arg]) || {}).name || arg;
      if (kind === "tier") return ((E && E.GUILD_DUNGEONS && E.GUILD_DUNGEONS[arg]) || {}).name || arg;
      if (kind === "achievement") return ((E && E.ACHIEVEMENT_BY_ID && E.ACHIEVEMENT_BY_ID[arg]) || {}).label || arg;
      if (kind === "gem") { const g = gemInfo(arg); if (g.rune) return ((E && E.RUNES && E.RUNES[arg]) || {}).name || arg; const G = E && E.GEMS && E.GEMS[g.type]; return (G ? G.name : g.type) + " " + ["I", "II", "III", "IV", "V"][g.grade - 1]; }
    } catch (e) { /* titles are cosmetic */ }
    return typeof arg === "string" ? arg : "";
  }
  function html(kind, arg, size, extraClass) {
    size = Math.round(+size || 64);
    const url = urlFor(kind, arg, size);
    if (!url) return "";
    const r = rarityOf(kind, arg);
    const cls = ["ii", "ii-" + kind, r ? "ii-r-" + r : "", extraClass || ""].filter(Boolean).join(" ");
    const t = titleFor(kind, arg);
    return `<img class="${esc(cls)}" src="${url}" width="${size}" height="${size}" alt="${esc(t)}" draggable="false" loading="lazy" decoding="async">`;
  }
  function box(kind, arg, size, extraClass) {
    const img = html(kind, arg, size);
    if (!img) return "";
    const r = rarityOf(kind, arg);
    return `<span class="iiBox${r ? " ii-r-" + r : ""}${extraClass ? " " + esc(extraClass) : ""}" style="width:${Math.round(+size || 64)}px;height:${Math.round(+size || 64)}px">${img}</span>`;
  }

  // Draw icons ahead of time in idle slices, so the first open of a GUI (guild hall boards,
  // trophy room) reads data URLs straight from the cache instead of encoding PNGs mid-click.
  const warmQueue = [];
  let warmBusy = false;
  function prewarm(list) {
    for (const job of list || []) if (job) warmQueue.push(job);
    if (warmBusy || !warmQueue.length) return;
    warmBusy = true;
    const idle = root.requestIdleCallback ? (fn) => root.requestIdleCallback(fn, { timeout: 1500 }) : (fn) => setTimeout(() => fn(null), 30);
    const step = (deadline) => {
      const until = Date.now() + 6;
      do {
        const [kind, arg, size] = warmQueue.shift();
        try { urlFor(kind, arg, size || 64); } catch (e) {}
      } while (warmQueue.length && (deadline && deadline.timeRemaining ? deadline.timeRemaining() > 4 : Date.now() < until));
      if (warmQueue.length) idle(step); else warmBusy = false;
    };
    idle(step);
  }

  const api = {
    version: 1,
    prewarm,
    gear: (item, size) => gear(item, size || 64),
    mat: (id, size) => matIcon(id, size || 64),
    gem: (id, size) => gemIcon(id, size || 64),
    tome: (id, size) => tome(id, size || 64),
    chest: (tier, size) => chestIcon(tier, size || 64),
    key: (kind, size) => keyIcon(kind, size || 64),
    trophy: (bossId, tier, size) => trophyIcon(bossId, tier, size || 64),
    achievement: (id, size) => achievementIcon(id, size || 64),
    boss: (id, size) => bossIcon(id, size || 64),
    tier: (key, size) => tierIcon(key, size || 64),
    rarityFrame: (r, size) => rarityFrame(r, size || 64),
    cosmetic: (id, size) => cosmeticIcon(id, size || 64),
    url: urlFor,
    html, box,
    family: (baseId) => lookFor(baseId).fam,
    // test / tooling hooks
    _setCanvasFactory(fn) { factory = fn || null; cache.clear(); },
    _strict(on) { strict = !!on; },
    _stats: () => ({ draws: stats.draws, hits: stats.hits, cached: cache.size }),
    clearCache() { cache.clear(); },
    _families: FAMILY,
  };
  root.ItemIcons = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
