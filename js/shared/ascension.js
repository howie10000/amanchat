/* THE SUNDERED CROWN II — "ASCENSION": shared data + rules for the second
   content wave (docs/sundered-crown/NEW-CONTENT.md). Loaded by BOTH the
   browser (<script> after crown.js, exposed as window.ASCEND) and the Node
   server (require()).

   Everything this wave adds is APPENDED to the canonical ECON / DEPTHS /
   DUNGEON tables at load time by install(): three tiers, six moving bosses
   (mounted, arena-reshaper, summoner with linked adds, role-swapping duo,
   phaser, four-form raid boss), nine mobs, two weapon kinds, uniques, sets,
   armaments, codex pages, achievements, cosmetics and the late-game systems
   (the Ascension ladder, the weekly challenge, boss mastery, essence crafting).
   Nothing legacy moves: every list is pushed onto, every id is new, and the
   legacy fingerprint (js/crown.test.js) never sees this module.

   New planner drivers ('reshaper', 'phaser') and the twins 'melee' mode are
   registered into CROWN through CROWN.registerDriver (crown.js hook). The
   server-side extension (linked adds, tethers, arena layouts, gear-power
   scaling) lives in server-node/ascension-engine.js and only talks to
   crown-engine.js through its `ext` hooks.

   Pure: no DOM, no Date.now(), no Math.random when a `rand` is passed. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./economy.js"), require("./depths.js"), require("./dungeon.js"), require("./crown.js"));
  else root.ASCEND = factory(root.ECON, root.DEPTHS || null, root.DUNGEON || null, root.CROWN || null);
})(typeof self !== "undefined" ? self : this, function (ECON, DEPTHS, DUNGEON, CROWN) {
  "use strict";
  const VERSION = 1;
  const TAU = Math.PI * 2;
  const MIN_MS = 60000;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const num = (x, d) => (Number.isFinite(+x) ? +x : (d || 0));

  // ---------------------------------------------------------------- IDS
  const TIERS = ["guild_bastion", "guild_wickwood", "guild_spire"];
  const BOSSES = ["vaughn", "candlemas", "aurelion"];
  const MINIS = ["mordaunt", "ilse_grim", "seraphine"];
  const ENEMIES = ["drowned", "tidecaller", "warhorse", "wick", "waxling", "lamp_acolyte", "unmoored", "spire_warden", "echo"];
  const THEMES = ["bastion", "wickwood", "spire"];
  const KINDS = ["greatsword", "wand"];

  // ---------------------------------------------------------------- TIERS
  // Bastion: item level 5 between the Forge and the Hollow Throne (mid-early);
  // Wickwood: L9 after the Geode (late); Spire: L12 after the Throne, raidable
  // (endgame). All expedition runs on the archetype engine (crown:true).
  const rosterOf = (spec) => spec.flatMap(([t, n]) => Array(n).fill(t));
  const DUNGEONS = {
    guild_bastion: {
      name: "The Drowned Bastion", tier: "guild_bastion", boss: "vaughn", mini: "mordaunt",
      floors: 7, enemyMin: 15, enemyMax: 20, hpMult: 3.4, speedMult: 1.52, reward: 5200,
      blurb: "The sea took the fort. The rider kept riding.",
      theme: "bastion", dmgMult: 1.0, gearLvl: 5, unlockAfter: "guild_forge", raidable: false, mode: "story", continuousOnly: true, crown: true, ascend: true,
      roster: rosterOf([["drowned", 4], ["tidecaller", 2], ["warhorse", 1], ["tank", 2], ["archer", 2], ["melee", 1]]),
    },
    guild_wickwood: {
      name: "The Wickwood Cathedral", tier: "guild_wickwood", boss: "candlemas", mini: "ilse_grim",
      floors: 7, enemyMin: 15, enemyMax: 20, hpMult: 8.6, speedMult: 1.86, reward: 27000,
      blurb: "Every candle in here was somebody. She lit them all.",
      theme: "wickwood", dmgMult: 1.34, gearLvl: 9, unlockAfter: "guild_geode", raidable: true, mode: "story", continuousOnly: true, crown: true, ascend: true,
      roster: rosterOf([["wick", 4], ["waxling", 2], ["lamp_acolyte", 2], ["stalker", 1], ["shaman", 1], ["revenant", 1], ["tome", 1]]),
    },
    guild_spire: {
      name: "The Unmoored Spire", tier: "guild_spire", boss: "aurelion", mini: "seraphine",
      floors: 7, enemyMin: 15, enemyMax: 20, hpMult: 13.2, speedMult: 1.96, reward: 48000,
      blurb: "A tower that forgot which way was down. Something at the top is still climbing.",
      theme: "spire", dmgMult: 1.62, gearLvl: 12, unlockAfter: "guild_throne", raidable: true, mode: "story", continuousOnly: true, crown: true, ascend: true,
      roster: rosterOf([["unmoored", 3], ["spire_warden", 2], ["echo", 3], ["crownguard", 1], ["courtier", 1], ["crown_wisp", 1], ["golem", 1]]),
    },
  };
  const EARN_CAPS = { guild_bastion: { cap: 14000, cooldown: 0 }, guild_wickwood: { cap: 66000, cooldown: 0 }, guild_spire: { cap: 130000, cooldown: 0 } };
  // Where each tier sits in STORY_LADDER (inserted after this key).
  const LADDER_AFTER = { guild_bastion: "guild_forge", guild_wickwood: "guild_geode", guild_spire: "guild_throne" };

  // ---------------------------------------------------------------- THEMES / ENEMIES
  // Props and motes reuse existing art kinds (nothing is left on a fallback).
  const THEME_DEFS = {
    bastion:  { floor: [22, 30, 40], shade: 14, joint: "rgba(56,189,248,.2)",   wall: "#24333f", cap: "#0e7490", fog: "#04080c", torch: "#67e8f9", motes: "bubbles", props: ["puddle", "chains", "bones"], sightMult: 0.95 },
    wickwood: { floor: [34, 26, 18], shade: 14, joint: "rgba(253,224,71,.16)",  wall: "#3a2a1a", cap: "#a16207", fog: "#080502", torch: "#fde047", motes: "embers",  props: ["candles", "candelabra", "bookshelf"], sightMult: 0.85 },
    spire:    { floor: [22, 24, 44], shade: 14, joint: "rgba(196,181,253,.2)", wall: "#262a4a", cap: "#c4b5fd", fog: "#04040c", torch: "#c4b5fd", motes: "stars",   props: ["floating_stone", "obelisk", "star_map"], sightMult: 0.9 },
  };
  const ENEMY_DEFS = {
    // ---- the Drowned Bastion ----
    drowned:      { color: "#0e7490", size: 14, speed: 1.0, hp: 64,  dmg: 10, ai: "chase",   name: "Drowned Marine",  sight: 320 },
    tidecaller:   { color: "#22d3ee", size: 12, speed: 0.9, hp: 58,  dmg: 9,  ai: "rooter",  name: "Tidecaller",      sight: 420, rootCd: 230, rootWarn: 50, rootR: 46, rootFrames: 65, ideal: 220 },
    warhorse:     { color: "#e2e8f0", size: 17, speed: 1.3, hp: 150, dmg: 20, ai: "charger", name: "Pale Warhorse",   sight: 420, chargeCd: 150, chargeWarn: 34, chargeSpeed: 9.5, chargeFrames: 28 },
    // ---- the Wickwood Cathedral ----
    wick:         { color: "#fde047", size: 9,  speed: 2.3, hp: 42,  dmg: 9,  ai: "orbiter", name: "Wick",            sight: 380, orbitR: 90, dashCd: 110, dashSpeed: 7.5, dashFrames: 14 },
    waxling:      { color: "#fef3c7", size: 13, speed: 0.55,hp: 120, dmg: 6,  ai: "spore",   name: "Waxling",         sight: 300, sporeCd: 190, sporeR: 84, slow: 0.45, sporeFrames: 160 },
    lamp_acolyte: { color: "#a16207", size: 12, speed: 1.3, hp: 90,  dmg: 15, ai: "phaser",  name: "Lamp Acolyte",    sight: 360, phaseCd: 190, phaseFrames: 80 },
    // ---- the Unmoored Spire ----
    unmoored:     { color: "#c4b5fd", size: 13, speed: 1.6, hp: 110, dmg: 17, ai: "mirror",  name: "Unmoored Shade",  sight: 380 },
    spire_warden: { color: "#818cf8", size: 18, speed: 0.8, hp: 260, dmg: 24, ai: "guard",   name: "Spire Warden",    sight: 300, blockArc: 2.4, turn: 0.055 },
    echo:         { color: "#f5d0fe", size: 11, speed: 1.9, hp: 76,  dmg: 18, ai: "pounce",  name: "Echo",            sight: 400, pounceCd: 130, pounceWarn: 26, pounceSpeed: 9, pounceFrames: 15 },
  };

  // ---------------------------------------------------------------- BOSSES
  // Deck entries with a `kind` are body moves (CROWN.buildMove); entries
  // without one are casts of an existing arena shape. New kinds this wave
  // adds: `reshape` (the Mason raises a wall layout), `phase_out` (Seraphine
  // vanishes into the other plane and re-emerges at an anchor, where a player
  // standing in the tether circle BINDS her). Both are built by the drivers
  // registered below and ride the same step contract.
  const BASTION_LAYOUTS = [
    [{ x: 260, y: 200, r: 34 }, { x: 764, y: 200, r: 34 }, { x: 260, y: 420, r: 34 }, { x: 764, y: 420, r: 34 }],
    [{ x: 512, y: 170, r: 34 }, { x: 330, y: 310, r: 34 }, { x: 694, y: 310, r: 34 }, { x: 512, y: 450, r: 34 }],
    [{ x: 210, y: 310, r: 34 }, { x: 410, y: 200, r: 34 }, { x: 614, y: 420, r: 34 }, { x: 814, y: 310, r: 34 }],
  ];
  const BOSS_DEFS = {
    // ===== MID-EARLY — THE DROWNED BASTION =====
    // VAUGHN, THE PALE RIDER: MOUNTED. On the warhorse he is a beast (lance
    // charges down telegraphed lanes; a charge into a barricade throws the
    // horse and STUNS him x2). At 55% the horse is killed under him: he
    // fights on foot as a duelist while the riderless warhorse keeps charging
    // the arena as a linked add. No weak points.
    vaughn: {
      name: "VAUGHN, THE PALE RIDER", archetype: "multiform", parts: 0, partName: "barding", color: "#1e3a5f", accent: "#e0f2fe",
      baseHp: 21000, reward: 7200, tier: "boss", enrageMs: 6.5 * 60000, maxAdds: 4, ascend: true,
      cry: "*HOOVES ON DROWNED STONE. HE HAS NOT DISMOUNTED IN A HUNDRED YEARS.*", title: "THE PALE RIDER OF THE BASTION",
      body: { r: 56, walk: 150, run: 260, turn: 3.4 },
      forms: [
        { key: "mounted", driver: "beast", name: "THE RIDER", body: { r: 56, walk: 150, run: 260, turn: 3.4 } },
        { key: "unhorsed", driver: "duelist", name: "THE KNIGHT", body: { r: 36, walk: 160, run: 280, turn: 7 } },
      ],
      beast: { maxLen: 1000, stunMs: 3400, stunVuln: 2.0, wallRecoverMs: 800, wallVuln: 1.2, pillarHits: 2, castChance: 0.14,
               wallFall: { type: "meteor", targets: 4, r: 42, dmg: 16, warnMs: 900, durMs: 1100 } },
      duelist: { castChance: 0.16, keepDist: 120, strafe: 0.45, strafeBelow: 250, stance: "iron" },
      arena: { pillars: BASTION_LAYOUTS[0] },
      attacks: [
        { type: "lance_charge", kind: "lunge", beast: true, weight: 34, warnMs: 1100, range: [200, 2000], w: 110, len: 1000, speed: 900, overshoot: 220, dmg: 30, cdMs: 2800, tell: "THE RIDER CHARGES", dodge: "stand in front of a barricade, then step aside" },
        { type: "trample", kind: "nova", weight: 20, warnMs: 850, activeMs: 240, recoverMs: 650, range: [0, 240], r: 200, dmg: 22, tell: "TRAMPLE", dodge: "back away from the hooves" },
        { type: "rearing_strike", kind: "cone", weight: 22, warnMs: 700, activeMs: 200, recoverMs: 600, range: [0, 200], r: 180, arc: 1.9, dmg: 24, vuln: 1.15, tell: "REARING STRIKE", dodge: "get to the horse's flank" },
        { type: "sweep", weight: 12, warnMs: 1300, w: 110, dmg: 22, durMs: 1400, tell: "THE TIDE COMES IN", dodge: "cross the band before it reaches you" },
      ],
      phases: [
        { at: 0.55, shiftMs: 4200, attackEveryMs: 2200, form: "unhorsed", cinematic: true, onEnterAdds: { type: "warhorse", n: 1 }, pillars: "regrow",
          name: "VAUGHN, UNHORSED", color: "#0f172a", accent: "#7dd3fc", cry: "THE HORSE WAS NEVER THE DANGEROUS ONE.", title: "THE KNIGHT ON FOOT",
          attacks: [
            { type: "lance_thrust", kind: "lunge", weight: 26, warnMs: 520, activeMs: 190, recoverMs: 560, range: [170, 600], len: 540, w: 66, overshoot: 90, speed: 1450, dmg: 30, vuln: 1.25, cdMs: 2500, tell: "LANCE THRUST", dodge: "step off the line" },
            { type: "cavalier_combo", kind: "combo", weight: 26, warnMs: 300, activeMs: 120, recoverMs: 760, range: [0, 180], vuln: 1.2, cdMs: 1900,
              hits: [{ warnMs: 300, arc: 2.2, r: 125, dmg: 16, lunge: 42 }, { warnMs: 420, arc: 3.2, r: 150, dmg: 26, lunge: 70 }],
              dmg: 16, tell: "TWO-CUT", dodge: "back off after the first cut" },
            { type: "parry", kind: "guard", weight: 14, warnMs: 250, guardMs: 1500, recoverMs: 500, range: [0, 420], cdMs: 7500,
              riposte: { warnMs: 200, activeMs: 160, len: 240, w: 84, dmg: 40, recoverMs: 420 }, dmg: 40, tell: "GUARD", dodge: "do not strike the glowing guard" },
            { type: "summon", weight: 10, warnMs: 1500, n: 1, addType: "warhorse", tell: "TO ME!", dodge: "the horse charges too — keep moving" },
            { type: "sweep", weight: 12, warnMs: 1200, w: 120, dmg: 24, durMs: 1400, tell: "THE TIDE COMES IN", dodge: "cross the band" },
          ] },
      ],
    },
    // MORDAUNT, THE MASON (mini): ARENA RESHAPER. He built the bastion and he
    // rebuilds it around you: every reshape raises a new wall layout (the
    // stones rise where the marks glow — stand on a mark and you are thrown
    // back), then the mortar has to set: EXHAUSTED 2.4 s x1.5. Sunken sectors
    // (hazard pools) slow anyone who stands in them.
    mordaunt: {
      name: "MORDAUNT, THE MASON", archetype: "duelist", driver: "reshaper", profile: "mason", parts: 0, partName: "mortar", color: "#475569", accent: "#67e8f9",
      baseHp: 7400, reward: 1500, tier: "mini", maxAdds: 2, ascend: true, cry: "YOU ARE STANDING WHERE MY WALL GOES.",
      body: { r: 40, walk: 100, run: 150, turn: 3 },
      duelist: { castChance: 0.22, keepDist: 140, strafe: 0.15, footwork: 0.1 },
      reshaper: { layouts: BASTION_LAYOUTS, everyMs: 14000, warnMs: 1600, setMs: 2400, setVuln: 1.5, knock: 24, wallHits: 2 },
      arena: { pillars: BASTION_LAYOUTS[0] },
      attacks: [
        { type: "raise_walls", kind: "reshape", weight: 12, warnMs: 1600, range: [0, 2000], cdMs: 14000, dmg: 24, tell: "THE STONES RISE", dodge: "step off the glowing marks — then hit him while the mortar sets" },
        { type: "slab_slam", kind: "cone", weight: 26, warnMs: 800, activeMs: 220, recoverMs: 700, range: [0, 190], r: 170, arc: 1.8, dmg: 22, vuln: 1.2, tell: "SLAB SLAM", dodge: "get beside him" },
        { type: "quake", kind: "nova", weight: 18, warnMs: 950, activeMs: 250, recoverMs: 700, range: [0, 260], r: 230, dmg: 18, tell: "QUAKE", dodge: "back out of the ring" },
        { type: "hazard", weight: 18, warnMs: 1200, targets: 3, r: 78, dmg: 10, lingerMs: 8000, slow: 0.5, tell: "THE FLOOR SINKS", dodge: "keep out of the flooded sectors" },
        { type: "surface", kind: "vanish", weight: 14, warnMs: 300, hideMs: 1100, behind: 70, range: [220, 2000], cdMs: 6000,
          strike: { warnMs: 420, r: 130, arc: 2.2, dmg: 26, recoverMs: 700, vuln: 1.3 }, dmg: 26, tell: "HE SINKS INTO THE STONE", dodge: "he comes up behind you — turn and move" },
      ],
      phases: [
        { at: 0.45, shiftMs: 2600, attackEveryMs: 2100, name: "MORDAUNT, REBUILDING", color: "#1e293b", accent: "#a5f3fc",
          cry: "AGAIN. HIGHER THIS TIME.", title: "THE WALLS CLOSE IN",
          reshaper: { everyMs: 10000, warnMs: 1300, setMs: 2200 },
          attacks: [
            { type: "raise_walls", kind: "reshape", weight: 16, warnMs: 1300, range: [0, 2000], cdMs: 10000, dmg: 28, tell: "THE STONES RISE", dodge: "step off the marks" },
            { type: "slab_slam", kind: "cone", weight: 24, warnMs: 720, activeMs: 220, recoverMs: 650, range: [0, 190], r: 175, arc: 1.9, dmg: 24, vuln: 1.2, tell: "SLAB SLAM", dodge: "get beside him" },
            { type: "quake", kind: "nova", weight: 18, warnMs: 900, activeMs: 250, recoverMs: 650, range: [0, 270], r: 240, dmg: 20, tell: "QUAKE", dodge: "back out" },
            { type: "hazard", weight: 18, warnMs: 1100, targets: 4, r: 80, dmg: 12, lingerMs: 9000, slow: 0.5, tell: "THE FLOOR SINKS", dodge: "keep out of the water" },
            { type: "surface", kind: "vanish", weight: 14, warnMs: 280, hideMs: 1000, behind: 70, range: [200, 2000], cdMs: 5500,
              strike: { warnMs: 400, r: 135, arc: 2.3, dmg: 28, recoverMs: 650, vuln: 1.3 }, dmg: 28, tell: "HE SINKS INTO THE STONE", dodge: "turn and move" },
          ] },
      ],
    },

    // ===== LATE — THE WICKWOOD CATHEDRAL =====
    // CANDLEMAS, THE WICK-MOTHER: SUMMONER WITH LINKED ADDS. While any of her
    // wicks burns she takes x0.25 damage (the wicks shield her: put them out
    // first). When the last wick dies she is SNUFFED — vulnerable x1.6 for 5 s
    // — before she lights new ones. At 50% the cathedral goes dark: only the
    // wicks and her own flame light the room.
    candlemas: {
      name: "CANDLEMAS, THE WICK-MOTHER", archetype: "duelist", profile: "caster", parts: 0, partName: "flame", color: "#78350f", accent: "#fde047",
      baseHp: 96000, reward: 32000, tier: "boss", enrageMs: 8.5 * 60000, maxAdds: 8, ascend: true,
      cry: "COME IN, LITTLE FLAMES. THERE IS ROOM ON THE ALTAR FOR EVERYONE.", title: "THE WICK-MOTHER OF THE CATHEDRAL",
      body: { r: 40, walk: 110, run: 160, turn: 4 },
      duelist: { castChance: 0.5, keepDist: 240, strafe: 0.3, footwork: 0.14 },
      summoner: { linked: ["wick"], shieldMult: 0.25, snuffMs: 5000, snuffVuln: 1.6, relightMs: 9000, relightN: 3 },
      attacks: [
        { type: "summon", weight: 30, warnMs: 1500, n: 3, addType: "wick", tell: "LIGHT THE WICKS", dodge: "put every wick out — she is shielded while they burn" },
        { type: "hazard", weight: 22, warnMs: 1200, targets: 4, r: 76, dmg: 14, lingerMs: 8000, slow: 0.5, tell: "HOT WAX", dodge: "keep off the wax" },
        { type: "candle_lash", kind: "cone", weight: 22, warnMs: 800, activeMs: 220, recoverMs: 650, range: [0, 230], r: 210, arc: 1.7, dmg: 30, vuln: 1.2, tell: "CANDLE LASH", dodge: "get behind her" },
        { type: "meteor", weight: 18, warnMs: 1500, r: 54, dmg: 28, targets: 12, durMs: 1700, tell: "TALLOW RAIN", dodge: "never stop moving" },
        { type: "ring", weight: 16, warnMs: 1400, r: 500, band: 56, dmg: 30, durMs: 1500, count: 2, gapMs: 500, tell: "FLASHOVER", dodge: "let each ring pass" },
      ],
      phases: [
        { at: 0.50, shiftMs: 3600, attackEveryMs: 2000, dark: true, onEnterAdds: { type: "wick", n: 4 }, name: "CANDLEMAS, SNUFFED", color: "#1c1917", accent: "#fbbf24",
          cry: "SHH. LET ME SHOW YOU THE DARK.", title: "LIGHTS OUT",
          summoner: { shieldMult: 0.25, snuffMs: 4500, relightMs: 8000, relightN: 4 },
          attacks: [
            { type: "summon", weight: 30, warnMs: 1400, n: 4, addType: "wick", tell: "LIGHT THE WICKS", dodge: "put every wick out" },
            { type: "collapse", weight: 20, warnMs: 1700, rStart: 520, rEnd: 150, dmg: 20, durMs: 3800, tell: "THE LAST LIGHT", dodge: "stay in the light" },
            { type: "candle_lash", kind: "cone", weight: 22, warnMs: 720, activeMs: 220, recoverMs: 600, range: [0, 240], r: 220, arc: 1.8, dmg: 34, vuln: 1.2, tell: "CANDLE LASH", dodge: "get behind her" },
            { type: "hazard", weight: 20, warnMs: 1100, targets: 5, r: 78, dmg: 16, lingerMs: 9000, slow: 0.5, tell: "HOT WAX", dodge: "keep off the wax" },
            { type: "safezone", weight: 14, warnMs: 2000, r: 110, dmg: 48, durMs: 1700, tell: "SNUFF", dodge: "stand in the marked circle" },
          ] },
      ],
    },
    // ILSE & GRIM, THE HUNTRESS AND THE HOUND (mini): a DUO WITH SWAPPING
    // ROLES. Two melee bodies: the one on the HUNT is armoured (untargetable)
    // and strikes hard; the one at BAY is exposed. Every 9 s they trade
    // roles (telegraphed 1.5 s ahead) and cross the room in a joint
    // CROSSFIRE line. When one falls the other goes feral and raises it at
    // 40% after 12 s — fell both inside the window.
    ilse_grim: {
      name: "ILSE & GRIM", archetype: "twins", parts: 0, partName: "leash", color: "#365314", accent: "#fef08a",
      baseHp: 30000, reward: 5200, tier: "mini", maxAdds: 2, ascend: true, cry: "HEEL, GRIM. WE HAVE GUESTS.",
      body: { r: 30, walk: 180, run: 320, turn: 8 },
      twins: { melee: true, swapMs: 9000, warnMs: 1500, linkMs: 12000, reviveFrac: 0.40, enrage: { dmgMult: 1.3, cadenceMult: 0.8 }, hunterDmg: 1.3,
        bodies: [
          { key: "sol", name: "ILSE, THE HUNTRESS", color: "#65a30d", accent: "#fef9c3", hpFrac: 0.5,
            attacks: [
              { type: "spear_thrust", kind: "lunge", weight: 30, warnMs: 560, activeMs: 170, recoverMs: 640, range: [120, 460], len: 400, w: 54, overshoot: 60, speed: 1500, dmg: 26, vuln: 1.25, cdMs: 2200, tell: "SPEAR THRUST", dodge: "sidestep the line" },
              { type: "hunters_combo", kind: "combo", weight: 26, warnMs: 300, activeMs: 120, recoverMs: 700, range: [0, 170], vuln: 1.2, cdMs: 1800,
                hits: [{ warnMs: 300, arc: 2.2, r: 120, dmg: 15, lunge: 40 }, { warnMs: 400, arc: 3.0, r: 145, dmg: 24, lunge: 60 }], dmg: 15, tell: "TWO-CUT", dodge: "back off after the first cut" },
              { type: "spit", weight: 20, warnMs: 900, r: 28, dmg: 16, speed: 6.5, targets: 4, tell: "THROWING KNIVES", dodge: "keep moving sideways" },
              { type: "parry", kind: "guard", weight: 12, warnMs: 240, guardMs: 1400, recoverMs: 480, range: [0, 400], cdMs: 7000,
                riposte: { warnMs: 200, activeMs: 150, len: 220, w: 80, dmg: 34, recoverMs: 400 }, dmg: 34, tell: "GUARD", dodge: "do not strike the glowing guard" },
            ] },
          { key: "umbra", name: "GRIM, THE HOUND", color: "#3f3f46", accent: "#f87171", hpFrac: 0.5,
            attacks: [
              { type: "pounce", kind: "lunge", weight: 32, warnMs: 480, activeMs: 160, recoverMs: 700, range: [150, 520], len: 460, w: 64, overshoot: 70, speed: 1700, dmg: 28, vuln: 1.3, cdMs: 2000, tell: "GRIM POUNCES", dodge: "step off the line" },
              { type: "savage", kind: "combo", weight: 26, warnMs: 240, activeMs: 100, recoverMs: 760, range: [0, 160], vuln: 1.25, cdMs: 1700,
                hits: [{ warnMs: 240, arc: 1.8, r: 105, dmg: 12, lunge: 36 }, { warnMs: 200, arc: 1.8, r: 105, dmg: 12, lunge: 36 }, { warnMs: 340, arc: 2.6, r: 130, dmg: 20, lunge: 60 }], dmg: 12, tell: "SAVAGE", dodge: "three bites — back off after the second" },
              { type: "howl", kind: "nova", weight: 18, warnMs: 900, activeMs: 240, recoverMs: 650, range: [0, 240], r: 210, dmg: 18, tell: "HOWL", dodge: "back away" },
              { type: "hazard", weight: 14, warnMs: 1100, targets: 3, r: 66, dmg: 10, lingerMs: 6000, slow: 0.6, tell: "CALTROPS", dodge: "keep off the spikes" },
            ] },
        ] },
      attacks: [
        { type: "eclipse", weight: 10, warnMs: 1500, w: 90, dmg: 32, durMs: 900, tell: "CROSSFIRE", dodge: "never stand between the two when they trade" },
        { type: "spit", weight: 20, warnMs: 900, r: 28, dmg: 16, speed: 6.5, targets: 4, tell: "THROWING KNIVES", dodge: "keep moving sideways" },
        { type: "hazard", weight: 14, warnMs: 1100, targets: 3, r: 66, dmg: 10, lingerMs: 6000, slow: 0.6, tell: "CALTROPS", dodge: "keep off the spikes" },
      ],
    },

    // ===== ENDGAME — THE UNMOORED SPIRE =====
    // SERAPHINE, THE UNMOORED (mini): PHASER. She fights on the material side
    // for a while, then PHASES OUT — untargetable, crossing the room as a
    // ghost — and re-emerges at one of the tether anchors. A player standing
    // inside the glowing tether circle when she emerges BINDS her: stunned
    // 3 s, x1.8. Nobody there, and she strikes out of the emergence.
    seraphine: {
      name: "SERAPHINE, THE UNMOORED", archetype: "duelist", driver: "phaser", profile: "phaser", parts: 0, partName: "anchor", color: "#4c1d95", accent: "#e9d5ff",
      baseHp: 26000, reward: 4800, tier: "mini", maxAdds: 3, ascend: true, cry: "I WAS NEVER ALL THE WAY HERE.",
      body: { r: 30, walk: 180, run: 300, turn: 8 },
      duelist: { castChance: 0.18, keepDist: 150, strafe: 0.5, strafeBelow: 280 },
      phaser: { everyMs: 11000, hideMs: 2600, tetherR: 110, boundMs: 3000, boundVuln: 1.8, anchors: [{ x: 250, y: 190 }, { x: 774, y: 190 }, { x: 250, y: 430 }, { x: 774, y: 430 }, { x: 512, y: 310 }],
                strike: { warnMs: 420, r: 140, arc: 2.4, dmg: 34, recoverMs: 600, vuln: 1.2 } },
      attacks: [
        { type: "phase_out", kind: "phase_out", weight: 14, warnMs: 380, range: [0, 2000], cdMs: 11000, dmg: 34, tell: "SHE PHASES OUT", dodge: "stand in the glowing tether where she will emerge — bind her" },
        { type: "spectral_lunge", kind: "lunge", weight: 26, warnMs: 440, activeMs: 160, recoverMs: 540, range: [150, 520], len: 460, w: 60, overshoot: 70, speed: 1700, dmg: 30, vuln: 1.25, cdMs: 2200, tell: "SPECTRAL LUNGE", dodge: "step off the line" },
        { type: "unmoored_cuts", kind: "combo", weight: 24, warnMs: 280, activeMs: 110, recoverMs: 700, range: [0, 180], vuln: 1.2, cdMs: 1700,
          hits: [{ warnMs: 280, arc: 2.3, r: 125, dmg: 17, lunge: 44 }, { warnMs: 400, arc: 3.4, r: 155, dmg: 28, lunge: 72 }], dmg: 17, tell: "TWO-CUT", dodge: "back off after the first" },
        { type: "bolt", weight: 16, warnMs: 1100, r: 44, dmg: 24, targets: 3, tell: "ECHOES", dodge: "step out of the circles" },
        { type: "lance", weight: 14, warnMs: 1300, len: 900, w: 50, dmg: 14, durMs: 3200, turn: 1.1, tell: "SEVERANCE", dodge: "keep circling" },
      ],
      phases: [
        { at: 0.50, shiftMs: 2800, attackEveryMs: 2000, windupMult: 0.9, name: "SERAPHINE, HALF-GONE", color: "#2e1065", accent: "#f5d0fe",
          cry: "LESS OF ME EVERY TIME. MORE OF YOU.", title: "BETWEEN THE PLANES",
          phaser: { everyMs: 8500, hideMs: 2200, tetherR: 100, boundMs: 2600 },
          attacks: [
            { type: "phase_out", kind: "phase_out", weight: 18, warnMs: 340, range: [0, 2000], cdMs: 8500, dmg: 38, tell: "SHE PHASES OUT", dodge: "stand in the tether — bind her" },
            { type: "spectral_lunge", kind: "lunge", weight: 26, warnMs: 420, activeMs: 160, recoverMs: 520, range: [150, 540], len: 480, w: 64, overshoot: 70, speed: 1800, dmg: 34, vuln: 1.25, cdMs: 2000, tell: "SPECTRAL LUNGE", dodge: "step off the line" },
            { type: "unmoored_cuts", kind: "combo", weight: 24, warnMs: 260, activeMs: 110, recoverMs: 680, range: [0, 185], vuln: 1.2, cdMs: 1600,
              hits: [{ warnMs: 260, arc: 2.4, r: 130, dmg: 19, lunge: 46 }, { warnMs: 380, arc: 3.6, r: 160, dmg: 30, lunge: 74 }], dmg: 19, tell: "TWO-CUT", dodge: "back off after the first" },
            { type: "bolt", weight: 16, warnMs: 1000, r: 46, dmg: 26, targets: 4, tell: "ECHOES", dodge: "step out of the circles" },
            { type: "cross", weight: 12, warnMs: 1500, arms: 4, len: 600, w: 54, dmg: 30, durMs: 1100, tell: "SEVERANCE", dodge: "stand between the beams" },
          ] },
      ],
    },
    // AURELION, THE ASCENDANT: the four-form RAID boss. HERALD (a duelist with
    // the King's guard) -> TEMPEST at 70% (a reshaper: the spire's stones rise
    // in storm layouts, the floor floods with starlight) -> LEGION at 45% (a
    // summoner: his echoes shield him x0.3 until they are cut down) ->
    // APOTHEOSIS at 20% (a phaser: bind him in the tether to end it).
    aurelion: {
      name: "AURELION, THE ASCENDANT", archetype: "multiform", parts: 0, partName: "halo", color: "#312e81", accent: "#fef08a",
      baseHp: 320000, reward: 68000, tier: "boss", enrageMs: 11 * 60000, maxAdds: 8, ascend: true,
      cry: "THE CROWN WAS A DRAFT. I AM THE FAIR COPY.", title: "THE ASCENDANT OF THE UNMOORED SPIRE",
      body: { r: 42, walk: 150, run: 260, turn: 5 },
      forms: [
        { key: "herald", driver: "duelist", name: "THE HERALD", body: { r: 42, walk: 150, run: 260, turn: 5 } },
        { key: "tempest", driver: "reshaper", name: "THE TEMPEST", body: { r: 44, walk: 110, run: 160, turn: 3.5 } },
        { key: "legion", driver: "duelist", name: "THE LEGION", body: { r: 42, walk: 150, run: 260, turn: 5 }, summoner: { linked: ["echo"], shieldMult: 0.3, snuffMs: 5000, snuffVuln: 1.6, relightMs: 10000, relightN: 3 } },
        { key: "apotheosis", driver: "phaser", name: "APOTHEOSIS", body: { r: 40, walk: 190, run: 320, turn: 8 } },
      ],
      duelist: { castChance: 0.2, keepDist: 130, strafe: 0.35, block: null },
      reshaper: { layouts: [
          [{ x: 300, y: 210, r: 34 }, { x: 724, y: 210, r: 34 }, { x: 300, y: 410, r: 34 }, { x: 724, y: 410, r: 34 }],
          [{ x: 512, y: 160, r: 34 }, { x: 512, y: 450, r: 34 }, { x: 300, y: 305, r: 34 }, { x: 724, y: 305, r: 34 }],
          [{ x: 380, y: 230, r: 34 }, { x: 644, y: 230, r: 34 }, { x: 380, y: 390, r: 34 }, { x: 644, y: 390, r: 34 }, { x: 512, y: 310, r: 30 }],
        ], everyMs: 12000, warnMs: 1500, setMs: 2600, setVuln: 1.5, knock: 26, wallHits: 2 },
      phaser: { everyMs: 10000, hideMs: 2400, tetherR: 110, boundMs: 3200, boundVuln: 1.8, anchors: [{ x: 250, y: 190 }, { x: 774, y: 190 }, { x: 250, y: 430 }, { x: 774, y: 430 }, { x: 512, y: 310 }],
                strike: { warnMs: 400, r: 150, arc: 2.6, dmg: 44, recoverMs: 600, vuln: 1.2 } },
      arena: { pillars: [] },
      attacks: [
        { type: "herald_cleave", kind: "combo", weight: 28, warnMs: 420, activeMs: 150, recoverMs: 900, range: [0, 200], vuln: 1.25, cdMs: 2200,
          hits: [{ warnMs: 420, arc: 2.8, r: 150, dmg: 32, lunge: 50 }, { warnMs: 520, arc: 3.6, r: 175, dmg: 42, lunge: 70 }], dmg: 32, tell: "HERALD'S CLEAVE", dodge: "two swings — the second is wider" },
        { type: "ascendant_dash", kind: "lunge", weight: 22, warnMs: 620, activeMs: 220, recoverMs: 650, range: [200, 700], len: 620, w: 96, overshoot: 90, speed: 1350, dmg: 40, vuln: 1.3, cdMs: 2800, tell: "ASCENDANT DASH", dodge: "step out of the lane" },
        { type: "parry", kind: "guard", weight: 14, warnMs: 280, guardMs: 1600, recoverMs: 520, range: [0, 460], cdMs: 7500,
          riposte: { warnMs: 220, activeMs: 170, len: 260, w: 100, dmg: 50, recoverMs: 460 }, dmg: 50, tell: "THE HERALD'S GUARD", dodge: "do not strike the glowing guard" },
        { type: "proclaim", kind: "nova", weight: 14, warnMs: 900, activeMs: 250, recoverMs: 700, range: [0, 260], r: 240, dmg: 32, tell: "PROCLAMATION", dodge: "back away" },
        { type: "cross", weight: 12, warnMs: 1600, arms: 4, len: 620, w: 58, dmg: 34, durMs: 1100, tell: "FOUR WINDS", dodge: "stand between the beams" },
      ],
      phases: [
        { at: 0.70, shiftMs: 4600, attackEveryMs: 2000, form: "tempest", cinematic: true, name: "AURELION, THE TEMPEST", color: "#1e1b4b", accent: "#a5b4fc",
          cry: "THE SPIRE ANSWERS TO ME. WATCH IT MOVE.", title: "THE STONES RISE",
          attacks: [
            { type: "raise_walls", kind: "reshape", weight: 14, warnMs: 1500, range: [0, 2000], cdMs: 12000, dmg: 30, tell: "THE SPIRE SHIFTS", dodge: "step off the glowing marks — punish him while the stone sets" },
            { type: "tempest_slam", kind: "cone", weight: 22, warnMs: 800, activeMs: 220, recoverMs: 700, range: [0, 200], r: 185, arc: 1.9, dmg: 30, vuln: 1.2, tell: "TEMPEST SLAM", dodge: "get beside him" },
            { type: "quake", kind: "nova", weight: 16, warnMs: 950, activeMs: 250, recoverMs: 700, range: [0, 270], r: 240, dmg: 28, tell: "QUAKE", dodge: "back out of the ring" },
            { type: "hazard", weight: 18, warnMs: 1200, targets: 5, r: 80, dmg: 16, lingerMs: 9000, slow: 0.5, tell: "STARFLOOD", dodge: "keep out of the light pools" },
            { type: "sweep", weight: 14, warnMs: 1300, w: 120, dmg: 30, durMs: 1400, tell: "STORMFRONT", dodge: "cross the band" },
            { type: "meteor", weight: 14, warnMs: 1500, r: 56, dmg: 30, targets: 14, durMs: 1800, tell: "STARFALL", dodge: "never stop moving" },
          ] },
        { at: 0.45, shiftMs: 4000, attackEveryMs: 1900, form: "legion", onEnterAdds: { type: "echo", n: 3 }, name: "AURELION, THE LEGION", color: "#0f172a", accent: "#f5d0fe",
          cry: "EVERY VERSION OF ME THAT EVER LOST. THEY ARE ALL HERE.", title: "THE ECHOES",
          attacks: [
            { type: "summon", weight: 28, warnMs: 1400, n: 3, addType: "echo", tell: "THE ECHOES WAKE", dodge: "cut every echo down — they shield him" },
            { type: "herald_cleave", kind: "combo", weight: 24, warnMs: 400, activeMs: 150, recoverMs: 860, range: [0, 200], vuln: 1.25, cdMs: 2100,
              hits: [{ warnMs: 400, arc: 2.8, r: 150, dmg: 34, lunge: 50 }, { warnMs: 500, arc: 3.6, r: 175, dmg: 44, lunge: 70 }], dmg: 34, tell: "HERALD'S CLEAVE", dodge: "two swings" },
            { type: "ascendant_dash", kind: "lunge", weight: 20, warnMs: 600, activeMs: 220, recoverMs: 620, range: [200, 700], len: 640, w: 96, overshoot: 90, speed: 1400, dmg: 42, vuln: 1.3, cdMs: 2600, tell: "ASCENDANT DASH", dodge: "step out of the lane" },
            { type: "spiral", weight: 16, warnMs: 1400, arms: 4, points: 32, r: 44, dmg: 34, durMs: 2200, turns: 1.8, tell: "LEGION WHEEL", dodge: "cross the arms" },
            { type: "safezone", weight: 12, warnMs: 2000, r: 110, dmg: 50, durMs: 1800, tell: "KNEEL", dodge: "get inside the marked circle" },
          ] },
        { at: 0.20, shiftMs: 4200, attackEveryMs: 1800, form: "apotheosis", windupMult: 0.9, name: "AURELION, APOTHEOSIS", color: "#0c0a09", accent: "#fef08a",
          cry: "I AM ALMOST NOT HERE. BIND ME IF YOU CAN.", title: "BETWEEN THE PLANES",
          attacks: [
            { type: "phase_out", kind: "phase_out", weight: 18, warnMs: 360, range: [0, 2000], cdMs: 10000, dmg: 44, tell: "HE PHASES OUT", dodge: "stand in the tether where he will emerge — bind him" },
            { type: "spectral_lunge", kind: "lunge", weight: 24, warnMs: 420, activeMs: 160, recoverMs: 520, range: [150, 560], len: 500, w: 70, overshoot: 70, speed: 1800, dmg: 40, vuln: 1.25, cdMs: 2000, tell: "SPECTRAL LUNGE", dodge: "step off the line" },
            { type: "unmoored_cuts", kind: "combo", weight: 22, warnMs: 260, activeMs: 110, recoverMs: 680, range: [0, 185], vuln: 1.2, cdMs: 1600,
              hits: [{ warnMs: 260, arc: 2.4, r: 130, dmg: 22, lunge: 46 }, { warnMs: 380, arc: 3.6, r: 160, dmg: 36, lunge: 74 }], dmg: 22, tell: "TWO-CUT", dodge: "back off after the first" },
            { type: "collapse", weight: 16, warnMs: 1700, rStart: 520, rEnd: 150, dmg: 22, durMs: 3800, tell: "THE SKY FALLS IN", dodge: "stay in the light" },
            { type: "lance", weight: 14, warnMs: 1300, len: 900, w: 54, dmg: 18, durMs: 3600, turn: 1.2, beams: 2, tell: "SEVERANCE", dodge: "stay between the beams" },
          ] },
      ],
    },
  };
  for (const id of Object.keys(BOSS_DEFS)) BOSS_DEFS[id].id = id;

  // ---------------------------------------------------------------- GEAR
  const UNIQUES = {
    riders_lance:       { name: "The Pale Rider's Lance", slot: "weapon", lvl: 5, minRarity: "legendary", boss: "vaughn", split: { atk: 0.90, vit: 0.10 },
                          fx: { staggerDmg: 0.20, afterDashHit: { mult: 1.35, ms: 1200 } } },
    drowned_barding:    { name: "Drowned Barding", slot: "chest", lvl: 5, minRarity: "legendary", boss: "vaughn", split: { def: 0.62, vit: 0.38 },
                          fx: { thorns: 0.16, dashCd: 0.10 } },
    masons_plumb:       { name: "The Mason's Plumb", slot: "ring", lvl: 5, minRarity: "legendary", boss: "mordaunt", split: { atk: 0.35, def: 0.35, vit: 0.30 },
                          fx: { staggerDmg: 0.15, maxHpPct: 0.05 } },
    wick_mothers_taper: { name: "The Wick-Mother's Taper", slot: "weapon", lvl: 9, minRarity: "mythic", boss: "candlemas", split: { atk: 0.92, def: 0.08 },
                          fx: { critIgnite: 0.18, artPower: 0.12 } },
    tallow_mantle:      { name: "Tallow Mantle", slot: "chest", lvl: 9, minRarity: "legendary", boss: "candlemas", split: { def: 0.60, vit: 0.40 },
                          fx: { onHitSlow: { chance: 0.15, pct: 0.35, ms: 1800 }, maxHpPct: 0.07 } },
    hounds_collar:      { name: "Grim's Collar", slot: "ring", lvl: 9, minRarity: "legendary", boss: "ilse_grim", split: { atk: 0.55, vit: 0.45 },
                          fx: { crit: 0.06, afterDashHit: { mult: 1.3, ms: 1000 } } },
    huntress_hood:      { name: "The Huntress' Hood", slot: "helmet", lvl: 9, minRarity: "legendary", boss: "ilse_grim", split: { def: 0.50, atk: 0.35, vit: 0.15 },
                          fx: { eliteDmg: 0.12, artCd: 0.08 } },
    tether_of_seraphine:{ name: "Seraphine's Tether", slot: "ring", lvl: 12, minRarity: "mythic", boss: "seraphine", split: { atk: 0.45, def: 0.25, vit: 0.30 },
                          fx: { staggerDmg: 0.30, artCd: 0.10 } },
    ascendants_edge:    { name: "The Ascendant's Edge", slot: "weapon", lvl: 12, minRarity: "mythic", boss: "aurelion", split: { atk: 0.93, vit: 0.07 },
                          fx: { staggerDmg: 0.35, bossDmg: 0.10, critDmg: 0.20 } },
    fair_copy_crown:    { name: "The Fair Copy", slot: "helmet", lvl: 12, minRarity: "mythic", boss: "aurelion", split: { def: 0.55, atk: 0.25, vit: 0.20 },
                          fx: { artPower: 0.20, artCd: 0.12 } },
    unmoored_greaves:   { name: "Unmoored Greaves", slot: "legs", lvl: 12, minRarity: "legendary", boss: "aurelion", split: { def: 0.55, vit: 0.45 },
                          fx: { dashCd: 0.15, takenMult: 0.95 } },
  };
  const SETS = {
    bastion_vigil:  { name: "Vigil of the Drowned Bastion", tier: "guild_bastion", boss: "vaughn", lvl: 5,
                      names: ["Bastion Lance", "Bastion Sallet", "Bastion Barding", "Bastion Greaves", "Bastion Signet"],
                      bonus: { 2: { defPct: 0.08, dashCd: 0.08 }, 4: { staggerDmg: 0.20, afterDashHit: { mult: 1.25, ms: 1200 } } },
                      bonusName: { 4: "The Charge" } },
    candlelight:    { name: "Candlelight Vestments", tier: "guild_wickwood", boss: "candlemas", lvl: 9,
                      names: ["Candlelight Taper", "Candlelight Cowl", "Candlelight Cassock", "Candlelight Hose", "Candlelight Band"],
                      bonus: { 2: { critDmg: 0.15, maxHpPct: 0.05 }, 4: { critIgnite: 0.15, artPower: 0.15 } },
                      bonusName: { 4: "Flashover" } },
    ascendant_regalia: { name: "Regalia of the Ascendant", tier: "guild_spire", boss: "aurelion", lvl: 12,
                      names: ["Ascendant Blade", "Ascendant Halo", "Ascendant Mantle", "Ascendant Greaves", "Ascendant Seal"],
                      bonus: { 2: { bossDmg: 0.08, artCd: 0.08 }, 4: { staggerDmg: 0.30, artPower: 0.20, critDmg: 0.20 } },
                      bonusName: { 4: "Fair Copy" } },
  };
  const SET_SLOT_SPLITS = { weapon: { atk: 0.90, vit: 0.10 }, helmet: { def: 0.60, atk: 0.25, vit: 0.15 }, chest: { def: 0.65, vit: 0.35 }, legs: { def: 0.55, vit: 0.45 }, ring: { atk: 0.45, def: 0.20, vit: 0.35 } };

  // Two new weapon kinds (WEAPONS.md two-hand system): a melee GREATSWORD —
  // slow, huge, wide, a heavy single hit that hurts bosses — and a ranged WAND
  // — fast weak bolts that feed the Crown Arts (art power / cooldown).
  const WEAPON_KINDS = {
    greatsword: { hand: "melee", label: "Greatsword", emoji: "⚔️", shape: "arc", dmg: 1.9, rate: 1.85, cd: [26, 22], reach: 84, bossReach: 68, krakenReach: 126,
                  arc: Math.PI / 1.5, targets: 5, knock: 8, fx: { bossDmg: 0.10, staggerDmg: 0.10 },
                  special: "Slow two-handed arc that hits like a falling door (up to 5 foes): +10% vs bosses, +10% vs staggered." },
    wand:       { hand: "ranged", label: "Wand", emoji: "🪄", shape: "bullet", dmg: 0.72, rate: 0.7, cd: [13, 12], speed: 9.5, life: 70, bossReach: 400, krakenReach: 320,
                  targets: 1, pierce: 0, knock: 0.5, fx: { artPower: 0.10, artCd: 0.06 },
                  special: "Quick arcane bolts. Attunement: +10% Crown Art power, -6% Crown Art cooldown." },
  };
  const ARMAMENT_NOUN = { greatsword: "Greatsword", wand: "Wand" };
  const ARMAMENT_UNIQUES = {
    riders_carbine:    { name: "The Rider's Carbine", slot: "ranged", kind: "gun", lvl: 5, minRarity: "legendary", boss: "vaughn", split: { atk: 0.90, def: 0.10 },
                         fx: { crit: 0.05, onHitKnock: { chance: 0.10 } } },
    masons_level:      { name: "The Mason's Level", slot: "weapon", kind: "greatsword", lvl: 5, minRarity: "legendary", boss: "mordaunt", split: { atk: 0.90, vit: 0.10 },
                         fx: { staggerDmg: 0.20 } },
    candlemas_wand:    { name: "Candlemas' Taper-Wand", slot: "ranged", kind: "wand", lvl: 9, minRarity: "mythic", boss: "candlemas", split: { atk: 0.90, def: 0.10 },
                         fx: { artPower: 0.15, critIgnite: 0.12 } },
    grims_fang:        { name: "Grim's Fang", slot: "ranged", kind: "boomerang", lvl: 9, minRarity: "legendary", boss: "ilse_grim", split: { atk: 0.88, vit: 0.12 },
                         fx: { crit: 0.08, eliteDmg: 0.10 } },
    seraphines_needle: { name: "Seraphine's Needle", slot: "ranged", kind: "blowdart", lvl: 12, minRarity: "mythic", boss: "seraphine", split: { atk: 0.92, vit: 0.08 },
                         fx: { bossDmg: 0.12, staggerDmg: 0.20 } },
    fair_copy_blade:   { name: "The Fair Copy Greatsword", slot: "weapon", kind: "greatsword", lvl: 12, minRarity: "mythic", boss: "aurelion", split: { atk: 0.93, vit: 0.07 },
                         fx: { staggerDmg: 0.30, bossDmg: 0.10 } },
  };

  // ---------------------------------------------------------------- LOOT ROWS
  const LOOT_W = (w) => { const t = w.reduce((s, x) => s + x, 0); return w.map(x => x / t); };
  const LOOT = {
    guild_bastion:  { lvl: 5, boss: "vaughn", mini: "mordaunt", set: "bastion_vigil", chance: 0.86, bonus: 0.30,
                      weights: LOOT_W([1, 18, 38, 30, 12, 0.7, 0.3, 0]), uniqueChance: 0.05, setChance: 0.11, tomeChance: 0.11,
                      mats: { dust: [14, 22], shard: { p: 0.7, n: [1, 2] }, ember: 0.06, sigil: 0.30, gem: { p: 0.22, grades: [1, 2] } },
                      parMs: 13 * MIN_MS, gxp: 20, dxp: 260 },
    guild_wickwood: { lvl: 9, boss: "candlemas", mini: "ilse_grim", set: "candlelight", chance: 1.0, bonus: 0.65,
                      weights: LOOT_W([0, 0, 4, 26, 40, 14, 3.6, 0.12]), uniqueChance: 0.10, setChance: 0.16, tomeChance: 0.29,
                      mats: { dust: [44, 64], shard: { p: 1, n: [4, 6] }, ember: 0.36, sigil: 0.40, gem: { p: 0.45, grades: [3, 3, 4] } },
                      parMs: 18 * MIN_MS, gxp: 120, dxp: 900 },
    guild_spire:    { lvl: 12, boss: "aurelion", mini: "seraphine", set: "ascendant_regalia", chance: 1.0, bonus: 0.85,
                      weights: LOOT_W([0, 0, 0, 12, 36, 21, 7, 0.26]), uniqueChance: 0.13, setChance: 0.19, tomeChance: 0.36,
                      mats: { dust: [70, 96], shard: { p: 1, n: [7, 9] }, ember: 0.55, sigil: 0.45, gem: { p: 0.60, grades: [3, 4, 5] } },
                      parMs: 22 * MIN_MS, gxp: 220, dxp: 1500 },
  };
  const CODEX_REWARDS = {
    guild_bastion: { hat: "riders_sallet_hat", title: "of the Bastion" },
    guild_wickwood: { hat: "wick_crown_hat", title: "Candlelit" },
    guild_spire: { hat: "ascendant_halo_hat", title: "Unmoored" },
  };
  const COSMETICS = {
    hat: [
      { id: "riders_sallet_hat", name: "The Rider's Sallet", unlock: "codex:guild_bastion" },
      { id: "wick_crown_hat", name: "Crown of Wicks", unlock: "codex:guild_wickwood" },
      { id: "ascendant_halo_hat", name: "Ascendant Halo", unlock: "codex:guild_spire" },
    ],
    aura: [
      { id: "tether_aura", name: "Seraphine's Tether", unlock: "ach:binder" },
      { id: "fair_copy_aura", name: "The Fair Copy", unlock: "ach:ascendant_slayer" },
      { id: "ascension_aura", name: "Ascension X", unlock: "ach:ascension_10" },
    ],
  };
  const ART_DROPS = {
    vaughn:     [["rampage_charge", 0.07], ["war_cry", 0.06], ["riposte", 0.03]],
    mordaunt:   [["thorn_snare", 0.05], ["sundering_strike", 0.004]],
    candlemas:  [["crown_nova", 0.05], ["frost_lance", 0.05], ["shadow_veil", 0.03]],
    ilse_grim:  [["blade_dash", 0.06], ["mirror_step", 0.03]],
    seraphine:  [["mirror_step", 0.06], ["shadow_veil", 0.05]],
    aurelion:   [["sundering_strike", 0.04], ["crown_nova", 0.06], ["riposte", 0.05]],
  };
  const CROWN_SHARDS = { guild_bastion: [2, 3], guild_wickwood: [4, 6], guild_spire: [6, 9] };

  // ---------------------------------------------------------------- LATE GAME: THE ASCENSION LADDER
  // Every crown/ascend tier can be run at Ascension 1-20 once the previous
  // level has been cleared (per guild per tier, u/guild record). Each level
  // adds HP and damage to EVERY boss in the run and stacks modifiers that
  // change how the fight is read. Rewards: Ascendant Essence (the crafting
  // material), extra crown shards, mastery.
  const ASCENSION_MAX = 20;
  const MODIFIERS = {
    ironhide:    { name: "Ironhide",     desc: "Bosses take 25% less damage while staggered.", vulnCap: 1.3 },
    quickening:  { name: "Quickening",   desc: "Bosses cast 20% more often.", cadenceMult: 0.8 },
    bloodlust:   { name: "Bloodlust",    desc: "Bosses deal +15% damage below half health.", lowHpDmg: 1.15 },
    unyielding:  { name: "Unyielding",   desc: "The enrage timer is 30% shorter.", enrageMult: 0.7 },
    brittle:     { name: "Brittle",      desc: "Pillars and walls break on the first hit.", pillarHits: 1 },
    hungering:   { name: "Hungering",    desc: "Lifesteal and item healing are halved.", healMult: 0.5 },
    volatile:    { name: "Volatile",     desc: "Arena-wide casts deal +20% damage.", castDmgMult: 1.2 },
    lightless:   { name: "Lightless",    desc: "The arena is dark.", dark: true },
    tyranny:     { name: "Tyranny",      desc: "Boss health +20%.", hpMult: 1.2 },
  };
  const MODIFIER_ORDER = Object.keys(MODIFIERS);
  for (const [id, m] of Object.entries(MODIFIERS)) m.id = id;
  // Deterministic modifiers per level: 1 at 1-4, 2 at 5-9, 3 at 10-14, 4 at 15+.
  function ascensionMods(level) {
    const L = clamp(level | 0, 0, ASCENSION_MAX);
    if (L <= 0) return [];
    const n = L >= 15 ? 4 : L >= 10 ? 3 : L >= 5 ? 2 : 1;
    const rand = ECON.mulberry32(0x5eed + L * 7919);
    const pool = MODIFIER_ORDER.slice();
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    return out;
  }
  function ascensionScale(level) {
    const L = clamp(level | 0, 0, ASCENSION_MAX);
    const mods = ascensionMods(L);
    const hpMod = mods.includes("tyranny") ? 1.2 : 1;
    return { level: L, hp: Math.pow(1.11, L) * hpMod, dmg: Math.pow(1.06, L), essence: L > 0 ? 2 + Math.floor(L / 2) : 0, shards: Math.floor(L / 4), mods };
  }
  // Merged effect of the run's modifiers (ascension + weekly).
  function modEffects(ids) {
    const out = { vulnCap: Infinity, cadenceMult: 1, lowHpDmg: 1, enrageMult: 1, pillarHits: null, healMult: 1, castDmgMult: 1, dark: false, hpMult: 1 };
    for (const id of ids || []) {
      const m = MODIFIERS[id];
      if (!m) continue;
      if (m.vulnCap != null) out.vulnCap = Math.min(out.vulnCap, m.vulnCap);
      if (m.cadenceMult != null) out.cadenceMult *= m.cadenceMult;
      if (m.lowHpDmg != null) out.lowHpDmg *= m.lowHpDmg;
      if (m.enrageMult != null) out.enrageMult *= m.enrageMult;
      if (m.pillarHits != null) out.pillarHits = m.pillarHits;
      if (m.healMult != null) out.healMult *= m.healMult;
      if (m.castDmgMult != null) out.castDmgMult *= m.castDmgMult;
      if (m.dark) out.dark = true;
      if (m.hpMult != null) out.hpMult *= m.hpMult;
    }
    return out;
  }
  // rec = u.ascension || guild.depths.ascension: {tiers:{tier:{max, clears}}}
  function ascensionAllowed(rec, tier, level) {
    const L = level | 0;
    if (L <= 0) return { ok: true };
    if (L > ASCENSION_MAX) return { ok: false, why: "There is no Ascension that high." };
    const cfg = ECON.GUILD_DUNGEONS[tier];
    if (!cfg || !(cfg.crown || cfg.ascend)) return { ok: false, why: "That dungeon cannot be ascended." };
    const t = rec && rec.tiers && rec.tiers[tier];
    const max = t ? t.max | 0 : 0;
    if (L > max + 1) return { ok: false, why: `Clear Ascension ${max + 1} first.` };
    return { ok: true };
  }
  function normAscension(rec) {
    const r = rec && typeof rec === "object" ? rec : {};
    const tiers = {};
    for (const [k, v] of Object.entries(r.tiers || {})) if (ECON.GUILD_DUNGEONS[k]) tiers[k] = { max: Math.max(0, num(v && v.max) | 0), clears: Math.max(0, num(v && v.clears) | 0) };
    const weekly = r.weekly && typeof r.weekly === "object" ? { wk: r.weekly.wk | 0, done: !!r.weekly.done } : { wk: -1, done: false };
    return { v: 1, tiers, weekly, crafted: Math.max(0, num(r.crafted) | 0), sundered: Math.max(0, num(r.sundered) | 0) };
  }
  function recordAscension(rec, tier, level) {
    const s = normAscension(rec);
    const t = s.tiers[tier] || (s.tiers[tier] = { max: 0, clears: 0 });
    t.clears += 1;
    t.max = Math.max(t.max, level | 0);
    return s;
  }

  // ---------------------------------------------------------------- LATE GAME: THE WEEKLY CHALLENGE
  // One boss a week (every crown + ascend tier in rotation), two modifiers,
  // a fat essence bounty, once per player per week.
  const CHALLENGE_POOL = ["guild_thornwild", "guild_bastion", "guild_colosseum", "guild_wickwood", "guild_mirror", "guild_throne", "guild_spire"];
  function weeklyChallenge(week) {
    const w = Math.max(0, week | 0);
    const tier = CHALLENGE_POOL[w % CHALLENGE_POOL.length];
    const rand = ECON.mulberry32(0xc4a11 + w * 104729);
    const pool = MODIFIER_ORDER.slice();
    const mods = [];
    while (mods.length < 2) mods.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    const cfg = ECON.GUILD_DUNGEONS[tier];
    return { week: w, tier, bossId: cfg ? cfg.boss : null, mods, essence: 14, crownShards: 6, level: 8 };
  }

  // ---------------------------------------------------------------- LATE GAME: BOSS MASTERY
  // Pure over the codex kill count (+ ascension clears): four ranks with a
  // title each; the top rank of a boss unlocks its mastery aura in the codex.
  const MASTERY_RANKS = [
    { rank: 1, kills: 1, name: "Initiate" }, { rank: 2, kills: 10, name: "Slayer" }, { rank: 3, kills: 50, name: "Master" }, { rank: 4, kills: 200, name: "Grandmaster" },
  ];
  function bossMastery(kills) {
    const k = Math.max(0, kills | 0);
    let cur = null, next = MASTERY_RANKS[0];
    for (const r of MASTERY_RANKS) { if (k >= r.kills) cur = r; }
    next = MASTERY_RANKS.find(r => k < r.kills) || null;
    return { kills: k, rank: cur ? cur.rank : 0, name: cur ? cur.name : "Unproven", next: next ? next.kills : null, frac: next ? clamp((k - (cur ? cur.kills : 0)) / (next.kills - (cur ? cur.kills : 0)), 0, 1) : 1 };
  }
  function masteryTitle(bossId, rank) {
    const def = ECON.GUILD_BOSSES[bossId];
    const r = MASTERY_RANKS.find(x => x.rank === rank);
    if (!def || !r) return null;
    const short = def.name.replace(/^THE /, "").split(",")[0].split(" & ")[0].toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    return `${r.name} of ${short}`;
  }
  // Total mastery points across every boss (1/3/6/10 per rank) -> the prestige tier.
  const PRESTIGE = [{ points: 0, name: "Wanderer" }, { points: 12, name: "Veteran" }, { points: 40, name: "Champion" }, { points: 90, name: "Legend" }, { points: 160, name: "Mythborn" }];
  function masteryPoints(codexB) {
    let pts = 0;
    for (const [id, n] of Object.entries(codexB || {})) if (ECON.GUILD_BOSSES[id]) pts += [0, 1, 3, 6, 10][bossMastery(n).rank];
    return pts;
  }
  function prestigeOf(points) { let cur = PRESTIGE[0]; for (const p of PRESTIGE) if (points >= p.points) cur = p; return cur; }

  // ---------------------------------------------------------------- LATE GAME: ESSENCE CRAFTING
  // Ascendant Essence drops from Ascension clears and the weekly challenge,
  // or from SUNDERING a mythic+ item of level 11+. Recipes craft the new
  // signature uniques at mythic (a fixed chase for the fully geared), plus
  // reforge-to-arcane for L12 crown uniques.
  const RECIPES = {
    ascendants_edge:     { essence: 60, crown_shard: 40, gold: 400000, sigil: "sigil_aurelion", sigils: 3, rarity: "mythic" },
    fair_copy_crown:     { essence: 55, crown_shard: 40, gold: 360000, sigil: "sigil_aurelion", sigils: 3, rarity: "mythic" },
    tether_of_seraphine: { essence: 45, crown_shard: 30, gold: 300000, sigil: "sigil_seraphine", sigils: 3, rarity: "mythic" },
    wick_mothers_taper:  { essence: 40, crown_shard: 24, gold: 240000, sigil: "sigil_candlemas", sigils: 3, rarity: "mythic" },
    riders_lance:        { essence: 24, crown_shard: 12, gold: 90000, sigil: "sigil_vaughn", sigils: 3, rarity: "legendary" },
    kingsbane:           { essence: 60, crown_shard: 40, gold: 400000, sigil: "sigil_sundered_king", sigils: 3, rarity: "mythic" },
    sol_and_umbra:       { essence: 50, crown_shard: 36, gold: 340000, sigil: "sigil_twin_monarchs", sigils: 3, rarity: "mythic" },
  };
  function sunderValue(item) {
    if (!item || !item.base) return 0;
    const b = ECON.GEAR_BASE_BY_ID[item.base];
    const ri = ECON.gearRarityIdx(item.rarity);
    if (!b || (b.lvl | 0) < 11 || ri < 5) return 0;
    return [0, 0, 0, 0, 0, 6, 10, 16][ri] + (item.uq ? 6 : 0) + ((b.lvl | 0) - 11) * 2;
  }
  function craftCheck(id, have) {
    const r = RECIPES[id];
    if (!r) return { ok: false, why: "No such recipe." };
    const h = have || {};
    if (num(h.essence) < r.essence) return { ok: false, why: `Needs ${r.essence} Ascendant Essence.` };
    if (num(h.crown_shard) < r.crown_shard) return { ok: false, why: `Needs ${r.crown_shard} crown shards.` };
    if (num(h.gold) < r.gold) return { ok: false, why: "Not enough money." };
    if (num(h[r.sigil]) < r.sigils) return { ok: false, why: `Needs ${r.sigils} ${(ECON.MATERIALS[r.sigil] || {}).name || r.sigil}.` };
    return { ok: true, cost: { essence: r.essence, crown_shard: r.crown_shard, gold: r.gold, [r.sigil]: r.sigils }, rarity: r.rarity };
  }

  // ---------------------------------------------------------------- GEAR-POWER SCALING
  // Bosses of this wave scale with the PARTY'S GEAR: the average fighter's
  // attack multiplier against what the tier expects. Above par the boss gets
  // more health (ratio^0.85) and more damage (45% of the surplus), so a
  // fully geared party still has a fight. Never below 1.
  // Par = a full legendary kit of the tier's level with a 40% attack share.
  function expectedAtk(lvl) { return Math.round((ECON.GEAR_POWER[clamp(lvl | 0, 1, ECON.GEAR_MAX_LEVEL)] || 9) * 2.4 * 5 * 0.40); }
  function gearScale(atks, lvl) {
    const list = (atks || []).map(a => num(a)).filter(a => a >= 0);
    if (!list.length) return { ratio: 1, hp: 1, dmg: 1 };
    const avg = list.reduce((s, a) => s + a, 0) / list.length;
    const ratio = clamp(avg / Math.max(1, expectedAtk(lvl)), 1, 2.6);
    return { ratio, hp: Math.pow(ratio, 0.7), dmg: 1 + (ratio - 1) * 0.45 };
  }

  // ---------------------------------------------------------------- DRIVERS (registered into CROWN)
  // Reshaper (Mordaunt, Aurelion's Tempest): a duelist whose special is the
  // `reshape` move — a long cast during which the marks glow, a server event
  // that swaps the wall layout, then the mortar sets (EXHAUSTED, vulnerable).
  function layoutIndex(ctx) { return num(ctx.layoutIdx, 0) | 0; }
  function buildReshape(def, ctx, a, tgt, B) {
    const C = CROWN;
    const T = C.tuning(def, ctx.phase, "reshaper");
    const now = num(ctx.now), pos = ctx.pos;
    const layouts = T.layouts || [];
    const next = layouts.length ? (layoutIndex(ctx) + 1) % layouts.length : 0;
    const warn = Math.max(500, num(a.warnMs, T.warnMs || 1500));
    const face = Math.atan2(tgt.y - pos.y, tgt.x - pos.x);
    const marks = (layouts[next] || []).map(q => ({ x: q.x, y: q.y, r: q.r || 34 }));
    const payload = (ph) => ({ type: a.type, phase: ph, dmg: a.dmg | 0, tell: a.tell || "", dodge: a.dodge || "", shape: "marks", marks, knock: num(T.knock, 24), layout: next });
    const steps = [
      C.step("cast", now, warn, pos, pos, { face, atk: payload("tell") }),
      C.step("active", now + warn, 260, pos, pos, { face, atk: payload("hit"), ev: [{ at: now + warn, kind: "reshape", i: next }] }),
      C.step("exhausted", now + warn + 260, num(T.setMs, 2400), pos, pos, { face, vuln: num(T.setVuln, 1.5) }),
    ];
    steps[2].reason = "mortar";
    return { steps, reshape: next };
  }
  function planReshaper(def, ctx, rand) {
    const C = CROWN;
    const now = num(ctx.now), B = C.bodyOf(def, ctx.phase);
    const deck = C.deckFor(def.id || ctx.bossId, ctx.phase);
    const rs = deck.find(a => a.kind === "reshape");
    const T = C.tuning(def, ctx.phase, "reshaper");
    const tgt = C.pickTarget(ctx, rand) || { user: null, x: C.CENTER.x, y: C.CENTER.y + 120 };
    if (rs && !(num(ctx.reshapeReadyAt) > now) && !(num((ctx.cds || {})[rs.type]) > now)) {
      const r = buildReshape(def, ctx, rs, tgt, B);
      const out = Object.assign({ move: rs.type, target: tgt.user, cds: Object.assign({}, ctx.cds || {}) }, r);
      out.cds[rs.type] = now + num(rs.cdMs, T.everyMs || 12000);
      return out;
    }
    // otherwise a plain duelist beat with the reshape move masked
    const sub = Object.assign({}, ctx, { cds: Object.assign({}, ctx.cds || {}, rs ? { [rs.type]: now + 1e9 } : {}) });
    const out = C.planDuelist(def, sub, rand);
    if (out.cds && rs) delete out.cds[rs.type];
    return out;
  }
  // Phaser (Seraphine, Aurelion's Apotheosis): a duelist whose special is
  // `phase_out` — vanish, cross as a ghost to an anchor away from the body,
  // emerge there with a `tether` event (the server decides bound / strike).
  function buildPhaseOut(def, ctx, a, tgt, B, rand) {
    const C = CROWN;
    const T = C.tuning(def, ctx.phase, "phaser");
    const now = num(ctx.now), pos = ctx.pos;
    const anchors = (T.anchors || []).filter(q => Math.hypot(q.x - pos.x, q.y - pos.y) > 180);
    const list = anchors.length ? anchors : (T.anchors || [C.CENTER]);
    const to = list[Math.floor(rand() * list.length)];
    const hideMs = num(T.hideMs, 2400), warn = Math.max(200, num(a.warnMs, 380));
    const face = Math.atan2(tgt.y - pos.y, tgt.x - pos.x), f2 = Math.atan2(tgt.y - to.y, tgt.x - to.x);
    const tether = { shape: "tether", x: to.x, y: to.y, r: num(T.tetherR, 110), emergeAt: now + warn + hideMs };
    const payload = (ph, extra) => Object.assign({ type: a.type, phase: ph, dmg: a.dmg | 0, tell: a.tell || "", dodge: a.dodge || "" }, tether, extra || {});
    const steps = [
      C.step("vanish", now, warn, pos, pos, { face, atk: payload("tell") }),
      C.step("hidden", now + warn, hideMs, pos, to, { e: "inOut", face, hide: true, atk: payload("tell") }),
      C.step("emerge", now + warn + hideMs, 240, to, to, { face: f2, ev: [{ at: now + warn + hideMs, kind: "tether", x: to.x, y: to.y, r: tether.r }] }),
    ];
    // the default continuation: a strike out of the emergence (the server
    // replaces it with a BOUND stun when a player stands in the tether)
    const st = T.strike || { warnMs: 400, r: 140, arc: 2.4, dmg: a.dmg | 0, recoverMs: 600, vuln: 1.2 };
    const t2 = now + warn + hideMs + 240;
    const sh = { shape: "cone", x: to.x, y: to.y, ang: f2, arc: num(st.arc, 2.4), r: num(st.r, 140) };
    steps.push(C.step("windup", t2, num(st.warnMs, 400), to, to, { face: f2, atk: Object.assign({ type: a.type, phase: "tell", dmg: st.dmg | 0, tell: "SHE STRIKES OUT", dodge: "get out of the cone" }, sh) }));
    steps.push(C.step("active", t2 + num(st.warnMs, 400), 150, to, to, { face: f2, atk: Object.assign({ type: a.type, phase: "hit", dmg: st.dmg | 0 }, sh) }));
    steps.push(C.step("recover", t2 + num(st.warnMs, 400) + 150, num(st.recoverMs, 600), to, to, { face: f2, vuln: st.vuln || undefined }));
    return { steps, phaseOut: { x: to.x, y: to.y, r: tether.r, at: tether.emergeAt } };
  }
  function planPhaser(def, ctx, rand) {
    const C = CROWN;
    const now = num(ctx.now), B = C.bodyOf(def, ctx.phase);
    const deck = C.deckFor(def.id || ctx.bossId, ctx.phase);
    const po = deck.find(a => a.kind === "phase_out");
    const T = C.tuning(def, ctx.phase, "phaser");
    const tgt = C.pickTarget(ctx, rand) || { user: null, x: C.CENTER.x, y: C.CENTER.y + 120 };
    if (po && !(num((ctx.cds || {})[po.type]) > now)) {
      const r = buildPhaseOut(def, ctx, po, tgt, B, rand);
      const out = Object.assign({ move: po.type, target: tgt.user, cds: Object.assign({}, ctx.cds || {}) }, r);
      out.cds[po.type] = now + num(po.cdMs, T.everyMs || 10000);
      return out;
    }
    const sub = Object.assign({}, ctx, { cds: Object.assign({}, ctx.cds || {}, po ? { [po.type]: now + 1e9 } : {}) });
    const out = C.planDuelist(def, sub, rand);
    if (out.cds && po) delete out.cds[po.type];
    return out;
  }
  // The BOUND continuation the server appends when a player stood in the tether.
  function boundSteps(def, phase, pos, now) {
    const T = CROWN.tuning(def, phase, "phaser");
    const st = CROWN.step("stunned", now, num(T.boundMs, 3000), pos, pos, { face: Math.PI / 2, vuln: num(T.boundVuln, 1.8) });
    st.reason = "bound";
    return [st];
  }
  // The SNUFFED stagger of a summoner whose last linked add just died.
  function snuffSteps(def, phase, pos, now) {
    const T = CROWN.tuning(def, phase, "summoner");
    const st = CROWN.step("stunned", now, num(T.snuffMs, 5000), pos, pos, { face: Math.PI / 2, vuln: num(T.snuffVuln, 1.6) });
    st.reason = "snuffed";
    return [st];
  }
  // Where the marks of a reshape hit: a player inside any raised mark when the
  // stones rise is struck and knocked out of it (client resolves, like every move).
  function markHit(marks, p, pr) {
    for (const m of marks || []) if (Math.hypot(p.x - m.x, p.y - m.y) <= m.r + num(pr, 12)) return m;
    return null;
  }

  // ---------------------------------------------------------------- INSTALL
  // Appends everything above to the canonical tables. Idempotent.
  let installed = false;
  function install() {
    if (installed || !ECON) return false;
    installed = true;
    // tiers
    for (const [k, cfg] of Object.entries(DUNGEONS)) if (!ECON.GUILD_DUNGEONS[k]) ECON.GUILD_DUNGEONS[k] = cfg;
    for (const [k, v] of Object.entries(EARN_CAPS)) if (!ECON.EARN_CAPS[k]) ECON.EARN_CAPS[k] = v;
    if (Array.isArray(ECON.STORY_LADDER)) for (const t of TIERS) if (!ECON.STORY_LADDER.includes(t)) {
      const i = ECON.STORY_LADDER.indexOf(LADDER_AFTER[t]);
      if (i >= 0) ECON.STORY_LADDER.splice(i + 1, 0, t); else ECON.STORY_LADDER.push(t);
    }
    ECON.ASCEND_DUNGEON_ORDER = TIERS.slice();
    ECON.ASCEND_BOSS_ORDER = BOSSES.slice();
    ECON.ASCEND_MINIS = MINIS.slice();
    // themes / enemies
    if (DEPTHS) {
      for (const [k, th] of Object.entries(THEME_DEFS)) if (!DEPTHS.DUNGEON_THEMES[k]) DEPTHS.DUNGEON_THEMES[k] = th;
      for (const t of TIERS) DEPTHS.THEME_TIER[DUNGEONS[t].theme] = t;
    }
    if (DUNGEON && DUNGEON.ENEMY_TYPES) for (const [k, e] of Object.entries(ENEMY_DEFS)) if (!DUNGEON.ENEMY_TYPES[k]) DUNGEON.ENEMY_TYPES[k] = e;
    // bosses
    for (const [id, def] of Object.entries(BOSS_DEFS)) if (!ECON.GUILD_BOSSES[id]) ECON.GUILD_BOSSES[id] = def;
    // gear: uniques, sets, weapon kinds, armaments
    const pushBase = (b) => { if (!ECON.GEAR_BASE_BY_ID[b.id]) { ECON.GEAR_BASES.push(b); ECON.GEAR_BASE_BY_ID[b.id] = b; } };
    for (const [id, u] of Object.entries(UNIQUES)) {
      if (ECON.GEAR_UNIQUES[id]) continue;
      u.id = id; u.crown = true; u.ascend = true;
      ECON.GEAR_UNIQUES[id] = u;
      pushBase({ id, slot: u.slot, lvl: u.lvl, name: u.name, split: Object.assign({}, u.split), unique: true });
      if (u.slot === "weapon") ECON.WEAPON_KIND_BY_BASE[id] = id === "riders_lance" ? "spear" : id === "wick_mothers_taper" ? "dagger" : "sword";
    }
    for (const [id, s] of Object.entries(SETS)) {
      if (ECON.GEAR_SETS[id]) continue;
      s.id = id; s.crown = true; s.ascend = true; s.pieces = {};
      ECON.GEAR_SETS[id] = s;
      ECON.SET_SLOTS.forEach((slot, i) => {
        const bid = id + "_" + slot;
        s.pieces[slot] = bid;
        pushBase({ id: bid, slot, lvl: s.lvl, name: s.names[i], split: Object.assign({}, SET_SLOT_SPLITS[slot]), set: id });
      });
      ECON.WEAPON_KIND_BY_BASE[id + "_weapon"] = id === "bastion_vigil" ? "spear" : id === "candlelight" ? "dagger" : "greatsword";
    }
    for (const [kind, k] of Object.entries(WEAPON_KINDS)) {
      if (ECON.WEAPON_KINDS[kind]) continue;
      k.id = kind; k.ascend = true;
      ECON.WEAPON_KINDS[kind] = k;
      (k.hand === "melee" ? ECON.MELEE_KINDS : ECON.RANGED_KINDS).push(kind);
      ECON.ARMAMENT_BASE[kind] = [null];
      const prefix = ["", "Rusty", "Bandit", "Hunter's", "Crypt", "Forgefire", "Voidtouched", "Emberscale", "Starlit", "Geodic", "Rimeveil", "Mirrorglass", "Crownbreaker"];
      for (let lvl = 1; lvl <= ECON.GEAR_MAX_LEVEL; lvl++) {
        const id = "arm_" + kind + "_" + lvl;
        pushBase({ id, slot: k.hand === "melee" ? "weapon" : "ranged", lvl, name: prefix[lvl] + " " + ARMAMENT_NOUN[kind], split: k.hand === "melee" ? { atk: 0.90, vit: 0.10 } : { atk: 0.90, def: 0.10 }, armament: true });
        ECON.WEAPON_KIND_BY_BASE[id] = kind;
        ECON.ARMAMENT_BASE[kind].push(id);
      }
    }
    for (const [id, u] of Object.entries(ARMAMENT_UNIQUES)) {
      if (ECON.GEAR_UNIQUES[id]) continue;
      u.id = id; u.armament = true; u.ascend = true;
      ECON.GEAR_UNIQUES[id] = u;
      ECON.ARMAMENT_UNIQUES[id] = u;
      ECON.WEAPON_KIND_BY_BASE[id] = u.kind;
      pushBase({ id, slot: u.slot, lvl: u.lvl, name: u.name, split: Object.assign({}, u.split), unique: true, armament: true });
    }
    // loot rows (+ the derived tables economy.js builds at load)
    for (const [tier, row] of Object.entries(LOOT)) {
      if (ECON.DUNGEON_LOOT[tier]) continue;
      row.tier = tier;
      row.sets = [row.set];
      row.uniques = Object.keys(ECON.GEAR_UNIQUES).filter(id => !ECON.GEAR_UNIQUES[id].armament && (ECON.GEAR_UNIQUES[id].boss === row.boss || ECON.GEAR_UNIQUES[id].boss === row.mini));
      ECON.DUNGEON_LOOT[tier] = row;
      ECON.GXP[tier] = row.gxp;
      ECON.GEAR_SOURCES[tier] = { lvl: row.lvl, chance: row.chance, bonus: row.bonus, weights: row.weights };
      ECON.BONUS_CAP[tier] = Math.round(EARN_CAPS[tier].cap * 0.15);
      ECON.TOME_DROP_CHANCE[tier] = row.tomeChance;
      ECON.DELVER_XP.boss[tier] = row.dxp;
    }
    // materials: essence + the six sigils
    if (!ECON.MATERIALS.essence) ECON.MATERIALS.essence = { name: "Ascendant Essence", color: "#a5f3fc", kind: "mat" };
    for (const id of BOSSES.concat(MINIS)) {
      if (ECON.MATERIALS["sigil_" + id]) continue;
      const b = ECON.GUILD_BOSSES[id];
      ECON.MATERIALS["sigil_" + id] = { name: "Sigil of " + b.name.replace(/^THE /, "").split(",")[0].split(" & ")[0].toLowerCase().replace(/\b\w/g, c => c.toUpperCase()), color: b.accent, kind: "sigil", boss: id };
    }
    for (const id of Object.keys(ECON.MATERIALS)) if (!ECON.MATERIAL_IDS.includes(id)) ECON.MATERIAL_IDS.push(id);
    // codex pages + rewards
    for (const tier of TIERS) {
      if (ECON.CODEX_PAGES[tier]) continue;
      const row = ECON.DUNGEON_LOOT[tier];
      const ids = ECON.GEAR_BASES.filter(b => b.lvl === row.lvl && !b.unique && !b.set && !b.armament).map(b => b.id).concat(row.uniques);
      for (const s of row.sets) ids.push(...ECON.SET_SLOTS.map(sl => ECON.GEAR_SETS[s].pieces[sl]));
      ECON.CODEX_PAGES[tier] = ids;
      ECON.CODEX_PAGE_REWARDS[tier] = Object.assign({ sigil: { id: "sigil_" + row.boss, n: 5 } }, CODEX_REWARDS[tier]);
    }
    // cosmetics
    const UNLOCK_PRICE = (ECON.COSMETICS.hat.find(h => h.unlock) || { price: 1e9 }).price || 1e9;
    for (const [kind, list] of Object.entries(COSMETICS)) {
      const tbl = ECON.COSMETICS[kind];
      if (!Array.isArray(tbl)) continue;
      for (const c of list) if (!tbl.some(x => x.id === c.id)) tbl.push(Object.assign({ price: UNLOCK_PRICE }, c));
    }
    // achievements (appended after the legacy 61)
    const add = (id, label, cat, test, reward) => { if (!ECON.ACHIEVEMENT_BY_ID[id]) { const a = { id, label, cat, test, reward }; ECON.ACHIEVEMENTS.push(a); ECON.ACHIEVEMENT_BY_ID[id] = a; } };
    const kills = (s, b) => ((s && s.codex && s.codex.b) || {})[b] | 0;
    const lastClear = (s, t) => !!(s && s.last && s.last.cleared && s.last.tier === t);
    const st = (s) => (s && s.delve && s.delve.stats) || {};
    for (const [boss, nm] of Object.entries({ vaughn: "Rider", candlemas: "Wick", aurelion: "Ascendant" })) {
      add(`bane_${boss}_1`, `${nm}bane I`, "bane", s => kills(s, boss) >= 10, { dust: 60 });
      add(`bane_${boss}_2`, `${nm}bane II`, "bane", s => kills(s, boss) >= 100, { dust: 200, shard: 8 });
      add(`bane_${boss}_3`, `${nm}bane III`, "bane", s => kills(s, boss) >= 500, { dust: 500, shard: 25, title: `${nm}bane` });
    }
    add("unhorsed", "Unhorsed", "feat", s => (st(s).stuns | 0) >= 20 && kills(s, "vaughn") >= 1, { dust: 120, title: "Unhorsed" });
    add("mortar_and_pestle", "Mortar and Pestle", "feat", s => (st(s).reshapes | 0) >= 30, { dust: 150, shard: 5 });
    add("snuffed", "Snuffed", "feat", s => (st(s).snuffs | 0) >= 25, { dust: 200, shard: 8, title: "Lamplighter" });
    add("heel", "Heel!", "feat", s => (st(s).twinSync | 0) >= 1 && kills(s, "ilse_grim") >= 1, { dust: 120 });
    add("binder", "Binder", "feat", s => (st(s).binds | 0) >= 20, { dust: 250, shard: 10, cosmetic: "aura:tether_aura" });
    add("ascendant_slayer", "Ascendant Slayer", "feat", s => lastClear(s, "guild_spire"), { dust: 600, shard: 30, cosmetic: "aura:fair_copy_aura", title: "Fair Copy" });
    add("ascension_1", "Ascended", "ascend", s => (st(s).ascMax | 0) >= 1, { dust: 100 });
    add("ascension_5", "Ascension V", "ascend", s => (st(s).ascMax | 0) >= 5, { dust: 300, shard: 10, title: "Ascendant" });
    add("ascension_10", "Ascension X", "ascend", s => (st(s).ascMax | 0) >= 10, { dust: 800, shard: 30, cosmetic: "aura:ascension_aura", title: "Unbound" });
    add("ascension_20", "Ascension XX", "ascend", s => (st(s).ascMax | 0) >= 20, { dust: 2000, shard: 80, title: "Apotheosis" });
    add("challenger", "Challenger", "ascend", s => (st(s).challenges | 0) >= 1, { dust: 100 });
    add("challenger_10", "Ten Weeks", "ascend", s => (st(s).challenges | 0) >= 10, { dust: 500, shard: 20, title: "Challenger" });
    add("essence_crafter", "Fair Copyist", "ascend", s => (st(s).crafted | 0) >= 1, { dust: 200 });
    add("grandmaster", "Grandmaster", "ascend", s => Object.values((s && s.codex && s.codex.b) || {}).some(n => (n | 0) >= 200), { dust: 1000, shard: 40, title: "Grandmaster" });
    // planner drivers + art drops / crown shards for the new tiers
    if (CROWN && CROWN.registerDriver) {
      CROWN.registerDriver("reshaper", planReshaper);
      CROWN.registerDriver("phaser", planPhaser);
    }
    if (CROWN && CROWN.ART_DROPS) for (const [id, t] of Object.entries(ART_DROPS)) if (!CROWN.ART_DROPS[id]) CROWN.ART_DROPS[id] = t;
    if (CROWN && CROWN.CROWN_SHARDS) for (const [t, r] of Object.entries(CROWN_SHARDS)) if (!CROWN.CROWN_SHARDS[t]) CROWN.CROWN_SHARDS[t] = r;
    return true;
  }
  install();

  const CONTENT = {
    tiers: TIERS.slice(), bosses: BOSSES.concat(MINIS), enemyTypes: ENEMIES.slice(), themes: THEMES.slice(), kinds: KINDS.slice(),
    attackTypes: (() => { const out = new Set(); for (const id of BOSSES.concat(MINIS)) { const def = BOSS_DEFS[id]; const decks = [def.attacks]; for (const p of def.phases || []) { if (p.attacks) decks.push(p.attacks); if (p.bodyAttacks) decks.push(...Object.values(p.bodyAttacks)); } if (def.twins) for (const b of def.twins.bodies) decks.push(b.attacks); for (const d of decks) for (const a of d) out.add(a.type); } return [...out]; })(),
    bases: Object.keys(UNIQUES).concat(Object.keys(ARMAMENT_UNIQUES), Object.values(SETS).flatMap(s => ECON.SET_SLOTS.map(sl => s.id + "_" + sl)), Object.keys(WEAPON_KINDS).flatMap(k => ECON.ARMAMENT_BASE[k] ? ECON.ARMAMENT_BASE[k].slice(1) : [])),
    uniques: Object.keys(UNIQUES), sets: Object.keys(SETS), armamentUniques: Object.keys(ARMAMENT_UNIQUES),
    achievements: ECON.ACHIEVEMENTS.slice(61).map(a => a.id), cosmetics: COSMETICS.hat.concat(COSMETICS.aura).map(c => c.id), materials: ["essence"].concat(BOSSES.concat(MINIS).map(id => "sigil_" + id)),
    modifiers: MODIFIER_ORDER.slice(),
  };

  return {
    VERSION, TIERS, BOSSES, MINIS, ENEMIES, THEMES, KINDS, CONTENT, LADDER_AFTER,
    DUNGEONS, BOSS_DEFS, ENEMY_DEFS, THEME_DEFS, UNIQUES, SETS, WEAPON_KINDS, ARMAMENT_UNIQUES, LOOT, CODEX_REWARDS, COSMETICS, ART_DROPS, CROWN_SHARDS, BASTION_LAYOUTS,
    ASCENSION_MAX, MODIFIERS, MODIFIER_ORDER, ascensionMods, ascensionScale, modEffects, ascensionAllowed, normAscension, recordAscension,
    CHALLENGE_POOL, weeklyChallenge,
    MASTERY_RANKS, PRESTIGE, bossMastery, masteryTitle, masteryPoints, prestigeOf,
    RECIPES, sunderValue, craftCheck,
    expectedAtk, gearScale,
    planReshaper, planPhaser, buildReshape, buildPhaseOut, boundSteps, snuffSteps, markHit,
    install,
  };
});
