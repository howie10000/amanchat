/* THE SUNDERED CROWN II — client bootstrap (always loaded, small).
   window.gameAscension:
     - lazily loads this wave's boss art (js/bosses/ascension-bosses.js) and
       cutscene rigs (js/cutscenes/ascension-cutscenes.js) the moment a run of
       one of its tiers starts — nothing is downloaded until the tier is reached
     - wraps gameCrownBoss.onPush for the new push kinds (tether / snuffed /
       pillar layouts) and gameCombat.applyBossHit for `shielded` replies, so
       every new mechanic has a readable banner or floater
     - remembers the Ascension level / weekly challenge the player picked in
       the panel and adds it to the next start request (netGuildDungeon wrapper)
   Everything is guarded: with no ASCEND / CROWN globals it does nothing. */
(function () {
  "use strict";
  const W = typeof window !== "undefined" ? window : null;
  if (!W) return;
  const A = () => W.ASCEND || null;
  const E = () => W.ECON || null;
  const G = () => W.gameGraphics || W.gameDungeonFx || null;
  const banner = (a, b, col, ms) => { const g = W.gameCrownBoss && W.gameCrownBoss._g ? W.gameCrownBoss._g() : null; if (g && g.banner) g.banner(a, b || "", col || "#a5f3fc", ms || 2200); else if (W.gameGraphics && W.gameGraphics.banner) W.gameGraphics.banner(a, b || "", col || "#a5f3fc", ms || 2200); };
  const floatAt = (x, y, text, col) => { const g = W.gameGraphics; if (g && g.floatText) g.floatText(x, y, text, col || "#a5f3fc", { size: 13, dur: 1100 }); };

  // ---------------------------------------------------------------- lazy assets
  const FILES = { art: "js/bosses/ascension-bosses.js?v=asc-1", cine: "js/cutscenes/ascension-cutscenes.js?v=asc-1" };
  const loaded = {}, loading = {};
  function scriptUrl(p) { try { const me = document.currentScript && document.currentScript.src; return new URL(p, me ? me.replace(/js\/[^/]*$/, "") : document.baseURI).href; } catch (e) { return p; } }
  const BASE = scriptUrl("");
  function load(which) {
    const p = FILES[which];
    if (!p || loaded[which]) return Promise.resolve(true);
    if (loading[which]) return loading[which];
    loading[which] = new Promise((res) => {
      const el = document.createElement("script"); el.src = new URL(p, BASE).href; el.async = true; el.fetchPriority = "low";
      el.onload = () => { loaded[which] = true; res(true); }; el.onerror = () => { delete loading[which]; res(false); };
      document.head.appendChild(el);
    });
    return loading[which];
  }
  function isOurTier(tier) { const e = E(), a = A(); return !!(a && e && e.GUILD_DUNGEONS[tier] && a.TIERS.includes(tier)); }
  function isOurBoss(id) { const a = A(); return !!(a && a.CONTENT.bosses.includes(id)); }
  function loadFor(tier) { if (!isOurTier(tier)) return; load("art"); load("cine"); }
  if (W.NET && W.NET.on) {
    W.NET.on("guild_dungeon", (m) => { try { if (m && (m.kind === "start" || m.kind === "joined" || m.kind === "state") && m.tier) loadFor(m.tier); } catch (e) { /* guarded */ } });
    W.NET.on("guild_boss", (m) => { try { if (m && m.boss && isOurBoss(m.boss.id)) { load("art"); load("cine"); } } catch (e) { /* guarded */ } });
  }

  // ---------------------------------------------------------------- pushes
  function wrapPushes() {
    const CB = W.gameCrownBoss;
    if (!CB || CB._ascWrapped || typeof CB.onPush !== "function") return;
    const prev = CB.onPush;
    CB.onPush = function (m) {
      let handled = false;
      try { handled = prev.call(CB, m); } catch (e) { handled = false; }
      try {
        if (!m) return handled;
        if (m.kind === "tether") {
          if (m.bound) { banner("BOUND", (m.by ? m.by + " held the tether — " : "") + "strike now (×1.8)", "#f5d0fe", 2600); if (m.x != null) floatAt(m.x, m.y - 40, "BOUND!", "#f5d0fe"); }
          else if (m.x != null) floatAt(m.x, m.y - 40, "nobody in the tether", "#94a3b8");
          return true;
        }
        if (m.kind === "snuffed") { banner("SNUFFED", "Every wick is out — strike her now (×1.6)", "#fbbf24", 2600); return true; }
        if (m.kind === "form" && m.form && isOurBoss(m.boss && m.boss.id)) {
          const T = { unhorsed: ["UNHORSED", "The knight fights on foot — the warhorse still charges"], tempest: ["THE TEMPEST", "Step off the glowing marks when the stones rise"], legion: ["THE LEGION", "Cut every echo down — they shield him"], apotheosis: ["APOTHEOSIS", "Stand in the tether where he will emerge — bind him"] }[m.form];
          if (T) banner(T[0], T[1], "#a5b4fc", 3200);
          return true;
        }
      } catch (e) { /* guarded */ }
      return handled;
    };
    CB._ascWrapped = true;
  }
  function wrapHits() {
    const C = W.gameCombat;
    if (!C || C._ascWrapped || typeof C.applyBossHit !== "function") return;
    const prev = C.applyBossHit;
    C.applyBossHit = function (res, tg) {
      try { const S = typeof state !== "undefined" ? state : null; if (res && res.shielded && S && S.pos) floatAt(S.pos.x, S.pos.y - 46, "SHIELDED — put out the wicks", "#fbbf24"); } catch (e) { /* guarded */ }
      return prev.call(C, res, tg);
    };
    C._ascWrapped = true;
  }

  // ---------------------------------------------------------------- start options
  // The panel sets these; the next run start carries them (server validates).
  const pick = { ascension: 0, challenge: false, tier: null };
  function setPick(o) { pick.ascension = Math.max(0, (o && o.ascension) | 0); pick.challenge = !!(o && o.challenge); pick.tier = (o && o.tier) || null; return Object.assign({}, pick); }
  function wrapStart() {
    if (typeof W.netGuildDungeon !== "function" || W.netGuildDungeon._ascWrapped) return;
    const prev = W.netGuildDungeon;
    const f = function (data) {
      try {
        if (data && (data.action === "start" || data.action === "party_start") && (pick.ascension || pick.challenge)) {
          if (!pick.tier || !data.tier || data.tier === pick.tier) { if (pick.ascension) data.ascension = pick.ascension; if (pick.challenge) data.challenge = true; }
        }
      } catch (e) { /* guarded */ }
      return prev(data);
    };
    f._ascWrapped = true;
    W.netGuildDungeon = f;
  }

  function init() { wrapPushes(); wrapHits(); wrapStart(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else setTimeout(init, 0);
  // the wrapped modules may load after us: try again once everything is up
  setTimeout(init, 1500);

  W.gameAscension = { load, loadFor, isOurTier, isOurBoss, setPick, pick: () => Object.assign({}, pick), loaded: () => Object.assign({}, loaded), init, banner };
})();
