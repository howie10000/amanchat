/* GUILDS & MASTERY — the broker in the Adventurers Guild, the guild hall
   behind his door, and the mastery panel.

   Everything with a price or a permission on it is a round-trip: this file
   renders what the server says and asks it to change things. It never decides
   who may withdraw, what a tax is worth, or whether a run paid out. */

let guildState = null;      // last `guild` op view, or null when guildless
let masteryState = null;    // last `mastery` op view
let guildInvites = {};

// Painted icon from js/item-icons.js, or '' so the caller's emoji fallback shows.
function gIco(kind, arg, size, cls) {
  try { return (typeof window !== "undefined" && window.ItemIcons && window.ItemIcons.html(kind, arg, size, cls)) || ""; } catch (e) { return ""; }
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const money = (n) => "$" + Math.max(0, Math.floor(+n || 0)).toLocaleString();
const pct = (r) => (Math.round((+r || 0) * 10000) / 100).toFixed(2) + "%";
// A JS string literal that is safe inside a double-quoted onclick="" attribute.
const jsq = (s) => esc(JSON.stringify(String(s == null ? "" : s)));
function fmtMs(ms) {
  ms = Math.max(0, Math.round(+ms || 0));
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
// THE ARCANE DEPTHS shared module. index.html loads it before this file, but a
// page without it must still render the old screens.
const depthsMod = () => (typeof window !== "undefined" && window.DEPTHS) || null;
const officerUp = () => !!guildState && (ECON.guildRankAtLeast ? ECON.guildRankAtLeast(guildState.myRank, "officer") : guildState.myRank !== "member");

// Guild level from the view, or derived from its XP when an older server
// doesn't send the level fields yet.
function guildLevelOf(g) {
  if (!g) return { level: 1, into: 0, need: 1, maxed: false };
  if (g.level != null && g.need != null) return { level: g.level | 0, into: +g.into || 0, need: +g.need || 1, maxed: !!g.maxed || (g.level | 0) >= (ECON.GUILD_LEVEL_MAX || 30) };
  if (typeof ECON.guildLevel === "function") return ECON.guildLevel(+g.xp || 0);
  return { level: 1, into: 0, need: 1, maxed: false };
}
// Palette of a tier's theme as CSS custom properties (see the AD-UI guild CSS).
function themeVars(tier) {
  const D = depthsMod(), cfg = ECON.GUILD_DUNGEONS[tier] || {};
  let t = null;
  try { t = D && D.themeFor ? D.themeFor(tier) : null; } catch (e) {}
  if (!t && D && D.DUNGEON_THEMES) t = D.DUNGEON_THEMES[cfg.theme] || null;
  if (!t) return "";
  const f = t.floor || [20, 20, 40];
  return `--ad-floor:rgb(${f[0]},${f[1]},${f[2]});--ad-wall:${t.wall};--ad-cap:${t.cap};--ad-torch:${t.torch};--ad-fog:${t.fog};`;
}

function myGuild() { return guildState; }
function myRank() { return guildState ? guildState.myRank : null; }
function canDo(power) { return !!guildState && ECON.guildCan(guildState.myRank, power); }

// Pull guild + mastery in one go. Called on login, after anything that changes
// either, and whenever a guild event lands.
async function refreshGuild() {
  try {
    const g = await netGuild({ action: "status" });
    guildState = g.guild || null;
    guildInvites = g.invites || {};
    if (g.interestPaid > 0) toast(`Guild bank interest: +${money(g.interestPaid)}`, 3000);
    if (g.interestUnfunded > 0) toast(`The guild treasury couldn't cover ${money(g.interestUnfunded)} of interest.`, 4000);
  } catch (e) { /* offline / not authed yet — the next call retries */ }
  try {
    const m = await netMastery();
    masteryState = m.mastery;
    state.mastery = m.mastery;   // combat.js reads this for damage scaling
    if (m.xpMult) masteryState.xpMult = m.xpMult;
  } catch (e) {}
  if (window.gameRaidUI && gameRaidUI.refresh) gameRaidUI.refresh();
  if (guildState) warmGuildIcons();
  updateHUD();
}

// ---------------- THE BROKER ----------------
// One NPC, three jobs: sell a charter, hand over invitations, and point the
// guildless at who is recruiting.
function openBroker() {
  const invites = Object.entries(guildInvites || {});
  let html = `
    <div class="brokerLine">
      <p class="brokerSay">"You want a charter, or you want to keep running errands for the board?"</p>
    </div>`;

  if (guildState) {
    html += `
      <h3 class="section">YOUR GUILD</h3>
      <div class="shopItem"><div class="info"><b>[${esc(guildState.tag)}] ${esc(guildState.name)}</b><br/>
        <small>${esc(ECON.GUILD_RANK_INFO[guildState.myRank].label)} · level ${guildLevelOf(guildState).level} · ${guildState.memberCount}/${guildState.maxMembers} members · ${guildState.clears} clears</small></div>
        <button class="menuBtn gold" onclick="gameGuild.openHall()">OPEN</button></div>
      <p class="muted">His door is beside him. It only opens for your own hall.</p>`;
    openMenu("THE BROKER", html);
    return;
  }

  html += `<h3 class="section">FOUND A GUILD — ${money(ECON.GUILD_CREATE_COST)}</h3>
    <p class="muted">A charter buys you a hall, a shared bank, a treasury you set the rates on, and the dungeons the quest board won't post.</p>
    <div class="formRow"><input id="gName" class="menuInput" maxlength="${ECON.GUILD_NAME_MAX}" placeholder="Guild name" /></div>
    <div class="formRow"><input id="gTag" class="menuInput" maxlength="${ECON.GUILD_TAG_MAX}" placeholder="TAG" style="text-transform:uppercase" /></div>
    <button class="menuBtn green" onclick="gameGuild.createGuild()">PAY ${money(ECON.GUILD_CREATE_COST)} &amp; FOUND IT</button>`;

  html += `<h3 class="section">INVITATIONS${invites.length ? ` (${invites.length})` : ""}</h3>`;
  if (!invites.length) {
    html += `<p class="muted">Nobody has asked for you. Invitations turn up here.</p>`;
  } else {
    for (const [gid, inv] of invites) {
      html += `<div class="shopItem"><div class="info"><b>[${esc(inv.tag)}] ${esc(inv.name)}</b><br/>
        <small>invited by ${esc(inv.by)}</small></div>
        <div class="flexRow">
          <button class="menuBtn green" onclick="gameGuild.acceptInvite(${jsq(gid)})">JOIN</button>
          <button class="menuBtn red" onclick="gameGuild.declineInvite(${jsq(gid)})">NO</button>
        </div></div>`;
    }
  }
  html += `<button class="menuBtn" onclick="gameGuild.browse()">WHO'S RECRUITING?</button>`;
  openMenu("THE BROKER", html);
}

async function createGuild() {
  const name = (document.getElementById("gName") || {}).value || "";
  const tag = (document.getElementById("gTag") || {}).value || "";
  try {
    const res = await netGuild({ action: "create", name, tag });
    guildState = res.guild;
    state.data.money = res.money;
    toast(`[${esc(res.guild.tag)}] ${esc(res.guild.name)} is chartered. The door is yours.`, 5000);
    updateHUD();
    openHall();
  } catch (e) { toast(esc(e.message), 4000); }
}
async function acceptInvite(gid) {
  try {
    const res = await netGuild({ action: "accept", guild: gid });
    guildState = res.guild;
    guildInvites = {};
    toast(`You're in — [${esc(res.guild.tag)}] ${esc(res.guild.name)}.`, 4000);
    openHall();
  } catch (e) { toast(esc(e.message), 4000); }
}
async function declineInvite(gid) {
  try { const res = await netGuild({ action: "decline", guild: gid }); guildInvites = res.invites || {}; openBroker(); }
  catch (e) { toast(esc(e.message)); }
}
async function browse() {
  try {
    const res = await netGuild({ action: "browse" });
    let html = `<p>Guilds in town, highest level first. Ask a member for an invitation — the broker doesn't do introductions.</p>`;
    const list = (res.guilds || []).slice().sort((a, b) =>
      ((+b.xp || 0) - (+a.xp || 0)) || ((+b.level || 0) - (+a.level || 0)) || ((b.clears | 0) - (a.clears | 0)) || ((b.members | 0) - (a.members | 0)));
    if (!list.length) html += `<p class="muted">Nobody has chartered one yet. Could be you.</p>`;
    for (const g of list) {
      html += `<div class="shopItem"><div class="info"><b>${g.level ? `<span class="adLvlPip">${g.level | 0}</span> ` : ""}[${esc(g.tag)}] ${esc(g.name)}</b><br/>
        <small>${g.level ? `guild level ${g.level | 0} · ` : ""}${g.members}/${g.maxMembers} members · ${g.clears} guild dungeon${g.clears === 1 ? "" : "s"} cleared · led by ${esc(g.master)}</small>
        ${g.motd ? `<br/><small class="muted">"${esc(g.motd)}"</small>` : ""}</div></div>`;
    }
    html += `<button class="menuBtn" onclick="gameGuild.openBroker()">BACK</button>`;
    openMenu("RECRUITING", html);
  } catch (e) { toast(esc(e.message)); }
}

// ---------------- THE HALL ----------------
function openHall() {
  if (!guildState) { toast("You have no guild."); return; }
  const g = guildState;
  const isMaster = g.myRank === "master";
  let html = `
    <div class="guildHead">
      <b>[${esc(g.tag)}] ${esc(g.name)}</b>
      <div class="muted">${g.memberCount}/${g.maxMembers} members · ${g.clears} guild dungeon${g.clears === 1 ? "" : "s"} cleared</div>
      ${g.motd ? `<div class="guildMotd">"${esc(g.motd)}"</div>` : ""}
    </div>
    ${hallProgressHtml(g)}
    <div class="adHallNav">
      <button class="menuBtn" onclick="gameGuild.openResearch()">🜂 RESEARCH${(g.researchPoints | 0) > 0 ? ` <span class="adBadge">${g.researchPoints | 0}</span>` : ""}</button>
      <button class="menuBtn" onclick="gameGuild.openTrophies()">🏆 TROPHY HALL</button>
      <button class="menuBtn" onclick="gameGuild.openVault()">⚗ VAULT &amp; BANNERS</button>
      <button class="menuBtn" onclick="gameGuild.openRecords()">📜 RECORDS</button>
      <button class="menuBtn" onclick="window.gameRaidUI ? gameRaidUI.openAlliances() : toast('Alliances are not available yet.')">🤝 ALLIANCES${allyReqCount(g) ? ` <span class="adBadge">${allyReqCount(g)}</span>` : ""}</button>
    </div>
    <div class="statRow">
      <div class="statBox"><small>TREASURY</small><b>${money(g.treasury)}</b></div>
      <div class="statBox"><small>YOUR SAVINGS</small><b>${money(g.myBank)}</b></div>
      <div class="statBox"><small>GUILD TAX</small><b>${pct(g.taxRate)}</b></div>
      <div class="statBox"><small>INTEREST</small><b>${pct(g.interestRate)}</b></div>
    </div>
    <div class="flexRow">
      <button class="menuBtn gold" onclick="gameGuild.openBank()">GUILD BANK</button>
      <button class="menuBtn green" onclick="gameGuild.openTreasury()">TREASURY</button>
      <button class="menuBtn red" onclick="gameGuild.openDungeons()">DUNGEONS</button>
      <button class="menuBtn" onclick="gameGear.openArmory()">ARMORY</button>
    </div>`;

  // --- skills ---
  html += `<h3 class="section">GUILD SKILLS — ${g.skillPoints} point${g.skillPoints === 1 ? "" : "s"} unspent</h3>
    <p class="muted">Every ${ECON.GUILD_DUNGEONS_PER_POINT} guild dungeon clears earns the guild a point. The Guild Master invests it, and every member's XP in that track goes up by ${Math.round(ECON.GUILD_SKILL_XP_PER_RANK * 100)}%.</p>`;
  for (const s of ECON.MASTERY_SKILLS) {
    const rank = g.skills[s] || 0;
    const info = ECON.MASTERY_INFO[s];
    const pips = Array.from({ length: ECON.GUILD_SKILL_RANKS }, (_, i) => `<span class="pip ${i < rank ? "on" : ""}"></span>`).join("");
    html += `<div class="shopItem"><div class="info"><b>${info.emoji} ${info.label}</b> <span class="pips">${pips}</span><br/>
      <small>+${Math.round(rank * ECON.GUILD_SKILL_XP_PER_RANK * 100)}% ${info.label.toLowerCase()} XP for the whole guild</small></div>
      ${isMaster && g.skillPoints > 0 && rank < ECON.GUILD_SKILL_RANKS
        ? `<button class="menuBtn green" onclick="gameGuild.spendSkill('${s}')">INVEST</button>`
        : `<button class="menuBtn" disabled>${rank >= ECON.GUILD_SKILL_RANKS ? "MAXED" : "—"}</button>`}
      </div>`;
  }

  // --- roster ---
  html += `<h3 class="section">ROSTER</h3>`;
  for (const m of g.members) {
    const label = ECON.GUILD_RANK_INFO[m.rank].label;
    let controls = "";
    if (isMaster && m.user !== state.user) {
      controls += m.rank === "member"
        ? `<button class="menuBtn green" onclick="gameGuild.setRank(${jsq(m.user)},'officer')">PROMOTE</button>`
        : m.rank === "officer" ? `<button class="menuBtn" onclick="gameGuild.setRank(${jsq(m.user)},'member')">DEMOTE</button>` : "";
      controls += `<button class="menuBtn red" onclick="gameGuild.kick(${jsq(m.user)})">KICK</button>`;
    } else if (canDo("canKick") && m.rank === "member" && m.user !== state.user) {
      controls += `<button class="menuBtn red" onclick="gameGuild.kick(${jsq(m.user)})">KICK</button>`;
    }
    html += `<div class="friendItem">
      <div class="info"><span class="statusDot ${m.online ? "online" : ""}"></span><b>${esc(m.user)}</b> <small class="muted">${label}</small><br/>
        <small>banked ${money(m.banked)} · contributed ${money(m.contributed)}</small></div>
      <div class="flexRow">${controls}</div></div>`;
  }

  if (canDo("canInvite")) {
    html += `<h3 class="section">INVITE</h3>
      <div class="formRow"><input id="gInvite" class="menuInput" placeholder="player name" />
      <button class="menuBtn green" onclick="gameGuild.invite()">INVITE</button></div>`;
  }
  if (isMaster) {
    html += `<h3 class="section">MASTER'S SETTINGS</h3>
      <p class="muted">Your tax is taken on top of the Mayor's ${pct(g.rates.mayorBank)} whenever a member moves money through the guild bank, and it is the only thing that fills the treasury from banking. Interest is paid out of the treasury — set it higher than the treasury can fund and members simply won't be paid in full.</p>
      <div class="formRow"><label>Guild tax %</label>
        <input id="gTax" class="menuInput" type="number" min="0" max="${ECON.GUILD_TAX_MAX * 100}" step="0.1" value="${(g.taxRate * 100).toFixed(1)}" /></div>
      <div class="formRow"><label>Interest % per ${Math.round(g.rates.interestPeriod / 60000)} min</label>
        <input id="gInt" class="menuInput" type="number" min="0" max="${ECON.GUILD_INTEREST_MAX * 100}" step="0.01" value="${(g.interestRate * 100).toFixed(2)}" /></div>
      <div class="formRow"><input id="gMotd" class="menuInput" maxlength="200" placeholder="Message of the day" value="${esc(g.motd)}" /></div>
      <button class="menuBtn gold" onclick="gameGuild.saveRates()">SAVE</button>

      <h3 class="section">REBRAND</h3>
      <p class="muted">A new name costs ${money(ECON.GUILD_RENAME_COST)}, a new tag costs ${money(ECON.GUILD_TAG_CHANGE_COST)} — pay for whichever you actually change. Leave a field as it is to skip its cost.</p>
      <div class="formRow"><input id="gRenameName" class="menuInput" maxlength="${ECON.GUILD_NAME_MAX}" placeholder="Guild name" value="${esc(g.name)}" /></div>
      <div class="formRow"><input id="gRenameTag" class="menuInput" maxlength="${ECON.GUILD_TAG_MAX}" placeholder="TAG" style="text-transform:uppercase" value="${esc(g.tag)}" /></div>
      <button class="menuBtn gold" onclick="gameGuild.renameGuild()">REBRAND</button>`;
  }
  if (g.myRank !== "master") {
    html += `<h3 class="section">LEAVE</h3>
      <p class="muted">Anything you have banked with the guild comes back with you.</p>
      <button class="menuBtn red" onclick="gameGuild.leave()">LEAVE THE GUILD</button>`;
  }
  openMenu("GUILD HALL", html);
}

async function invite() {
  const el = document.getElementById("gInvite");
  const who = el ? el.value : "";
  try { const res = await netGuild({ action: "invite", user: who }); guildState = res.guild; toast(`Invitation sent to ${esc(res.invited)}.`); openHall(); }
  catch (e) { toast(esc(e.message), 4000); }
}
async function setRank(user, rank) {
  try { const res = await netGuild({ action: "set_rank", user, rank }); guildState = res.guild; openHall(); }
  catch (e) { toast(esc(e.message), 4000); }
}
async function kick(user) {
  if (!confirm(`Remove ${user} from the guild? Their guild savings are returned to them.`)) return;
  try { const res = await netGuild({ action: "kick", user }); guildState = res.guild; toast(`${esc(user)} has been removed.`); openHall(); }
  catch (e) { toast(esc(e.message), 4000); }
}
async function saveRates() {
  const tax = (+(document.getElementById("gTax") || {}).value || 0) / 100;
  const int = (+(document.getElementById("gInt") || {}).value || 0) / 100;
  const motd = (document.getElementById("gMotd") || {}).value || "";
  try { const res = await netGuild({ action: "set_rates", taxRate: tax, interestRate: int, motd }); guildState = res.guild; toast("Settings saved."); openHall(); }
  catch (e) { toast(esc(e.message), 4000); }
}
async function renameGuild() {
  const name = (document.getElementById("gRenameName") || {}).value || "";
  const tag = (document.getElementById("gRenameTag") || {}).value || "";
  try {
    const res = await netGuild({ action: "rename", name, tag });
    guildState = res.guild;
    state.data.money = res.money;
    toast(`Now [${esc(res.guild.tag)}] ${esc(res.guild.name)}.`, 4000);
    updateHUD();
    openHall();
  } catch (e) { toast(esc(e.message), 4000); }
}
async function spendSkill(skill) {
  try { const res = await netGuild({ action: "spend_skill", skill }); guildState = res; toast(`${ECON.MASTERY_INFO[skill].label} mastery rank ${res.rank} for the whole guild.`, 4000); await refreshGuild(); openHall(); }
  catch (e) { toast(esc(e.message), 4000); }
}
async function leave() {
  if (!confirm("Leave the guild? You keep whatever you had banked with them.")) return;
  try {
    const res = await netGuild({ action: "leave" });
    guildState = null;
    state.data.money = res.money;
    toast(res.refunded > 0 ? `You're out. ${money(res.refunded)} returned.` : "You're out.", 4000);
    updateHUD(); closeMenu();
  } catch (e) { toast(esc(e.message), 4000); }
}

// ---------------- GUILD PROGRESSION (THE ARCANE DEPTHS) ----------------
// Level / XP, research, trophies, the materials vault, banners and the
// leaderboards. All of it is the server's `guild` view; nothing here computes
// an effect that matters — the numbers shown are ECON's, for reading.
function allyReqCount(g) {
  const r = g && g.allyRequests;
  if (!r) return 0;
  const rows = Array.isArray(r) ? r : Object.keys(r).map(k => Object.assign({ gid: k }, typeof r[k] === "object" ? r[k] : {}));
  return rows.filter(x => x && (x.dir ? x.dir === "in" : !x.outgoing)).length;
}
function hallProgressHtml(g) {
  const lv = guildLevelOf(g);
  const fill = lv.maxed ? 100 : Math.max(0, Math.min(100, Math.round((lv.into / Math.max(1, lv.need)) * 100)));
  const banner = g.banner && g.banner.id && (+g.banner.until || 0) > Date.now() && ECON.GUILD_BANNERS ? ECON.GUILD_BANNERS[g.banner.id] : null;
  return `<div class="adGuildLevel">
      <div class="adLvlSeal"><small>LEVEL</small><b>${lv.level}</b></div>
      <div class="adLvlBody">
        <div class="adXpBar"><i style="width:${fill}%"></i></div>
        <small>${lv.maxed ? "The guild is at its peak." : `${Math.floor(lv.into).toLocaleString()} / ${Math.floor(lv.need).toLocaleString()} guild XP to level ${lv.level + 1}`}
          · ${(g.researchPoints | 0)} research point${(g.researchPoints | 0) === 1 ? "" : "s"}</small>
        ${banner ? `<div class="adBannerLive">⚑ ${esc(banner.name)} flies for ${Math.max(1, Math.round((g.banner.until - Date.now()) / 3600000))} more hour${Math.round((g.banner.until - Date.now()) / 3600000) > 1 ? "s" : ""}</div>` : ""}
      </div>
    </div>`;
}

function researchTreeHtml(g) {
  const R = ECON.GUILD_RESEARCH || {};
  const branches = ECON.GUILD_RESEARCH_BRANCHES || ["plunder", "arsenal", "bulwark", "delving"];
  const BR = { plunder: "PLUNDER", arsenal: "ARSENAL", bulwark: "BULWARK", delving: "DELVING" };
  const have = g.research || {};
  const isMaster = g.myRank === "master";
  const pts = g.researchPoints | 0;
  let html = `<p>Every guild level grants one research point. A rank costs the point <b>plus gold from the treasury</b> (${money(g.treasury)} on hand), and only the Guild Master can spend them. There are more ranks than points — specialise.</p>
    <div class="statRow"><div class="statBox"><small>RESEARCH POINTS</small><b>${pts}</b></div><div class="statBox"><small>TREASURY</small><b>${money(g.treasury)}</b></div><div class="statBox"><small>GUILD LEVEL</small><b>${guildLevelOf(g).level}</b></div></div>
    <div class="adTree">`;
  for (const b of branches) {
    html += `<div class="adBranch ${esc(b)}"><div class="adBranchHead">${BR[b] || esc(String(b).toUpperCase())}</div>`;
    for (const id of Object.keys(R)) {
      const n = R[id];
      if (n.branch !== b) continue;
      const rank = have[id] | 0, max = n.ranks | 0, maxed = rank >= max;
      const cost = !maxed && ECON.researchCost ? ECON.researchCost(id, rank + 1) : null;
      const afford = cost && pts >= (cost.points || 1) && (+g.treasury || 0) >= (cost.gold || 0);
      const pips = Array.from({ length: max }, (_, i) => `<span class="pip ${i < rank ? "on" : ""}"></span>`).join("");
      html += `<div class="adNode${rank > 0 ? " lit" : ""}${maxed ? " maxed" : ""}">
        <b>${esc(n.name)}</b> <span class="pips">${pips}</span><br/>
        <small>${esc(n.desc || "")}</small><br/>
        ${maxed ? `<small class="adOk">MASTERED</small>`
          : `<small class="muted">next: ${cost ? `${cost.points || 1} pt + ${money(cost.gold)}` : "—"}</small>
             ${isMaster ? `<button class="menuBtn ${afford ? "green" : ""}" ${afford ? "" : "disabled"} onclick="gameGuild.research(${jsq(id)})">RESEARCH</button>` : ""}`}
      </div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  if (!isMaster) html += `<p class="muted">Only the Guild Master can spend research. Officers and members can see what's been learned.</p>`;
  return html;
}
function openResearch() {
  if (!guildState) { toast("You have no guild."); return; }
  openMenu("GUILD RESEARCH", researchTreeHtml(guildState) +
    `<button class="menuBtn" onclick="gameGuild.openHall()">BACK TO THE HALL</button>`, true);
}
async function research(node) {
  try {
    const res = await netGuild({ action: "research", node });
    guildState = res.guild || res;
    const n = (ECON.GUILD_RESEARCH || {})[node];
    toast(`${n ? n.name : node} — rank ${((guildState.research || {})[node]) | 0}.`, 3500);
    openResearch();
  } catch (e) { toast(esc(e.message), 4000); }
}

function trophyHallHtml(g) {
  const T = ECON.TROPHY_TIERS || [];
  const tro = g.trophies || {};
  const ids = [].concat(ECON.GUILD_BOSS_ORDER || [], ECON.GUILD_MINIS || [], ECON.GUILD_SPECIAL_BOSSES || [])
    .filter((id, i, a) => a.indexOf(id) === i && ECON.GUILD_BOSSES[id]);
  let html = `<p>Every boss your guild fells is counted here. Bronze at ${(T[0] || {}).kills || 25} kills, Silver at ${(T[1] || {}).kills || 100}, Gold at ${(T[2] || {}).kills || 400} — and <b>Arcane</b> for a clear at delve ${(T[3] || {}).delve || 15} or deeper. Each trophy tier adds +1% material find in that boss's dungeon for every member.</p>
    <div class="adTrophyGrid">`;
  for (const id of ids) {
    const b = ECON.GUILD_BOSSES[id], rec = tro[id] || {};
    const tier = ECON.trophyTier ? ECON.trophyTier(rec) : 0;
    const next = T.find(t => t.kills && (rec.k | 0) < t.kills);
    const tn = tier ? ((T.find(t => t.tier === tier) || {}).name || "") : "";
    const pc = next ? Math.min(100, Math.round(((rec.k | 0) / next.kills) * 100)) : 100;
    html += `<div class="adTrophy t${tier}${rec.k ? "" : " none"}" style="--c:${esc(b.color || "#64748b")};--a:${esc(b.accent || "#e2e8f0")}">
      <div class="adTrophyGem">${(tier ? gIco("trophy", [id, tier], 40) : gIco("boss", id, 40, "iiSil")) || (tier ? ["", "Ⅰ", "Ⅱ", "Ⅲ", "✦"][tier] : "·")}</div>
      <b>${esc(b.name)}</b>
      <small>${(rec.k | 0).toLocaleString()} kill${(rec.k | 0) === 1 ? "" : "s"}${tn ? ` · <span class="adTier">${esc(tn)}</span>` : ""}</small>
      ${rec.dl ? `<small class="muted">deepest: delve ${rec.dl | 0}${rec.ms ? ` · best ${fmtMs(rec.ms)}` : ""}</small>` : ""}
      ${rec.fb ? `<small class="muted">first felled by ${esc(rec.fb)}</small>` : ""}
      ${next ? `<div class="adFill"><i style="width:${pc}%"></i></div>` : ""}
    </div>`;
  }
  return html + `</div>`;
}
function openTrophies() {
  if (!guildState) { toast("You have no guild."); return; }
  openMenu("TROPHY HALL", trophyHallHtml(guildState) +
    `<button class="menuBtn" onclick="gameGuild.openHall()">BACK TO THE HALL</button>`, true);
}

function matName(id) { const m = (ECON.MATERIALS || {})[id]; return m ? m.name : id; }
function vaultHtml(g) {
  const v = g.vault || {};
  const ids = (ECON.MATERIAL_IDS || Object.keys(ECON.MATERIALS || {}));
  const sigils = Object.keys(v).filter(k => /^sigil_/.test(k)).reduce((s, k) => s + (v[k] | 0), 0);
  const have = (k) => k === "sigil_any" ? sigils : (v[k] | 0);
  let html = `<p>The guild's shared materials. Any member can deposit after 24 hours in the guild (the Master straight away); officers and the Master can hand them out to a member. Every movement is logged.</p><div class="adChips">`;
  const held = Object.keys(v).filter(k => (v[k] | 0) > 0);
  if (!held.length) html += `<span class="muted">The vault is empty.</span>`;
  for (const k of held) {
    const m = (ECON.MATERIALS || {})[k];
    html += `<span class="adChip" style="--c:${esc((m && m.color) || "#c4b5fd")}">${esc(matName(k))} ×${(v[k] | 0).toLocaleString()}</span>`;
  }
  html += `</div>`;
  const opts = ids.map(k => `<option value="${esc(k)}">${esc(matName(k))}</option>`).join("");
  html += `<h3 class="section">DEPOSIT</h3>
    <div class="formRow"><select id="gvMat" class="menuInput">${opts}</select>
      <input id="gvN" class="menuInput" type="number" min="1" value="10" style="max-width:90px" />
      <button class="menuBtn green" onclick="gameGuild.vaultDeposit()">DEPOSIT</button></div>`;
  if (officerUp()) {
    const mem = (g.members || []).map(m => `<option value="${esc(m.user)}">${esc(m.user)}</option>`).join("");
    html += `<h3 class="section">HAND OUT</h3>
      <div class="formRow"><select id="gwMat" class="menuInput">${held.map(k => `<option value="${esc(k)}">${esc(matName(k))}</option>`).join("")}</select>
        <input id="gwN" class="menuInput" type="number" min="1" value="1" style="max-width:90px" />
        <select id="gwTo" class="menuInput">${mem}</select>
        <button class="menuBtn gold" onclick="gameGuild.vaultWithdraw()">GIVE</button></div>`;
  }
  // Banners
  const B = ECON.GUILD_BANNERS || {};
  const live = g.banner && g.banner.id && (+g.banner.until || 0) > Date.now();
  html += `<h3 class="section">BANNERS</h3><p class="muted">Woven from the vault. One banner flies at a time, for ${Math.round(((B.deep || {}).durMs || 86400000) / 3600000)} hours.</p><div class="adBanners">`;
  for (const id of Object.keys(B)) {
    const b = B[id], cost = b.cost || {};
    const ok = Object.keys(cost).every(k => have(k) >= cost[k]);
    const flying = live && g.banner.id === id;
    const fx = b.fx || {};
    const eff = fx.matFind ? `+${Math.round(fx.matFind * 100)}% material find for every member` : fx.dailyChestTier ? `each member's first clear of the day opens one chest tier higher` : "";
    html += `<div class="adBannerCard ${esc(id)}${flying ? " flying" : ""}">
      <div class="adBannerCloth">⚑</div><b>${esc(b.name)}</b><small>${esc(eff)}</small>
      <small class="muted">${Object.keys(cost).map(k => `${cost[k]} ${k === "sigil_any" ? "sigils (any)" : esc(matName(k))} (${have(k)})`).join(" · ")}</small>
      ${flying ? `<small class="adOk">FLYING — ${Math.max(1, Math.round((g.banner.until - Date.now()) / 60000))} min left</small>`
        : officerUp() ? `<button class="menuBtn ${ok && !live ? "gold" : ""}" ${ok && !live ? "" : "disabled"} onclick="gameGuild.raiseBanner(${jsq(id)})">RAISE</button>` : ""}
    </div>`;
  }
  html += `</div>`;
  const log = Array.isArray(g.vlog) ? g.vlog.slice().reverse() : [];
  if (log.length) {
    html += `<h3 class="section">VAULT LOG</h3><div class="adLog">`;
    for (const e of log.slice(0, 30)) {
      const who = e.by || e.user || "?", n = e.n | 0, mat = matName(e.mat || e.id || "");
      const what = e.kind === "withdraw" || e.to ? `gave ${n} ${esc(mat)} to ${esc(e.to || "?")}` : e.kind === "banner" ? `raised ${esc((B[e.banner || e.id] || {}).name || "a banner")}` : `deposited ${n} ${esc(mat)}`;
      html += `<div><small class="muted">${e.at ? new Date(e.at).toLocaleString() : ""}</small> <b>${esc(who)}</b> ${what}</div>`;
    }
    html += `</div>`;
  }
  return html;
}
function openVault() {
  if (!guildState) { toast("You have no guild."); return; }
  openMenu("GUILD VAULT", vaultHtml(guildState) + `<button class="menuBtn" onclick="gameGuild.openHall()">BACK TO THE HALL</button>`, true);
}
function adoptMats(res) {
  if (!res || !res.mats || typeof res.mats !== "object" || !window.gameGear || !gameGear.adoptChanges) return;
  try { gameGear.adoptChanges({ mats: res.mats, gems: res.gems }); } catch (e) {}
}
async function vaultDeposit() {
  const mat = (document.getElementById("gvMat") || {}).value, n = +(document.getElementById("gvN") || {}).value | 0;
  try { const res = await netGuild({ action: "vault_deposit", mat, n }); guildState = res.guild || res; adoptMats(res); toast(`Deposited ${n} ${matName(mat)}.`); openVault(); }
  catch (e) { toast(esc(e.message), 4000); }
}
async function vaultWithdraw() {
  const mat = (document.getElementById("gwMat") || {}).value, n = +(document.getElementById("gwN") || {}).value | 0, to = (document.getElementById("gwTo") || {}).value;
  try { const res = await netGuild({ action: "vault_withdraw", mat, n, to }); guildState = res.guild || res; toast(`Gave ${n} ${matName(mat)} to ${esc(to)}.`); openVault(); }
  catch (e) { toast(esc(e.message), 4000); }
}
async function raiseBanner(id) {
  try { const res = await netGuild({ action: "banner", banner: id }); guildState = res.guild || res; toast(`${(ECON.GUILD_BANNERS[id] || {}).name || "The banner"} is raised over the hall.`, 4000); openVault(); }
  catch (e) { toast(esc(e.message), 4000); }
}

// Leaderboards: all-time and weekly, per tier (deepest / fastest), plus the
// endless Depths and raid boards.
let recordsCache = null, recordsTab = "all", recordsTier = null;
function recEntryRow(e, i, kind) {
  const mine = guildState && e.gid === guildState.id;
  const val = kind === "fast" ? fmtMs(e.ms) : kind === "floor" ? `floor ${e.floor != null ? e.floor | 0 : e.dl | 0}` : `delve ${e.dl | 0}${e.ms ? ` · ${fmtMs(e.ms)}` : ""}`;
  const allies = e.allies && e.allies.length ? ` <small class="muted">with ${e.allies.map(t => "[" + esc(t) + "]").join(" ")}</small>` : "";
  return `<tr class="${mine ? "mine" : ""}"><td>${i + 1}</td><td>[${esc(e.tag || "?")}] ${esc(e.name || "")}${e.raid ? ` <span class="adPriv open">RAID</span>` : ""}${allies}</td><td>${val}</td><td>${e.n ? e.n | 0 : ""}</td></tr>`;
}
function recTable(list, kind, title) {
  let h = `<div class="adBoard"><b>${title}</b>`;
  if (!list || !list.length) return h + `<p class="muted">No entries yet.</p></div>`;
  h += `<div class="adPayWrap"><table class="adPay"><thead><tr><th>#</th><th>Guild</th><th>${kind === "fast" ? "Time" : kind === "floor" ? "Floor" : "Depth"}</th><th>Party</th></tr></thead><tbody>`;
  list.slice(0, 10).forEach((e, i) => { h += recEntryRow(e, i, kind); });
  return h + `</tbody></table></div></div>`;
}
function recordsHtml(res, tab, tier) {
  res = res || {};
  const order = ECON.GUILD_DUNGEON_ORDER.concat(["raid_nexus"]).filter(k => ECON.GUILD_DUNGEONS[k]);
  tier = tier && order.indexOf(tier) >= 0 ? tier : order[0];
  let html = `<div class="adChoice">
    <button class="menuBtn ${tab === "all" ? "gold" : ""}" onclick="gameGuild.openRecords('all')">ALL-TIME</button>
    <button class="menuBtn ${tab === "week" ? "gold" : ""}" onclick="gameGuild.openRecords('week')">THIS WEEK</button>
    <button class="menuBtn ${tab === "endless" ? "gold" : ""}" onclick="gameGuild.openRecords('endless')">ARCANE DEPTHS</button>
    <button class="menuBtn ${tab === "raid" ? "gold" : ""}" onclick="gameGuild.openRecords('raid')">RAIDS</button>
  </div>`;
  if (tab === "endless") {
    const en = res.endless || {};
    html += recTable(en.allTime, "floor", "DEEPEST DESCENTS — ALL-TIME");
    html += recTable(en.week && (en.week.list || en.week.top || en.week.entries || (Array.isArray(en.week) ? en.week : null)), "floor", "DEEPEST DESCENTS — THIS WEEK'S SEED");
    return html;
  }
  if (tab === "raid") return html + recTable(res.raidBest, "deep", "GREATEST RAIDS");
  html += `<div class="adChoice">${order.map(k => `<button class="menuBtn ${k === tier ? "gold" : ""}" style="${themeVars(k)}" onclick="gameGuild.openRecords(${jsq(tab)}, ${jsq(k)})">${esc(ECON.GUILD_DUNGEONS[k].name)}</button>`).join("")}</div>`;
  const src = tab === "week" ? (res.week || {}) : (res.top || {});
  const b = src[tier] || {};
  html += `<div class="adBoards">${recTable(b.deep, "deep", "DEEPEST")}${recTable(b.fast, "fast", "FASTEST")}</div>`;
  const mine = res.mine || {};
  const mt = (mine.tiers && mine.tiers[tier]) || (mine.records && mine.records[tier]) || mine[tier];
  if (mt) html += `<p class="muted">Your guild here: ${mt.clears != null ? `${mt.clears | 0} clears · ` : ""}best delve ${(mt.best != null ? mt.best : mt.dl) | 0}${(mt.bestMs || mt.ms) ? ` · fastest ${fmtMs(mt.bestMs || mt.ms)}` : ""}</p>`;
  return html;
}
async function openRecords(tab, tier) {
  if (!guildState) { toast("You have no guild."); return; }
  recordsTab = tab || recordsTab || "all";
  if (tier) recordsTier = tier;
  if (!recordsCache || !tab) {
    try { recordsCache = await netGuildDungeon({ action: "records" }); }
    catch (e) { recordsCache = recordsCache || {}; if (!tab) toast(esc(e.message), 3000); }
  }
  openMenu("RECORDS", recordsHtml(recordsCache, recordsTab, recordsTier) +
    `<button class="menuBtn" onclick="gameGuild.openHall()">BACK TO THE HALL</button>`, true);
}

// ---------------- THE GUILD LEADER (help NPC) ----------------
// Not the actual Guild Master — a fixture standing in every hall, purely to
// answer the same handful of "how does this work" questions new members ask.
// Entirely client-side: canned text, no round trip, nothing it says depends
// on which guild you're in beyond the numbers already in guildState.
const LEADER_FAQ = [
  { q: "How do I invite someone?", a: () =>
    `Only a Guild Master or Officer can invite, and only someone already in your guild's roster of trust — an outsider first has to hear about you and ask in person. Open the ROSTER here in the hall, type their name under INVITE, and they'll see it waiting next time they visit the Broker.` },
  { q: "What's the guild bank for?", a: () =>
    `Your own savings, just held by the guild instead of the Mayor's bank. Every deposit and withdrawal pays the Mayor's cut plus your Master's guild tax — currently ${pct((guildState && guildState.taxRate) || 0)} — and that tax is the ONLY thing that fills the treasury. Nothing forces you to use it over your own pocket; it exists so a guild has money to work with.` },
  { q: "What's the treasury, and where does interest come from?", a: () =>
    `The treasury is the guild's shared pot, filled only by members' bank taxes. The Master sets an interest rate paid out of it periodically to every banked member — set it higher than the treasury can actually cover and everyone just gets a smaller share, so a generous rate needs a treasury to back it.` },
  { q: "How do guild dungeons work?", a: () =>
    `Explore one connected dungeon together, using your minimap to track discovered passages. Enemy deaths persist across the whole expedition. Explore within your torchlight. A mini-boss seals the far door of the central chamber; defeat it, pass through, and explore the deeper wing to find the final boss. Claim its chest, then use the revealed exit. Clearing it pays the party and tithes ${pct(ECON.GUILD_DUNGEON_CUT || 0.1)} to the treasury. Along the way: elites and champions with magic affixes, shrines that bless the whole party, locked chests, secret walls, trial rooms, a sealed vault that wants three sigil shards, and a Glimmerthief worth chasing. If you go down, a friend can revive you.` },
  { q: "There are seven dungeons now. How do the deeper ones open?", a: () =>
    `The Sunken Crypt, Ember Forge, Hollow Throne and Ashen Roost are always open. Below them lie The Starlit Archive, The Singing Geode and The Rimeveil Abyss — each stays sealed until your guild has cleared the one before it, so the Roost opens the Archive and so on. Deeper dungeons drop higher item levels (up to 10), harder bosses and richer chests.` },
  { q: "What are delve levels and weekly affixes?", a: () =>
    `Once your guild clears a dungeon it can run it again at a delve level. Every level makes enemies tougher and hit harder, and pays a little more (up to +30% cash) with much better loot odds — Ancient items start dropping at delve 5, Arcane at delve 10. Beat the par time and your guild's ladder climbs (+1, or +2/+3 for a very fast clear); an over-par clear at delve 1+ pays ×0.75. From delve 2 up, this week's affixes join in (Tyrannical or Fortified, then a minor, a major and a seasonal affix at 4, 7 and 10). They change every week — the GUILD DUNGEONS board shows them.` },
  { q: "What is the Arcane Depths?", a: () =>
    `An endless descent that opens once your guild clears The Rimeveil Abyss. Each floor takes the look of one of the seven dungeons and gets deeper and deadlier; every fifth floor has a guardian and a sanctuary where the party banks what it has earned so far, and every tenth floor holds the Heart of the Depths. Leave at a sanctuary to keep your haul. There is also a weekly seed that everyone races on the same floors — the Records board keeps the deepest.` },
  { q: "How do multi-guild raids work?", a: () =>
    `Open a raid from the RAID BOARD in Guild Dungeons: pick the dungeon and delve, and choose who may join — invite only, your allied guilds, or anyone. Up to ${((window.DEPTHS && DEPTHS.RAID) || {}).MAX || 24} delvers from up to ${((window.DEPTHS && DEPTHS.RAID) || {}).MAX_GUILDS || 6} guilds. The Leyline Nexus is raid-only, but a raid of one is allowed. The payout is fair to every guild: each guild's share of the purse is sized by how many of its members fought, ${pct(ECON.GUILD_DUNGEON_CUT || 0.1)} of that share is tithed to that guild's OWN treasury, and every fighter gets the same cut they would get running alone. A guild is credited with the clear if one of its members has been in it for a day and it pulled at least half its weight on the boss. Raids also give +10% Delver XP and an extra material roll.` },
  { q: "What do guild levels and research do?", a: () =>
    `Every credited clear earns guild XP — more for deeper dungeons, higher delves and bigger contingents. Each level grants one research point. The Master spends a point plus treasury gold on the research tree: Plunder (material and magic find, vault gems), Arsenal (cheaper, safer forging), Bulwark (more HP, faster revives) and Delving (Keystone Lore lets you start any cleared dungeon at a higher delve, Pathfinders loosens par, Deep Charter speeds guild XP). Leftover skill points, once all skills are maxed, turn into research points.` },
  { q: "What are trophies, the vault and banners?", a: () =>
    `The Trophy Hall counts every boss your guild fells: Bronze, Silver and Gold at 25, 100 and 400 kills, and Arcane for a clear at delve 15+. Each tier adds material find in that boss's dungeon. The vault holds shared materials — anyone may deposit, officers hand them out — and officers can weave a banner from it: the Banner of the Deep (+10% material find) or the Banner of Plunder (better first chest of the day), for a day at a time.` },
  { q: "What about alliances?", a: () =>
    `Officers and the Master can propose alliances with up to five other guilds. Allies see each other's ALLIES-mode raids on the board and can join straight in. Either side can break an alliance at any time.` },
  { q: "How do skill points work?", a: () =>
    `Every ${ECON.GUILD_DUNGEONS_PER_POINT} guild dungeon clears earns the guild one skill point. Only the Master can spend it, on a mastery track that then trains faster for every member — not just whoever cleared the run. Once every skill is maxed, further points become research points.` },
  { q: "How do ranks work?", a: () =>
    `Master outranks Officer outranks Member. Only the Master can change tax and interest rates, spend skill points, or hand off the guild. Officers can invite and kick same as the Master, but can't touch a peer's rank or the guild's settings.` },
  { q: "How much does founding or rebranding cost?", a: () =>
    `Chartering a new guild runs ${money(ECON.GUILD_CREATE_COST)}. Once you have one, the Master can rebrand it — a new name costs ${money(ECON.GUILD_RENAME_COST)}, a new tag costs ${money(ECON.GUILD_TAG_CHANGE_COST)}, charged separately since you might only want one.` },
];
function openLeaderNPC() {
  if (!guildState) { toast("You have no guild."); return; }
  let html = `<p class="brokerSay">"Ask away. I've heard every question there is about how this place runs."</p>`;
  for (let i = 0; i < LEADER_FAQ.length; i++) {
    html += `<button class="menuBtn" style="display:block;width:100%;text-align:left;margin-top:6px" onclick="gameGuild.askLeader(${i})">${esc(LEADER_FAQ[i].q)}</button>`;
  }
  openMenu("THE GUILD LEADER", html);
}
function askLeader(i) {
  const item = LEADER_FAQ[i];
  if (!item) return openLeaderNPC();
  openMenu("THE GUILD LEADER", `
    <p class="brokerSay">"${esc(item.q)}"</p>
    <p>${esc(item.a())}</p>
    <button class="menuBtn gold" onclick="gameGuild.openLeaderNPC()">ASK SOMETHING ELSE</button>
  `);
}

// ---------------- GUILD BANK ----------------
function openBank() {
  if (!guildState) { toast("You have no guild."); return; }
  const g = guildState;
  const total = ECON.GUILD_BANK_MAYOR_TAX + g.taxRate;
  openMenu("GUILD BANK", `
    <p>Your own savings, held by the guild. Both ways, the Mayor takes ${pct(g.rates.mayorBank)} and your Guild Master takes ${pct(g.taxRate)} — <b>${pct(total)}</b> in total — and the Master's share is what fills the treasury.</p>
    <div class="statRow">
      <div class="statBox"><small>YOUR SAVINGS</small><b>${money(g.myBank)}</b></div>
      <div class="statBox"><small>ON HAND</small><b>${money(state.data.money)}</b></div>
      <div class="statBox"><small>INTEREST</small><b>${pct(g.interestRate)} / ${Math.round(g.rates.interestPeriod / 60000)}m</b></div>
    </div>
    <p class="muted">Interest is paid out of the guild treasury (${money(g.treasury)}). If it runs dry, it stops paying — the rate is a promise the treasury has to keep.</p>
    <div class="formRow"><input id="gbAmt" class="menuInput" type="number" min="1" placeholder="amount" /></div>
    <div class="flexRow">
      <button class="menuBtn green" onclick="gameGuild.bank('deposit')">DEPOSIT</button>
      <button class="menuBtn gold" onclick="gameGuild.bank('withdraw')">WITHDRAW</button>
      <button class="menuBtn" onclick="gameGuild.bank('withdraw', true)">TAKE IT ALL</button>
    </div>
    <button class="menuBtn" onclick="gameGuild.openHall()">BACK TO THE HALL</button>
  `);
}
async function bank(which, all) {
  const el = document.getElementById("gbAmt");
  const amount = all ? "all" : (+(el ? el.value : 0) || 0);
  try {
    const res = await netGuild({ action: which === "deposit" ? "bank_deposit" : "bank_withdraw", amount });
    guildState = res;
    state.data.money = res.money;
    const moved = which === "deposit" ? res.deposited : res.withdrew;
    toast(`${which === "deposit" ? "Banked" : "Withdrew"} ${money(moved)} — Mayor ${money(res.mayorTax)}, guild ${money(res.guildTax)}.`, 4000);
    updateHUD(); openBank();
  } catch (e) { toast(esc(e.message), 4000); }
}

// ---------------- TREASURY ----------------
function openTreasury() {
  if (!guildState) { toast("You have no guild."); return; }
  const g = guildState;
  openMenu("GUILD TREASURY", `
    <p>The guild's shared pot. It pays the interest on member savings, and it fills from the Guild Master's tax, the ${pct(g.rates.dungeonCut)} tithe on every guild dungeon clear, and donations.</p>
    <div class="statRow">
      <div class="statBox"><small>TREASURY</small><b>${money(g.treasury)}</b></div>
      <div class="statBox"><small>ON HAND</small><b>${money(state.data.money)}</b></div>
    </div>
    <h3 class="section">DONATE</h3>
    <p class="muted">Anyone in the guild can put money in; the Mayor takes ${pct(g.rates.mayorTreasury)} on the way.</p>
    <div class="formRow"><input id="gtAmt" class="menuInput" type="number" min="1" placeholder="amount" />
      <button class="menuBtn green" onclick="gameGuild.treasury('deposit')">DONATE</button></div>
    <h3 class="section">WITHDRAW</h3>
    ${canDo("canWithdraw")
      ? `<p class="muted">Guild Master and officers only. No tax on the way out.</p>
         <div class="formRow"><input id="gtOut" class="menuInput" type="number" min="1" placeholder="amount" />
           <button class="menuBtn red" onclick="gameGuild.treasury('withdraw')">WITHDRAW</button></div>`
      : `<p class="muted">Only the Guild Master and officers can draw from the treasury.</p>`}
    <button class="menuBtn" onclick="gameGuild.openHall()">BACK TO THE HALL</button>
  `);
}
async function treasury(which) {
  const el = document.getElementById(which === "deposit" ? "gtAmt" : "gtOut");
  const amount = +(el ? el.value : 0) || 0;
  try {
    const res = await netGuild({ action: which === "deposit" ? "treasury_deposit" : "treasury_withdraw", amount });
    guildState = res;
    state.data.money = res.money;
    toast(which === "deposit" ? `Donated ${money(res.donated)}.` : `Withdrew ${money(res.withdrew)}.`, 3500);
    updateHUD(); openTreasury();
  } catch (e) { toast(esc(e.message), 4000); }
}

// ---------------- THE PARTY LOBBY ----------------
// Guild dungeons are entered as a party, and a party is a room you stand in
// before the run: the leader picks the dungeon and invites guildmates, they
// accept or don't, and only when the leader hits START does anybody load into
// a floor. The server owns all of it — this renders what it reports.
let partyState = null;      // the lobby I'm in, or null
let partyInvites = [];      // lobbies that have asked for me

async function refreshParty() {
  try {
    const res = await netGuildDungeon({ action: "party_status" });
    partyState = res.party || null;
    partyInvites = res.invites || [];
  } catch (e) { partyState = null; partyInvites = []; }
}

// Open a lobby for a dungeon (the CREATE PARTY button on each row).
// `delve` defaults to whatever the tier card's picker is set to.
let partyWeekly = false;    // Arcane Depths: race this week's seed (sent on start)
let partyWeeklyFor = null;  // …for this party id only (a stale flag showed on other parties)
async function createParty(tier, delve, weekly) {
  if (delve == null) delve = delvePick[tier] | 0;
  try {
    const res = await netGuildDungeon({ action: "party_create", tier, delve: delve | 0 });
    partyState = res.party;
    partyWeekly = !!weekly; partyWeeklyFor = res.party ? res.party.id : null;
    openParty();
  } catch (e) { toast(esc(e.message), 4000); }
}
function setPartyWeekly(on) { partyWeekly = !!on; partyWeeklyFor = partyState ? partyState.id : null; openParty(true); }
const weeklyOn = (p) => !!p && (p.weekly != null ? !!p.weekly : partyWeekly && partyWeeklyFor === p.id);

function openParty(fresh) {
  if (!partyState) { openDungeons(); return; }
  const p = partyState;
  // The invite list reads the guild roster: pull it fresh so members who joined
  // (or came online) since the hall was opened show up (QA B15).
  if (!fresh && p.isLeader) refreshGuild().then(() => { const t = document.getElementById("menuTitle"); if (partyState && t && t.textContent === "PARTY") openParty(true); });
  const inParty = new Set(p.members.map(m => m.user));
  const pending = new Set(p.invited);
  // Everyone in the guild who is online, not already in, and not mid-invite.
  const askable = (guildState ? guildState.members : [])
    .filter(m => m.online && !inParty.has(m.user) && !pending.has(m.user));

  const dl = p.delve | 0;
  const endless = (ECON.GUILD_DUNGEONS[p.tier] || {}).mode === "endless";
  let html = `<div class="guildHead adPartyHead" style="${themeVars(p.tier)}">
      <b>${esc(p.name)}</b>${dl ? ` <span class="adDelveBadge">DELVE ${dl}</span>` : ""}${endless && weeklyOn(p) ? ` <span class="adDelveBadge">WEEKLY SEED</span>` : ""}
      <div class="muted">party of ${p.members.length} · led by ${esc(p.leader)}${p.maxDelve != null && !endless ? ` · guild ladder: delve ${p.maxDelve | 0}` : ""}</div>
    </div>
    ${dl || endless ? `<div class="adDelveInfo">${delveInfoHtml(p.tier, dl)}</div>` : ""}
    ${endless && p.isLeader ? `<label class="adRadio"><input type="checkbox" ${weeklyOn(p) ? "checked" : ""} onchange="gameGuild.setPartyWeekly(this.checked)"/> Race this week's seed (everyone descends the same floors; the weekly board keeps the deepest)</label>` : ""}
    ${p.isLeader && !endless ? `<p class="muted">To change the delve level, disband and open the dungeon again with a different pick.</p>` : ""}
    <p class="muted">Nobody enters until you start. Each extra fighter gives every part of the boss <b>+${Math.round(ECON.GUILD_BOSS.HP_PER_PLAYER * 100)}% HP</b>, and the purse splits between everyone who lands a hit on it.</p>`;

  html += `<h3 class="section">IN THE PARTY</h3>`;
  for (const m of p.members) {
    html += `<div class="friendItem">
      <div class="info"><span class="statusDot ${m.online ? "online" : ""}"></span><b>${esc(m.user)}</b>
        ${m.leader ? `<small class="muted">party leader</small>` : ""}</div>
      <div class="flexRow">${p.isLeader && !m.leader ? `<button class="menuBtn red" onclick="gameGuild.kickFromParty(${jsq(m.user)})">REMOVE</button>` : ""}</div>
    </div>`;
  }

  if (p.invited.length) {
    html += `<h3 class="section">WAITING TO ANSWER</h3>`;
    for (const u of p.invited) {
      html += `<div class="friendItem"><div class="info"><b>${esc(u)}</b> <small class="muted">invited</small></div>
        <div class="flexRow">${p.isLeader ? `<button class="menuBtn" onclick="gameGuild.kickFromParty(${jsq(u)})">CANCEL</button>` : ""}</div></div>`;
    }
  }

  if (p.isLeader) {
    html += `<h3 class="section">INVITE — GUILDMATES ONLINE</h3>`;
    if (!askable.length) {
      html += `<p class="muted">Nobody else from the guild is online right now. You can still run it alone.</p>`;
    } else {
      for (const m of askable) {
        html += `<div class="friendItem">
          <div class="info"><span class="statusDot online"></span><b>${esc(m.user)}</b>
            <small class="muted">${esc(ECON.GUILD_RANK_INFO[m.rank].label)}</small></div>
          <button class="menuBtn green" onclick="gameGuild.inviteToParty(${jsq(m.user)})">INVITE</button>
        </div>`;
      }
    }
  }

  html += `<div class="flexRow" style="margin-top:14px">
    ${p.isLeader
      ? `<button class="menuBtn red" onclick="gameGuild.startParty()">START THE RUN</button>`
      : `<p class="muted">Waiting for ${esc(p.leader)} to start.</p>`}
    <button class="menuBtn" onclick="gameGuild.leaveParty()">${p.isLeader ? "DISBAND" : "LEAVE PARTY"}</button>
  </div>`;
  openMenu("PARTY", html);
}

async function inviteToParty(user) {
  try { const res = await netGuildDungeon({ action: "party_invite", user }); partyState = res.party; toast(`Asked ${esc(user)}.`, 2500); openParty(); }
  catch (e) { toast(esc(e.message), 4000); }
}
async function kickFromParty(user) {
  try { const res = await netGuildDungeon({ action: "party_kick", user }); partyState = res.party; openParty(); }
  catch (e) { toast(esc(e.message), 4000); }
}
async function leaveParty() {
  try { await netGuildDungeon({ action: "party_leave" }); partyState = null; openDungeons(); }
  catch (e) { toast(esc(e.message), 4000); }
}
async function startParty() {
  // Close the lobby the moment you commit to starting, rather than waiting
  // on the round trip and whatever startDungeon() does afterward — the party
  // list has no reason to still be on screen once you've asked to go in.
  closeMenu();
  const p = partyState || {};
  const endless = (ECON.GUILD_DUNGEONS[p.tier] || {}).mode === "endless";
  const req = { action: "party_start", layout: "continuous", delve: p.delve | 0 };
  if (endless) req.weekly = weeklyOn(p);
  try {
    const res = await netGuildDungeon(req);
    partyState = null;
    // The leader loads in from the reply; everyone else gets the `start` event.
    // The 4th arg (B2) forwards delve / weekly; older startDungeon ignores it.
    gameCombat.startDungeon(res.tier, [], { runId: res.runId, seed: res.seed, state: res.state, initiate: res.initiate || null },
      { delve: res.delve != null ? res.delve : req.delve, weekly: !!req.weekly, raid: res.kind === "raid" });
  } catch (e) { toast(esc(e.message), 4000); }
}
async function acceptParty(id) {
  try { const res = await netGuildDungeon({ action: "party_accept", party: id }); partyState = res.party; partyInvites = []; openParty(); }
  catch (e) { toast(esc(e.message), 4000); }
}
async function declineParty(id) {
  try { const res = await netGuildDungeon({ action: "party_decline", party: id }); partyInvites = res.invites || []; closeMenu(); }
  catch (e) { toast(esc(e.message), 4000); }
}

// ---------------- GUILD DUNGEONS ----------------
// THE ARCANE DEPTHS board: seven story tiers (four always open, three sealed
// behind the one before), a delve picker per tier with this week's affixes,
// the endless Arcane Depths and the raid-only Leyline Nexus, and the entry to
// the multi-guild raid board. The server's `depths_info` is the truth; when it
// is missing (an older server) the same rows are derived from the guild view
// with the shared DEPTHS formulas so the board still renders.
let depthsInfo = null;          // last depths_info reply (merged over local rows)
const delvePick = {};           // tier -> chosen delve level in the picker

function tierPurse(k) {
  const d = ECON.GUILD_DUNGEONS[k]; if (!d) return 0;
  const b = ECON.GUILD_BOSSES[d.boss], mi = d.mini ? ECON.GUILD_BOSSES[d.mini] : null;
  const raw = (d.reward | 0) + (b ? b.reward | 0 : 0) + (mi ? mi.reward | 0 : 0);
  const cap = ECON.EARN_CAPS && ECON.EARN_CAPS[k] ? ECON.EARN_CAPS[k].cap : 0;
  return cap > 0 ? Math.min(raw, cap) : raw;
}
function localDepthsInfo() {
  const D = depthsMod();
  const g = guildState || {};
  const rec = g.depths || { tiers: {} };
  const keystone = ((g.research || {}).keystone) | 0;
  const pathf = ((g.research || {}).pathfinders) | 0;
  const keys = ECON.GUILD_DUNGEON_ORDER.concat(["raid_nexus", "arcane_depths"]).filter(k => ECON.GUILD_DUNGEONS[k]);
  const tiers = keys.map(k => {
    const cfg = ECON.GUILD_DUNGEONS[k];
    const tr = (rec.tiers && rec.tiers[k]) || {};
    const unlocked = D && D.tierUnlocked ? D.tierUnlocked(rec, k) : !cfg.unlockAfter;
    const loot = (ECON.DUNGEON_LOOT || {})[k] || {};
    let parMs = loot.parMs || 0;
    try { if (D && D.parMsFor && parMs) parMs = D.parMsFor(k, pathf); } catch (e) {}
    return {
      key: k, name: cfg.name, mode: cfg.mode || "story", unlocked,
      lockedWhy: unlocked ? "" : cfg.unlockAfter ? `Sealed until your guild clears ${ECON.GUILD_DUNGEONS[cfg.unlockAfter].name}.` : "Sealed.",
      clears: tr.clears | 0, delveUnlocked: tr.unlocked | 0,
      maxDelve: D && D.guildMaxDelve ? D.guildMaxDelve(tr, keystone) : 0,
      best: tr.best | 0, bestMs: tr.bestMs || 0, parMs,
      gearLvl: cfg.gearLvl, boss: cfg.boss, mini: cfg.mini, raidable: !!cfg.raidable, raidMin: cfg.raidMin || 0,
    };
  });
  let affixes = { week: 0, season: 0, list: [] };
  if (D && D.affixWeek && D.pickAffixes) {
    const week = D.affixWeek(Date.now());
    affixes = { week, season: D.affixSeason ? D.affixSeason(week) : 0,
      list: D.pickAffixes(week, D.DELVE_MAX || 30).map(id => (D.AFFIX_DEFS || {})[id]).filter(Boolean) };
  }
  const en = rec.endless || {};
  return { tiers, affixes, endless: { bestFloor: en.bestFloor | 0, weekly: en.weekly || null, unlocked: D && D.tierUnlocked ? D.tierUnlocked(rec, "arcane_depths") : false } };
}
// Server rows win field by field; anything the server leaves out is filled
// from the local derivation.
function mergeDepthsInfo(server) {
  const local = localDepthsInfo();
  if (!server || typeof server !== "object") return local;
  const byKey = {};
  for (const r of server.tiers || []) if (r && r.key) byKey[r.key] = r;
  return {
    tiers: local.tiers.map(r => Object.assign({}, r, byKey[r.key] || {})),
    affixes: server.affixes && Array.isArray(server.affixes.list) ? server.affixes : local.affixes,
    endless: Object.assign({}, local.endless, server.endless || {}),
  };
}

function affixChip(a, dim) {
  if (!a) return "";
  return `<span class="adAffix ${esc(a.slot || "")}${dim ? " dim" : ""}" title="${esc(a.desc || "")}"><b>${esc(a.name || a.id)}</b><small>L${a.minL | 0}+</small></span>`;
}
function currentWeek() {
  if (depthsInfo && depthsInfo.affixes && depthsInfo.affixes.week != null) return depthsInfo.affixes.week;
  const D = depthsMod();
  return D && D.affixWeek ? D.affixWeek(Date.now()) : 0;
}
// What a delve level does, in numbers straight from DEPTHS.
function delveInfoHtml(tier, L) {
  const D = depthsMod();
  const cfg = ECON.GUILD_DUNGEONS[tier] || {};
  if (cfg.mode === "endless") {
    return `<small>Each floor is deeper than the last: guardians every 5th floor, a sanctuary to bank the haul, and the Heart of the Depths every 10th. This week's affixes join as the floors deepen.</small>`;
  }
  L = L | 0;
  if (!D) return L ? `<small>Delve ${L}.</small>` : "";
  if (!L) return `<small class="muted">Delve 0 — the dungeon as it was built. No affixes, no ladder pressure.</small>`;
  const x = (n) => "×" + (Math.round(n * 100) / 100).toFixed(2);
  const ids = D.pickAffixes ? D.pickAffixes(currentWeek(), L) : [];
  const defs = D.AFFIX_DEFS || {};
  const par = (depthsInfo && (depthsInfo.tiers || []).find(r => r.key === tier) || {}).parMs;
  return `<div class="adDelveStats">
      <span><small>ENEMY HP</small><b>${x(D.delveHpMult(L))}</b></span>
      <span><small>DAMAGE</small><b>${x(D.delveDmgMult(L))}</b></span>
      <span><small>PURSE</small><b>${x(D.delveRewardMult(L))}</b></span>
      <span><small>LOOT QUALITY</small><b>${x(D.lootQualityMult ? D.lootQualityMult(L) : 1)}</b></span>
      <span><small>ELITES</small><b>${Math.round((D.eliteChance ? D.eliteChance(L) : 0) * 100)}%</b></span>
    </div>
    ${ids.length ? `<div class="adAffixRow">${ids.map(id => affixChip(defs[id])).join("")}</div>` : ""}
    <small class="muted">${par ? `Beat par ${fmtMs(par)} to climb the ladder (≤60% +3, ≤80% +2); over par pays ×0.75. ` : ""}${L >= 5 ? "Ancient drops unlocked. " : ""}${L >= 10 ? "Arcane drops unlocked." : ""}</small>`;
}
function pickDelve(tier, L) {
  delvePick[tier] = Math.max(0, L | 0);
  const el = document.getElementById("adDelve-" + tier);
  if (el) el.innerHTML = delveInfoHtml(tier, delvePick[tier]);
}

function lootPreviewHtml(k) {
  const L = (ECON.DUNGEON_LOOT || {})[k];
  if (!L) return "";
  const uq = (L.uniques || []).map(id => (ECON.GEAR_UNIQUES || {})[id]).filter(Boolean).map(u => u.name);
  const sets = (L.sets || (L.set ? [L.set] : [])).map(s => (ECON.GEAR_SETS || {})[s]).filter(Boolean).map(s => s.name);
  if (!uq.length && !sets.length) return "";
  return `<div class="adLoot">${sets.map(n => `<span class="adLootSet">✦ ${esc(n)}</span>`).join("")}${uq.map(n => `<span class="adLootUq">◈ ${esc(n)}</span>`).join("")}
    <a href="#" class="adLink" onclick="window.gameCodex&&gameCodex.open?gameCodex.open(${jsq(k)}):toast('The Codex is not open yet.');return false;">codex</a></div>`;
}
function tierCardHtml(r, idx) {
  const k = r.key, cfg = ECON.GUILD_DUNGEONS[k] || {};
  const boss = ECON.GUILD_BOSSES[r.boss || cfg.boss];
  const miniIds = (cfg.minis || (r.mini || cfg.mini ? [r.mini || cfg.mini] : [])).filter(id => ECON.GUILD_BOSSES[id]);
  const minis = miniIds.map(id => ECON.GUILD_BOSSES[id]);
  const unlocked = !!r.unlocked;
  const sealedTo = cfg.unlockAfter && ECON.GUILD_DUNGEONS[cfg.unlockAfter] ? ECON.GUILD_DUNGEONS[cfg.unlockAfter].name : "";
  const maxD = Math.max(0, r.maxDelve | 0);
  const pick = Math.min(maxD, delvePick[k] | 0);
  delvePick[k] = pick;
  const raidOnly = cfg.mode === "raid";
  let html = `<div class="adTierCard ${unlocked ? "open" : "sealed"} ${raidOnly ? "raid" : ""}" style="${themeVars(k)}">
    <div class="adRuneBorder" aria-hidden="true"></div>
    <div class="adTierNum">${gIco("tier", k, 44) || (raidOnly ? "⚝" : ROMAN[idx + 1] || idx + 1)}</div>
    <div class="adTierMain">
      <div class="adTierTitle"><b>${esc(cfg.name || k)}</b> <span class="adGL">ITEM LV ${r.gearLvl || cfg.gearLvl || "?"}</span>${raidOnly ? ` <span class="adPriv open">RAID · ${r.raidMin || cfg.raidMin || 1}+</span>` : ""}</div>
      <small class="adBlurb">${esc(cfg.blurb || "")}</small>
      <div class="adFoes">${boss ? `<span class="adBoss" style="--c:${esc(boss.accent || "#fff")}">${gIco("boss", r.boss || cfg.boss, 18) || "☠"} ${esc(boss.name)}</span>` : ""}${minis.map((m, i) => `<span class="adMini" style="--c:${esc(m.accent || "#fff")}">${gIco("boss", miniIds[i], 18) || "◆"} ${esc(m.name)}</span>`).join("")}</div>
      <div class="adStats">
        <span><small>CLEARS</small><b>${r.clears | 0}</b></span>
        <span><small>BEST DELVE</small><b>${r.best | 0}</b></span>
        <span><small>BEST TIME</small><b>${r.bestMs ? fmtMs(r.bestMs) : "—"}</b></span>
        <span><small>PAR</small><b>${r.parMs ? fmtMs(r.parMs) : "—"}</b></span>
        <span><small>PURSE</small><b>${money(tierPurse(k))}</b></span>
      </div>
      ${lootPreviewHtml(k)}`;
  if (!unlocked) {
    html += `<div class="adSeal">🜏 SEALED — ${sealedTo ? `until your guild clears <b>${esc(sealedTo)}</b>` : esc(r.lockedWhy || "not yet open to your guild")}</div>`;
  } else {
    if (maxD > 0) {
      let opts = "";
      for (let L = 0; L <= maxD; L++) opts += `<option value="${L}"${L === pick ? " selected" : ""}>Delve ${L}</option>`;
      html += `<div class="adDelvePick"><label>DELVE <select class="menuInput" onchange="gameGuild.pickDelve(${jsq(k)}, +this.value)">${opts}</select></label>
        <small class="muted">ladder: ${r.delveUnlocked | 0} · max ${maxD}</small></div>`;
    } else if (r.clears | 0) {
      html += `<small class="muted">Beat par to open delve 1.</small>`;
    } else {
      html += `<small class="muted">Clear it once to open the delve ladder.</small>`;
    }
    html += `<div class="adDelveInfo" id="adDelve-${esc(k)}">${delveInfoHtml(k, pick)}</div><div class="flexRow">`;
    if (raidOnly) {
      html += `<button class="menuBtn gold" onclick="window.gameRaidUI?gameRaidUI.openCreate(${jsq(k)}):toast('Raids are not open yet.')">OPEN A RAID LOBBY</button>`;
    } else {
      html += `<button class="menuBtn red" onclick="gameGuild.createParty(${jsq(k)})">CREATE PARTY</button>`;
      if (r.raidable || cfg.raidable) html += `<button class="menuBtn" onclick="window.gameRaidUI?gameRaidUI.openCreate(${jsq(k)}):toast('Raids are not open yet.')">RAID IT</button>`;
    }
    html += `</div>`;
  }
  return html + `</div></div>`;
}
function endlessCardHtml(info) {
  const k = "arcane_depths", cfg = ECON.GUILD_DUNGEONS[k];
  if (!cfg) return "";
  const row = (info.tiers || []).find(r => r.key === k) || {};
  const en = info.endless || {};
  const unlocked = !!(en.unlocked || row.unlocked);
  const wk = en.weekly || {};
  const sealedTo = cfg.unlockAfter && ECON.GUILD_DUNGEONS[cfg.unlockAfter] ? ECON.GUILD_DUNGEONS[cfg.unlockAfter].name : "";
  return `<div class="adTierCard endless ${unlocked ? "open" : "sealed"}" style="${themeVars(k)}">
    <div class="adRuneBorder" aria-hidden="true"></div>
    <div class="adTierNum">∞</div>
    <div class="adTierMain">
      <div class="adTierTitle"><b>${esc(cfg.name)}</b> <span class="adGL">ITEM LV 8–10</span></div>
      <small class="adBlurb">${esc(cfg.blurb || "")}</small>
      <div class="adFoes"><span class="adMini">◆ a guardian every 5th floor</span><span class="adBoss">☠ ${esc((ECON.GUILD_BOSSES.heart || {}).name || "The Heart")} every 10th</span></div>
      <div class="adStats">
        <span><small>GUILD BEST</small><b>${en.bestFloor ? "floor " + (en.bestFloor | 0) : "—"}</b></span>
        <span><small>THIS WEEK</small><b>${wk.bestFloor ? "floor " + (wk.bestFloor | 0) : "—"}</b></span>
      </div>
      ${unlocked ? `<div class="adDelveInfo">${delveInfoHtml(k, 0)}</div>
      <div class="flexRow">
        <button class="menuBtn red" onclick="gameGuild.createParty('arcane_depths', 0, false)">DESCEND</button>
        <button class="menuBtn gold" onclick="gameGuild.createParty('arcane_depths', 0, true)">WEEKLY SEED</button>
        <button class="menuBtn" onclick="gameGuild.openRecords('endless')">DEPTHS BOARD</button>
      </div>` : `<div class="adSeal">🜏 SEALED — until your guild clears <b>${esc(sealedTo)}</b></div>`}
    </div></div>`;
}
function dungeonsHtml(info, invites, rates) {
  const cut = rates && rates.dungeonCut != null ? rates.dungeonCut : ECON.GUILD_DUNGEON_CUT;
  let html = `<div class="adDepthsHero">
      <div class="adRunes" aria-hidden="true">ᚦᛖ · ᚨᚱᚲᚨᚾᛖ · ᛞᛖᛈᚦᛊ</div>
      <p>Seven dungeons beneath the town, each sealed by something the quest board will not name. Every clear tithes <b>${pct(cut)}</b> to your treasury; the rest splits between everyone who landed a hit on the boss, and each of them rolls their own loot.</p>
      <p class="muted">More fighters means a sturdier boss — bring people who will actually swing. <a href="#" class="adLink" onclick="gameGear.openArmory();return false;">The Armory</a> is where you wear what you find.</p>
    </div>`;
  const list = info.affixes && info.affixes.list || [];
  if (list.length) {
    html += `<div class="adWeek"><small>THIS WEEK'S AFFIXES${info.affixes.week != null ? ` · week ${info.affixes.week | 0}` : ""}</small><div class="adAffixRow">${list.map(a => affixChip(a)).join("")}</div>
      <small class="muted">They join at delve 2, 4, 7 and 10. Hover (or long-press) for what each does.</small></div>`;
  }
  if (invites && invites.length) {
    html += `<h3 class="section">YOU'VE BEEN ASKED ALONG</h3>`;
    for (const inv of invites) {
      html += `<div class="shopItem"><div class="info"><b>${esc(inv.name)}</b><br/>
        <small>${esc(inv.by)}'s party · ${inv.members} ${inv.members === 1 ? "member" : "members"}</small></div>
        <div class="flexRow">
          <button class="menuBtn green" onclick="gameGuild.acceptParty(${jsq(inv.party)})">JOIN</button>
          <button class="menuBtn red" onclick="gameGuild.declineParty(${jsq(inv.party)})">NO</button>
        </div></div>`;
    }
  }
  html += `<div class="adRaidBanner">
      <div><b>⚔ MULTI-GUILD RAID BOARD</b><br/><small>Join forces with other guilds — every guild is paid and credited as if it ran alone.</small></div>
      <button class="menuBtn gold" onclick="window.gameRaidUI?gameRaidUI.open():toast('Raids are not open yet.')">OPEN</button></div>`;
  html += `<div class="adRaidBanner" style="border-color:#fde68a">
      <div><b>✦ THE DELVER'S JOURNEY</b><br/><small>Your Path, this week's Great Vault and Challenge, Mythic Hunts and artifacts.</small></div>
      <button class="menuBtn gold" onclick="window.gameJourney?gameJourney.open('week'):toast('The Journey is not open yet.')">OPEN</button></div>`;
  html += `<h3 class="section">THE SEVEN DUNGEONS</h3>
    <p class="muted">Opening one makes you the party leader. Invite whoever you want from the guild, then start when everyone's in.</p><div class="adTierList">`;
  const story = (info.tiers || []).filter(r => (ECON.GUILD_DUNGEONS[r.key] || {}).mode !== "raid" && (ECON.GUILD_DUNGEONS[r.key] || {}).mode !== "endless");
  story.forEach((r, i) => { html += tierCardHtml(r, i); });
  html += `</div><h3 class="section">BEYOND THE SEVEN</h3><div class="adTierList">`;
  html += endlessCardHtml(info);
  const nexus = (info.tiers || []).find(r => r.key === "raid_nexus");
  if (nexus) html += tierCardHtml(nexus, 7);
  html += `</div>`;
  return html;
}

async function openDungeons() {
  if (!guildState) { toast("Guild dungeons are for guilds. Talk to the broker."); return; }
  await refreshParty();
  // Already in a lobby? That is the screen you want, not the list.
  if (partyState) { openParty(); return; }
  if (window.gameRaidUI && gameRaidUI.state && gameRaidUI.state()) { gameRaidUI.openLobby(); return; }
  let server = null;
  try { server = await netGuildDungeon({ action: "depths_info" }); } catch (e) { server = null; }
  depthsInfo = mergeDepthsInfo(server);
  openMenu("GUILD DUNGEONS", dungeonsHtml(depthsInfo, partyInvites, guildState.rates), true);
}

// ---------------- MASTERY ----------------
function openMastery() {
  const m = masteryState;
  if (!m) { toast("Mastery is still loading."); return; }
  let html = `<p>Mastery levels come from doing the work — landing fish, cooking, harvesting, and fighting through dungeons. The bonuses are small and permanent.</p>`;
  for (const s of ECON.MASTERY_SKILLS) {
    const t = m[s], info = ECON.MASTERY_INFO[s];
    const mult = (m.xpMult && m.xpMult[s]) || 1;
    let effect = "";
    if (s === "fishing") effect = `+${Math.round(ECON.masteryFishBonus(t.level) * 100)}% weight on every rarity above common`;
    else if (s === "cooking") effect = `${Math.round(ECON.masteryCookBias(t.level) * 100)}% skew toward the top of a meal's luck range`;
    else if (s === "farming") effect = `+${Math.round(ECON.masteryFarmBonus(t.level) * 100)}% chance of a bonus crop per harvest`;
    else effect = `x${ECON.masteryCombatMult(t.level).toFixed(2)} damage in dungeons`;
    html += `<div class="masteryRow">
      <div class="info"><b>${info.emoji} ${info.label} — Lv ${t.level}${t.maxed ? " (MAX)" : ""}</b>
        ${mult > 1 ? `<span class="guildBonus">guild +${Math.round((mult - 1) * 100)}% XP</span>` : ""}
        <br/><small>${effect}</small>
        <br/><small class="muted">${esc(info.blurb)}</small></div>
      <div class="xpBar"><div class="xpFill" style="width:${Math.round(t.pct * 100)}%"></div></div>
      <small class="muted">${t.maxed ? "maxed out" : `${t.into.toLocaleString()} / ${t.need.toLocaleString()} XP`}</small>
    </div>`;
  }
  openMenu("MASTERY", html);
}

// ---------------- THE HALL DOOR ----------------
// Paint the hall's icons (dungeon boards, trophy room) during idle time so the
// first open of each station doesn't stall on PNG encoding.
let guildIconsWarmed = false;
function warmGuildIcons() {
  const I = typeof window !== "undefined" && window.ItemIcons;
  if (guildIconsWarmed || !I || !I.prewarm || !ECON.GUILD_BOSSES) return;
  guildIconsWarmed = true;
  const jobs = [];
  for (const k of Object.keys(ECON.GUILD_DUNGEONS || {})) jobs.push(["tier", k, 44]);
  const tiers = (ECON.TROPHY_TIERS || []).map(t => t.tier);
  for (const id of Object.keys(ECON.GUILD_BOSSES)) {
    jobs.push(["boss", id, 18], ["boss", id, 40]);
    for (const t of tiers) jobs.push(["trophy", [id, t], 40]);
  }
  I.prewarm(jobs);
}

async function enterGuildHall() {
  if (!guildState) { toast("That door isn't yours to open."); return; }
  warmGuildIcons();
  state.area = "interior_guild";
  state.pos.x = 512; state.pos.y = 540;
  state.facing = "up";
  updateHUD();
  toast(`[${esc(guildState.tag)}] ${esc(guildState.name)} — walk to a station and press E.`);
}

// ---------------- POST-RUN RESULTS ----------------
// One entry point for a settlement (the `complete` reply, a sanctuary payout,
// `depths_leave`, or the `reward` push): the loot reveal first (B4b, falling
// back to the old toast list), then the per-guild payout breakdown (raid-ui).
function showRunResults(res) {
  if (!res) return;
  // The server's `complete`, sanctuary and `reward` replies carry `tier` (B2);
  // the run's own tier is only the fallback for an older server, taken now
  // before the reveal plays and the dungeon ends (QA B2: header read "?").
  if (!res.tier && state.dungeon && state.dungeon.tier) res = Object.assign({}, res, { tier: state.dungeon.tier });
  if (res.tier && window.gameRaidUI && gameRaidUI.noteTier) gameRaidUI.noteTier(res.tier);
  let p = null;
  try {
    if (window.gameLootReveal && typeof gameLootReveal.show === "function") {
      p = gameLootReveal.show(res, { source: res.segment ? "sanctuary" : "clear", chestTier: res.chestTier | 0 });
    } else if (window.gameGear && gameGear.announceLoot) {
      gameGear.announceLoot(res.loot, res.gear);
    }
  } catch (e) { if (window.gameGear && gameGear.announceLoot) gameGear.announceLoot(res.loot, res.gear); }
  const after = () => { if (window.gameRaidUI && gameRaidUI.showResults && (res.settlement || res.delve || res.delver)) gameRaidUI.showResults(res); };
  if (p && typeof p.then === "function") p.then(after, after); else after();
}

// ---------------- server events ----------------
if (window.NET) {
  NET.on("guild_invite", (m) => {
    guildInvites[m.guild] = { by: m.by, at: Date.now(), name: m.name, tag: m.tag };
    toast(`${esc(m.by)} invited you to [${esc(m.tag)}] ${esc(m.name)} — the broker in the Adventurers Guild has the paperwork.`, 7000);
  });
  NET.on("guild", (m) => {
    if (m.kind === "kicked") { guildState = null; toast(`You were removed from ${esc(m.name)}${m.refunded ? ` — ${money(m.refunded)} returned` : ""}.`, 6000); updateHUD(); return; }
    if (m.kind === "skill_point") toast(`Your guild earned a skill point (${m.clears} clears).`, 5000);
    // An auto-settled chest (nobody opened it in time) has no claimer.
    if (m.kind === "clear") toast(`${m.by ? esc(m.by) : "Your guild"} cleared a guild dungeon — ${money(m.tithe)} tithed to the treasury.`, 5000);
    if (m.kind === "joined") toast(`${esc(m.user)} joined the guild.`, 3500);
    // THE ARCANE DEPTHS guild pushes.
    if (m.kind === "level_up") toast(`✦ Your guild reached level ${m.level}! A research point is waiting for the Master.`, 6000);
    if (m.kind === "research") { const n = (ECON.GUILD_RESEARCH || {})[m.node]; toast(`Research: ${n ? n.name : m.node} is now rank ${m.rank}.`, 4500); }
    if (m.kind === "vault" && m.by && m.by !== state.user) toast(`${esc(m.by)} moved materials in the guild vault.`, 3000);
    if (m.kind === "banner" && m.banner && m.banner.id) toast(`⚑ ${((ECON.GUILD_BANNERS || {})[m.banner.id] || {}).name || "A banner"} is raised over the hall.`, 5000);
    if (m.kind === "trophy") { const b = ECON.GUILD_BOSSES[m.boss]; const t = (ECON.TROPHY_TIERS || []).find(x => x.tier === m.tier); toast(`${gIco("trophy", [m.boss, m.tier], 22) || "🏆"} ${t ? t.name : "New"} trophy: ${b ? b.name : m.boss}.`, 5000); }
    if (m.kind === "record") {
      // The endless Depths records floors, the story tiers record delve levels.
      const endless = (ECON.GUILD_DUNGEONS[m.tier] || {}).mode === "endless";
      const depth = endless ? `floor ${(m.floor != null ? m.floor : m.dl) | 0}` : `delve ${m.dl | 0}`;
      toast(`📜 New guild record in ${esc((ECON.GUILD_DUNGEONS[m.tier] || {}).name || m.tier)}: ${depth}${m.ms ? ` in ${fmtMs(m.ms)}` : ""}.`, 5000);
    }
    if (m.kind === "ally_request") toast(`${m.tag ? `[${esc(m.tag)}] ` : ""}${m.name || "A guild"} proposes an alliance — see ALLIANCES in the hall.`, 6000);
    if (m.kind === "ally") toast(`${m.tag ? `[${esc(m.tag)}] ` : ""}${m.name || "A guild"} is now your ally.`, 5000);
    if (m.kind === "ally_removed") toast(`The alliance with ${m.tag ? `[${esc(m.tag)}] ` : ""}${m.name || "a guild"} is over.`, 5000);
    if (m.kind === "record" || m.kind === "trophy") recordsCache = null;
    refreshGuild().then(() => {
      // Keep an open progression screen live (research spends, vault moves…).
      const t = (document.getElementById("menuTitle") || {}).textContent;
      const menuShown = !document.getElementById("menu") || !document.getElementById("menu").classList.contains("hidden");
      if (!menuShown || !guildState) return;
      if (t === "GUILD RESEARCH") openResearch();
      else if (t === "GUILD VAULT") openVault();
      else if (t === "TROPHY HALL") openTrophies();
      else if (t === "PARTY" && partyState) openParty(true);
    });
  });
  NET.on("guild_party", (m) => {
    if (m.kind === "invited") {
      partyInvites = partyInvites.filter(i => i.party !== m.party);
      partyInvites.push({ party: m.party, by: m.by, tier: m.tier, name: m.name, members: 1, guild: m.guild });
      toast(`${esc(m.by)} wants you in a party for ${esc(m.name)} — open GUILD DUNGEONS to answer.`, 7000);
      return;
    }
    if (m.kind === "disbanded" || m.kind === "removed") {
      const wasMine = partyState && partyState.id === m.party;
      partyState = null;
      partyInvites = partyInvites.filter(i => i.party !== m.party);
      // party_start disbands the lobby (reason 'started') and pushes this to
      // EVERY member, including the leader whose own party_start reply is
      // what's putting them in the dungeon right now. Racing that reply with
      // this push reopened the dungeon list right on top of (or right after)
      // the leader's own transition in — "started" means the party is fine,
      // it just isn't a lobby anymore.
      if (wasMine && m.reason !== "started") {
        toast(m.kind === "removed" ? "You were removed from the party." : "The party broke up.", 4000);
        if (state.area.startsWith("interior_")) openDungeons();
      }
      return;
    }
    // roster / joined / left — the server sends the whole view, so just take it.
    if (m.view) {
      partyState = m.view;
      if (m.kind === "joined" && m.user !== state.user) toast(`${esc(m.user)} joined the party.`, 3000);
      if (m.kind === "left") toast(`${esc(m.user)} left the party.`, 3000);
      const menu = document.getElementById("menuTitle");
      if (menu && menu.textContent === "PARTY") openParty();
    }
  });

  NET.on("guild_dungeon", (m) => {
    if (m.kind === "start" && m.by !== state.user) {
      // The leader started the party's run — everyone loads the same floor.
      partyState = null;
      toast(`${esc(m.by)} is taking the party into ${ECON.GUILD_DUNGEONS[m.tier].name}.`, 5000);
      if (window.gameRaidUI && gameRaidUI.closeResults) gameRaidUI.closeResults();
      if (state.area === "neighborhood" || state.area.startsWith("interior_")) {
        // The server already has us in this run — join it, don't open another.
        gameCombat.startDungeon(m.tier, [], { runId: m.runId, seed: m.seed, state: m.state, initiate: m.initiate || null },
          { delve: m.delve | 0, weekly: !!m.weekly, raid: m.kind === "raid" || m.runKind === "raid" || !!(m.guilds && Object.keys(m.guilds).length > 1) });
      }
    } else if (m.kind === "enemies") {
      // A guildmate's kills, applied to our copy of the floor.
      if (state.dungeon && state.dungeon.runId === m.runId) gameCombat.applyEnemyChanges(m.changed);
    } else if (m.kind === "floor") {
      // Whoever reported the stair moves the WHOLE party down it.
      gameCombat.adoptServerFloor(m);
    } else if (m.kind === "reward") {
      if (m.money != null) state.data.money = m.money;
      const lf = (m.overflow && m.overflow.length) ? ` ${m.overflow.length} piece${m.overflow.length === 1 ? "" : "s"} went to the Lost & Found (Armory).` : "";
      if (m.auto) {
        // Nobody opened the chest in time (or the party walked out / wiped
        // after the kill): the server opened it for everyone.
        toast(`Your unclaimed chest was opened for you — your share ${money(m.gained)}.${lf}`, 7000);
      } else {
        toast((m.segment ? `Sanctuary reached — your share ${money(m.gained)}.` : `Guild dungeon cleared — your share ${money(m.gained)}.`) + lf, 5000);
      }
      // A party member who did not call `complete` still gets their own roll
      // of the loot table; it arrives on this event rather than a reply.
      // The loot reveal (B4b) plays first, then the payout breakdown.
      showRunResults(m);
      // The run is settled: whatever chest we still see is spent, so it must
      // not keep offering PRESS E (a `complete` now would only be refused).
      if (state.dungeon && state.dungeon.runId === m.runId && (state.dungeon.continuous || !m.segment)) {
        state.dungeon.exitReady = true;
        if (state.dungeon.chest) { state.dungeon.chest.claimed = true; state.dungeon.chest.state = 'open'; }
      }
      // The pack, materials and Lost & Found changed server-side (B4).
      if (window.gameGear && gameGear.refresh) { try { gameGear.refresh(); } catch (e) {} }
      updateHUD();
    }
  });
  NET.on("mastery_level", (m) => {
    const info = ECON.MASTERY_INFO[m.skill];
    toast(`${info.emoji} ${info.label} mastery is now level ${m.level}.`, 5000);
    refreshGuild();
  });
}

window.gameGuild = {
  refresh: refreshGuild, myGuild, myRank,
  openBroker, createGuild, acceptInvite, declineInvite, browse,
  openHall, invite, setRank, kick, saveRates, renameGuild, spendSkill, leave,
  openLeaderNPC, askLeader,
  openBank, bank, openTreasury, treasury,
  openDungeons, openMastery, enterGuildHall,
  createParty, openParty, inviteToParty, kickFromParty, leaveParty, startParty,
  acceptParty, declineParty, refreshParty,
  // THE ARCANE DEPTHS
  pickDelve, setPartyWeekly, showRunResults,
  openResearch, research, openTrophies, openVault, vaultDeposit, vaultWithdraw, raiseBanner, openRecords,
  depthsInfo: () => depthsInfo,
  // pure renderers (js/raid-ui.test.js)
  _render: { dungeonsHtml, tierCardHtml, delveInfoHtml, researchTreeHtml, trophyHallHtml, vaultHtml, recordsHtml, hallProgressHtml, mergeDepthsInfo },
};
