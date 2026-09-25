/* GEAR — dungeon loot, the Armory in the Adventurers Guild, and the three
   numbers a set of equipment is worth in a fight.

   The server rolls every drop, owns every piece and prices every sale (see
   docs/SERVER-AUTHORITY.md). This file only ever asks it to equip, unequip or
   sell something by id, and caches the answer so combat.js can read the totals
   without a round-trip on every swing.

   ARCANE DEPTHS (Armory v2): v2 items (`v >= 2`) get the full item card —
   eight rarities, mods, uniques, sets, sockets, +N, locks and a compare panel.
   Legacy items (no `v`) and tomes keep the exact card they always had. The
   shared card helpers live on `gameGear.ui` so forge.js / codex.js /
   loot-reveal.js draw items the same way. */

let gearView = { gear: {}, equipped: {}, totals: { atk: 0, def: 0, vit: 0 }, packMax: ECON.GEAR_PACK_MAX, packUsed: 0,
  fx: null, sets: {}, overflow: [], mats: {}, gems: {} };

function gEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const gMoney = (n) => "$" + Math.max(0, Math.floor(+n || 0)).toLocaleString();

// ---------------- what the numbers do ----------------
function totals() { return gearView.totals || { atk: 0, def: 0, vit: 0 }; }
// Multiplies everything you hit, stacked on top of combat mastery.
function attackMult() { return ECON.gearAttackMult(totals().atk); }
// Fraction of incoming damage armour eats, before it reaches your HP.
function mitigation() { return ECON.gearMitigation(totals().def); }
// Vitality is extra HP on top of the flat 100 everyone starts with.
// (maxHpPct from mods/uniques/sets is applied by the dungeon runtime, B2.)
function maxHp() { return ECON.gearMaxHp(totals().vit); }
function equippedItem(slot) {
  const id = gearView.equipped && gearView.equipped[slot];
  return (id && gearView.gear && gearView.gear[id]) || null;
}
// Every worn piece (tome included), in slot order.
function gearEquippedItems() { return ECON.GEAR_SLOTS.map(equippedItem).filter(Boolean); }
// The effects of what you have on (§6.7). The server's view wins when it sent
// one; otherwise it is recomputed from the worn pieces.
function gearFxNow() {
  if (gearView.fx && typeof gearView.fx === "object") return gearView.fx;
  try { return ECON.gearFx(gearEquippedItems()); } catch (e) { return ECON.emptyFx ? ECON.emptyFx() : {}; }
}

// ---------------- server sync ----------------
function applyView(v) {
  if (!v || typeof v !== "object") return;
  if (v.gear && typeof v.gear === "object") gearView.gear = v.gear;
  if (v.equipped && typeof v.equipped === "object") gearView.equipped = v.equipped;
  if (v.totals && typeof v.totals === "object") gearView.totals = v.totals;
  else gearView.totals = ECON.gearTotals(ECON.GEAR_SLOTS.map(equippedItem).filter(Boolean));
  if (typeof v.packUsed === "number") gearView.packUsed = v.packUsed;
  else gearView.packUsed = Object.keys(gearView.gear).length;
  if (typeof v.packMax === "number") gearView.packMax = v.packMax;
  // Arcane Depths additions (all optional; an old server sends none of them).
  if (v.fx && typeof v.fx === "object") gearView.fx = v.fx;
  else if (v.gear || v.equipped) gearView.fx = null;           // recompute from the new worn set
  if (v.sets && typeof v.sets === "object") gearView.sets = v.sets;
  else gearView.sets = ECON.setCounts ? ECON.setCounts(gearEquippedItems()) : {};
  if (Array.isArray(v.overflow)) gearView.overflow = v.overflow;
  if (v.mats && typeof v.mats === "object") gearView.mats = v.mats;
  if (v.gems && typeof v.gems === "object") gearView.gems = v.gems;
  if (state.data) {
    state.data.gear = gearView.gear; state.data.equipped = gearView.equipped;
    if (v.mats && typeof v.mats === "object") state.data.mats = gearView.mats;
    if (v.gems && typeof v.gems === "object") state.data.gems = gearView.gems;
  }
  // Vitality moves the HP ceiling, so the bar has to move with it. The duel
  // arena is left alone (it is a flat 100 each on purpose), and inside a
  // dungeon the current HP is only ever clamped down — swapping armour
  // mid-run must not be a heal.
  if (state.area !== "duel") {
    state.maxHp = maxHp();
    state.hp = state.area === "dungeon" ? Math.min(state.hp, state.maxHp) : state.maxHp;
  }
  updateHUD();
}
async function refreshGear() {
  try { applyView(await netGear({ action: "status" })); }
  catch (e) { /* offline / not authed yet — the next call retries */ }
}
// Login hands us the whole user record, so the first paint needs no round-trip.
function adoptFromRecord(data) {
  if (!data) return;
  const v = { gear: data.gear || {}, equipped: data.equipped || {} };
  if (data.mats && typeof data.mats === "object") v.mats = data.mats;
  if (data.gems && typeof data.gems === "object") v.gems = data.gems;
  if (Array.isArray(data.overflow)) v.overflow = data.overflow;
  applyView(v);
}
// A forge reply ({item?, items?, mats, gems, money, removed?}) or a loot
// result ({gear, mats, gems, overflow}) folded into the cached view.
function adoptChanges(res) {
  if (!res || typeof res !== "object") return;
  const gear = Object.assign({}, res.gear && typeof res.gear === "object" ? res.gear : gearView.gear);
  const put = (it) => { if (it && it.id) gear[it.id] = it; };
  if (!res.gear) { put(res.item); (Array.isArray(res.items) ? res.items : []).forEach(put); }
  const removed = Array.isArray(res.removed) ? res.removed : [];
  const equipped = Object.assign({}, res.equipped || gearView.equipped);
  for (const id of removed) {
    delete gear[id];
    for (const s of Object.keys(equipped)) if (equipped[s] === id) delete equipped[s];
  }
  const v = { gear, equipped };
  for (const k of ["mats", "gems", "overflow", "packMax", "fx"]) if (res[k] != null) v[k] = res[k];
  if (typeof res.money === "number" && state.data) state.data.money = res.money;
  applyView(v);
}

