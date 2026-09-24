/* LOOT REVEAL — the cinematic chest (Arcane Depths, B4b).

   gameLootReveal.show(result, {source, chestTier, anchor, tier}) -> Promise

   `result` is a settlement reply / `reward` push (MASTER-PLAN §6.4), a
   {loot:[item]} object or a bare item array. The chest shakes and bursts,
   then the items fly out one by one in ASCENDING rarity, each flipping over
   on a beam of its colour. Mythic dims the room, Ancient draws a rune circle
   and braided twin beams, Arcane stops everything for a 1.4s "ARCANE" title
   card and a prismatic surge. Then a summary: materials, gems, Delver XP
   (with rank-ups), new Codex entries and achievements.

   Snappy by contract: <= 9s for up to 8 items, click (or Space) reveals the
   next one immediately, E / Esc skips to the end, and another click closes.
   Without a DOM (or without ECON) it falls back to gameGear.announceLoot. */
(function () {
  "use strict";

  // ---------------- pure helpers (vm-tested in js/loot-reveal.test.js) ----------------
  const INTRO_MS = 650;
  const CAP_MS = 9000;
  const MIN_STEP_MS = 160;
  const TITLE_CARD_MS = 1400;
  // Per-item reveal time by rarity index (worn..arcane).
  const STEP_MS = [260, 300, 420, 560, 820, 1100, 1350, 2300];
  const RARITIES = ["worn", "fine", "rare", "epic", "legendary", "mythic", "ancient", "arcane"];
  function rarityIdx(r) { const i = RARITIES.indexOf(r); return i < 0 ? 1 : i; }
  // Ascending rarity; stable within a rarity (the server's order).
  function order(items) {
    return (items || []).filter(Boolean).map((it, i) => ({ it, i, r: rarityIdx(it.rarity) }))
      .sort((a, b) => (a.r - b.r) || (a.i - b.i)).map(x => x.it);
  }
  // The timeline: when each item starts and how long it holds the stage.
  function plan(items, opts) {
    opts = opts || {};
    const list = order(items);
    const n = list.length;
    const cap = opts.cap || (n <= 8 ? CAP_MS : CAP_MS + 380 * (n - 8));
    const raw = list.map(it => STEP_MS[rarityIdx(it.rarity)]);
    const budget = Math.max(0, cap - INTRO_MS);
    // Scale everything down to fit, never below MIN_STEP_MS: steps pinned at
    // the floor are taken out and the rest re-scaled until it fits.
    let durs = raw.slice();
    if (raw.reduce((s, d) => s + d, 0) > budget) {
      const pinned = new Set();
      for (let pass = 0; pass < raw.length + 1; pass++) {
        const free = raw.reduce((s, d, i) => s + (pinned.has(i) ? 0 : d), 0);
        const room = budget - pinned.size * MIN_STEP_MS;
        const k = free > 0 ? Math.max(0, room) / free : 1;
        let changed = false;
        durs = raw.map((d, i) => {
          if (pinned.has(i)) return MIN_STEP_MS;
          const v = Math.floor(d * k);
          if (v < MIN_STEP_MS) { pinned.add(i); changed = true; return MIN_STEP_MS; }
          return v;
        });
        if (!changed) break;
      }
    }
    let at = INTRO_MS, sawArcane = false;
    const steps = list.map((it, i) => {
      const r = rarityIdx(it.rarity);
      const dur = durs[i];
      const step = { item: it, rarity: RARITIES[r], idx: r, at, dur, cine: r >= 7 ? 2 : r >= 5 ? 1 : 0,
        titleCard: r >= 7 && !sawArcane && dur >= TITLE_CARD_MS * 0.6 };
      if (r >= 7) sawArcane = true;
      at += dur;
      return step;
    });
    const total = at;
    return { intro: INTRO_MS, steps, total, cap };
  }
  // Pull the displayable parts out of any result shape.
  function normalize(result, opts) {
    opts = opts || {};
    const r = Array.isArray(result) ? { loot: result } : (result && typeof result === "object" ? result : {});
    const loot = Array.isArray(r.loot) ? r.loot.filter(x => x && typeof x === "object") : [];
    const over = new Set((Array.isArray(r.overflow) ? r.overflow : []).map(x => x && x.id).filter(Boolean));
    const mats = r.mats && typeof r.mats === "object" ? r.mats : {};
    const gems = r.gems && typeof r.gems === "object" ? r.gems : {};
    const dv = r.delver && typeof r.delver === "object" ? r.delver : null;
    const chestTier = Math.max(0, Math.min(3, (opts.chestTier != null ? opts.chestTier : r.chestTier) | 0));
    return {
      items: loot, overflowIds: over, mats, gems, delver: dv, chestTier,
      codexNew: Array.isArray(r.codexNew) ? r.codexNew : [], achievements: Array.isArray(r.achievements) ? r.achievements : [],
      gained: +r.gained || 0, packFull: !!r.packFull, tier: opts.tier || r.tier || null, segment: !!r.segment,
      source: opts.source || "", delve: r.delve || null,
    };
  }
  function isEmpty(n) {
    return !n.items.length && !Object.keys(n.mats).length && !Object.keys(n.gems).length && !(n.delver && n.delver.gained) &&
      !n.codexNew.length && !n.achievements.length;
  }

  // ---------------- DOM runtime ----------------
  const hasDom = () => typeof document !== "undefined" && !!document.body && typeof document.createElement === "function";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduced = () => { try { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } };
  const queue = [];
  let active = null;
  // Toasts ("bounty done", "Path step ready"…) landed on top of the chest title.
  // Hold them while a reveal is up and play them after it closes (QA UX-8).
  let heldToasts = null, realToast = null;
  function holdToasts() {
    if (heldToasts || typeof window.toast !== "function") return;
    heldToasts = []; realToast = window.toast;
    window.toast = function (text, dur) { heldToasts.push([text, dur]); };
  }
  function releaseToasts() {
    if (!heldToasts) return;
    const list = heldToasts.slice(-3); heldToasts = null;
    if (window.toast !== realToast && realToast) window.toast = realToast;
    const t = realToast; realToast = null;
    let at = 150;
    for (const [text, dur] of list) { setTimeout(() => { try { t(text, dur); } catch (e) {} }, at); at += Math.min(3200, Math.max(1600, +dur || 2000)); }
  }

  function rInfo(r) { return (window.ECON && ECON.GEAR_RARITY_INFO[r]) || { label: r, color: "#e5e7eb", glow: "#fff", beam: { h: 0, w: 0, particles: 6 } }; }
  function cardFace(it, overflowed) {
    const r = rInfo(it.rarity);
    const ui = window.gameGear && gameGear.ui;
    let inner;
    if (window.ECON && ECON.isTome(it)) {
      const t = ECON.tomeDef(it.tome) || {};
      inner = `<div class="adRvTome"><div class="adRvTomeIco">${ui ? ui.icon("tome", it.tome, 64, "", t.emoji || "📕") : (t.emoji || "📕")}</div><b>${esc(t.name || "Tome")}</b>
        <span class="adRBadge">${esc(r.label)}</span><small>${esc(t.blurb || "")}</small><small class="muted">Tome — press R in a dungeon</small></div>`;
    } else if (ui && ui.isV2(it)) {
      inner = ui.card(it, { compact: true, actions: false, reveal: true });
    } else {
      const slot = (window.ECON && ECON.GEAR_SLOT_INFO[it.slot]) || { emoji: "", label: it.slot || "" };
      inner = `<div class="adRvLegacy"><div class="adRvTomeIco">${ui ? ui.icon("gear", it, 64, "", slot.emoji) : slot.emoji}</div><b>${esc(window.ECON ? ECON.gearName(it) : it.base)}</b>
        <span class="adRBadge">${esc(r.label)}</span><small>${ui ? ui.statLine(it) : ""}</small><small class="muted">Lv ${it.lvl | 0} ${esc(slot.label)}</small></div>`;
    }
    return inner + (overflowed ? `<div class="adRvOver">Pack full → Lost &amp; Found</div>` : "");
  }

  // ---- particles (one canvas for the whole overlay) ----
  function fxLayer(canvas) {
    const ctx = canvas.getContext && canvas.getContext("2d");
    const parts = [];
    let raf = 0, alive = true;
    function size() { canvas.width = innerWidth; canvas.height = innerHeight; }
    size();
    addEventListener("resize", size);
    function burst(x, y, colors, n, kind) {
      if (!ctx || reduced()) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = (kind === "surge" ? 6 : 3.2) * (0.35 + Math.random());
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === "rise" ? 2.2 : 1), life: 1, decay: 0.008 + Math.random() * 0.014,
          size: (kind === "surge" ? 2.6 : 1.8) + Math.random() * 2.4, color: colors[i % colors.length], g: kind === "rise" ? -0.02 : 0.05,
          glyph: kind === "glyph" ? "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ"[Math.floor(Math.random() * 24)] : null });
      }
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function rain(colors, n) {       // falling glyphs across the screen (Ancient)
      if (!ctx || reduced()) return;
      for (let i = 0; i < n; i++) parts.push({ x: Math.random() * canvas.width, y: -20 - Math.random() * 200, vx: 0, vy: 1.4 + Math.random() * 2,
        life: 1, decay: 0.006, size: 12 + Math.random() * 10, color: colors[i % colors.length], g: 0.01, glyph: "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏ"[i % 17] });
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function tick() {
      raf = 0;
      if (!alive) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "lighter";
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.985; p.life -= p.decay;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        if (p.glyph) { ctx.font = `${p.size | 0}px serif`; ctx.fillText(p.glyph, p.x, p.y); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      if (parts.length) raf = requestAnimationFrame(tick);
    }
    return { burst, rain, stop() { alive = false; removeEventListener("resize", size); if (raf) cancelAnimationFrame(raf); } };
  }

  function headline(n) {
    const bits = [];
    if (n.tier && window.ECON && ECON.GUILD_DUNGEONS[n.tier]) bits.push(ECON.GUILD_DUNGEONS[n.tier].name);
    const ct = window.ECON && ECON.CHEST_TIERS && ECON.CHEST_TIERS[n.chestTier];
    if (n.source === "forge") bits.push("The Arcane Forge");
    else bits.push((ct ? ct.name : "Bronze") + " Chest");
    return bits.join(" — ");
  }
  function matsRow(n) {
    const ui = window.gameGear && gameGear.ui;
    const chips = Object.keys(n.mats).filter(k => +n.mats[k] > 0).map(k =>
      `<span class="adMat" style="--mc:${ui ? ui.matColor(k) : "#c4b5fd"}">${ui ? ui.matIco(k) : "<i></i>"}${esc(ui ? ui.matName(k) : k)} <b>+${n.mats[k]}</b></span>`);
    for (const k of Object.keys(n.gems)) {
      const g = ui && ui.gem(k);
      chips.push(`<span class="adMat" style="--mc:${g ? g.color : "#f472b6"}">${ui ? ui.icon("gem", k, 16, "", "<i></i>") : "<i></i>"}${esc(g ? g.name : k)} <b>+${n.gems[k]}</b></span>`);
    }
    return chips.join("");
  }
  function codexLabel(id) {
    if (!window.ECON) return id;
    if (/^tome:/.test(id)) { const t = ECON.TOMES[id.slice(5)]; return t ? t.name : id; }
    const b = ECON.GEAR_BASE_BY_ID[id];
    return b ? b.name : id;
  }

  function build(n, p) {
    const root = document.createElement("div");
    root.id = "adReveal";
    root.className = `adRv tier-${n.chestTier}` + (reduced() ? " reduced" : "");
    const slots = p.steps.map((s, i) => {
      const r = rInfo(s.rarity);
      const beam = r.beam || {};
      const bh = beam.h >= 9999 ? "140vh" : (beam.h | 0) + "px";
      return `<div class="adRvSlot adR-${s.rarity} cine-${s.cine}" data-i="${i}" style="--rc:${r.color};--rg:${r.glow || r.color};--bh:${bh};--bw:${Math.max(6, beam.w | 0)}px;--bd:${Math.max(400, Math.min(beam.dur || 800, s.dur + 600))}ms">
        <div class="adRvBeam"></div><div class="adRvBeam twin"></div>
        <div class="adRvFlip"><div class="adRvBack"><span>?</span></div><div class="adRvFace">${cardFace(s.item, n.overflowIds.has(s.item.id))}</div></div>
      </div>`;
    }).join("");
    root.innerHTML = `<canvas class="adRvFx"></canvas><div class="adRvDim"></div><div class="adRvRays"></div>
      <div class="adRvRune"><i></i><i></i><i></i></div>
      <div class="adRvTitleCard"><span>ARCANE</span><small></small></div>
      <div class="adRvStage">
        <div class="adRvHead"><b>${window.gameGear && gameGear.ui ? gameGear.ui.icon("chest", n.chestTier, 28, "", "") : ""}${esc(headline(n))}</b>${n.gained ? `<small>+$${Math.floor(n.gained).toLocaleString()}</small>` : ""}${n.segment ? `<small>Sanctuary payout</small>` : ""}</div>
        <div class="adRvChest"><div class="adRvChestGlow"></div><div class="adRvLid"></div><div class="adRvBox"></div></div>
        <div class="adRvCards${p.steps.length > 8 ? " many" : ""}">${slots}</div>
        <div class="adRvMore" hidden>▾ scroll for more loot</div>
        <div class="adRvSummary" hidden></div>
        <div class="adRvHint">Click to reveal the next · <b>E</b> to skip</div>
      </div>`;
    document.body.appendChild(root);
    return root;
  }

  function summaryHtml(n) {
    const parts = [];
    const mr = matsRow(n);
    if (mr) parts.push(`<div class="adRvMats">${mr}</div>`);
    if (n.delver && window.ECON) {
      const gained = +n.delver.gained || 0;
      const before = rankBefore(n.delver);
      parts.push(`<div class="adRvXp"><div class="adRvXpHead"><b class="adRvRank">RANK ${before.rank}</b><small>+${gained.toLocaleString()} Delver XP</small></div>
        <div class="adIXpBar"><i style="width:${Math.round(100 * before.into / Math.max(1, before.need))}%"></i></div><div class="adRvRankUp"></div></div>`);
    }
    const toasts = [];
    for (const id of n.codexNew.slice(0, 8)) toasts.push(`<span class="adRvToast codex">📖 New in the Codex: <b>${esc(codexLabel(id))}</b></span>`);
    if (n.codexNew.length > 8) toasts.push(`<span class="adRvToast codex">📖 +${n.codexNew.length - 8} more Codex entries</span>`);
    for (const id of n.achievements) {
      const a = window.ECON && ECON.ACHIEVEMENT_BY_ID && ECON.ACHIEVEMENT_BY_ID[id];
      toasts.push(`<span class="adRvToast ach">★ Achievement: <b>${esc(a ? a.label : id)}</b></span>`);
    }
    if (n.packFull) toasts.push(`<span class="adRvToast warn">Your pack is full — the rest waits in the Armory's Lost &amp; Found.</span>`);
    if (toasts.length) parts.push(`<div class="adRvToasts">${toasts.join("")}</div>`);
    if (!n.items.length && !parts.length) parts.push(`<div class="muted">The chest was empty this time.</div>`);
    parts.push(`<button class="menuBtn gold adRvDone">CONTINUE</button>`);
    return parts.join("");
  }
  // Rank before/after this reward. An older reply may carry only {rank, up}
  // (no running xp total): never fall back to "RANK 1" for a veteran (QA B11).
  function rankAfter(dv) {
    if (+dv.xp > 0) return ECON.delverRank(+dv.xp);
    const r = dv.rank | 0 || 1;
    return { rank: r, into: 0, need: 1 };
  }
  function rankBefore(dv) {
    if (+dv.xp > 0) return ECON.delverRank(Math.max(0, +dv.xp - (+dv.gained || 0)));
    const r = Math.max(1, (dv.rank | 0 || 1) - ((dv.up && dv.up.length) | 0));
    return { rank: r, into: 0, need: 1 };
  }
  // Walk the XP bar through every rank-up.
  function animateXp(root, n, fx) {
    if (!n.delver || !window.ECON) return;
    const from = rankBefore(n.delver), to = rankAfter(n.delver);
    // Many rank-ups (a first clear) still land in about two seconds.
    const ups = Math.max(0, to.rank - from.rank), per = ups > 4 ? Math.max(90, Math.floor(1900 / ups)) : 470;
    const bar = root.querySelector(".adRvXp .adIXpBar i"), lab = root.querySelector(".adRvRank"), up = root.querySelector(".adRvRankUp");
    if (!bar) return;
    let rank = from.rank;
    const step = () => {
      if (!active || active.root !== root) return;
      if (rank < to.rank) {
        bar.style.transition = "width " + (per - 20) / 1000 + "s ease-in"; bar.style.width = "100%";
        setTimeout(() => {
          rank++;
          if (lab) lab.textContent = "RANK " + rank;
          if (up) { up.innerHTML = `<span>RANK UP! ${rank}</span>`; up.classList.remove("go"); void up.offsetWidth; up.classList.add("go"); }
          const r = bar.getBoundingClientRect();
          fx.burst(r.right, r.top, ["#fde68a", "#a78bfa", "#f0abfc"], 40, "rise");
          bar.style.transition = "none"; bar.style.width = "0%";
          setTimeout(step, 60);
        }, per);
      } else {
        bar.style.transition = "width .6s ease-out";
        bar.style.width = Math.round(100 * to.into / Math.max(1, to.need)) + "%";
      }
    };
    setTimeout(step, 250);
  }

  function run(n) {
    return new Promise((resolve) => {
      const p = plan(n.items);
      const root = build(n, p);
      const fx = fxLayer(root.querySelector(".adRvFx"));
      const slotsEl = [...root.querySelectorAll(".adRvSlot")];
      const chest = root.querySelector(".adRvChest");
      const st = { root, next: 0, timer: 0, done: false, closed: false, idleTimer: 0 };
      active = st;
      holdToasts();

      function center(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      // Cards start folded into the chest and fly out to their slots.
      const c0 = center(chest);
      for (const el of slotsEl) {
        const c = center(el);
        el.style.setProperty("--fx", (c0.x - c.x) + "px");
        el.style.setProperty("--fy", (c0.y - c.y) + "px");
      }
      requestAnimationFrame(() => root.classList.add("in"));
      setTimeout(() => {
        if (st.closed) return;
        chest.classList.add("open");
        const c = center(chest);
        fx.burst(c.x, c.y, [["#cd7f32", "#fbbf24"], ["#e2e8f0", "#93c5fd"], ["#fde68a", "#fbbf24"], ["#f472b6", "#a78bfa", "#38bdf8", "#34d399", "#fde047"]][n.chestTier], 24 + 12 * n.chestTier, "rise");
      }, 260);

      function clearCine() { root.classList.remove("dim", "cine-ancient", "cine-arcane", "cine-mythic", "shake"); }
      function reveal(i, quick) {
        const s = p.steps[i], el = slotsEl[i];
        if (!s || !el) return;
        el.classList.add("out");
        setTimeout(() => {
          if (st.closed) return;
          el.classList.add("flip", "beam");
          const c = center(el), r = rInfo(s.rarity);
          const cols = r.prism || [r.color, r.glow || r.color, "#ffffff"];
          if (!quick) {
            clearCine();
            if (s.cine >= 1) root.classList.add("dim", "cine-" + s.rarity);
            if (s.rarity === "ancient") fx.rain([r.color, r.glow], 26);
            if (s.cine >= 2) {
              root.classList.add("shake");
              if (s.titleCard) {
                const tc = root.querySelector(".adRvTitleCard");
                const small = tc && tc.querySelector("small");
                if (small) small.textContent = window.ECON ? ECON.gearName(s.item) : "";
                if (tc) { tc.classList.remove("go"); void tc.offsetWidth; tc.classList.add("go"); }
              }
              fx.burst(innerWidth / 2, innerHeight / 2, cols, 90, "surge");
            }
            fx.burst(c.x, c.y, cols, (r.beam && r.beam.particles) || 8, s.cine >= 1 ? "surge" : "burst");
          } else fx.burst(c.x, c.y, cols, Math.min(10, (r.beam && r.beam.particles) || 6), "burst");
        }, quick ? 0 : 140);
      }
      function schedule() {
        clearTimeout(st.timer);
        if (st.next >= p.steps.length) { st.timer = setTimeout(finish, p.steps.length ? p.steps[p.steps.length - 1].dur : 700); return; }
        const i = st.next;
        const wait = i === 0 ? INTRO_MS : p.steps[i - 1].dur;
        st.timer = setTimeout(() => { st.next = i + 1; reveal(i); schedule(); }, wait);
      }
      function advance() {        // click: the next one, now
        if (st.done) return close();
        clearTimeout(st.timer);
        if (st.next >= p.steps.length) return finish();
        const i = st.next; st.next = i + 1;
        reveal(i); schedule();
      }
      function skip() {           // E / Esc: everything, now
        if (st.done) return close();
        clearTimeout(st.timer);
        chest.classList.add("open");
        for (let i = st.next; i < p.steps.length; i++) reveal(i, true);
        st.next = p.steps.length;
        clearCine();
        const lastBig = p.steps.slice().reverse().find(s => s.cine >= 1);
        if (lastBig) root.classList.add("dim");
        finish();
      }
      function finish() {
        if (st.done) return;
        st.done = true;
        clearTimeout(st.timer);
        // The surge has had its moment: calm the room for the summary.
        setTimeout(() => { if (!st.closed) { clearCine(); if (p.steps.some(x => x.cine >= 1)) root.classList.add("dim"); } }, 900);
        const sum = root.querySelector(".adRvSummary");
        sum.innerHTML = summaryHtml(n);
        sum.hidden = false;
        root.classList.add("summary");
        const hint = root.querySelector(".adRvHint");
        if (hint) hint.innerHTML = "Click or press <b>E</b> to continue";
        animateXp(root, n, fx);
        // The summary clips the card grid; say so when a row is hidden (QA B10).
        setTimeout(() => {
          const cards = root.querySelector(".adRvCards"), more = root.querySelector(".adRvMore");
          if (!cards || !more) return;
          const check = () => { const hidden = cards.scrollHeight - cards.clientHeight - cards.scrollTop > 6; more.hidden = !hidden; cards.classList.toggle("more", hidden); };
          check();
          cards.addEventListener("scroll", check, { passive: true });
          more.addEventListener("click", (e) => { e.stopPropagation(); cards.scrollBy({ top: cards.clientHeight * 0.8, behavior: "smooth" }); });
        }, 420);
        [...sum.querySelectorAll(".adRvToast")].forEach((t, i) => { t.style.animationDelay = (0.15 + i * 0.18) + "s"; });
        st.idleTimer = setTimeout(close, 15000 + 1000 * n.achievements.length);
      }
      function close() {
        if (st.closed) return;
        st.closed = true;
        clearTimeout(st.timer); clearTimeout(st.idleTimer);
        removeEventListener("keydown", onKey, true);
        root.classList.add("closing");
        setTimeout(() => { fx.stop(); root.remove(); if (active === st) active = null; if (!queue.length) releaseToasts(); resolve({ skipped: st.next < p.steps.length }); pump(); }, 220);
      }
      function onKey(e) {
        const k = (e.key || "").toLowerCase();
        if (k === "e" || k === "escape") { e.preventDefault(); e.stopImmediatePropagation(); skip(); }
        else if (k === " " || k === "enter") { e.preventDefault(); e.stopImmediatePropagation(); advance(); }
        else if (!e.ctrlKey && !e.metaKey) { e.stopImmediatePropagation(); }
      }
      addEventListener("keydown", onKey, true);
      root.addEventListener("click", (e) => { e.stopPropagation(); if (e.target.closest && e.target.closest(".adRvDone")) return close(); advance(); });
      schedule();
    });
  }
  function pump() {
    if (active || !queue.length) return;
    const job = queue.shift();
    run(job.n).then(job.resolve, job.resolve);
  }

  // Mirror what this reward earned into the login record, so rank / codex /
  // achievement cosmetics unlock in the Barber without a reload (QA L-11).
  function mirrorRecord(n) {
    const s = typeof state !== "undefined" ? state : null;
    if (!s || !s.data) return;
    const d = s.data;
    if (n.delver && +n.delver.xp > 0) { d.delve = d.delve || {}; if (!(+d.delve.xp >= +n.delver.xp)) d.delve.xp = +n.delver.xp; }
    if (n.achievements.length) { d.delve = d.delve || {}; d.delve.ach = d.delve.ach || {}; for (const id of n.achievements) if (!d.delve.ach[id]) d.delve.ach[id] = Date.now(); }
    if (n.codexNew.length) {
      d.codex = d.codex || {}; d.codex.i = d.codex.i || {};
      for (const id of n.codexNew) if (!d.codex.i[id]) {
        const it = n.items.find(x => x && (x.base === id || ("tome:" + x.tome) === id));
        d.codex.i[id] = [it ? rarityIdx(it.rarity) : 1, 1, 0];
      }
    }
  }
  function show(result, opts) {
    const n = normalize(result, opts);
    // Keep the Armory's cached pack in step with what the server granted.
    try {
      if (window.gameGear && result && !Array.isArray(result) && result.gear && typeof result.gear === "object") gameGear.applyView({ gear: result.gear });
      if (window.gameGear && gameGear.refresh && result && !Array.isArray(result) && (result.mats || result.overflow || result.gems)) gameGear.refresh();
      if (window.gameCodex && gameCodex.noteDelver && n.delver) gameCodex.noteDelver(n.delver);
      mirrorRecord(n);
    } catch (e) { /* display only */ }
    if (isEmpty(n)) return Promise.resolve({ empty: true });
    if (!hasDom() || !window.ECON) {
      if (window.gameGear && gameGear.announceLoot) gameGear.announceLoot(n.items);
      return Promise.resolve({ fallback: true });
    }
    return new Promise((resolve) => { queue.push({ n, resolve }); pump(); });
  }

  window.gameLootReveal = {
    show, plan, order, normalize,
    isOpen: () => !!active,
    skip: () => { if (active && typeof KeyboardEvent === "function") dispatchEvent(new KeyboardEvent("keydown", { key: "e" })); },
    CAP_MS, INTRO_MS, TITLE_CARD_MS,
  };
})();
