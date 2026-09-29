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
  const FILES = { art: "js/bosses/ascension-bosses.js?v=asc-2", cine: "js/cutscenes/ascension-cutscenes.js?v=asc-2" };
  const loaded = {}, loading = {};
  if (W.gameAscensionCutscenes || (W.DungeonCutscenes && W.DungeonCutscenes.get && W.DungeonCutscenes.get("aurelion"))) loaded.cine = true;
  if (W.gameBosses && W.gameBosses.ASCEND_ART) loaded.art = true;
  function scriptUrl(p) {
    try {
      let me = document.currentScript && document.currentScript.src;
      if (!me && typeof document !== "undefined") {
        const scripts = (typeof document.getElementsByTagName === "function" && document.getElementsByTagName("script")) || document.scripts || [];
        for (let i = scripts.length - 1; i >= 0; i--) {
          const s = scripts[i] && scripts[i].src;
          if (s && s.includes("ascension-client.js")) { me = s; break; }
        }
      }
      return new URL(p, me ? me.replace(/js\/[^/]*$/, "") : (document.baseURI || "http://localhost/")).href;
    } catch (e) {
      return p;
    }
  }
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
  function loadFor(tier) { if (!isOurTier(tier)) return; load("art"); load("cine"); init(); }
  if (W.NET && W.NET.on) {
    W.NET.on("guild_dungeon", (m) => { try { if (m && (m.kind === "start" || m.kind === "joined" || m.kind === "state") && m.tier) loadFor(m.tier); } catch (e) { /* guarded */ } });
    W.NET.on("guild_boss", (m) => { try { init(); if (m && m.boss && isOurBoss(m.boss.id)) { load("art"); load("cine"); } } catch (e) { /* guarded */ } });
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
        const bId = (m.boss && m.boss.id) || (CB._t && CB._t.runtime && CB._t.runtime().bossId) || (W.state && W.state.dungeon && W.state.dungeon.boss && W.state.dungeon.boss.id);
        const targetForm = m.form || (m.boss && m.boss.form) || (bId === "aurelion" ? (m.phase === 3 ? "legion" : m.phase === 4 ? "apotheosis" : m.phase === 2 ? "tempest" : "") : "");
        if ((m.kind === "form" || m.kind === "phase") && targetForm && isOurBoss(bId)) {
          if (bId === "aurelion" && (targetForm === "legion" || targetForm === "apotheosis")) {
            startAurelion2D(targetForm, Date.now());
          }
          const T = { unhorsed: ["UNHORSED", "The knight fights on foot — the warhorse still charges"], tempest: ["THE TEMPEST", "Step off the glowing marks when the stones rise"], legion: ["THE LEGION", "Cut every echo down — they shield him"], apotheosis: ["APOTHEOSIS", "Stand in the tether where he will emerge — bind him"] }[targetForm];
          if (T) banner(T[0], T[1], "#a5b4fc", 3200);
          return true;
        }
      } catch (e) { /* guarded */ }
      return handled;
    };
    CB._ascWrapped = true;
  }

  // ---------------------------------------------------------------- in-world 2D cutscenes (Aurelion P3 & P4)
  const cine2D = {
    active: false,
    form: null,
    t0: 0,
    dur: 4400,
    progress: 0,
    lines: []
  };

  function startAurelion2D(form, t) {
    const isP4 = form === "apotheosis";
    cine2D.active = true;
    cine2D.form = form;
    cine2D.t0 = t || (typeof performance !== "undefined" ? performance.now() : Date.now());
    cine2D.dur = isP4 ? 5400 : 4800;
    cine2D.progress = 0;
    cine2D.lines = isP4 ? [
      { t0: 0, t1: 0.35, text: "THE MORTAL SHELL HAS CRACKED.", sub: "Look upon the light that burns away the flesh!" },
      { t0: 0.35, t1: 0.70, text: "I AM BECOME THE ASCENDANT SUN!", sub: "No cage can hold a god. No spire can touch the heavens!" },
      { t0: 0.70, t1: 1.0, text: "APOTHEOSIS — BURN IN THE BLINDING DAWN!", sub: "Bind me if you can... before the world turns to ash!" }
    ] : [
      { t0: 0, t1: 0.35, text: "If I lose it all... slip and fall...", sub: "Will you laugh at me? Or remember what I was?" },
      { t0: 0.35, t1: 0.70, text: "LET THE SPIRE SHATTER. LET THE STARS REMEMBER!", sub: "The dawn does not ask permission to burn." },
      { t0: 0.70, t1: 1.0, text: "AWAKEN, LEGIONS OF THE ETERNAL DAWN!", sub: "Every life I lived — fight as one!" }
    ];
  }

  function syncCine2DPose(CB) {
    if (!cine2D.active) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = now - cine2D.t0;
    if (elapsed >= cine2D.dur) {
      cine2D.active = false;
      const bList = typeof CB.bodies === "function" ? CB.bodies() : [];
      for (let i = 0; i < bList.length; i++) {
        if (bList[i] && bList[i].pose) delete bList[i].pose.cutscene2d;
      }
      return;
    }
    cine2D.progress = Math.max(0, Math.min(1, elapsed / cine2D.dur));
    const bList = typeof CB.bodies === "function" ? CB.bodies() : [];
    for (let i = 0; i < bList.length; i++) {
      if (bList[i] && bList[i].pose) {
        bList[i].pose.cutscene2d = cine2D.progress;
      }
    }
  }

  function renderCine2D(ctx, t, CB) {
    if (!cine2D.active || !ctx || typeof ctx.save !== "function") return;
    const p = cine2D.progress;
    const bList = typeof CB.bodies === "function" ? CB.bodies() : [];
    const mainBody = (bList && bList[0] && bList[0].pose) ? bList[0].pose : ((typeof CB.focusPos === "function" ? CB.focusPos() : null) || { x: 512, y: 280 });
    const bx = Number.isFinite(mainBody.x) ? mainBody.x : 512;
    const by = Number.isFinite(mainBody.y) ? mainBody.y : 280;
    const hoverH = 26 * Math.sin(p * Math.PI);
    const swordTipX = bx;
    const swordTipY = Math.max(20, by - 74 - hoverH);
    const isApo = cine2D.form === "apotheosis";

    ctx.save();
    try {
      // 1. Ambient darkness vignette
      const darkAlpha = Math.sin(p * Math.PI) * (isApo ? 0.72 : 0.52);
      ctx.fillStyle = "rgba(7, 10, 20, " + darkAlpha + ")";
      const cw = (ctx.canvas && ctx.canvas.width) || 1024, ch = (ctx.canvas && ctx.canvas.height) || 640;
      ctx.fillRect(0, 0, cw, ch);

      // 2. Summoning solar sigil under Aurelion's feet
      const sigilAlpha = Math.sin(p * Math.PI) * 0.85;
      ctx.strokeStyle = isApo ? "rgba(254, 240, 138, " + sigilAlpha + ")" : "rgba(251, 191, 36, " + sigilAlpha + ")";
      ctx.lineWidth = isApo ? 3.5 : 2.5;
      ctx.beginPath();
      ctx.ellipse(bx, by + 10, 80, 32, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(bx, by + 10, 52, 21, 0, 0, Math.PI * 2);
      ctx.stroke();
      const starRot = t / 1000;
      const nRays = isApo ? 16 : 10;
      for (let r = 0; r < nRays; r++) {
        const ang = starRot + (r / nRays) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(bx + Math.cos(ang) * 52, by + 10 + Math.sin(ang) * 21);
        ctx.lineTo(bx + Math.cos(ang) * (isApo ? 86 : 80), by + 10 + Math.sin(ang) * (isApo ? 35 : 32));
        ctx.stroke();
      }

      // 3. Starlight Godray striking the sword from above
      const beamPhase = Math.sin(p * Math.PI);
      if (beamPhase > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const beamW = Math.max(2, (isApo ? 64 : 44) * beamPhase);
        if (typeof ctx.createLinearGradient === "function") {
          const grad = ctx.createLinearGradient(swordTipX - beamW, 0, swordTipX + beamW, 0);
          grad.addColorStop(0, "rgba(245, 158, 11, 0)");
          grad.addColorStop(0.25, isApo ? "rgba(254, 240, 138, " + (0.7 * beamPhase) + ")" : "rgba(253, 224, 71, " + (0.55 * beamPhase) + ")");
          grad.addColorStop(0.5, "rgba(255, 255, 255, " + (0.98 * beamPhase) + ")");
          grad.addColorStop(0.75, isApo ? "rgba(254, 240, 138, " + (0.7 * beamPhase) + ")" : "rgba(253, 224, 71, " + (0.55 * beamPhase) + ")");
          grad.addColorStop(1, "rgba(245, 158, 11, 0)");
          ctx.fillStyle = grad;
          ctx.fillRect(swordTipX - beamW, 0, beamW * 2, Math.max(0, swordTipY));
        } else {
          ctx.fillStyle = "rgba(254, 240, 138, " + (0.75 * beamPhase) + ")";
          ctx.fillRect(swordTipX - beamW * 0.5, 0, beamW, Math.max(0, swordTipY));
        }

        // Sword tip impact burst
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(swordTipX, swordTipY, (14 + 8 * Math.sin(t / 70)) * beamPhase, 0, Math.PI * 2);
        ctx.fill();

        // Expanding celestial shockwaves
        if (p >= 0.35 && p <= 0.90) {
          const shockU = (p - 0.35) / 0.55;
          const shockR = Math.max(1, shockU * (isApo ? 380 : 320));
          ctx.strokeStyle = isApo ? "rgba(255, 255, 255, " + ((1 - shockU) * 0.9) + ")" : "rgba(254, 240, 138, " + ((1 - shockU) * 0.85) + ")";
          ctx.lineWidth = Math.max(1, (1 - shockU) * (isApo ? 8 : 6) + 1);
          ctx.beginPath();
          ctx.ellipse(bx, by + 10, shockR, Math.max(0.5, shockR * 0.42), 0, 0, Math.PI * 2);
          ctx.stroke();

          if (isApo && p >= 0.5) {
            const shockU2 = (p - 0.5) / 0.4;
            const shockR2 = Math.max(1, shockU2 * 260);
            ctx.strokeStyle = "rgba(254, 240, 138, " + ((1 - shockU2) * 0.8) + ")";
            ctx.lineWidth = Math.max(1, (1 - shockU2) * 5 + 1);
            ctx.beginPath();
            ctx.ellipse(bx, by + 10, shockR2, Math.max(0.5, shockR2 * 0.42), 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        ctx.restore();
      }

      // 4. In-world cinematic dialogue bubble
      let curLine = null;
      for (let i = 0; i < cine2D.lines.length; i++) {
        const l = cine2D.lines[i];
        if (p >= l.t0 && p < l.t1) { curLine = l; break; }
      }
      if (curLine) {
        const lineProg = (p - curLine.t0) / (curLine.t1 - curLine.t0);
        const textAlpha = Math.sin(lineProg * Math.PI);
        const boxW = 460, boxH = 72;
        const boxX = bx - boxW / 2, boxY = Math.max(26, swordTipY - 96);

        ctx.save();
        ctx.globalAlpha = textAlpha;

        ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
        ctx.strokeStyle = isApo ? "#ffffff" : "#fde047";
        ctx.lineWidth = isApo ? 2.5 : 2;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(boxX, boxY, boxW, boxH, 8);
        else ctx.rect(boxX, boxY, boxW, boxH);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isApo ? "#ffffff" : "#fef08a";
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(isApo ? "✦ AURELION, APOTHEOSIS ✦" : "✦ AURELION, THE ASCENDANT ✦", bx, boxY + 7);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 15px Georgia, serif";
        ctx.fillText(curLine.text, bx, boxY + 26);

        ctx.fillStyle = isApo ? "#cbd5e1" : "#94a3b8";
        ctx.font = "italic 11px Georgia, serif";
        ctx.fillText(curLine.sub, bx, boxY + 49);

        ctx.restore();
      }
    } finally {
      ctx.restore();
    }
  }

  function wrapDrawBodies() {
    const CB = W.gameCrownBoss;
    if (!CB || CB._ascDrawWrapped || typeof CB.drawBodies !== "function") return;
    const prev = CB.drawBodies;
    CB.drawBodies = function (ctx, t, layer, playerY) {
      try {
        const bId = (typeof state !== "undefined" && state.dungeon && state.dungeon.boss && state.dungeon.boss.id) || (typeof CB.bossId === "function" ? CB.bossId() : null);
        if (bId === "aurelion") {
          const form = (typeof state !== "undefined" && state.dungeon && state.dungeon.boss && state.dungeon.boss.form) || (typeof CB.form === "function" ? CB.form() : null);
          const ph = (typeof state !== "undefined" && state.dungeon && state.dungeon.boss && state.dungeon.boss.phase) || (typeof CB.phase === "function" ? CB.phase() : 1);
          if ((form === "legion" || ph === 3) && !CB._sawP3Cine) {
            CB._sawP3Cine = true;
            startAurelion2D("legion", t);
          } else if ((form === "apotheosis" || ph === 4) && !CB._sawP4Cine) {
            CB._sawP4Cine = true;
            startAurelion2D("apotheosis", t);
          }
        }
      } catch (e) { /* guarded */ }
      if (cine2D.active) syncCine2DPose(CB);
      const res = prev.call(CB, ctx, t, layer, playerY);
      if (layer === "front" && cine2D.active) {
        try { renderCine2D(ctx, t, CB); } catch (e) { console.error("renderCine2D:", e); }
      }
      return res;
    };
    CB._ascDrawWrapped = true;
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

  function init() { wrapPushes(); wrapDrawBodies(); wrapHits(); wrapStart(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else setTimeout(init, 0);
  // the wrapped modules may load after us: try again once everything is up
  setTimeout(init, 1500);

  W.gameAscension = { load, loadFor, isOurTier, isOurBoss, setPick, pick: () => Object.assign({}, pick), loaded: () => Object.assign({}, loaded), init, banner, startAurelion2D, cine2D: () => Object.assign({}, cine2D) };
})();
