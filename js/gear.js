/* GEAR — dungeon loot, the Armory in the Adventurers Guild, and the three
   numbers a set of equipment is worth in a fight.

   The server rolls every drop, owns every piece and prices every sale (see
   docs/SERVER-AUTHORITY.md). This file only ever asks it to equip, unequip or
   sell something by id, and caches the answer so combat.js can read the totals
   without a round-trip on every swing. */

let gearView = { gear: {}, equipped: {}, totals: { atk: 0, def: 0, vit: 0 }, packMax: ECON.GEAR_PACK_MAX, packUsed: 0 };

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
function maxHp() { return ECON.gearMaxHp(totals().vit); }
function equippedItem(slot) {
  const id = gearView.equipped && gearView.equipped[slot];
  return (id && gearView.gear && gearView.gear[id]) || null;
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
  if (state.data) { state.data.gear = gearView.gear; state.data.equipped = gearView.equipped; }
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
async function refresh() {
  try { applyView(await netGear({ action: "status" })); }
  catch (e) { /* offline / not authed yet — the next call retries */ }
}
// Login hands us the whole user record, so the first paint needs no round-trip.
function adoptFromRecord(data) {
  if (!data) return;
  applyView({ gear: data.gear || {}, equipped: data.equipped || {} });
}

// A tome is drawn differently everywhere it appears: it has no stats to
// compare, so the row shows what the thing DOES instead.
function tomeRow(item, worn) {
  const def = ECON.tomeDef(item.tome);
  if (!def) return "";
  const r = ECON.GEAR_RARITY_INFO[item.rarity] || ECON.GEAR_RARITY_INFO.legendary;
  return `<div class="gearItem" style="border-left:3px solid ${r.color}">
    <div class="info">
      <b>${def.emoji} ${gEsc(def.name)}</b>
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

// ---------------- rendering ----------------
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
  const r = ECON.GEAR_RARITY_INFO[item.rarity] || ECON.GEAR_RARITY_INFO.fine;
  const slot = ECON.GEAR_SLOT_INFO[item.slot] || { label: item.slot, emoji: "" };
  const worn = (opts && opts.worn) || false;
  return `<div class="gearItem" style="border-left:3px solid ${r.color}">
    <div class="info">
      <b>${slot.emoji} ${gEsc(ECON.gearName(item))}</b>
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

let packSlotFilter = "all";
function setFilter(slot) { packSlotFilter = slot; openArmory(); }

function openArmory() {
  const t = totals();
  const pack = Object.values(gearView.gear || {});
  const wornIds = new Set(Object.values(gearView.equipped || {}));
  const loose = pack.filter(it => !wornIds.has(it.id));
  const junk = loose.filter(it => {
    const w = equippedItem(it.slot);
    return w && ECON.gearPower(it) < ECON.gearPower(w);
  });
  const junkValue = junk.reduce((s, it) => s + ECON.gearSellValue(it), 0);

  let html = `<p>Everything the dungeons dropped. One piece per slot; the rest sits in your pack until you sell it.</p>
    <div class="statRow">
      <div class="statBox"><small>ATTACK</small><b>+${t.atk} <span class="muted">(x${attackMult().toFixed(2)} dmg)</span></b></div>
      <div class="statBox"><small>DEFENCE</small><b>+${t.def} <span class="muted">(-${Math.round(mitigation() * 100)}% taken)</span></b></div>
      <div class="statBox"><small>VITALITY</small><b>+${t.vit} <span class="muted">(${maxHp()} HP)</span></b></div>
      <div class="statBox"><small>PACK</small><b>${loose.length + wornIds.size}/${gearView.packMax}</b></div>
    </div>
    <p class="muted">Attack and defence apply everywhere you fight — the quest board's mazes, guild dungeons and the boss at the end of one. They do not carry into the duel arena, which is deliberately an even fight.</p>`;

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
  if (junk.length) {
    html += `<div class="shopItem"><div class="info"><b>Sell everything worse than what you're wearing</b><br/>
      <small>${junk.length} piece${junk.length === 1 ? "" : "s"} · ${gMoney(junkValue)}</small></div>
      <button class="menuBtn gold" onclick="gameGear.sellJunk()">SELL THE JUNK</button></div>`;
  }
  html += `<div class="flexRow gearFilters">
    <button class="menuBtn ${packSlotFilter === "all" ? "gold" : "gray"}" onclick="gameGear.setFilter('all')">ALL</button>
    ${ECON.GEAR_SLOTS.map(s => `<button class="menuBtn ${packSlotFilter === s ? "gold" : "gray"}" onclick="gameGear.setFilter('${s}')">${ECON.GEAR_SLOT_INFO[s].emoji}</button>`).join("")}
  </div>`;

  const shown = loose
    .filter(it => packSlotFilter === "all" || it.slot === packSlotFilter)
    .sort((a, b) => (b.lvl - a.lvl) || (ECON.gearPower(b) - ECON.gearPower(a)));
  if (!shown.length) {
    html += `<p class="muted">${loose.length ? "Nothing in your pack for that slot." : "Your pack is empty. Clear a dungeon — the guild's run much better odds."}</p>`;
  } else {
    for (const it of shown) html += itemRow(it, { worn: false });
  }
  openMenu("THE ARMORY", html);
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
        ${bases.map(b => `<option value="${gEsc(b.id)}">${ECON.GEAR_SLOT_INFO[b.slot].emoji} Lv${b.lvl} ${gEsc(b.name)}</option>`).join("")}
      </select>
      <select id="grantRarity" class="menuInput">
        ${ECON.GEAR_RARITIES.map(r => `<option value="${r}"${r === "legendary" ? " selected" : ""}>${ECON.GEAR_RARITY_INFO[r].label}</option>`).join("")}
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
  }
  try {
    const res = await netGear(msg);
    if (res.gear) applyView(res);
    const it = res.granted;
    toast(`Granted ${gEsc(ECON.gearName(it))} (${it.rarity})${res.target && res.target !== state.user ? " to " + gEsc(res.target) : ""}.`, 4000);
    openArmory();
  } catch (e) { toast(e.message, 4000); }
}

// ---------------- actions ----------------
async function equip(id) {
  try {
    const res = await netGear({ action: "equip", piece: id });
    applyView(res);
    const it = gearView.gear[id];
    toast(`Equipped ${ECON.gearName(it)}.`, 2500);
    openArmory();
  } catch (e) { toast(e.message, 4000); }
}
async function unequip(slot) {
  try { applyView(await netGear({ action: "unequip", slot })); openArmory(); }
  catch (e) { toast(e.message, 4000); }
}
async function sell(id) {
  const it = gearView.gear[id];
  if (it && !confirm(`Sell ${ECON.gearName(it)} for ${gMoney(ECON.gearSellValue(it))}? It's gone for good.`)) return;
  try {
    const res = await netGear({ action: "sell", piece: id });
    applyView(res);
    if (typeof res.money === "number") state.data.money = res.money;
    toast(`Sold for ${gMoney(res.gained)}.`, 3000);
    updateHUD(); openArmory();
  } catch (e) { toast(e.message, 4000); }
}
async function sellJunk() {
  if (!confirm("Sell every loose piece that's worse than what you have on?")) return;
  try {
    const res = await netGear({ action: "sell_junk" });
    applyView(res);
    if (typeof res.money === "number") state.data.money = res.money;
    toast(`Sold ${res.sold.length} piece${res.sold.length === 1 ? "" : "s"} for ${gMoney(res.gained)}.`, 4000);
    updateHUD(); openArmory();
  } catch (e) { toast(e.message, 4000); }
}

window.gameGear = {
  refresh, adoptFromRecord, announceLoot, applyView,
  openArmory, setFilter, equip, unequip, sell, sellJunk, staffGrant,
  // The armory was spelled the British way everywhere until now; anything
  // still holding the old name keeps working.
  openArmory: openArmory,
  totals, attackMult, mitigation, maxHp, equippedItem,
};
