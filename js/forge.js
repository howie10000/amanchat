/* FORGE — the Arcane Forge (Arcane Depths, B4b).

   Enhance (+N with a success chance and a failstack), salvage to materials,
   reforge one mod, drill / socket / unsocket gems and runes, combine gems,
   ascend Mythic -> Ancient, forge set pieces, transmute surplus materials
   up a grade (dust -> shard -> ember) and lock pieces. Every number
   shown here is a PREVIEW from ECON (js/shared/economy.js); the server's
   `forge` op (MASTER-PLAN §6.6) rolls and charges for real, and its reply
   ({item?, items?, mats, gems, money, removed?, result?}) is what sticks. */
(function () {
  "use strict";
  const U = () => gameGear.ui;
  const esc = (s) => U().esc(s);
  const money = (n) => U().money(n);

  const F = {
    tab: "enhance", pick: null, mats: null, gems: null, mods: {}, sel: new Set(), modIdx: 0,
    busy: false, flash: null, craftSet: null, craftSlot: "weapon", gemPick: {}, ask: null,
    tm: { shard: 1, ember: 1 },
  };
  const TABS = [
    ["enhance", "ENHANCE", "✦"], ["reforge", "REFORGE", "↻"], ["sockets", "SOCKETS", "◆"], ["gems", "GEMS", "❖"],
    ["ascend", "ASCEND", "▲"], ["craft", "SET FORGING", "⛨"], ["transmute", "TRANSMUTE", "⇪"], ["salvage", "SALVAGE", "♺"],
  ];

  // ---------------- network ----------------
  // net.js exposes one wrapper per op; `netForge` arrives with the server op.
  function call(msg) {
    if (typeof window.netForge === "function") return window.netForge(msg);
    return Promise.reject(new Error("The Arcane Forge is still being built. Check back after the update."));
  }
  async function loadStatus() {
    try {
      const res = await call({ action: "status" });
      if (res && res.mats) F.mats = res.mats;
      if (res && res.gems) F.gems = res.gems;
      if (res && res.costs && typeof res.costs === "object") F.mods = Object.assign({}, res.costs);
      return true;
    } catch (e) { return false; }
  }

  // ---------------- data ----------------
  const view = () => gameGear.view();
  const mats = () => F.mats || gameGear.mats() || {};
  const gems = () => F.gems || gameGear.gems() || {};
  // core.js declares `const state` — a script-scope global, NOT a window
  // property — so it must be reached by its bare name (window.state is undefined).
  const ST = () => (typeof state !== "undefined" ? state : null);
  const haveMoney = () => { const s = ST(); return (s && s.data && +s.data.money) || 0; };
  function items() { return Object.values(view().gear || {}).filter(Boolean); }
  function wornIds() { return new Set(Object.values(view().equipped || {})); }
  function item(id) { return (view().gear || {})[id] || null; }
  // Perk / research modifiers. The server may send them with `status.costs`;
  // otherwise the Delver perks we know about are applied (research is the
  // server's to add — the reply's `result` shows the real number).
  function mods() {
    const cached = window.gameCodex && gameCodex.cached ? gameCodex.cached() : null;
    let rank = cached && cached.rank;
    const s = ST();
    if (!rank && s && s.data && s.data.delve) rank = ECON.delverRank(s.data.delve.xp).rank;
    const pv = ECON.delverPerkValues(rank || 1);
    return Object.assign({ enhanceGoldMult: pv.enhanceGoldMult, failstackBonus: pv.failstackBonus, enhanceChanceBonus: 0,
      gemGoldMult: pv.gemGoldMult, salvageMult: pv.salvageMult }, F.mods || {});
  }

  // ---------------- cost helpers ----------------
  function have(key) {
    if (key === "gold") return haveMoney();
    return +mats()[key] || 0;
  }
  function costRows(cost) {
    if (!cost) return [];
    const rows = [];
    if (cost.gold) rows.push({ key: "gold", label: "Gold", need: cost.gold, have: haveMoney(), color: "#fbbf24", ico: "<i></i>" });
    for (const k of ["dust", "shard", "ember"]) if (cost[k]) rows.push({ key: k, label: U().matName(k), need: cost[k], have: have(k), color: U().matColor(k) });
    if (cost.sigil && cost.sigil.id && cost.sigil.n) rows.push({ key: cost.sigil.id, label: U().matName(cost.sigil.id), need: cost.sigil.n, have: have(cost.sigil.id), color: U().matColor(cost.sigil.id) });
    return rows;
  }
  function affordable(cost) { return costRows(cost).every(r => r.have >= r.need); }
  function costHtml(cost) {
    const rows = costRows(cost);
    if (!rows.length) return `<div class="adCost"><span class="ok">Free</span></div>`;
    return `<div class="adCost">${rows.map(r => `<span class="${r.have >= r.need ? "ok" : "short"}" style="--mc:${r.color}">${r.ico || U().matIco(r.key)}${esc(r.label)} <b>${r.key === "gold" ? money(r.need) : r.need.toLocaleString()}</b><small>/ ${r.key === "gold" ? money(r.have) : r.have.toLocaleString()}</small></span>`).join("")}</div>`;
  }

  // ---------------- rendering ----------------
  function walletHtml() {
    const m = mats();
    const order = ["dust", "shard", "ember", "gilded_key"];
    const sig = Object.keys(m).filter(k => /^sigil_/.test(k) && m[k] > 0).sort();
    const gemN = Object.values(gems()).reduce((s, n) => s + (+n || 0), 0);
    return `<div class="adWallet adForgeWallet">
      <span class="adMat" style="--mc:#fbbf24"><i></i>Gold <b>${money(haveMoney())}</b></span>
      ${order.map(k => `<span class="adMat${m[k] ? "" : " zero"}" style="--mc:${U().matColor(k)}">${U().matIco(k)}${esc(U().matName(k))} <b>${(+m[k] || 0).toLocaleString()}</b></span>`).join("")}
      ${sig.map(k => `<span class="adMat sig" style="--mc:${U().matColor(k)}">${U().matIco(k)}${esc(U().matName(k))} <b>${m[k]}</b></span>`).join("")}
      <span class="adMat" style="--mc:#f472b6"><i></i>Gems <b>${gemN}</b></span>
    </div>`;
  }
  function tabsHtml() {
    return `<div class="adForgeTabs">${TABS.map(([id, label, ico]) =>
      `<button class="adFTab ${F.tab === id ? "on" : ""}" onclick="gameForge.tab('${id}')"><span>${ico}</span>${label}</button>`).join("")}</div>`;
  }
  function pickFilter(tab) {
    const worn = wornIds();
    if (tab === "salvage") return (it) => !worn.has(it.id) && !it.lock;
    if (tab === "reforge") return (it) => !ECON.isTome(it) && (it.mods || []).some(m => m.k !== "resonance");
    if (tab === "ascend") return (it) => !ECON.isTome(it) && it.rarity === "mythic";
    return (it) => !ECON.isTome(it);
  }
  function pickRow(it, on, multi) {
    const r = U().rar(it.rarity), slot = ECON.GEAR_SLOT_INFO[it.slot] || { emoji: "" };
    const worn = wornIds().has(it.id);
    const click = multi ? `gameForge.toggleSel('${esc(it.id)}')` : `gameForge.pick('${esc(it.id)}')`;
    return `<button class="adPick adR-${esc(it.rarity)} ${on ? "on" : ""}" style="--rc:${r.color}" onclick="${click}">
      ${multi ? `<span class="adChk">${on ? "☑" : "☐"}</span>` : ""}
      <span class="adPickIco">${U().icon("gear", it, 24, "", slot.emoji)}</span>
      <span class="adPickName">${esc(ECON.gearName(it))}</span>
      <span class="adPickTag">${r.label}${worn ? " · worn" : ""}${it.lock ? " · 🔒" : ""}</span>
    </button>`;
  }
  function pickerHtml(multi) {
    const list = items().filter(pickFilter(F.tab))
      .sort((a, b) => (U().rarIdx(b.rarity) - U().rarIdx(a.rarity)) || ((b.lvl | 0) - (a.lvl | 0)) || ((b.plus | 0) - (a.plus | 0)));
    if (!list.length) {
      const why = { reforge: "Nothing with a mod to reforge. Epic and better pieces carry mods.", ascend: "Only Mythic pieces can ascend.",
        salvage: "Nothing loose and unlocked to salvage." }[F.tab] || "Your pack is empty.";
      return `<div class="adForgePick"><p class="muted">${why}</p></div>`;
    }
    return `<div class="adForgePick">${list.map(it => pickRow(it, multi ? F.sel.has(it.id) : F.pick === it.id, multi)).join("")}</div>`;
  }
  // In-UI confirmation. Native confirm() looked out of place and some webviews
  // suppress it silently, which made salvage/ascend do nothing.
  function askHtml() {
    return `<div class="adAsk"><div class="adAskRune">⚠</div><div class="adAskBody"><b>${esc(F.ask.title)}</b><small>${esc(F.ask.text)}</small></div>
      <div class="adAskBtns"><button class="menuBtn ${F.ask.danger ? "red" : "gold"}" onclick="gameForge.confirmYes()">${esc(F.ask.yes || "CONFIRM")}</button>
      <button class="menuBtn gray" onclick="gameForge.confirmNo()">CANCEL</button></div></div>`;
  }
  function ask(title, text, yes, danger, fn) { F.ask = { title, text, yes, danger, fn }; F.flash = null; paint(); return F.ask; }
  function confirmYes() { const a = F.ask; F.ask = null; return a ? a.fn() : null; }
  function confirmNo() { F.ask = null; paint(); }
  function flashHtml() {
    if (F.ask) return askHtml();
    if (!F.flash) return "";
    return `<div class="adFlash ${F.flash.kind}">${F.flash.html}</div>`;
  }
  function mini(it) { return U().isV2(it) ? U().card(it, { compact: true, actions: false }) : U().legacyRow(it, { worn: true }).replace(/<div class="flexRow">[\s\S]*<\/div><\/div>$/, "</div>"); }

  function enhanceBench(it) {
    const n = ECON.normGear(it);
    const max = ECON.ENHANCE_MAX[n.rarity] || 5;
    const md = mods();
    if (n.plus >= max) {
      return `<div class="adBench">${mini(it)}<div class="adBenchInfo"><div class="adPlusJump maxed">+${n.plus}<small>MAX</small></div>
        <p class="muted">This piece is at its limit. ${U().rarIdx(n.rarity) < 6 ? "Only Ancient and Arcane pieces go to +12." : ""}</p></div></div>`;
    }
    const chance = ECON.enhanceChance(n, { bonus: md.enhanceChanceBonus, failstackBonus: md.failstackBonus });
    const cost = ECON.enhanceCost(n, { goldMult: md.enhanceGoldMult });
    const next = ECON.applyEnhance(n, true);
    const a = ECON.gearStats(n), b = ECON.gearStats(next);
    const perFail = 0.10 + (+md.failstackBonus || 0);
    const pct = Math.round(chance * 100);
    const statPrev = ECON.GEAR_STATS.filter(s => b[s] > 0).map(s =>
      `<span style="color:${ECON.GEAR_STAT_INFO[s].color}">${a[s]} → <b>${b[s]}</b> ${ECON.GEAR_STAT_INFO[s].short}</span>`).join("");
    const fsPips = Array.from({ length: Math.min(10, n.fs) }, () => "<i></i>").join("");
    return `<div class="adBench adEnh ${F.flash ? "fx-" + F.flash.kind : ""}">
      <div class="adAnvil">${mini(it)}<div class="adSparks"></div></div>
      <div class="adBenchInfo">
        <div class="adPlusJump">+${n.plus}<span>→</span>+${n.plus + 1}</div>
        <div class="adChance ${pct >= 100 ? "sure" : pct < 50 ? "risky" : ""}" style="--p:${pct}"><b>${pct}%</b><small>success</small></div>
        <div class="adFs">Failstack <b>${n.fs}</b> <span class="adFsPips">${fsPips}</span> <small class="muted">(+${Math.round(perFail * 100)}% chance per failure)</small></div>
        <div class="adStatPrev">${statPrev}</div>
        ${costHtml(cost)}
        <button class="menuBtn gold adStrike" ${F.busy || !affordable(cost) ? "disabled" : ""} onclick="gameForge.enhance()">⚒ STRIKE</button>
        <p class="muted adNote">A failed strike never breaks or downgrades the piece. It adds to the failstack, and the next strike is likelier to land.</p>
      </div></div>`;
  }
  function reforgeBench(it) {
    const n = ECON.normGear(it);
    const list = n.mods.map((m, i) => {
      const fixed = m.k === "resonance";
      return `<label class="adModPick ${F.modIdx === i ? "on" : ""} ${fixed ? "fixed" : ""}">
        <input type="radio" name="adMod" ${F.modIdx === i ? "checked" : ""} ${fixed ? "disabled" : ""} onclick="gameForge.setMod(${i})"/>
        ${esc(U().modText(m))}${fixed ? " <small>(fixed)</small>" : ""}${F.flash && F.flash.modIdx === i ? ` <span class="adNew">NEW</span>` : ""}</label>`;
    }).join("");
    const cost = ECON.reforgeCost(n);
    const ok = n.mods[F.modIdx] && n.mods[F.modIdx].k !== "resonance";
    return `<div class="adBench ${F.flash ? "fx-" + F.flash.kind : ""}">${mini(it)}<div class="adBenchInfo">
      <p>Pick one mod to reroll. The others stay exactly as they are. Each reforge of the same piece costs more.</p>
      <div class="adModList">${list}</div>
      ${costHtml(cost)}
      <button class="menuBtn gold" ${F.busy || !ok || !affordable(cost) ? "disabled" : ""} onclick="gameForge.reforge()">↻ REFORGE</button>
      <small class="muted">Reforged ${n.rr} time${n.rr === 1 ? "" : "s"}.</small>
    </div></div>`;
  }
  function gemOptions(n, allowRune) {
    const g = gems();
    return Object.keys(g).filter(k => g[k] > 0).sort().map(k => {
      const info = U().gem(k);
      if (!info) return "";
      const dis = info.rune && !allowRune;
      return `<option value="${esc(k)}" ${dis ? "disabled" : ""}>${esc(info.name)} (${g[k]}) — ${esc(info.eff)}${dis ? " · one rune per piece" : ""}</option>`;
    }).join("");
  }
  function socketBench(it) {
    const n = ECON.normGear(it);
    const hasRune = n.gems.some(x => { const p = ECON.parseGem(x); return p && p.rune; });
    let slots = "";
    for (let i = 0; i < n.sockets; i++) {
      const gid = n.gems[i];
      if (gid) {
        const info = U().gem(gid), c = ECON.unsocketCost(gid);
        slots += `<div class="adSlotRow">${U().gemPip(gid)} <b>${esc(info ? info.name : gid)}</b> <small>${esc(info ? info.eff : "")}</small>
          <button class="menuBtn gray" ${F.busy || haveMoney() < c.gold ? "disabled" : ""} onclick="gameForge.unsocket(${i})">REMOVE ${money(c.gold)}</button></div>`;
      } else {
        const opts = gemOptions(n, !hasRune);
        slots += `<div class="adSlotRow">${U().gemPip(null)} <b class="muted">Empty socket</b>
          ${opts ? `<select class="menuInput" id="adGemSel${i}">${opts}</select>
          <button class="menuBtn green" ${F.busy ? "disabled" : ""} onclick="gameForge.socket(${i})">SET</button>` : `<small class="muted">No gems in your wallet — they drop from boss chests and champions.</small>`}</div>`;
      }
    }
    const drill = ECON.socketDrillCost();
    return `<div class="adBench ${F.flash ? "fx-" + F.flash.kind : ""}">${mini(it)}<div class="adBenchInfo">
      <p>Socketing is free. Removing a gem returns it to your wallet for a fee.</p>
      ${n.sockets ? `<div class="adSlots">${slots}</div>` : `<p class="muted">This piece has no sockets. Legendary and Mythic pieces carry one, Ancient and Arcane two.</p>`}
      ${it.drilled ? `<small class="muted">Already drilled (+1 socket).</small>` : `<div class="adDrill"><b>Socket Drill</b> — add one socket, once per piece.
        ${costHtml(drill)}<button class="menuBtn gold" ${F.busy || !affordable(drill) ? "disabled" : ""} onclick="gameForge.drill()">DRILL</button></div>`}
    </div></div>`;
  }
  function gemsBench() {
    const g = gems(), md = mods();
    const ids = Object.keys(g).filter(k => g[k] > 0).sort((a, b) => {
      const pa = ECON.parseGem(a) || {}, pb = ECON.parseGem(b) || {};
      return String(pa.type).localeCompare(String(pb.type)) || (pa.grade - pb.grade);
    });
    if (!ids.length) return `<p class="muted">Your gem wallet is empty. Gems drop from boss chests, champions, goblins and vault chests; runes only from delve 5 and deeper.</p>`;
    return `<p>Three gems of one grade fuse into one of the next grade (up to V). Runes do not combine.</p>
      <div class="adGemGrid">${ids.map(k => {
        const info = U().gem(k);
        if (!info) return "";
        const can = !info.rune && info.grade < ECON.GEM_MAX_GRADE && g[k] >= 3;
        const cost = ECON.gemCombineCost(info.grade, { goldMult: md.gemGoldMult });
        return `<div class="adGemRow" style="--g:${info.color}">${U().gemPip(k)}<div><b>${esc(info.name)}</b> <span class="adCount">×${g[k]}</span><br/><small>${esc(info.eff)}</small></div>
          ${can ? `<div class="adGemAct">${costHtml({ gold: cost.gold, dust: cost.dust })}<button class="menuBtn gold" ${F.busy || !affordable(cost) ? "disabled" : ""} onclick="gameForge.combine('${esc(k)}')">FUSE 3 → 1</button></div>`
            : `<small class="muted">${info.rune ? "rune" : info.grade >= ECON.GEM_MAX_GRADE ? "max grade" : "need 3 to fuse"}</small>`}</div>`;
      }).join("")}</div>`;
  }
  function ascendBench(it) {
    const n = ECON.normGear(it);
    let preview = null;
    try { preview = ECON.ascendItem(n, () => 0.5); } catch (e) { preview = null; }
    const cost = ECON.ascendCost(n);
    const a = ECON.gearStats(n), b = preview ? ECON.gearStats(preview) : a;
    return `<div class="adBench adAscend ${F.flash ? "fx-" + F.flash.kind : ""}">${mini(it)}<div class="adBenchInfo">
      <div class="adAscArrow"><span class="adR-mythic" style="--rc:${U().rar("mythic").color}">MYTHIC</span> ▲ <span class="adR-ancient" style="--rc:${U().rar("ancient").color}">ANCIENT</span></div>
      <p>The same roll, re-poured at Ancient power. Its +${n.plus}, mods and gems are kept; it gains a mod and a second socket, and it can be enhanced to +12.</p>
      <div class="adStatPrev">${ECON.GEAR_STATS.filter(s => b[s] > 0).map(s => `<span style="color:${ECON.GEAR_STAT_INFO[s].color}">${a[s]} → <b>${b[s]}</b> ${ECON.GEAR_STAT_INFO[s].short}</span>`).join("")}
        <span>+1 random mod</span></div>
      ${costHtml(cost)}
      <button class="menuBtn gold adAscBtn" ${F.busy || !affordable(cost) ? "disabled" : ""} onclick="gameForge.ascend()">▲ ASCEND</button>
    </div></div>`;
  }
  function craftBench() {
    const sets = Object.keys(ECON.GEAR_SETS);
    if (!F.craftSet || !ECON.GEAR_SETS[F.craftSet]) F.craftSet = sets[0];
    const s = ECON.GEAR_SETS[F.craftSet];
    const cost = ECON.craftSetCost(F.craftSet);
    const idx = ECON.SET_SLOTS.indexOf(F.craftSlot);
    let preview = null;
    try { preview = ECON.makeSetPiece(F.craftSet, F.craftSlot, "legendary", () => 0.5, { id: "preview", now: 0 }); } catch (e) { preview = null; }
    return `<p>Forge a missing set piece from its boss's sigils. It comes out Legendary (80%) or Mythic (20%).</p>
      <div class="adIChips">${sets.map(id => `<button class="adRChip ${id === F.craftSet ? "on" : ""}" onclick="gameForge.craftPick('${id}')">${esc(ECON.GEAR_SETS[id].name)}</button>`).join("")}</div>
      <div class="adIChips">${ECON.SET_SLOTS.map((sl, i) => `<button class="adRChip ${sl === F.craftSlot ? "on" : ""}" onclick="gameForge.craftPick(null,'${sl}')">${ECON.GEAR_SLOT_INFO[sl].emoji} ${esc(s.names[i])}</button>`).join("")}</div>
      <div class="adBench ${F.flash ? "fx-" + F.flash.kind : ""}">${preview ? `<div class="adExample"><span class="adExTag" title="The real affix is rolled when you forge">EXAMPLE ROLL</span>${U().card(preview, { compact: true, actions: false, reveal: true })}</div>` : ""}
        <div class="adBenchInfo">${U().setBox(F.craftSet, F.craftSlot)}
        <p class="muted">${esc(s.names[idx] || "")} · iLvl ${s.lvl} · ${esc(U().bossName(s.boss))}</p>
        ${costHtml(cost)}
        <button class="menuBtn gold" ${F.busy || !affordable(cost) ? "disabled" : ""} onclick="gameForge.craft()">⛨ FORGE IT</button></div></div>`;
  }
  // Transmute (QA-ECONOMY P5): the lossy material sink. Rates come from
  // ECON.TRANSMUTE (250 dust -> 1 shard, 100 shards -> 1 ember, plus gold).
  function tmRecipes() { return ECON.TRANSMUTE || {}; }
  function tmMax() { return ECON.TRANSMUTE_MAX || 50; }
  function tmClamp(n) { n = Math.floor(+n || 0); return Math.max(1, Math.min(tmMax(), n)); }
  // How many the wallet covers right now (at least 1, so the row still shows a price).
  function tmAffordable(to) {
    const r = tmRecipes()[to];
    if (!r) return 0;
    const byMat = Math.floor(have(r.from) / r.n), byGold = r.gold ? Math.floor(haveMoney() / r.gold) : Infinity;
    return Math.max(0, Math.min(tmMax(), byMat, byGold));
  }
  function transmuteBench() {
    const R = tmRecipes();
    const rows = Object.keys(R).map(to => {
      const r = R[to], n = tmClamp(F.tm[to]);
      const t = ECON.transmuteCost ? ECON.transmuteCost(to, n) : null;
      const cost = t ? t.cost : { gold: r.gold * n, [r.from]: r.n * n };
      const can = tmAffordable(to);
      return `<div class="adTmRow" style="--mc:${U().matColor(to)}">
        <div class="adTmRecipe">${U().matIco(r.from)}<b>${r.n.toLocaleString()} ${esc(U().matName(r.from))}</b>${r.gold ? ` + ${money(r.gold)}` : ""} → ${U().matIco(to)}<b>1 ${esc(U().matName(to))}</b></div>
        <div class="adTmCtl"><label>Make <input type="number" id="adTm_${to}" min="1" max="${tmMax()}" value="${n}" onchange="gameForge.tmCount('${to}', this.value)" oninput="gameForge.tmCount('${to}', this.value, true)"/></label>
          <button class="menuBtn gray" ${can > 0 ? "" : "disabled"} onclick="gameForge.tmCount('${to}', ${Math.max(1, can)})">MAX (${can})</button></div>
        ${costHtml(cost)}
        <button class="menuBtn gold" ${F.busy || !affordable(cost) ? "disabled" : ""} onclick="gameForge.transmute('${to}')">⇪ TRANSMUTE ×${n}</button>
      </div>`;
    }).join("");
    return `<p>Turn surplus materials into the next grade up. It is lossy on purpose — a sink for what you have too much of. Up to ${tmMax()} at a time.</p>
      <div class="adTmGrid">${rows || `<p class="muted">Nothing can be transmuted yet.</p>`}</div>`;
  }
  function salvageBench() {
    const md = mods();
    const sel = [...F.sel].map(item).filter(Boolean);
    let yMats = {}, yGems = {};
    for (const it of sel) {
      const y = ECON.salvageYield(it, { mult: md.salvageMult });
      yMats = ECON.mergeMats(yMats, y.mats); yGems = ECON.mergeMats(yGems, y.gems);
    }
    const yl = Object.keys(yMats).map(k => `<span class="adMat" style="--mc:${U().matColor(k)}">${U().matIco(k)}${esc(U().matName(k))} <b>+${yMats[k]}</b></span>`)
      .concat(Object.keys(yGems).map(k => { const g = U().gem(k); return `<span class="adMat" style="--mc:${g ? g.color : "#fff"}">${U().icon("gem", k, 16, "", "<i></i>")}${esc(g ? g.name : k)} <b>+${yGems[k]}</b></span>`; })).join("");
    const junk = items().filter(it => !wornIds().has(it.id) && !it.lock && U().isJunk(it));
    return `<p>Break pieces down into materials. Socketed gems come back, and so does half of what you spent enhancing them. Locked and worn pieces are safe.</p>
      <div class="adSalvBar">
        <button class="menuBtn gray" onclick="gameForge.selectJunk()">SELECT JUNK (${junk.length})</button>
        <button class="menuBtn gray" onclick="gameForge.clearSel()">CLEAR</button>
        <button class="menuBtn gray" ${F.busy ? "disabled" : ""} onclick="gameForge.salvageJunk()">SALVAGE ALL JUNK</button>
      </div>
      <div class="adYield">${sel.length ? `<b>${sel.length} selected →</b> ${yl || `<span class="muted">nothing</span>`}` : `<span class="muted">Tick pieces below to see what they break into.</span>`}</div>
      <button class="menuBtn red" ${F.busy || !sel.length ? "disabled" : ""} onclick="gameForge.salvageSelected()">♺ SALVAGE ${sel.length || ""}</button>`;
  }

  function render() {
    const needsPick = ["enhance", "reforge", "sockets", "ascend"].includes(F.tab);
    let body = "";
    if (needsPick) {
      const it = F.pick && item(F.pick);
      const okPick = it && pickFilter(F.tab)(it);
      let bench = `<p class="muted adPickHint">Choose a piece.</p>`;
      if (okPick) {
        bench = F.tab === "enhance" ? enhanceBench(it) : F.tab === "reforge" ? reforgeBench(it)
          : F.tab === "sockets" ? socketBench(it) : ascendBench(it);
      }
      body = `<div class="adForgeMain">${pickerHtml(false)}<div class="adForgeBench">${flashHtml()}${bench}</div></div>`;
    } else if (F.tab === "salvage") {
      body = `<div class="adForgeMain">${pickerHtml(true)}<div class="adForgeBench">${flashHtml()}${salvageBench()}</div></div>`;
    } else if (F.tab === "gems") body = `<div class="adForgeBench wide">${flashHtml()}${gemsBench()}</div>`;
    else if (F.tab === "transmute") body = `<div class="adForgeBench wide">${flashHtml()}${transmuteBench()}</div>`;
    else body = `<div class="adForgeBench wide">${flashHtml()}${craftBench()}</div>`;
    return `<div id="adForgeRoot" class="adForge">
      <div class="adForgeHero"><div class="adForgeRune"></div><div><b>THE ARCANE FORGE</b><small>Every strike is rolled by the server. Materials cannot be sold or traded.</small></div>
        <button class="menuBtn gray" onclick="gameGear.openArmory()">← ARMORY</button></div>
      ${walletHtml()}${tabsHtml()}${body}</div>`;
  }
  function paint() {
    const root = typeof document !== "undefined" && document.getElementById && document.getElementById("adForgeRoot");
    // Closed (BACK / another menu) while a load or strike animation was in
    // flight: never re-open the Forge over whatever the player moved on to.
    if (root && root.parentNode) root.outerHTML = render();
  }

  // ---------------- actions ----------------
  function open(pieceId, tab) {
    if (typeof tab === "string" && TABS.some(t => t[0] === tab)) F.tab = tab;
    if (pieceId && item(pieceId)) {
      F.pick = pieceId;
      if (!tab && !pickFilter(F.tab)(item(pieceId))) F.tab = "enhance";
    }
    F.flash = null; F.ask = null;
    openMenu("THE ARCANE FORGE", render(), true);
    loadStatus().then(ok => { if (ok) paint(); });
  }
  function setTab(t) { F.tab = t; F.flash = null; F.ask = null; paint(); }
  function pick(id) { F.pick = id; F.flash = null; F.ask = null;F.modIdx = firstMod(item(id)); paint(); }
  function firstMod(it) { const m = (it && it.mods) || []; const i = m.findIndex(x => x.k !== "resonance"); return i < 0 ? 0 : i; }
  function setMod(i) { F.modIdx = i | 0; paint(); }
  function toggleSel(id) { if (F.sel.has(id)) F.sel.delete(id); else F.sel.add(id); paint(); }
  function clearSel() { F.sel.clear(); paint(); }
  function selectJunk() {
    for (const it of items()) if (!wornIds().has(it.id) && !it.lock && U().isJunk(it)) F.sel.add(it.id);
    paint();
  }
  function craftPick(set, slot) { if (set) F.craftSet = set; if (slot) F.craftSlot = slot; F.flash = null; paint(); }

  // Run one forge action: animate, call, fold the reply in, repaint.
  async function run(msg, onOk, animMs) {
    if (F.busy) return null;
    F.busy = true; F.flash = { kind: "working", html: "" };
    paint();
    const t0 = Date.now();
    let res = null, err = null;
    try { res = await call(msg); } catch (e) { err = e; }
    const wait = Math.max(0, (animMs || 0) - (Date.now() - t0));
    if (wait) await new Promise(r => setTimeout(r, wait));
    F.busy = false;
    if (err) { F.flash = null; paint(); toast(esc(err.message || String(err)), 4000); return null; }
    if (res) {
      if (res.mats) F.mats = res.mats;
      if (res.gems) F.gems = res.gems;
      gameGear.adoptChanges(res);
    }
    try { onOk && onOk(res || {}); } catch (e) { /* display only */ }
    paint();
    return res;
  }
  function enhance() {
    const it = item(F.pick);
    if (!it) return;
    const from = it.plus | 0;
    return run({ action: "enhance", piece: it.id }, (res) => {
      const r = res.result || {};
      const now = res.item || item(it.id) || it;
      const ok = r.success != null ? !!r.success : (now.plus | 0) > from;
      F.flash = ok
        ? { kind: "success", html: `<b>SUCCESS</b> — ${esc(ECON.gearName(Object.assign({}, now, { plus: 0 })))} rises to <b>+${now.plus | 0}</b>.` }
        : { kind: "fail", html: `<b>The strike glances off.</b> Failstack ${now.fs | 0}. The next one is likelier.` };
    }, 900);
  }
  function reforge() {
    const it = item(F.pick), i = F.modIdx;
    if (!it) return;
    return run({ action: "reforge", piece: it.id, index: i }, (res) => {
      const now = res.item || item(it.id);
      const m = now && now.mods && now.mods[i];
      F.flash = { kind: "success", modIdx: i, html: m ? `New mod: <b>${esc(U().modText(m))}</b>` : "Reforged." };
    }, 700);
  }
  function drill() {
    const it = item(F.pick);
    if (!it) return;
    return run({ action: "socket_drill", piece: it.id }, () => { F.flash = { kind: "success", html: "<b>A new socket opens.</b>" }; }, 700);
  }
  function socket(slotIdx) {
    const it = item(F.pick);
    const sel = typeof document !== "undefined" && document.getElementById && document.getElementById("adGemSel" + slotIdx);
    const gem = sel && sel.value;
    if (!it || !gem) return;
    return run({ action: "socket", piece: it.id, gem, slotIdx }, () => {
      const g = U().gem(gem);
      F.flash = { kind: "success", html: `Set <b>${esc(g ? g.name : gem)}</b>.` };
    }, 450);
  }
  function unsocket(slotIdx) {
    const it = item(F.pick);
    if (!it) return;
    return run({ action: "unsocket", piece: it.id, slotIdx }, () => { F.flash = { kind: "success", html: "The gem is back in your wallet." }; }, 400);
  }
  function combine(gem) {
    return run({ action: "gem_combine", gem, times: 1 }, () => {
      const p = ECON.parseGem(gem);
      const g = p && U().gem(ECON.gemId(p.type, p.grade + 1));
      F.flash = { kind: "success", html: `Fused: <b>${esc(g ? g.name : "a finer gem")}</b>.` };
    }, 600);
  }
  function ascend() {
    const it = item(F.pick);
    if (!it) return;
    return ask("Ascend to Ancient?", `${ECON.gearName(it)} will be re-poured at Ancient power. The materials are consumed.`, "▲ ASCEND", false,
      () => run({ action: "ascend", piece: it.id }, (res) => {
        const now = res.item || item(it.id);
        F.flash = { kind: "ascend", html: `<b>ANCIENT</b> — ${esc(ECON.gearName(now || it))} remembers what it was.` };
        if (now && window.gameLootReveal && gameLootReveal.show && now.rarity === "ancient") gameLootReveal.show({ loot: [now] }, { source: "forge", chestTier: 3 });
      }, 1400));
  }
  function craft() {
    return run({ action: "craft_set", set: F.craftSet, slot: F.craftSlot }, (res) => {
      const now = res.item || (res.items && res.items[0]);
      F.flash = { kind: "success", html: now ? `Forged <b>${esc(ECON.gearName(now))}</b> (${U().rar(now.rarity).label}).` : "Forged." };
      if (now && window.gameLootReveal && gameLootReveal.show) gameLootReveal.show({ loot: [now] }, { source: "forge", chestTier: 2 });
    }, 900);
  }
  function salvageSelected() {
    const ids = [...F.sel].filter(id => item(id));
    if (!ids.length) return;
    return ask(`Salvage ${ids.length} piece${ids.length === 1 ? "" : "s"}?`, "They break into materials and are gone for good.", "♺ SALVAGE", true,
      () => run({ action: "salvage", pieces: ids }, (res) => {
        F.sel.clear();
        F.flash = { kind: "success", html: "Salvaged: " + yieldText(res.result && res.result.yield) };
      }, 700));
  }
  function salvageJunk() {
    return ask("Salvage all junk?", "Every loose piece worse than what you wear breaks into materials. Locked, unique and set pieces are kept.", "♺ SALVAGE ALL", true,
      () => run({ action: "salvage_junk" }, (res) => {
        F.sel.clear();
        F.flash = { kind: "success", html: "Salvaged: " + yieldText(res.result && res.result.yield) };
      }, 700));
  }
  // `quiet` (typing in the box) stores the number without repainting, so the
  // caret is not thrown out of the field mid-keystroke.
  function tmCount(to, n, quiet) {
    if (!tmRecipes()[to]) return;
    F.tm[to] = tmClamp(n);
    if (!quiet) { F.flash = null; paint(); }
  }
  function transmute(to) {
    if (!tmRecipes()[to]) return;
    const n = tmClamp(F.tm[to]);
    return run({ action: "transmute", to, count: n }, (res) => {
      const r = res.result || {};
      const got = (r.transmuted && r.transmuted[to]) || n;
      const c = r.cost || {};
      const spent = ["dust", "shard", "ember"].filter(k => c[k] > 0).map(k => `${c[k].toLocaleString()} ${esc(U().matName(k))}`)
        .concat(c.gold ? [money(c.gold)] : []).join(" + ");
      F.flash = { kind: "success", html: `<b>TRANSMUTED</b> — +${got} ${esc(U().matName(to))}${spent ? ` <small>(${spent})</small>` : ""}.` };
    }, 600);
  }
  function yieldText(y) {
    if (!y) return "done.";
    const m = y.mats || y, g = y.gems || {};
    const parts = Object.keys(m).filter(k => typeof m[k] === "number" && m[k] > 0).map(k => `+${m[k]} ${esc(U().matName(k))}`)
      .concat(Object.keys(g).map(k => { const gi = U().gem(k); return `+${g[k]} ${esc(gi ? gi.name : k)}`; }));
    return parts.length ? parts.join(", ") : "nothing of value.";
  }

  window.gameForge = {
    open, call, render, tab: setTab, pick, setMod, toggleSel, clearSel, selectJunk, craftPick,
    enhance, reforge, drill, socket, unsocket, combine, ascend, craft, salvageSelected, salvageJunk, confirmYes, confirmNo,
    transmute, tmCount,
    salvage: (ids) => { F.tab = "salvage"; F.sel = new Set(ids || []); open(null, "salvage"); },
    _state: F,
  };
})();
