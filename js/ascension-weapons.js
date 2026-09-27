/* THE SUNDERED CROWN II — the two new weapon kinds on the client (greatsword
   and wand: held models, keyed attack animations, trails) and the icon art for
   everything this wave adds (armament families, unique / set looks, the six
   boss portraits). Registers through gameWeapons.registerKind and
   ItemIcons.register (hooks in js/player-weapons.js / js/item-icons.js); with
   either missing it does nothing. Eager (small): icons show in any pack. */
(function () {
  "use strict";
  const W = typeof window !== "undefined" ? window : null;
  if (!W) return;
  const TAU = Math.PI * 2, PI = Math.PI;

  // ---------------------------------------------------------------- held weapons + animations
  function weapons() {
    const G = W.gameWeapons;
    if (!G || typeof G.registerKind !== "function" || G._ascKinds) return false;
    const COL = { steel: "#cbd5e1", edge: "#f8fafc", dark: "#334155", gold: "#d4a64a", leather: "#6b3f1f", wood: "#8b5a2b", gem: "#a5f3fc" };
    const outline = (ctx) => { ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(15,23,42,.85)"; ctx.stroke(); };
    const grip = (ctx, x0, x1, w) => { ctx.fillStyle = COL.leather; ctx.fillRect(x0, -w / 2, x1 - x0, w); ctx.fillStyle = "rgba(0,0,0,.25)"; for (let x = x0 + 2; x < x1; x += 3) ctx.fillRect(x, -w / 2, 1, w); };
    // GREATSWORD: a long two-handed blade — a slow heave over the shoulder, a
    // falling cut that bites the ground, a heavy drag back to the rest.
    G.registerKind("greatsword", {
      rest: { rot: 1.15, orb: 0.6, ext: -2, lift: 1 }, tip: 42, ms: 520, trail: "#bae6fd",
      model(ctx, p, tint) {
        grip(ctx, -12, 2, 3.8);
        ctx.fillStyle = COL.gold; ctx.beginPath(); ctx.arc(-13.5, 0, 2.6, 0, TAU); ctx.fill();
        ctx.fillStyle = COL.gold; ctx.fillRect(2, -7.5, 3, 15);
        ctx.beginPath(); ctx.moveTo(5, -3.4); ctx.lineTo(37, -2.4); ctx.lineTo(43, 0); ctx.lineTo(37, 2.4); ctx.lineTo(5, 3.4); ctx.closePath();
        ctx.fillStyle = COL.steel; ctx.fill(); outline(ctx);
        ctx.strokeStyle = COL.edge; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(38, 0); ctx.stroke();
        if (tint) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.55; ctx.strokeStyle = tint; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(7, -1.6); ctx.lineTo(40, -1.2); ctx.stroke(); ctx.restore(); }
      },
      pose(P, R, k, dir, E) {
        const up = E.inOut(E.seg(k, 0, 0.36)), down = E.inCubic(E.seg(k, 0.36, 0.5)), rec = E.inOut(E.seg(k, 0.68, 1));
        const bite = k >= 0.5 && k < 0.68 ? Math.sin(E.seg(k, 0.5, 0.68) * PI) : 0;
        if (k < 0.36) { P.rot = E.lerp(R.rot, -2.6, up); P.lift = E.lerp(R.lift, 18, up); P.ext = E.lerp(R.ext, -6, up); P.orb = E.lerp(R.orb, -0.4, up); P.len = E.lerp(1, 0.72, up); }
        else if (k < 0.5) { P.rot = E.lerp(-2.6, 0.5, down); P.lift = E.lerp(18, -2, down); P.ext = E.lerp(-6, 14, down); P.orb = E.lerp(-0.4, 0.2, down); P.len = E.lerp(0.72, 1, down); P.trail = 1; }
        else if (k < 0.68) { P.trail = k < 0.56 ? 1 : 0; P.rot = 0.5 - 0.12 * bite; P.lift = -2 + 2 * bite; P.ext = 14 - 1.5 * bite; P.orb = 0.2; }
        else { P.rot = E.lerp(0.35, R.rot, rec); P.lift = E.lerp(0, R.lift, rec); P.ext = E.lerp(12, R.ext, rec); P.orb = E.lerp(0.2, R.orb, rec); }
      },
    });
    // WAND: a short rod with a crystal — a flick forward, a spark, a springy settle.
    G.registerKind("wand", {
      rest: { rot: 0.2, orb: 0.25, ext: 3, lift: 3 }, tip: 22, ms: 210, trail: "#a5f3fc",
      model(ctx, p, tint) {
        ctx.fillStyle = COL.wood; ctx.fillRect(-6, -1.4, 22, 2.8); grip(ctx, -6, 2, 3.2);
        ctx.fillStyle = COL.gold; ctx.fillRect(14, -2.2, 2.4, 4.4);
        ctx.strokeStyle = "rgba(15,23,42,.85)"; ctx.lineWidth = 1; ctx.strokeRect(-6, -1.4, 22, 2.8);
        ctx.fillStyle = tint || COL.gem; ctx.beginPath(); ctx.moveTo(16, -3.2); ctx.lineTo(22, 0); ctx.lineTo(16, 3.2); ctx.lineTo(18.5, 0); ctx.closePath(); ctx.fill(); outline(ctx);
        if (p.flash > 0.02) {
          ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = p.flash;
          ctx.fillStyle = "#e0f2fe"; ctx.beginPath(); ctx.arc(22, 0, 2 + 5 * p.flash, 0, TAU); ctx.fill();
          ctx.strokeStyle = tint || COL.gem; ctx.lineWidth = 1.5; for (let i = 0; i < 4; i++) { const a = i * PI / 2 + p.flash * 2; ctx.beginPath(); ctx.moveTo(22 + Math.cos(a) * 4, Math.sin(a) * 4); ctx.lineTo(22 + Math.cos(a) * (8 + 6 * p.flash), Math.sin(a) * (8 + 6 * p.flash)); ctx.stroke(); }
          ctx.restore();
        }
      },
      pose(P, R, k, dir, E) {
        const u = E.kick(k, 0.1, 12, 7);
        P.ext = R.ext + 6 * Math.max(0, u) - 2 * Math.min(0, u); P.rot = R.rot - 0.5 * Math.max(0, u); P.lift = R.lift + 2 * Math.max(0, u);
        P.flash = k < 0.3 ? 1 - k / 0.3 : 0;
      },
    });
    G._ascKinds = true;
    return true;
  }

  // ---------------------------------------------------------------- icons
  function icons() {
    const I = W.ItemIcons, E = W.ECON, A = W.ASCEND;
    if (!I || typeof I.register !== "function" || !E || !A || I._ascIcons) return false;
    const families = {}, variants = {};
    for (let l = 1; l <= 12; l++) {
      families["arm_greatsword_" + l] = "greatsword"; families["arm_wand_" + l] = "wand";
      if (l >= 9) variants["arm_greatsword_" + l] = { runes: 1 };
    }
    Object.assign(families, {
      riders_lance: "spear", drowned_barding: "plate", masons_plumb: "band", wick_mothers_taper: "knives", tallow_mantle: "robe", hounds_collar: "band", huntress_hood: "hood",
      tether_of_seraphine: "band", ascendants_edge: "greatsword", fair_copy_crown: "crown", unmoored_greaves: "greaves",
      riders_carbine: "gun", masons_level: "greatsword", candlemas_wand: "wand", grims_fang: "boomerang", seraphines_needle: "blowpipe", fair_copy_blade: "greatsword",
      bastion_vigil_weapon: "spear", bastion_vigil_helmet: "helm", bastion_vigil_chest: "plate", bastion_vigil_legs: "greaves", bastion_vigil_ring: "band",
      candlelight_weapon: "knives", candlelight_helmet: "hood", candlelight_chest: "robe", candlelight_legs: "greaves", candlelight_ring: "band",
      ascendant_regalia_weapon: "greatsword", ascendant_regalia_helmet: "crown", ascendant_regalia_chest: "plate", ascendant_regalia_legs: "greaves", ascendant_regalia_ring: "band",
    });
    Object.assign(variants, { wick_mothers_taper: { flame: 1 }, candlemas_wand: { flame: 1 }, tether_of_seraphine: { gemc: "#e9d5ff" }, fair_copy_crown: { gemc: "#fef08a" }, ascendants_edge: { runes: 1 }, fair_copy_blade: { runes: 1 }, riders_lance: { ice: 1 } });
    // Some family names may not exist in this build of the painters: fall back to the closest known one.
    const known = new Set(Object.values(I._families));
    const FALL = { plate: "plate", band: "band", knives: "knives", robe: "robe", hood: "hood", crown: "crown", greaves: "greaves", helm: "helm", spear: "spear", gun: "gun", boomerang: "boomerang", blowpipe: "blowpipe", greatsword: "greatsword" };
    for (const k of Object.keys(families)) if (!known.has(families[k]) && families[k] !== "wand") families[k] = E.GEAR_BASE_BY_ID[k] ? (I._families[Object.keys(I._families).find(id => E.GEAR_BASE_BY_ID[id] && E.GEAR_BASE_BY_ID[id].slot === E.GEAR_BASE_BY_ID[k].slot)] || families[k]) : families[k];
    void FALL;
    const h = I.register({ families, variants });
    if (!h) return false;
    const { circ, poly, al, lg, glowDot, strokeP, part, rr } = h;
    // the wand painter (the frame is rotated 45°: the weapon runs along -y, tip up)
    const weapons = {
      wand(c, p, v, rn) {
        part(c, cc => rr(cc, -2.6, -22, 5.2, 66, 2.4), lg(c, -3, 0, 3, 0, ["#7c5a35", "#c08a52", "#5a3d1f"]), { rn, tex: 10, box: [-3, -22, 3, 44] });
        part(c, cc => rr(cc, -4, -26, 8, 6, 2), lg(c, -4, 0, 4, 0, p.trim || ["#fde68a", "#b45309"]), { lw: 1 });
        part(c, cc => poly(cc, [0, -52, 7, -36, 0, -28, -7, -36]), lg(c, -7, -52, 7, -28, ["#ffffff", p.gem || "#a5f3fc", al(p.gem || "#a5f3fc", 0.7)]), { lw: 1.1 });
        for (let i = 0; i < 5; i++) glowDot(c, (rn() - 0.5) * 30, -40 + (rn() - 0.5) * 24, 1 + rn() * 1.5, p.glow || "#a5f3fc", "#ffffff");
        strokeP(c, al("#ffffff", 0.7), 0.8, cc => { cc.moveTo(-1, -46); cc.lineTo(1, -32); });
      },
    };
    // the six portraits: a hooded / helmed bust in the boss colours with one signature each
    const bust = (c, col, acc, rn, sig) => {
      part(c, cc => poly(cc, [14, 96, 22, 60, 50, 50, 78, 60, 86, 96]), lg(c, 50, 50, 50, 96, [col, al(col, 0.55)]), { lw: 1.4 });   // shoulders
      part(c, cc => circ(cc, 50, 40, 17), lg(c, 40, 24, 60, 56, [al("#ffffff", 0.25), col]), { lw: 1.6 });                            // head
      sig(c, col, acc, rn);
    };
    const eyes = (c, acc, y, sep, r) => { glowDot(c, 50 - sep, y, r, acc, "#ffffff"); glowDot(c, 50 + sep, y, r, acc, "#ffffff"); };
    const busts = {
      vaughn: (c, col, acc, rn) => bust(c, col, acc, rn, (cc) => {
        part(cc, x => poly(x, [33, 40, 50, 18, 67, 40, 67, 48, 33, 48]), lg(cc, 33, 18, 67, 48, ["#94a3b8", "#334155"]), { lw: 1.4 });   // the sallet
        part(cc, x => rr(x, 36, 42, 28, 4, 1), "#0c0a09", { lw: 0.6 });
        eyes(cc, acc, 44, 6, 1.6);
        strokeP(cc, "#e5e7eb", 3, x => { x.moveTo(84, 14); x.lineTo(70, 92); });                                                            // the lance
        for (let i = 0; i < 6; i++) glowDot(cc, 10 + rn() * 80, 60 + rn() * 34, 1 + rn() * 1.2, "#67e8f9", "#e0f2fe");                     // sea spray
      }),
      mordaunt: (c, col, acc, rn) => bust(c, col, acc, rn, (cc) => {
        for (let i = 0; i < 5; i++) part(cc, x => rr(x, 20 + i * 12, 62 + (i % 2) * 6, 11, 9, 1), lg(cc, 0, 62, 0, 71, ["#64748b", "#334155"]), { lw: 0.8 });   // stone shoulders
        eyes(cc, acc, 40, 6, 1.8);
        part(cc, x => rr(x, 30, 48, 40, 5, 2), "#94a3b8", { lw: 0.8 });                                                                    // the level
        glowDot(cc, 50, 50, 2.2, acc, "#ffffff");
      }),
      candlemas: (c, col, acc, rn) => bust(c, col, acc, rn, (cc) => {
        for (let i = -2; i <= 2; i++) { part(cc, x => rr(x, 48 + i * 7, 14 + Math.abs(i) * 3, 3.5, 12, 1), "#fef3c7", { lw: 0.6 }); glowDot(cc, 49.7 + i * 7, 10 + Math.abs(i) * 3, 2.2, i % 2 ? "#fb923c" : "#fde047", "#ffffff"); }   // the crown of wicks
        eyes(cc, "#fbbf24", 41, 6, 1.8);
        for (let i = 0; i < 5; i++) part(cc, x => circ(x, 22 + i * 14, 70 + (i % 2) * 8, 3 + rn() * 2), "#fde68a", { lw: 0.6 });         // wax drips
      }),
      ilse_grim: (c, col, acc, rn) => bust(c, col, acc, rn, (cc) => {
        part(cc, x => poly(x, [32, 44, 50, 22, 68, 44, 66, 30, 50, 24, 34, 30]), lg(cc, 32, 22, 68, 44, ["#a16207", "#3f2a14"]), { lw: 1.3 });   // the hood
        eyes(cc, "#fef9c3", 42, 5, 1.5);
        part(cc, x => poly(x, [76, 62, 86, 70, 78, 84, 70, 74]), lg(cc, 70, 62, 86, 84, ["#52525b", "#18181b"]), { lw: 1.2 });         // Grim's head at her shoulder
        glowDot(cc, 79, 72, 1.6, "#f87171", "#ffffff");
        strokeP(cc, "#d6d3d1", 2.4, x => { x.moveTo(16, 92); x.lineTo(30, 14); });                                                          // the spear
      }),
      seraphine: (c, col, acc, rn) => bust(c, col, acc, rn, (cc) => {
        strokeP(cc, al("#e9d5ff", 0.9), 2.2, x => { x.arc(50, 34, 24, 0, TAU); });                                                         // the halo
        eyes(cc, acc, 41, 6, 1.9);
        for (let i = 0; i < 3; i++) strokeP(cc, al("#c4b5fd", 0.35 - i * 0.1), 1.4, x => { x.arc(50, 40, 19 + i * 5, 0.2, PI - 0.2); });  // phasing echoes
        for (let i = 0; i < 6; i++) glowDot(cc, 10 + rn() * 80, 10 + rn() * 80, 1 + rn() * 1.2, "#e9d5ff", "#ffffff");
      }),
      aurelion: (c, col, acc, rn) => bust(c, col, acc, rn, (cc) => {
        part(cc, x => poly(x, [32, 32, 36, 14, 44, 26, 50, 8, 56, 26, 64, 14, 68, 32]), lg(cc, 32, 8, 68, 32, ["#fef9c3", "#ca8a04"]), { lw: 1.3 });   // the fair copy of the crown
        strokeP(cc, al("#fef08a", 0.8), 2, x => { x.arc(50, 34, 27, 0, TAU); });
        eyes(cc, acc, 41, 6, 1.9);
        strokeP(cc, "#e5e7eb", 3.2, x => { x.moveTo(82, 96); x.lineTo(72, 18); });                                                           // the greatsword
      }),
    };
    I.register({ weapons, busts });
    I._ascIcons = true;
    return true;
  }

  function init() { weapons(); icons(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else setTimeout(init, 0);
  setTimeout(init, 1200);
  W.gameAscensionWeapons = { init, weapons, icons };
})();