// A tome is drawn differently everywhere it appears: it has no stats to
// compare, so the row shows what the thing DOES instead.
function tomeRow(item, worn) {
  const def = ECON.tomeDef(item.tome);
  if (!def) return "";
  const r = ECON.GEAR_RARITY_INFO[item.rarity] || ECON.GEAR_RARITY_INFO.legendary;
  return `<div class="gearItem" style="border-left:3px solid ${r.color}">
    <div class="info">
      <b>${adIcon("tome", item.tome, 28, "", def.emoji)} ${gEsc(def.name)}</b>
      <span class="gearTag" style="color:${r.color};border-color:${r.color}">${r.label}</span>
      <span class="muted">Tome</span><br/>
      <small style="color:${def.accent}">${gEsc(def.blurb)}</small><br/>
      <small class="muted">Press <b>R</b> in a dungeon — once per run.${worn ? " Worth " + gMoney(ECON.gearSellValue(item)) + " if sold." : ""}</small>
    </div>
    <div class="flexRow">
      ${worn
        ? `<button class="menuBtn gray" onclick="gameGear.unequip('${ECON.TOME_SLOT}')">PUT AWAY</button>`
        : `<button class="menuBtn green" onclick="gameGear.equip('${gEsc(item.id)}')">CARRY IT</button>
           <button class="menuBtn red" onclick="gameGear.sell('${gEsc(item.id)}')">SELL ${gMoney(ECON.gearSellValue(item))}</button>`}
    </div></div>`;
}

// A dungeon just paid out. `loot` is whatever the server decided dropped.
function announceLoot(loot, gear) {
  if (gear && typeof gear === "object") { gearView.gear = gear; applyView({ gear }); }
  if (!Array.isArray(loot) || !loot.length) return;
  for (const it of loot) {
    const r = ECON.GEAR_RARITY_INFO[it.rarity] || ECON.GEAR_RARITY_INFO.fine;
    if (ECON.isTome(it)) {
      const def = ECON.tomeDef(it.tome);
      toast(`<b style="color:${r.color}">${r.label}</b> — <b>${def.emoji} ${gEsc(def.name)}</b> was in the chest. ${gEsc(def.blurb)} Carry it at the Armory and press R in a dungeon.`, 11000);
      continue;
    }
    toast(`<b style="color:${r.color}">${r.label}</b> drop — ${gEsc(ECON.gearName(it))} (${statLine(it)}). It's in your pack; the Armory is in the Adventurers Guild.`, 7000);
  }
}

// ---------------- rendering (legacy card, unchanged) ----------------
function statLine(item) {
  if (!item || !item.stats) return "";
  return ECON.GEAR_STATS
    .filter(s => item.stats[s] > 0)
    .map(s => `<span style="color:${ECON.GEAR_STAT_INFO[s].color}">+${item.stats[s]} ${ECON.GEAR_STAT_INFO[s].short}</span>`)
    .join(" · ");
}
// "worse / same / better than what you have on", so a player never has to do
// the arithmetic themselves.
function compareToWorn(item) {
  const worn = equippedItem(item.slot);
  if (!worn) return `<small style="color:#4ade80">nothing in that slot</small>`;
  if (worn.id === item.id) return `<small class="muted">equipped</small>`;
  const d = ECON.gearPower(item) - ECON.gearPower(worn);
  if (d === 0) return `<small class="muted">same as worn</small>`;
  return `<small style="color:${d > 0 ? "#4ade80" : "#f87171"}">${d > 0 ? "+" : ""}${d} vs worn</small>`;
}
function itemRow(item, opts) {
  if (ECON.isTome(item)) return tomeRow(item, !!(opts && opts.worn));
  if (adIsV2(item)) return adCard(item, opts);
  const r = ECON.GEAR_RARITY_INFO[item.rarity] || ECON.GEAR_RARITY_INFO.fine;
  const slot = ECON.GEAR_SLOT_INFO[item.slot] || { label: item.slot, emoji: "" };
  const worn = (opts && opts.worn) || false;
  return `<div class="gearItem" style="border-left:3px solid ${r.color}">
    <div class="info">
      <b>${adIcon("gear", item, 28, "", slot.emoji)} ${gEsc(ECON.gearName(item))}</b>
      <span class="gearTag" style="color:${r.color};border-color:${r.color}">${r.label}</span>
      <span class="muted">Lv ${item.lvl} ${slot.label}</span><br/>
      <small>${statLine(item)}</small><br/>
      ${worn ? `<small class="muted">worth ${gMoney(ECON.gearSellValue(item))} if sold</small>` : compareToWorn(item)}
    </div>
    <div class="flexRow">
      ${worn
        ? `<button class="menuBtn gray" onclick="gameGear.unequip('${gEsc(item.slot)}')">TAKE OFF</button>`
        : `<button class="menuBtn green" onclick="gameGear.equip('${gEsc(item.id)}')">EQUIP</button>
           <button class="menuBtn red" onclick="gameGear.sell('${gEsc(item.id)}')">SELL ${gMoney(ECON.gearSellValue(item))}</button>`}
    </div></div>`;
}

