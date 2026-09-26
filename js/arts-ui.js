/* ARTS UI — the Crown Arts panel (THE SUNDERED CROWN, B4).

   gameArtsUI.open(tab?)       the panel: 10-art collection, ranks 1-5, duplicate
                               progress, forging with crown shards, the F / C slots
   gameArtsUI.artsForTier(t)   which arts can drop in a dungeon (picker, codex)
   gameArtsUI.artLines(id, r)  the tooltip lines for one art at one rank

   The server's `arts` op (docs/sundered-crown/MASTER-PLAN.md §6.3) owns every
   number that sticks: status -> {arts, cds, crown_shard, table}, equip
   {art|null, slot} -> {arts}, forge {art} -> {arts, cost, money, mats}. Copies
   merge on their own when they drop (rank r -> r+1 takes r duplicates); the
   Forge buys a rank with crown shards + gold instead. Everything here is a
   preview from the pure CROWN rules and is guarded, so the panel renders with
   an old server, no server, or no CROWN at all. */
(function () {
  "use strict";
  const W = typeof window !== "undefined" ? window : globalThis;
  const CR = () => W.CROWN || null;
  const EC = () => W.ECON || {};
  const ST = () => (typeof state !== "undefined" ? state : null);   // core.js lexical global
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Math.max(0, Math.floor(+n || 0)).toLocaleString();
  const pct = (v) => Math.round((+v || 0) * 100) + "%";
  const secs = (ms) => { const s = (+ms || 0) / 1000; return (Math.round(s * 10) / 10).toString().replace(/\.0$/, "") + "s"; };
  const toastT = (t, ms) => { if (typeof W.toast === "function") W.toast(esc(t), ms || 3000); };
  function ico(kind, arg, size, cls) { try { return (W.ItemIcons && W.ItemIcons.html(kind, arg, size, cls)) || ""; } catch (e) { return ""; } }

  const KIND_LABEL = { dash: "Dash", ground: "Ground burst", buff: "Rally", stance: "Stance", line: "Piercing line", self: "Self", blink: "Blink", nova: "Nova", strike: "Strike" };
  const RAR_LABEL = { rare: "Rare", epic: "Epic", legendary: "Legendary", mythic: "Mythic" };
  const MAX_RANK = () => (CR() && CR().ART_MAX_RANK) || 5;
  const order = () => (CR() && CR().ART_ORDER) || [];
  const def = (id) => (CR() && CR().ARTS && CR().ARTS[id]) || null;
  function rarColor(r) { const I = EC().GEAR_RARITY_INFO && EC().GEAR_RARITY_INFO[r]; return (I && I.color) || { rare: "#3b82f6", epic: "#a855f7", legendary: "#fbbf24", mythic: "#e879f9" }[r] || "#e5e7eb"; }
  function norm(rec) { try { return CR() ? CR().normArts(rec) : { v: 1, own: {}, eq: [null, null], pity: {} }; } catch (e) { return { v: 1, own: {}, eq: [null, null], pity: {} }; } }
  function gearFx() { try { return (W.gameGear && W.gameGear.fx && W.gameGear.fx()) || {}; } catch (e) { return {}; } }
  // "Kael, Crownbound" must not read as plain "Kael": keep a short epithet after the comma.
  function bossLabel(id) {
    const b = (EC().GUILD_BOSSES || {})[id]; if (!b) return id;
    const [head, tail] = b.name.replace(/^THE /, "").split(/,\s*/);
    const t = (s) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    return tail && !/^THE /.test(tail) ? t(head) + ", " + t(tail) : t(head);
  }
  function tierLabel(t) { const d = (EC().GUILD_DUNGEONS || {})[t]; return d ? d.name : t; }

  // ---------------- pure helpers (tested in js/arts-ui.test.js) ----------------
  // Every art that can drop in `tier`: [{id, p, from:[{who, p, kind:'boss'|'mini'|'chest'}]}], rarest first.
  function artsForTier(tier) {
    const C = CR(), cfg = (EC().GUILD_DUNGEONS || {})[tier];
    if (!C || !cfg) return [];
    const by = {};
    const add = (list, who, kind) => { for (const [id, p] of list || []) { if (!C.ARTS[id]) continue; const r = by[id] = by[id] || { id, p: 0, from: [] }; r.p = Math.max(r.p, p); r.from.push({ who, p, kind }); } };
    add(C.ART_DROPS[cfg.boss], cfg.boss, "boss");
    if (cfg.mini) add(C.ART_DROPS[cfg.mini], cfg.mini, "mini");
    if (!C.ART_DROPS[cfg.boss]) add(C.LEGACY_ART_DROPS[tier], cfg.boss, "chest");
    const rIdx = (id) => (C.ART_RARITIES || []).indexOf(C.ARTS[id].rarity);
    return Object.values(by).sort((a, b) => (rIdx(b.id) - rIdx(a.id)) || (b.p - a.p));
  }
  // Where one art drops, across every dungeon: [{tier, who, p, kind}]
  function sourcesOf(id) {
    const out = [], E = EC();
    const ladder = (E.STORY_LADDER || []).concat(["raid_nexus", "arcane_depths"]);
    for (const t of ladder) for (const r of artsForTier(t)) if (r.id === id) for (const f of r.from) out.push({ tier: t, who: f.who, p: f.p, kind: f.kind });
    return out.sort((a, b) => b.p - a.p);
  }
  // Tooltip / detail lines for an art at a rank (fx = gear effects: artCd, artPower).
  function artLines(id, rank, fx) {
    const C = CR(), a = def(id);
    if (!C || !a) return [];
    rank = Math.max(1, Math.min(MAX_RANK(), rank | 0 || 1));
    fx = fx || {};
    const L = [];
    L.push(`${RAR_LABEL[a.rarity] || a.rarity} · ${KIND_LABEL[a.kind] || a.kind} · rank ${rank}/${MAX_RANK()}`);
    L.push(`Cooldown ${secs(C.artCooldownMs(id, rank, fx))}` + ((+fx.artCd || 0) > 0 ? ` (gear −${pct(Math.min(0.4, fx.artCd))})` : ""));
    if (a.power > 0) {
      const ap = Math.min(0.6, Math.max(0, +fx.artPower || 0));
      L.push(`Damage ×${(C.artPower(id, rank) * (1 + ap)).toFixed(2)} of a sword swing` + (a.maxTargets ? `, up to ${a.maxTargets} ${a.maxTargets === 1 ? "target" : "targets"}` : ""));
    }
    if (a.len) L.push(`Reach ${a.len}px${a.w ? " × " + a.w + "px wide" : ""}`);
    else if (a.kind === "ground") L.push(`Thrown up to ${a.reach}px, bursts in a ${a.r}px ring`);
    else if (a.r) L.push(`Radius ${a.r}px`);
    else if (a.reach) L.push(`Reach ${a.reach}px`);
    if (a.iframesMs) L.push(`Untouchable for ${secs(a.iframesMs)} while dashing`);
    if (a.rootMs) L.push(`Roots foes for ${secs(a.rootMs)}; bosses are slowed ${pct(a.bossSlow)} for ${secs(a.bossSlowMs)}`);
    if (a.stunMs) L.push(`Knocks back ${a.knockback}px and stuns lesser foes for ${secs(a.stunMs)}`);
    if (a.slow) L.push(`Slows ${pct(a.slow)} for ${secs(a.slowMs)}`);
    if (a.buff) L.push(`Allies within ${a.r}px deal +${pct(C.warCryMult(rank) - 1)} damage for ${secs(a.buff.durMs)}`);
    if (a.windowMs) L.push(`A ${secs(a.windowMs)} guard: the next hit on you is negated and countered`);
    if (a.veilMs) L.push(`Bosses lose you for ${secs(a.veilMs)}; your next hit lands ×${a.nextHitMult}`);
    if (a.decoyMs) L.push(`Leaves a reflection that draws aggro for ${secs(a.decoyMs)}, then shatters`);
    if (a.vsStaggered) L.push(`×${a.vsStaggered} against a stunned, exhausted or sundered boss`);
    return L;
  }
  // What the next rank costs and how close the copies are.
  function rankInfo(id, own) {
    const C = CR(), max = MAX_RANK();
    if (!C || !own) return { rank: 0, max, dupes: 0, need: 0, forge: null, melt: 0 };
    const r = own.r | 0 || 1;
    return { rank: r, max, dupes: own.d | 0, need: r >= max ? 0 : C.artDupesForRank(r), forge: C.artForgeCost(id, r), melt: C.artMeltShards(id) };
  }

  // ---------------- state + network ----------------
  const A = { rec: null, shards: null, cds: {}, sel: null, tab: "collection", busy: false, flash: null, ask: null, lastForge: 0, drag: null, live: false };
  function call(msg) {
    if (typeof W.netArts === "function") return W.netArts(msg);
    return Promise.reject(new Error("The Crown Arts are still being forged. Check back after the update."));
  }
  function localRec() { const s = ST(); return norm(s && s.data && s.data.arts); }
  function rec() { return A.rec || localRec(); }
  function shards() {
    if (A.shards != null) return A.shards | 0;
    try { const m = W.gameGear && W.gameGear.mats ? W.gameGear.mats() : null; if (m && m.crown_shard != null) return m.crown_shard | 0; } catch (e) {}
    const s = ST(); return (s && s.data && s.data.mats && s.data.mats.crown_shard) | 0;
  }
  const gold = () => { const s = ST(); return (s && s.data && +s.data.money) || 0; };
  function adopt(res) {
    if (!res || typeof res !== "object") return;
    if (res.arts) { A.rec = norm(res.arts); const s = ST(); if (s && s.data) s.data.arts = A.rec; }
    if (res.crown_shard != null) A.shards = res.crown_shard | 0;
    if (res.mats && typeof res.mats === "object") {
      if (res.mats.crown_shard != null) A.shards = res.mats.crown_shard | 0;
      try { if (W.gameGear && W.gameGear.adoptChanges) W.gameGear.adoptChanges({ mats: res.mats }); } catch (e) {}
    }
    if (res.cds && typeof res.cds === "object") A.cds = res.cds;
    if (typeof res.money === "number") { const s = ST(); if (s && s.data) s.data.money = res.money; if (typeof W.updateHUD === "function") try { W.updateHUD(); } catch (e) {} }
    // Keep the in-run HUD (B2) in step with what is equipped.
    try { if (W.gameCrownArts && W.gameCrownArts.applyStatus && res.arts) W.gameCrownArts.applyStatus({ arts: A.rec, cds: A.cds, crown_shard: A.shards }); } catch (e) {}
  }
  async function load() {
    try { adopt(await call({ action: "status" })); A.live = true; return true; } catch (e) { return false; }
  }

  // ---------------- rendering ----------------
  function pips(r, max) { let h = ""; for (let i = 1; i <= max; i++) h += `<i class="${i <= r ? "on" : ""}"></i>`; return `<span class="scPips" title="Rank ${r} of ${max}">${h}</span>`; }
  function slotHtml(i, R) {
    const id = R.eq[i], a = id && def(id), own = id && R.own[id];
    const key = ((CR() && CR().ART_KEYS) || ["f", "c"])[i].toUpperCase();
    const sel = A.sel && R.own[A.sel] && A.sel !== id;
    return `<div class="scSlot${a ? " full" : ""}${sel ? " ready" : ""}" style="--ac:${esc(a ? a.color : "#64748b")}" data-slot="${i}"
        onclick="gameArtsUI.slotClick(${i})" ondragover="event.preventDefault()" ondrop="gameArtsUI.drop(event, ${i})" title="${a ? esc(artLines(id, own.r, gearFx()).join("\n")) : "Empty — pick an art, then tap here"}">
      <kbd>${key}</kbd>
      ${a ? `<span class="scSlotIco">${ico("art", id, 44) || "♛"}</span><span class="scSlotTxt"><b>${esc(a.name)}</b>${pips(own.r, MAX_RANK())}</span>
        <button class="scX" title="Unequip" onclick="event.stopPropagation();gameArtsUI.equip(null, ${i})">×</button>`
        : `<span class="scSlotIco empty">+</span><span class="scSlotTxt"><b class="muted">${sel ? "Equip " + esc(def(A.sel).name) + " here" : "Empty slot"}</b><small>press ${key} in a dungeon</small></span>`}
    </div>`;
  }
  function cardHtml(id, R) {
    const a = def(id), own = R.own[id];
    const slot = R.eq.indexOf(id);
    const ri = rankInfo(id, own);
    const tip = own ? artLines(id, own.r, gearFx()) : [RAR_LABEL[a.rarity] + " — not found yet"].concat(sourcesOf(id).slice(0, 3).map(s => `${bossLabel(s.who)} (${tierLabel(s.tier)}): ${(s.p * 100).toFixed(s.p < 0.01 ? 1 : 0)}%`));
    const prog = own && ri.need ? Math.min(100, Math.round(100 * ri.dupes / ri.need)) : own ? 100 : 0;
    return `<button class="scArt r-${esc(a.rarity)}${own ? " own" : " none"}${A.sel === id ? " sel" : ""}${slot >= 0 ? " eq" : ""}" style="--ac:${esc(a.color)};--rc:${esc(rarColor(a.rarity))}"
        ${own ? `draggable="true" ondragstart="gameArtsUI.dragStart(event, '${esc(id)}')"` : ""} onclick="gameArtsUI.pick('${esc(id)}')" title="${esc(a.name + "\n" + tip.join("\n"))}">
      <span class="scArtIco">${ico("art", id, 56, own ? "" : "scSil") || `<span class="scGlyph">♛</span>`}</span>
      <b>${esc(a.name)}</b>
      <small class="scRar">${RAR_LABEL[a.rarity]}</small>
      ${own ? `${pips(own.r, ri.max)}<span class="scDupe" title="${ri.need ? `${ri.dupes}/${ri.need} copies to rank ${own.r + 1}` : "Max rank"}"><i style="width:${prog}%"></i></span>` : `<small class="muted">not found</small>`}
      ${slot >= 0 ? `<span class="scEqTag">${((CR() && CR().ART_KEYS) || ["f", "c"])[slot].toUpperCase()}</span>` : ""}
    </button>`;
  }
  function detailHtml(R) {
    const id = A.sel, a = id && def(id);
    if (!a) return `<div class="scDetail empty"><p class="muted">Pick an art to see what it does. Drag an owned art onto <b>F</b> or <b>C</b>, or pick it and tap a slot.</p></div>`;
    const own = R.own[id], ri = rankInfo(id, own), fx = gearFx();
    const lines = artLines(id, own ? own.r : 1, fx);
    const C = CR(), nr = own && own.r < ri.max ? own.r + 1 : 0;
    const nextTxt = nr ? `Rank ${nr}: cooldown ${secs(C.artCooldownMs(id, nr, fx))}` + (a.power > 0 ? `, damage ×${(C.artPower(id, nr) * (1 + Math.min(0.6, Math.max(0, +fx.artPower || 0)))).toFixed(2)}` : "") + (a.buff ? `, +${pct(C.warCryMult(nr) - 1)} rally` : "") : "";
    const srcs = sourcesOf(id);
    let h = `<div class="scDetail r-${esc(a.rarity)}" style="--ac:${esc(a.color)};--rc:${esc(rarColor(a.rarity))}">
      <div class="scDHead">${ico("art", id, 72, own ? "" : "scSil")}<div><b>${esc(a.name)}</b><small>${esc(a.desc || "")}</small>${own ? pips(own.r, ri.max) : ""}</div></div>
      <ul class="scLines">${lines.map(l => `<li>${esc(l)}</li>`).join("")}${nextTxt ? `<li class="scNext">▲ ${esc(nextTxt)}</li>` : ""}</ul>`;
    if (own) {
      h += `<div class="scEquipRow"><button class="menuBtn ${R.eq[0] === id ? "gray" : "gold"}" onclick="gameArtsUI.equip('${esc(id)}', 0)">${R.eq[0] === id ? "ON F" : "EQUIP → F"}</button>
        <button class="menuBtn ${R.eq[1] === id ? "gray" : "gold"}" onclick="gameArtsUI.equip('${esc(id)}', 1)">${R.eq[1] === id ? "ON C" : "EQUIP → C"}</button></div>`;
      if (ri.need) {
        const c = ri.forge || { gold: 0, crown_shard: 0 };
        const okG = gold() >= c.gold, okS = shards() >= c.crown_shard;
        h += `<div class="scRankBox"><div><b>Rank ${own.r} → ${own.r + 1}</b>
            <small>Merge: <b>${ri.dupes}/${ri.need}</b> duplicate ${ri.need === 1 ? "copy" : "copies"} — copies merge by themselves when they drop.</small>
            <span class="scDupe big"><i style="width:${Math.min(100, Math.round(100 * ri.dupes / ri.need))}%"></i></span></div>
          <div class="scForge"><small>…or forge it now:</small>
            <div class="adCost"><span class="${okG ? "ok" : "short"}" style="--mc:#fbbf24"><i></i>Gold <b>${money(c.gold)}</b><small>/ ${money(gold())}</small></span>
              <span class="${okS ? "ok" : "short"}" style="--mc:#fde047">${ico("mat", "crown_shard", 16) || "<i></i>"}Crown Shard <b>${c.crown_shard}</b><small>/ ${shards()}</small></span></div>
            <button class="menuBtn gold scForgeBtn" ${A.busy || !okG || !okS ? "disabled" : ""} onclick="gameArtsUI.forge('${esc(id)}')">⚒ FORGE RANK ${own.r + 1}</button></div></div>`;
      } else h += `<div class="scRankBox max"><b>MAX RANK</b><small>Every further copy melts into ${ri.melt} crown shards.</small></div>`;
    }
    h += `<h4 class="adCxGroup">Where it drops</h4>`;
    h += srcs.length ? `<div class="scSrc">${srcs.slice(0, 6).map(s => `<span>${ico("boss", s.who, 18)}<b>${esc(bossLabel(s.who))}</b> <small>${esc(tierLabel(s.tier))} · ${s.kind === "chest" ? "rare chest roll " : ""}${(s.p * 100).toFixed(s.p < 0.01 ? 1 : 0)}%</small></span>`).join("")}</div>
      <small class="muted">Better chests and deeper delves raise the odds. Twelve Crown boss clears without an art guarantee one.</small>` : `<p class="muted">Unknown.</p>`;
    return h + `</div>`;
  }
  function askHtml() {
    return `<div class="adAsk"><div class="adAskRune">♛</div><div class="adAskBody"><b>${esc(A.ask.title)}</b><small>${esc(A.ask.text)}</small></div>
      <div class="adAskBtns"><button class="menuBtn gold" onclick="gameArtsUI.confirmYes()">${esc(A.ask.yes)}</button><button class="menuBtn gray" onclick="gameArtsUI.confirmNo()">CANCEL</button></div></div>`;
  }
  function render() {
    const R = rec(), ids = order();
    if (!CR()) return `<div id="scArtsRoot" class="scArts"><p class="muted">The Crown Arts have not reached this town yet.</p></div>`;
    const owned = ids.filter(id => R.own[id]).length;
    return `<div id="scArtsRoot" class="scArts">
      <div class="scHero"><div class="scCrown" aria-hidden="true">♛</div><div><b>THE CROWN ARTS</b>
        <small>Abilities torn from the Sundered Crown's champions. Two ride with you into every dungeon: <kbd>F</kbd> and <kbd>C</kbd>.</small></div>
        <span class="scHave"><b>${owned}</b>/${ids.length} found</span>
        <span class="adMat" style="--mc:#fde047">${ico("mat", "crown_shard", 16) || "<i></i>"}Crown Shards <b>${shards().toLocaleString()}</b></span></div>
      ${A.ask ? askHtml() : A.flash ? `<div class="adFlash ${esc(A.flash.kind)}">${A.flash.html}</div>` : ""}
      <div class="scSlots">${slotHtml(0, R)}${slotHtml(1, R)}</div>
      <div class="scMain"><div class="scGrid">${ids.map(id => cardHtml(id, R)).join("")}</div>${detailHtml(R)}</div>
      <div class="flexRow"><button class="menuBtn gray" onclick="window.gameGear&&gameGear.openArmory()">← ARMORY</button>
        <button class="menuBtn gray" onclick="window.gameForge&&gameForge.open()">⚒ ARCANE FORGE</button></div>
    </div>`;
  }
  // Read-only collection for the Codex tab.
  function codexHtml() {
    if (!CR()) return `<p class="muted">The Crown Arts have not reached this town yet.</p>`;
    const R = rec(), ids = order();
    return `<div class="adCxTop"><b>${ids.filter(id => R.own[id]).length}</b> of ${ids.length} Crown Arts found. <a href="#" class="adLink" onclick="gameArtsUI.open();return false;">open the Crown Arts</a></div>
      <div class="scGrid codex">${ids.map(id => cardHtml(id, R)).join("")}</div>`;
  }
  function paint() {
    const d = typeof document !== "undefined" ? document : null;
    const root = d && d.getElementById && d.getElementById("scArtsRoot");
    if (root && root.parentNode) root.outerHTML = render();
  }

  // ---------------- actions ----------------
  function open(tab) {
    if (typeof tab === "string") A.tab = tab;
    if (!A.sel) { const R = rec(); A.sel = order().find(id => R.own[id]) || order()[0] || null; }
    A.flash = null; A.ask = null;
    if (typeof W.openMenu === "function") W.openMenu("CROWN ARTS", render(), true);
    return load().then(ok => { if (ok) paint(); return ok; });
  }
  function pick(id) { if (def(id)) { A.sel = id; A.flash = null; paint(); } }
  function slotClick(i) { const R = rec(); if (A.sel && R.own[A.sel] && R.eq[i] !== A.sel) return equip(A.sel, i); }
  function dragStart(ev, id) { A.drag = id; try { ev.dataTransfer.setData("text/plain", id); ev.dataTransfer.effectAllowed = "move"; } catch (e) {} }
  function drop(ev, i) {
    try { ev.preventDefault(); } catch (e) {}
    let id = A.drag; try { id = (ev.dataTransfer && ev.dataTransfer.getData("text/plain")) || id; } catch (e) {}
    A.drag = null;
    if (id && rec().own[id]) return equip(id, i);
  }
  async function equip(id, slot) {
    if (A.busy) return null;
    A.busy = true;
    try {
      const res = await call({ action: "equip", art: id || null, slot: slot | 0 });
      adopt(res);
      A.flash = { kind: "success", html: id ? `<b>${esc(def(id).name)}</b> answers to <kbd>${slot ? "C" : "F"}</kbd>.` : "Slot cleared." };
      return res;
    } catch (e) { toastT(e.message || String(e), 3500); return null; }
    finally { A.busy = false; paint(); }
  }
  function forge(id) {
    const own = rec().own[id], a = def(id);
    if (!own || !a) return null;
    const c = rankInfo(id, own).forge;
    if (!c) return null;
    A.ask = { title: `Forge ${a.name} to rank ${own.r + 1}?`, text: `Costs ${money(c.gold)} and ${c.crown_shard} crown shards. Duplicates you already hold are kept.`, yes: "⚒ FORGE",
      fn: () => doForge(id) };
    A.flash = null; paint();
    return A.ask;
  }
  async function doForge(id) {
    const now = Date.now();
    if (A.busy || now - A.lastForge < 300) return null;
    A.busy = true; A.lastForge = now;
    const before = (rec().own[id] || {}).r | 0;
    try {
      const res = await call({ action: "forge", art: id });
      adopt(res);
      const r = (rec().own[id] || {}).r | 0 || before + 1;
      A.flash = { kind: "ascend", html: `<b>RANK ${r}</b> — ${esc(def(id).name)} burns brighter.` };
      return res;
    } catch (e) { A.flash = null; toastT(e.message || String(e), 4000); return null; }
    finally { A.busy = false; paint(); }
  }
  function confirmYes() { const q = A.ask; A.ask = null; return q ? q.fn() : null; }
  function confirmNo() { A.ask = null; paint(); }

  // Push after a settle: event:'arts' kind:'granted' {arts:[{id, result, rank, shards}]}.
  function onGranted(list) {
    if (!Array.isArray(list) || !list.length) return;
    const R = norm(rec());
    for (const g of list) {
      if (!g || !def(g.id)) continue;
      if (g.result === "melt") { A.shards = shards() + (g.shards | 0); continue; }
      const o = R.own[g.id] || (R.own[g.id] = { r: 1, d: 0, at: Date.now() });
      if (g.result === "rank" || g.result === "new") { o.r = Math.max(o.r, g.rank | 0 || 1); if (g.result === "rank") o.d = 0; }
      else if (g.result === "dupe") o.d += 1;
    }
    A.rec = R;
    load().then(() => paint());
    paint();
  }
  if (W.NET && typeof W.NET.on === "function") W.NET.on("arts", (m) => { if (m && m.kind === "granted") onGranted(m.arts); });

  W.gameArtsUI = {
    open, render, codexHtml, pick, slotClick, dragStart, drop, equip, forge, confirmYes, confirmNo, onGranted, load,
    artsForTier, sourcesOf, artLines, rankInfo, state: () => rec(), _state: A,
  };
})();