// ---------------- Armory v2: shared item-card helpers ----------------
// Painted icons from js/item-icons.js when that library is loaded; the
// fallback (emoji / CSS pip) otherwise.
function adIcon(kind, arg, size, cls, fallback) {
  const I = typeof window !== "undefined" && window.ItemIcons;
  if (I && typeof I.html === "function") {
    try { const h = I.html(kind, arg, size, "adIco" + (cls ? " " + cls : "")); if (h) return h; } catch (e) { /* fall back */ }
  }
  return fallback == null ? "" : fallback;
}
// A set piece as the painted item (silhouette when not owned/worn); slot emoji otherwise.
function adSetPieceIco(sid, slot, have, size) {
  const info = ECON.GEAR_SLOT_INFO[slot] || { emoji: "" };
  return adIcon("gear", { base: sid + "_" + slot, slot, rarity: have ? "legendary" : "worn", set: sid }, size, have ? "" : "iiSil", info.emoji);
}
function adIsV2(item) { return !!item && !ECON.isTome(item) && (item.v | 0) >= 2; }
function adRar(r) { return ECON.GEAR_RARITY_INFO[r] || ECON.GEAR_RARITY_INFO.fine; }
function adRarIdx(r) { return ECON.gearRarityIdx ? ECON.gearRarityIdx(r) : Math.max(0, ECON.GEAR_RARITIES.indexOf(r)); }
function adPct(v, digits) {
  const n = (+v || 0) * 100;
  const d = digits != null ? digits : (Math.abs(n) < 10 && Math.round(n) !== n ? 1 : 0);
  return n.toFixed(d).replace(/\.0$/, "") + "%";
}
function adTitle(id) { return String(id || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
// One rolled mod as text: "+4.3% Critical chance".
function adModText(m) {
  const def = m && ECON.GEAR_MODS[m.k];
  if (!def) return "";
  if (m.k === "resonance") return "Resonance: +5% to every other mod";
  if (m.k === "dashCd") return "-" + adPct(m.v) + " Dash cooldown";
  const effective = (m.k === "lifesteal" || m.k === "regen") ? m.v * ECON.ITEM_HEALING_MULT : m.v;
  if (!def.pct) return "+" + (Math.round((+effective || 0) * 100) / 100) + " " + def.label;
  return "+" + adPct(effective) + " " + def.label;
}
const AD_FX_LABEL = {
  crit: "Critical chance", critDmg: "Critical damage", bossDmg: "Damage to bosses", eliteDmg: "Damage to elites",
  execute: "Damage to wounded (<30%)", lifesteal: "Lifesteal", thorns: "Thorns", maxHpPct: "Max HP",
  moveSpeed: "Move speed", dashDist: "Dash distance", magicFind: "Magic find", matFind: "Material find",
  defPct: "Defence", atkPct: "Attack", critIgnite: "Crits ignite for extra damage",
};
// Human lines for any fx object (unique signature, set bonus, rune, totals).
function adFxLines(fx, effective = false) {
  const out = [];
  if (!fx || typeof fx !== "object") return out;
  for (const k of Object.keys(fx)) {
    const v = !effective && (k === "lifesteal" || k === "regen") ? fx[k] * ECON.ITEM_HEALING_MULT : fx[k];
    if (v == null || v === 0 || k === "sets") continue;
    if (AD_FX_LABEL[k] && typeof v === "number") out.push("+" + adPct(v) + " " + AD_FX_LABEL[k]);
    else if (k === "regen" && typeof v === "number") out.push("+" + (Math.round(v * 10) / 10) + " HP regen /s");
    else if (k === "dashCd" && typeof v === "number") out.push("-" + adPct(v) + " Dash cooldown");
    else if (k === "vaultExtraRoll" && typeof v === "number") out.push("+" + v + " extra roll from vault chests");
    else if (k === "takenMult" && typeof v === "number") { if (v < 1) out.push("Take " + adPct(1 - v) + " less damage"); }
    else if (k === "darkSight") { if (v) out.push("See clearly in the dark"); }
    else if (k === "chain") { const c = typeof v === "number" ? v : (+v.chance || 0); if (c > 0) out.push(adPct(c) + " chance to arc lightning"); }
    else if (k === "onHitSlow") out.push(adPct(v.chance) + " on hit: slow " + adPct(v.pct) + " for " + (v.ms / 1000) + "s");
    else if (k === "onCritSlow") out.push("Crits slow " + adPct(v.pct) + " for " + (v.ms / 1000) + "s");
    else if (k === "onKill") out.push("On kill: " + adTitle(v.proc) + " bursts for " + adPct(v.frac) + " damage");
    else if (k === "onDashBurst") out.push("Dashing bursts for " + adPct(v.frac) + " damage around you");
    else if (k === "afterDashHit") out.push("First hit after a dash deals x" + v.mult + " (" + (v.ms / 1000) + "s)");
    else if (k === "onHitKnock") out.push(adPct(v.chance) + " on hit: knock the target back");
    else if (k === "lowHpTaken") out.push("Below " + adPct(v.below) + " HP: take " + adPct(1 - v.mult) + " less damage");
    else if (k === "procs" && Array.isArray(v)) for (const p of v) {
      out.push((p.onCrit ? "On crit" : adPct(p.chance) + " on hit") + ": " + adTitle(p.id) + " — " + adPct(p.frac) + " damage " +
        (p.shape === "nova" ? "to up to " + p.n + " nearby" : p.shape === "cone" ? "in a cone (" + p.n + ")" : "chaining to " + p.n) +
        (p.canCrit ? " (can crit)" : ""));
    }
    else if (k === "counters" && Array.isArray(v)) for (const c of v) {
      out.push("Every " + c.every + "th hit: " + adTitle(c.id) + " x" + c.mult + (c.chain ? " and chains to " + c.chain.n : ""));
    }
  }
  return out;
}
function adGemInfo(id) {
  const p = ECON.parseGem ? ECON.parseGem(id) : null;
  if (!p) return null;
  const def = p.rune ? ECON.RUNES[p.type] : ECON.GEMS[p.type];
  if (!def) return null;
  let eff = "";
  if (p.rune) eff = adFxLines({ [def.fx]: def.value }).join("");
  else if (def.stat) {
    const v = def.grades[p.grade - 1] || 0;
    eff = def.stat === "all" ? "+" + v + " all stats" : "+" + v + " " + ECON.GEAR_STAT_INFO[def.stat].short;
  } else eff = adFxLines({ [def.fx]: def.grades[p.grade - 1] || 0 }).join("");
  return { type: p.type, grade: p.grade, rune: p.rune, name: p.rune ? def.name : def.name + " " + ["I", "II", "III", "IV", "V"][p.grade - 1],
    color: def.color, eff };
}
function adGemPip(id, extra) {
  const g = adGemInfo(id);
  if (!g) return `<span class="adSock" title="Empty socket">◇</span>`;
  return `<span class="adSock full${g.rune ? " rune" : ""}" style="--g:${g.color}" title="${gEsc(g.name + " — " + g.eff)}">${adIcon("gem", id, 16, "", g.rune ? "ᚱ" : "◆")}${extra || ""}</span>`;
}
function adMatIco(id) { return adIcon("mat", id, 16, "", "<i></i>"); }
function adMatName(id) { const m = ECON.MATERIALS && ECON.MATERIALS[id]; return m ? m.name : adTitle(id); }
function adMatColor(id) { const m = ECON.MATERIALS && ECON.MATERIALS[id]; return (m && m.color) || "#e5e7eb"; }
function adDungeonName(tier) { const d = ECON.GUILD_DUNGEONS && ECON.GUILD_DUNGEONS[tier]; return d ? d.name : adTitle(tier); }
function adBossName(id) {
  const b = ECON.GUILD_BOSSES && ECON.GUILD_BOSSES[id];
  return b ? b.name.replace(/^THE /, "").split(",")[0].toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : adTitle(id);
}
// A single set's box: which slots you own / wear and the 2- and 4-piece bonuses.
function adSetBox(setId, focusSlot) {
  const s = ECON.GEAR_SETS[setId];
  if (!s) return "";
  const worn = (gearView.sets && gearView.sets[setId]) || (ECON.setCounts ? ECON.setCounts(gearEquippedItems())[setId] : 0) || 0;
  const owned = new Set(Object.values(gearView.gear || {}).filter(it => it && it.set === setId).map(it => it.slot));
  const wornSlots = new Set(gearEquippedItems().filter(it => it.set === setId).map(it => it.slot));
  const pieces = ECON.SET_SLOTS.map((slot, i) => {
    const cls = wornSlots.has(slot) ? "on" : owned.has(slot) ? "own" : "";
    return `<span class="adSetPc ${cls}${slot === focusSlot ? " me" : ""}" title="${gEsc(s.names[i])}">${adSetPieceIco(setId, slot, !!cls, 22)}</span>`;
  }).join("");
  const bonus = [2, 4].map(k => {
    const lines = adFxLines(s.bonus[k]);
    const nm = s.bonusName && s.bonusName[k] ? `<b>${gEsc(s.bonusName[k])}</b> — ` : "";
    return `<div class="adSetB ${worn >= k ? "on" : ""}"><span>(${k})</span> ${nm}${gEsc(lines.join(" · "))}</div>`;
  }).join("");
  return `<div class="adSetBox"><div class="adSetHead"><b>${gEsc(s.name)}</b> <span class="adSetN">${worn}/5</span> ${pieces}</div>${bonus}</div>`;
}
// Stat + effect deltas for swapping `item` into its slot.
function adCompare(item) {
  const worn = equippedItem(item.slot);
  if (worn && worn.id === item.id) return `<div class="adCmp muted">Equipped.</div>`;
  const a = ECON.gearStats(item), b = worn ? ECON.gearStats(worn) : { atk: 0, def: 0, vit: 0 };
  const parts = [];
  for (const s of ECON.GEAR_STATS) {
    const d = (a[s] || 0) - (b[s] || 0);
    if (d) parts.push(`<span class="${d > 0 ? "up" : "dn"}">${d > 0 ? "+" : ""}${d} ${ECON.GEAR_STAT_INFO[s].short}</span>`);
  }
  try {
    const cur = gearEquippedItems();
    const next = cur.filter(it => it.slot !== item.slot).concat([item]);
    const f0 = ECON.gearFx(cur), f1 = ECON.gearFx(next);
    for (const k of Object.keys(AD_FX_LABEL).concat(["regen", "dashCd"])) {
      const d = (+f1[k] || 0) - (+f0[k] || 0);
      if (Math.abs(d) < 1e-4) continue;
      const good = d > 0;
      const txt = k === "regen" ? (good ? "+" : "−") + (Math.round(Math.abs(d) * 10) / 10) + " regen/s"
        : k === "dashCd" ? (good ? "−" : "+") + adPct(Math.abs(d)) + " dash cooldown"
        : (good ? "+" : "−") + adPct(Math.abs(d)) + " " + AD_FX_LABEL[k];
      parts.push(`<span class="${good ? "up" : "dn"}">${gEsc(txt)}</span>`);
    }
    const dt = (+f1.takenMult || 1) - (+f0.takenMult || 1);
    if (Math.abs(dt) > 1e-4) parts.push(`<span class="${dt < 0 ? "up" : "dn"}">${dt < 0 ? "−" : "+"}${adPct(Math.abs(dt))} damage taken</span>`);
    for (const [sid, n] of Object.entries(f1.sets || {})) {
      const was = (f0.sets || {})[sid] | 0;
      if ((n >= 2 && was < 2) || (n >= 4 && was < 4)) parts.push(`<span class="up">activates ${gEsc(ECON.GEAR_SETS[sid].name)} (${n >= 4 ? 4 : 2})</span>`);
      if ((was >= 2 && n < 2) || (was >= 4 && n < 4)) parts.push(`<span class="dn">breaks ${gEsc(ECON.GEAR_SETS[sid].name)} (${was >= 4 ? 4 : 2})</span>`);
    }
    for (const [sid, was] of Object.entries(f0.sets || {})) {
      if ((f1.sets || {})[sid] == null && was >= 2) parts.push(`<span class="dn">breaks ${gEsc(ECON.GEAR_SETS[sid].name)} (${was >= 4 ? 4 : 2})</span>`);
    }
  } catch (e) { /* ECON without gearFx — stats alone */ }
  if (!worn) parts.unshift(`<span class="up">empty slot</span>`);
  return `<div class="adCmp"><small class="muted">vs worn:</small> ${parts.length ? parts.join(" ") : `<span class="muted">same</span>`}</div>`;
}
// The v2 item card. opts: {worn, compact, actions:false, extraActions, reveal}
function adCard(item, opts) {
  opts = opts || {};
  const it = ECON.normGear ? ECON.normGear(item) : item;
  const r = adRar(it.rarity);
  const slot = ECON.GEAR_SLOT_INFO[it.slot] || { label: it.slot, emoji: "" };
  const base = ECON.GEAR_BASE_BY_ID[it.base];
  const uq = it.uq && ECON.GEAR_UNIQUES[it.uq];
  const set = it.set && ECON.GEAR_SETS[it.set];
  const st = ECON.gearStats(it);
  const worn = !!opts.worn;
  const id = gEsc(it.id);
  const cls = ["adCard", "adR-" + it.rarity];
  if (uq) cls.push("adUq");
  if (set) cls.push("adSet");
  if (it.lock) cls.push("adLocked");
  if (worn) cls.push("adWorn");
  if (opts.compact) cls.push("adCompact");
  const setN = set ? ((gearView.sets && gearView.sets[it.set]) | 0) : 0;
  const statHtml = ECON.GEAR_STATS.filter(s => st[s] > 0).map(s => {
    const baseV = (it.stats && +it.stats[s]) || 0, bonus = st[s] - baseV;
    return `<span class="adStat" style="color:${ECON.GEAR_STAT_INFO[s].color}">+${st[s]} ${ECON.GEAR_STAT_INFO[s].short}${bonus > 0 ? `<i>(+${bonus})</i>` : ""}</span>`;
  }).join("");
  const mods = it.mods.filter(m => ECON.GEAR_MODS[m.k]).map(m =>
    `<li class="${m.k === "resonance" ? "adRes" : ""}">${gEsc(adModText(m))}</li>`).join("");
  const uqLines = uq ? adFxLines(uq.fx) : [];
  const sockets = it.sockets > 0
    ? `<div class="adSockets">${Array.from({ length: it.sockets }, (_, i) => adGemPip(it.gems[i])).join("")}${it.drilled ? `<small class="muted">drilled</small>` : ""}</div>` : "";
  const src = it.src && ECON.GUILD_DUNGEONS && ECON.GUILD_DUNGEONS[it.src] ? `<small class="muted adSrc">${gEsc(adDungeonName(it.src))}${it.dl ? " · delve " + it.dl : ""}</small>` : "";
  let acts = "";
  if (opts.actions === "extra") acts = opts.extraActions || "";
  else if (opts.actions !== false) {
    const forge = `<button class="menuBtn adBtnForge" onclick="gameForge&&gameForge.open('${id}')" title="Enhance, reforge, socket">⚒</button>`;
    const lock = `<button class="menuBtn gray adLockBtn" onclick="gameGear.toggleLock('${id}')" title="${it.lock ? "Unlock" : "Lock: it can't be sold or salvaged"}">${it.lock ? "🔒" : "🔓"}</button>`;
    acts = worn
      ? `<button class="menuBtn gray" onclick="gameGear.unequip('${gEsc(it.slot)}')">TAKE OFF</button>${forge}${lock}`
      : `<button class="menuBtn green" onclick="gameGear.equip('${id}')">EQUIP</button>
         <button class="menuBtn red" ${it.lock ? "disabled" : ""} onclick="gameGear.sell('${id}')">SELL ${gMoney(ECON.gearSellValue(it))}</button>
         ${forge}${lock}`;
    if (opts.extraActions) acts += opts.extraActions;
  }
  return `<div class="${cls.join(" ")}" style="--rc:${r.color};--rg:${r.glow || r.color}" data-id="${id}">
    <div class="adCardIn">
      <div class="adPlate">
        <span class="adSlotIco">${adIcon("gear", it, 40, "", slot.emoji)}</span>
        <b class="adName">${gEsc((base ? base.name : "Unknown Relic") + (it.affix ? " " + it.affix : ""))}</b>
        ${it.plus > 0 ? `<span class="adPlus">+${it.plus}</span>` : ""}
        ${it.lock ? `<span class="adLockIco" title="Locked">🔒</span>` : ""}
      </div>
      <div class="adTags">
        <span class="adRBadge">${r.label}</span>
        ${uq ? `<span class="adUqBadge">UNIQUE</span>` : ""}
        ${set ? `<span class="adSetBadge">SET ${setN}/5</span>` : ""}
        <span class="adIlvl">iLvl ${it.lvl} ${gEsc(slot.label)}</span>
      </div>
      <div class="adIStats">${statHtml}</div>
      ${mods ? `<ul class="adMods">${mods}</ul>` : ""}
      ${uqLines.length ? `<div class="adUqFx">${uqLines.map(l => `<div>✦ ${gEsc(l)}</div>`).join("")}</div>` : ""}
      ${set && !opts.compact ? adSetBox(it.set, it.slot) : ""}
      ${sockets}
      ${src}
      ${opts.compact || worn || opts.reveal ? "" : adCompare(it)}
      ${acts ? `<div class="adActs">${acts}</div>` : ""}
    </div></div>`;
}

// ---------------- the Armory ----------------
let packSlotFilter = "all";
let packRarityFilter = "all";
let armoryTab = "gear";
function setFilter(slot) { packSlotFilter = slot; openArmory(); }
function setRarityFilter(r) { packRarityFilter = r; openArmory(); }
function setArmoryTab(t) { armoryTab = t; openArmory(t); }

// Mirrors the server's sell_junk filter: worse than worn, never locked,
// unique or set, and never carrying a mod the worn piece lacks.
function isJunk(it) {
  const w = equippedItem(it.slot);
  if (!w || !(ECON.gearPower(it) < ECON.gearPower(w))) return false;
  if (it.lock || it.uq || it.set) return false;
  const wk = new Set((w.mods || []).map(m => m.k));
  if ((it.mods || []).some(m => m && m.k && !wk.has(m.k))) return false;
  return true;
}

function armoryNav() {
  const lost = (gearView.overflow || []).length;
  const tab = (t, label) => `<button class="menuBtn ${armoryTab === t ? "gold" : "gray"}" onclick="gameGear.setArmoryTab('${t}')">${label}</button>`;
  return `<div class="adNav">
    ${tab("gear", "ARMORY")}${tab("sets", "SETS")}${tab("lost", "LOST &amp; FOUND" + (lost ? ` <span class="adPill">${lost}</span>` : ""))}
    <span class="adNavGap"></span>
    <button class="menuBtn adNavForge" onclick="window.gameForge&&gameForge.open()">⚒ ARCANE FORGE</button>
    <button class="menuBtn adNavCodex" onclick="window.gameCodex&&gameCodex.open('codex')">📖 CODEX</button>
    <button class="menuBtn adNavDelver" onclick="window.gameCodex&&gameCodex.open('delver')">✧ DELVER RANK</button>
  </div>`;
}
function fxChips() {
  const fx = gearFxNow();
  const lines = adFxLines(Object.assign({}, fx, { sets: null }), true);
  if (!lines.length) return "";
  return `<div class="adFxChips">${lines.map(l => `<span>${gEsc(l)}</span>`).join("")}</div>`;
}
function walletRow() {
  const mats = gearView.mats || {};
  const ids = Object.keys(mats).filter(k => mats[k] > 0);
  const gems = Object.values(gearView.gems || {}).reduce((s, n) => s + (+n || 0), 0);
  if (!ids.length && !gems) return "";
  return `<div class="adWallet">${ids.map(k => `<span class="adMat" style="--mc:${adMatColor(k)}">${adMatIco(k)}${gEsc(adMatName(k))} <b>${(+mats[k]).toLocaleString()}</b></span>`).join("")}
    ${gems ? `<span class="adMat" style="--mc:#f472b6"><i></i>Gems <b>${gems}</b></span>` : ""}</div>`;
}

function renderArmory(tab) {
  if (tab) armoryTab = tab;
  const t = totals();
  const pack = Object.values(gearView.gear || {});
  const wornIds = new Set(Object.values(gearView.equipped || {}));
  const loose = pack.filter(it => !wornIds.has(it.id));
  const junk = loose.filter(isJunk);
  const junkValue = junk.reduce((s, it) => s + ECON.gearSellValue(it), 0);

  let html = `<p>Everything the dungeons dropped. One piece per slot; the rest sits in your pack until you sell it.</p>
    <div class="statRow">
      <div class="statBox"><small>ATTACK</small><b>+${t.atk} <span class="muted">(x${attackMult().toFixed(2)} dmg)</span></b></div>
      <div class="statBox"><small>DEFENCE</small><b>+${t.def} <span class="muted">(-${Math.round(mitigation() * 100)}% taken)</span></b></div>
      <div class="statBox"><small>VITALITY</small><b>+${t.vit} <span class="muted">(${maxHp()} HP)</span></b></div>
      <div class="statBox"><small>PACK</small><b>${loose.length + wornIds.size}/${gearView.packMax}</b></div>
    </div>`;
  html += fxChips() + walletRow() + armoryNav();

  if (armoryTab === "sets") return html + renderSetsTab();
  if (armoryTab === "lost") return html + renderLostTab();

  html += `<p class="muted">Attack and defence apply everywhere you fight — the quest board's mazes, guild dungeons and the boss at the end of one. They do not carry into the duel arena, which is deliberately an even fight.</p>`;
  html += `<h3 class="section">EQUIPPED</h3>`;
  for (const slot of ECON.GEAR_SLOTS) {
    const it = equippedItem(slot);
    const info = ECON.GEAR_SLOT_INFO[slot];
    html += it ? itemRow(it, { worn: true })
      : `<div class="gearItem gearEmpty"><div class="info"><b>${info.emoji} ${info.label}</b><br/>
           <small class="muted">${slot === ECON.TOME_SLOT
             ? "empty — a guild dungeon's chest can hold one"
             : "empty — nothing equipped"}</small></div></div>`;
  }
  html += `<p class="muted">A tome takes its own slot and adds no stats. It does one thing: press <b>R</b> once per dungeon run and everyone in the room gets the effect. Only the chest at the end of a <b>guild</b> dungeon can hold one.</p>`;
  if (state.isMayor) html += staffGrantPanel();

  html += `<h3 class="section">PACK — ${loose.length} loose piece${loose.length === 1 ? "" : "s"}</h3>`;
  if ((gearView.overflow || []).length) {
    html += `<div class="shopItem adLostNote"><div class="info"><b>${gearView.overflow.length} piece${gearView.overflow.length === 1 ? "" : "s"} waiting in Lost &amp; Found</b><br/>
      <small>Your pack was full when ${gearView.overflow.length === 1 ? "it" : "they"} dropped. Claim before they expire.</small></div>
      <button class="menuBtn gold" onclick="gameGear.setArmoryTab('lost')">CLAIM</button></div>`;
  }
  if (junk.length) {
    html += `<div class="shopItem"><div class="info"><b>Sell everything worse than what you're wearing</b><br/>
      <small>${junk.length} piece${junk.length === 1 ? "" : "s"} · ${gMoney(junkValue)}</small></div>
      <button class="menuBtn gold" onclick="gameGear.sellJunk()">SELL THE JUNK</button></div>`;
  }
  html += `<div class="flexRow gearFilters">
    <button class="menuBtn ${packSlotFilter === "all" ? "gold" : "gray"}" onclick="gameGear.setFilter('all')">ALL</button>
    ${ECON.GEAR_SLOTS.map(s => `<button class="menuBtn ${packSlotFilter === s ? "gold" : "gray"}" onclick="gameGear.setFilter('${s}')">${ECON.GEAR_SLOT_INFO[s].emoji}</button>`).join("")}
  </div>`;
  const present = new Set(loose.map(it => it.rarity));
  if (present.size > 1 || packRarityFilter !== "all") {
    html += `<div class="adRarFilter">
      <button class="adRChip ${packRarityFilter === "all" ? "on" : ""}" onclick="gameGear.setRarityFilter('all')">Any rarity</button>
      ${ECON.GEAR_RARITIES.filter(r => present.has(r) || r === packRarityFilter).map(r =>
        `<button class="adRChip adR-${r} ${packRarityFilter === r ? "on" : ""}" style="--rc:${adRar(r).color}" onclick="gameGear.setRarityFilter('${r}')">${adIcon("frame", r, 14, "", "")}${adRar(r).label}</button>`).join("")}
    </div>`;
  }

  const shown = loose
    .filter(it => packSlotFilter === "all" || it.slot === packSlotFilter)
    .filter(it => packRarityFilter === "all" || it.rarity === packRarityFilter)
    .sort((a, b) => (b.lvl - a.lvl) || (ECON.gearPower(b) - ECON.gearPower(a)));
  if (!shown.length) {
    html += `<p class="muted">${loose.length ? "Nothing in your pack for that filter." : "Your pack is empty. Clear a dungeon — the guild's run much better odds."}</p>`;
  } else {
    for (const it of shown) html += itemRow(it, { worn: false });
  }
  return html;
}
function renderSetsTab() {
  let html = `<p class="muted">Wear pieces of one set together: 2 pieces wake the first bonus, 4 the second. Missing pieces can be forged at the Arcane Forge from that boss's sigils.</p>`;
  for (const [sid, s] of Object.entries(ECON.GEAR_SETS)) {
    const owned = Object.values(gearView.gear || {}).filter(it => it && it.set === sid);
    html += `<div class="adSetCard${((gearView.sets || {})[sid] | 0) >= 2 ? " live" : ""}">
      <div class="adSetTop"><b>${gEsc(s.name)}</b> <small class="muted">${gEsc(adDungeonName(s.tier))} · ${gEsc(adBossName(s.boss))} · iLvl ${s.lvl}</small></div>
      ${adSetBox(sid)}
      <div class="adSetList">${ECON.SET_SLOTS.map((slot, i) => {
        const have = owned.find(it => it.slot === slot);
        // Worn (counts toward the bonus) vs owned but in the pack (QA UX-11).
        const wornIds = new Set(Object.values(gearView.equipped || {}));
        const worn = owned.some(it => it.slot === slot && wornIds.has(it.id));
        const mark = worn ? ` <em class="adSetMark worn" title="Worn">◆ worn</em>` : have ? ` <em class="adSetMark owned" title="In your pack, not worn">◇ in pack</em>` : "";
        return `<span class="${worn ? "have worn" : have ? "have" : ""}">${adSetPieceIco(sid, slot, !!have, 22)} ${gEsc(s.names[i])}${mark}</span>`;
      }).join("")}</div>
      <button class="menuBtn gray" onclick="window.gameForge&&gameForge.open(null,'craft')">FORGE A PIECE</button>
    </div>`;
  }
  return html;
}
function renderLostTab() {
  const list = gearView.overflow || [];
  let html = `<p class="muted">When your pack is full, new drops wait here instead of being lost — up to 20 pieces, for 7 days. Make room, then claim them.</p>`;
  if (!list.length) return html + `<p class="muted">Nothing waiting. Every drop made it into your pack.</p>`;
  const free = Math.max(0, (gearView.packMax | 0) - Object.keys(gearView.gear || {}).length);
  html += `<div class="shopItem"><div class="info"><b>${list.length} piece${list.length === 1 ? "" : "s"} waiting</b><br/>
    <small>${free} free pack slot${free === 1 ? "" : "s"}.</small></div>
    <button class="menuBtn gold" onclick="gameGear.claimOverflow()">CLAIM ALL</button></div>`;
  for (const it of list) {
    const exp = it.exp || (it.at ? it.at + 7 * 86400000 : 0);
    const left = exp ? Math.max(0, exp - Date.now()) : 0;
    const note = left ? `<small class="muted adExp">expires in ${left > 86400000 ? Math.ceil(left / 86400000) + "d" : Math.ceil(left / 3600000) + "h"}</small>` : "";
    const claim = `<button class="menuBtn gold" onclick="gameGear.claimOverflow(['${gEsc(it.id)}'])">CLAIM</button>`;
    if (adIsV2(it)) html += adCard(it, { actions: "extra", extraActions: claim + note, reveal: true });
    else {
      const r = adRar(it.rarity);
      html += `<div class="gearItem" style="border-left:3px solid ${r.color}"><div class="info"><b>${gEsc(ECON.gearName(it))}</b>
        <span class="gearTag" style="color:${r.color};border-color:${r.color}">${r.label}</span><br/><small>${statLine(it)}</small> ${note}</div>
        <div class="flexRow">${claim}</div></div>`;
    }
  }
  return html;
}
function openArmory(tab) {
  if (typeof tab !== "string") tab = undefined;
  openMenu("THE ARMORY", renderArmory(tab));
}

// ---------------- the staff bench ----------------
// Staff can hand themselves a specific, named piece rather than farming for
// it. The server re-checks the role and rolls the item through exactly the
// same makeGear/makeTome a dungeon uses, so a granted piece is an ordinary
// piece — and every grant is logged with who did it.
function staffGrantPanel() {
  const bases = ECON.GEAR_BASES
    .slice()
    .sort((a, b) => (a.slot === b.slot ? a.lvl - b.lvl : ECON.GEAR_SLOTS.indexOf(a.slot) - ECON.GEAR_SLOTS.indexOf(b.slot)));
  return `<h3 class="section">STAFF BENCH <span class="muted" style="font-size:11px">${gEsc(state.role.toUpperCase())}</span></h3>
    <p class="muted">Put a specific piece straight into a pack. Every grant is logged server-side.</p>
    <div class="shopItem"><div class="info">
      <b>Equipment</b><br/>
      <select id="grantBase" class="menuInput">
        ${bases.map(b => `<option value="${gEsc(b.id)}">${ECON.GEAR_SLOT_INFO[b.slot].emoji} Lv${b.lvl || "*"} ${gEsc(b.name)}${b.unique ? " (unique)" : b.set ? " (set)" : ""}</option>`).join("")}
      </select>
      <select id="grantRarity" class="menuInput">
        ${ECON.GEAR_RARITIES.map(r => `<option value="${r}"${r === "legendary" ? " selected" : ""}>${ECON.GEAR_RARITY_INFO[r].label}</option>`).join("")}
      </select>
      <select id="grantPlus" class="menuInput" title="Enhancement">
        ${Array.from({ length: 13 }, (_, i) => `<option value="${i}">+${i}</option>`).join("")}
      </select>
    </div><button class="menuBtn gold" onclick="gameGear.staffGrant('gear')">GIVE IT</button></div>
    <div class="shopItem"><div class="info">
      <b>Tome</b><br/>
      <select id="grantTome" class="menuInput">
        ${ECON.TOME_ORDER.map(id => `<option value="${id}">${ECON.TOMES[id].emoji} ${gEsc(ECON.TOMES[id].name)} — ${ECON.TOMES[id].rarity}</option>`).join("")}
      </select>
    </div><button class="menuBtn gold" onclick="gameGear.staffGrant('tome')">GIVE IT</button></div>
    ${state.role === "owner" ? `<div class="shopItem"><div class="info">
      <b>Give it to someone else</b><br/>
      <small class="muted">Owners only. Leave blank to keep it yourself.</small><br/>
      <input id="grantTarget" class="menuInput" placeholder="username" maxlength="20"/>
    </div></div>` : ""}`;
}
async function staffGrant(what) {
  const targetEl = document.getElementById("grantTarget");
  const target = targetEl && targetEl.value.trim();
  const msg = { action: "grant" };
  if (target) msg.target = target;
  if (what === "tome") {
    const el = document.getElementById("grantTome");
    if (!el) return;
    msg.tome = el.value;
  } else {
    const b = document.getElementById("grantBase"), r = document.getElementById("grantRarity");
    if (!b || !r) return;
    msg.base = b.value; msg.rarity = r.value;
    const base = ECON.GEAR_BASE_BY_ID[b.value];
    if (base && base.unique) msg.uq = base.id;
    if (base && base.set) { msg.set = base.set; msg.slot = base.slot; }
    const p = document.getElementById("grantPlus");
    if (p && +p.value > 0) msg.plus = +p.value;
  }
  try {
    const res = await netGear(msg);
    if (res.gear) applyView(res);
    const it = res.granted;
    toast(`Granted ${gEsc(ECON.gearName(it))} (${it.rarity})${res.target && res.target !== state.user ? " to " + gEsc(res.target) : ""}.`, 4000);
    openArmory();
  } catch (e) { toast(gEsc(e.message), 4000); }
}

// ---------------- actions ----------------
async function equip(id) {
  try {
    const res = await netGear({ action: "equip", piece: id });
    applyView(res);
    const it = gearView.gear[id];
    toast(`Equipped ${ECON.gearName(it)}.`, 2500);
    openArmory();
  } catch (e) { toast(gEsc(e.message), 4000); }
}
async function unequip(slot) {
  try { applyView(await netGear({ action: "unequip", slot })); openArmory(); }
  catch (e) { toast(gEsc(e.message), 4000); }
}
async function sell(id) {
  const it = gearView.gear[id];
  if (it && it.lock) { toast("That piece is locked.", 2500); return; }
  if (it && !confirm(`Sell ${ECON.gearName(it)} for ${gMoney(ECON.gearSellValue(it))}? It's gone for good.`)) return;
  try {
    const res = await netGear({ action: "sell", piece: id });
    applyView(res);
    if (typeof res.money === "number") state.data.money = res.money;
    toast(`Sold for ${gMoney(res.gained)}.`, 3000);
    updateHUD(); openArmory();
  } catch (e) { toast(gEsc(e.message), 4000); }
}
async function sellJunk() {
  if (!confirm("Sell every loose piece that's worse than what you have on?")) return;
  try {
    const res = await netGear({ action: "sell_junk" });
    applyView(res);
    if (typeof res.money === "number") state.data.money = res.money;
    toast(`Sold ${res.sold.length} piece${res.sold.length === 1 ? "" : "s"} for ${gMoney(res.gained)}.`, 4000);
    updateHUD(); openArmory();
  } catch (e) { toast(gEsc(e.message), 4000); }
}
// Lock lives on the forge op (§6.6). An old server without it says so.
async function toggleLock(id) {
  const it = gearView.gear[id];
  if (!it) return;
  if (!window.gameForge || !gameForge.call) { toast("Locks arrive with the Arcane Forge.", 3000); return; }
  try {
    const res = await gameForge.call({ action: "lock", piece: id, on: !it.lock });
    if (res && !res.item) res.item = Object.assign({}, it, { lock: !it.lock });
    adoptChanges(res);
    toast(it.lock ? "Unlocked." : "Locked — it can't be sold or salvaged.", 2200);
    openArmory();
  } catch (e) { toast(gEsc(e.message), 4000); }
}
async function claimOverflow(ids) {
  try {
    const msg = { action: "claim_overflow" };
    if (Array.isArray(ids) && ids.length) msg.ids = ids;
    const res = await netGear(msg);
    if (Array.isArray(res.overflow)) gearView.overflow = res.overflow;
    if (res.gear) applyView(res); else await refreshGear();
    const n = (res.claimed || []).length;
    toast(n ? `Claimed ${n} piece${n === 1 ? "" : "s"}.${res.packFull ? " Your pack is full again — make room for the rest." : ""}`
      : (res.packFull ? "Your pack is full. Sell or salvage something first." : "Nothing to claim."), 4000);
    openArmory(n && !(gearView.overflow || []).length ? "gear" : "lost");
  } catch (e) { toast(gEsc(e.message), 4000); }
}

// A staff grant lands in the pack live (the server pushes `gear_granted` to the target).
if (window.NET && NET.on) NET.on("gear_granted", (m) => {
  refreshGear();
  if (m && m.item && m.by !== state.user) toast(`${gEsc(m.by || "Staff")} granted you ${gEsc(ECON.gearName(m.item))}.`, 4000);
});

window.gameGear = {
  refresh: refreshGear, adoptFromRecord, announceLoot, applyView, adoptChanges,
  openArmory, setFilter, setRarityFilter, setArmoryTab, equip, unequip, sell, sellJunk, staffGrant,
  toggleLock, claimOverflow, renderArmory,
  // The armory was spelled the British way everywhere until now; anything
  // still holding the old name keeps working.
  openArmory: openArmory,
  totals, attackMult, mitigation, maxHp, equippedItem,
  // §6.7 contract
  fx: gearFxNow, equippedItems: gearEquippedItems,
  view: () => gearView,
  mats: () => gearView.mats || {}, gems: () => gearView.gems || {}, overflow: () => gearView.overflow || [],
  // Card helpers shared with forge.js / codex.js / loot-reveal.js
  ui: { esc: gEsc, money: gMoney, card: adCard, legacyRow: itemRow, isV2: adIsV2, rar: adRar, rarIdx: adRarIdx, pct: adPct,
        title: adTitle, modText: adModText, fxLines: adFxLines, gem: adGemInfo, gemPip: adGemPip, matName: adMatName,
        matColor: adMatColor, matIco: adMatIco, icon: adIcon, dungeonName: adDungeonName, bossName: adBossName, setBox: adSetBox, statLine, isJunk },
};
