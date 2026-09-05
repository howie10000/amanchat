/* GUILDS & MASTERY — the broker in the Adventurers Guild, the guild hall
   behind his door, and the mastery panel.

   Everything with a price or a permission on it is a round-trip: this file
   renders what the server says and asks it to change things. It never decides
   who may withdraw, what a tax is worth, or whether a run paid out. */

let guildState = null;      // last `guild` op view, or null when guildless
let masteryState = null;    // last `mastery` op view
let guildInvites = {};

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const money = (n) => "$" + Math.max(0, Math.floor(+n || 0)).toLocaleString();
const pct = (r) => (Math.round((+r || 0) * 10000) / 100).toFixed(2) + "%";

function myGuild() { return guildState; }
function myRank() { return guildState ? guildState.myRank : null; }
function canDo(power) { return !!guildState && ECON.guildCan(guildState.myRank, power); }

// Pull guild + mastery in one go. Called on login, after anything that changes
// either, and whenever a guild event lands.
async function refresh() {
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
        <small>${esc(ECON.GUILD_RANK_INFO[guildState.myRank].label)} · ${guildState.memberCount}/${guildState.maxMembers} members · ${guildState.clears} clears</small></div>
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
          <button class="menuBtn green" onclick="gameGuild.acceptInvite('${esc(gid)}')">JOIN</button>
          <button class="menuBtn red" onclick="gameGuild.declineInvite('${esc(gid)}')">NO</button>
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
    toast(`[${res.guild.tag}] ${res.guild.name} is chartered. The door is yours.`, 5000);
    updateHUD();
    openHall();
  } catch (e) { toast(e.message, 4000); }
}
async function acceptInvite(gid) {
  try {
    const res = await netGuild({ action: "accept", guild: gid });
    guildState = res.guild;
    guildInvites = {};
    toast(`You're in — [${res.guild.tag}] ${res.guild.name}.`, 4000);
    openHall();
  } catch (e) { toast(e.message, 4000); }
}
async function declineInvite(gid) {
  try { const res = await netGuild({ action: "decline", guild: gid }); guildInvites = res.invites || {}; openBroker(); }
  catch (e) { toast(e.message); }
}
async function browse() {
  try {
    const res = await netGuild({ action: "browse" });
    let html = `<p>Guilds in town, busiest first. Ask a member for an invitation — the broker doesn't do introductions.</p>`;
    if (!res.guilds.length) html += `<p class="muted">Nobody has chartered one yet. Could be you.</p>`;
    for (const g of res.guilds) {
      html += `<div class="shopItem"><div class="info"><b>[${esc(g.tag)}] ${esc(g.name)}</b><br/>
        <small>${g.members}/${g.maxMembers} members · ${g.clears} guild dungeon${g.clears === 1 ? "" : "s"} cleared · led by ${esc(g.master)}</small>
        ${g.motd ? `<br/><small class="muted">"${esc(g.motd)}"</small>` : ""}</div></div>`;
    }
    html += `<button class="menuBtn" onclick="gameGuild.openBroker()">BACK</button>`;
    openMenu("RECRUITING", html);
  } catch (e) { toast(e.message); }
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
      <button class="menuBtn" onclick="gameGear.openArmoury()">ARMOURY</button>
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
        ? `<button class="menuBtn green" onclick="gameGuild.setRank('${esc(m.user)}','officer')">PROMOTE</button>`
        : m.rank === "officer" ? `<button class="menuBtn" onclick="gameGuild.setRank('${esc(m.user)}','member')">DEMOTE</button>` : "";
      controls += `<button class="menuBtn red" onclick="gameGuild.kick('${esc(m.user)}')">KICK</button>`;
    } else if (canDo("canKick") && m.rank === "member" && m.user !== state.user) {
      controls += `<button class="menuBtn red" onclick="gameGuild.kick('${esc(m.user)}')">KICK</button>`;
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
      <button class="menuBtn gold" onclick="gameGuild.saveRates()">SAVE</button>`;
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
  try { const res = await netGuild({ action: "invite", user: who }); guildState = res.guild; toast(`Invitation sent to ${res.invited}.`); openHall(); }
  catch (e) { toast(e.message, 4000); }
}
async function setRank(user, rank) {
  try { const res = await netGuild({ action: "set_rank", user, rank }); guildState = res.guild; openHall(); }
  catch (e) { toast(e.message, 4000); }
}
async function kick(user) {
  if (!confirm(`Remove ${user} from the guild? Their guild savings are returned to them.`)) return;
  try { const res = await netGuild({ action: "kick", user }); guildState = res.guild; toast(`${user} has been removed.`); openHall(); }
  catch (e) { toast(e.message, 4000); }
}
async function saveRates() {
  const tax = (+(document.getElementById("gTax") || {}).value || 0) / 100;
  const int = (+(document.getElementById("gInt") || {}).value || 0) / 100;
  const motd = (document.getElementById("gMotd") || {}).value || "";
  try { const res = await netGuild({ action: "set_rates", taxRate: tax, interestRate: int, motd }); guildState = res.guild; toast("Settings saved."); openHall(); }
  catch (e) { toast(e.message, 4000); }
}
async function spendSkill(skill) {
  try { const res = await netGuild({ action: "spend_skill", skill }); guildState = res; toast(`${ECON.MASTERY_INFO[skill].label} mastery rank ${res.rank} for the whole guild.`, 4000); await refresh(); openHall(); }
  catch (e) { toast(e.message, 4000); }
}
async function leave() {
  if (!confirm("Leave the guild? You keep whatever you had banked with them.")) return;
  try {
    const res = await netGuild({ action: "leave" });
    guildState = null;
    state.data.money = res.money;
    toast(res.refunded > 0 ? `You're out. ${money(res.refunded)} returned.` : "You're out.", 4000);
    updateHUD(); closeMenu();
  } catch (e) { toast(e.message, 4000); }
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
  } catch (e) { toast(e.message, 4000); }
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
  } catch (e) { toast(e.message, 4000); }
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
async function createParty(tier) {
  try {
    const res = await netGuildDungeon({ action: "party_create", tier });
    partyState = res.party;
    openParty();
  } catch (e) { toast(e.message, 4000); }
}

function openParty() {
  if (!partyState) { openDungeons(); return; }
  const p = partyState;
  const inParty = new Set(p.members.map(m => m.user));
  const pending = new Set(p.invited);
  // Everyone in the guild who is online, not already in, and not mid-invite.
  const askable = (guildState ? guildState.members : [])
    .filter(m => m.online && !inParty.has(m.user) && !pending.has(m.user));

  let html = `<div class="guildHead">
      <b>${esc(p.name)}</b>
      <div class="muted">party of ${p.members.length} · led by ${esc(p.leader)}</div>
    </div>
    <p class="muted">Nobody enters until you start. Each extra fighter gives every part of the boss <b>+${Math.round(ECON.GUILD_BOSS.HP_PER_PLAYER * 100)}% HP</b>, and the purse splits between everyone who lands a hit on it.</p>`;

  html += `<h3 class="section">IN THE PARTY</h3>`;
  for (const m of p.members) {
    html += `<div class="friendItem">
      <div class="info"><span class="statusDot ${m.online ? "online" : ""}"></span><b>${esc(m.user)}</b>
        ${m.leader ? `<small class="muted">party leader</small>` : ""}</div>
      <div class="flexRow">${p.isLeader && !m.leader ? `<button class="menuBtn red" onclick="gameGuild.kickFromParty('${esc(m.user)}')">REMOVE</button>` : ""}</div>
    </div>`;
  }

  if (p.invited.length) {
    html += `<h3 class="section">WAITING TO ANSWER</h3>`;
    for (const u of p.invited) {
      html += `<div class="friendItem"><div class="info"><b>${esc(u)}</b> <small class="muted">invited</small></div>
        <div class="flexRow">${p.isLeader ? `<button class="menuBtn" onclick="gameGuild.kickFromParty('${esc(u)}')">CANCEL</button>` : ""}</div></div>`;
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
          <button class="menuBtn green" onclick="gameGuild.inviteToParty('${esc(m.user)}')">INVITE</button>
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
  try { const res = await netGuildDungeon({ action: "party_invite", user }); partyState = res.party; toast(`Asked ${user}.`, 2500); openParty(); }
  catch (e) { toast(e.message, 4000); }
}
async function kickFromParty(user) {
  try { const res = await netGuildDungeon({ action: "party_kick", user }); partyState = res.party; openParty(); }
  catch (e) { toast(e.message, 4000); }
}
async function leaveParty() {
  try { await netGuildDungeon({ action: "party_leave" }); partyState = null; openDungeons(); }
  catch (e) { toast(e.message, 4000); }
}
async function startParty() {
  try {
    const res = await netGuildDungeon({ action: "party_start" });
    partyState = null;
    // The leader loads in from the reply; everyone else gets the `start` event.
    gameCombat.startDungeon(res.tier, [], { runId: res.runId, seed: res.seed, state: res.state });
  } catch (e) { toast(e.message, 4000); }
}
async function acceptParty(id) {
  try { const res = await netGuildDungeon({ action: "party_accept", party: id }); partyState = res.party; partyInvites = []; openParty(); }
  catch (e) { toast(e.message, 4000); }
}
async function declineParty(id) {
  try { const res = await netGuildDungeon({ action: "party_decline", party: id }); partyInvites = res.invites || []; closeMenu(); }
  catch (e) { toast(e.message, 4000); }
}

// ---------------- GUILD DUNGEONS ----------------
async function openDungeons() {
  if (!guildState) { toast("Guild dungeons are for guilds. Talk to the broker."); return; }
  await refreshParty();
  // Already in a lobby? That is the screen you want, not the list.
  if (partyState) { openParty(); return; }

  let html = `<p>Longer, denser and sealed at the end by something the quest board will not name. Every clear tithes <b>${pct(guildState.rates.dungeonCut)}</b> to your treasury; the rest splits between everyone who landed a hit on the boss.</p>
    <p class="muted">Each extra fighter gives every part of the boss <b>+${Math.round(ECON.GUILD_BOSS.HP_PER_PLAYER * 100)}% HP</b> — bring people who will actually swing.</p>
    <p class="muted">Everyone who lands a hit on the boss also rolls the loot table — armour, weapons and rings the quest board's dungeons cannot drop. <a href="#" onclick="gameGear.openArmoury();return false;">The Armoury</a> is where you wear it or sell it.</p>`;

  if (partyInvites.length) {
    html += `<h3 class="section">YOU'VE BEEN ASKED ALONG</h3>`;
    for (const inv of partyInvites) {
      html += `<div class="shopItem"><div class="info"><b>${esc(inv.name)}</b><br/>
        <small>${esc(inv.by)}'s party · ${inv.members} ${inv.members === 1 ? "member" : "members"}</small></div>
        <div class="flexRow">
          <button class="menuBtn green" onclick="gameGuild.acceptParty('${esc(inv.party)}')">JOIN</button>
          <button class="menuBtn red" onclick="gameGuild.declineParty('${esc(inv.party)}')">NO</button>
        </div></div>`;
    }
  }

  html += `<h3 class="section">CHOOSE A DUNGEON</h3>
    <p class="muted">Opening one makes you the party leader. Invite whoever you want from the guild, then start when everyone's in.</p>`;
  for (const id of ECON.GUILD_DUNGEON_ORDER) {
    const d = ECON.GUILD_DUNGEONS[id];
    const boss = ECON.GUILD_BOSSES[d.boss];
    const mini = d.mini ? ECON.GUILD_BOSSES[d.mini] : null;
    const purse = d.reward + boss.reward + (mini ? mini.reward : 0);
    html += `<div class="shopItem"><div class="info"><b>${esc(d.name)}</b><br/>
      <small>${d.floors} floors · boss: ${esc(boss.name)} · purse up to ${money(purse)}</small><br/>
      ${mini ? `<small class="muted">${esc(mini.name)} blocks floor ${ECON.miniFloorOf(d) + 1} — its bounty is paid with the run.</small><br/>` : ""}
      <small class="muted">${esc(d.blurb)}</small></div>
      <button class="menuBtn red" onclick="gameGuild.createParty('${id}')">CREATE PARTY</button></div>`;
  }
  openMenu("GUILD DUNGEONS", html);
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
async function enterGuildHall() {
  if (!guildState) { toast("That door isn't yours to open."); return; }
  state.area = "interior_guild";
  state.pos.x = 512; state.pos.y = 540;
  state.facing = "up";
  updateHUD();
  toast(`[${guildState.tag}] ${guildState.name} — walk to a station and press E.`);
}

// ---------------- server events ----------------
if (window.NET) {
  NET.on("guild_invite", (m) => {
    guildInvites[m.guild] = { by: m.by, at: Date.now(), name: m.name, tag: m.tag };
    toast(`${m.by} invited you to [${m.tag}] ${m.name} — the broker in the Adventurers Guild has the paperwork.`, 7000);
  });
  NET.on("guild", (m) => {
    if (m.kind === "kicked") { guildState = null; toast(`You were removed from ${m.name}${m.refunded ? ` — ${money(m.refunded)} returned` : ""}.`, 6000); updateHUD(); return; }
    if (m.kind === "skill_point") toast(`Your guild earned a skill point (${m.clears} clears).`, 5000);
    if (m.kind === "clear") toast(`${m.by} cleared a guild dungeon — ${money(m.tithe)} tithed to the treasury.`, 5000);
    if (m.kind === "joined") toast(`${m.user} joined the guild.`, 3500);
    refresh();
  });
  NET.on("guild_party", (m) => {
    if (m.kind === "invited") {
      partyInvites = partyInvites.filter(i => i.party !== m.party);
      partyInvites.push({ party: m.party, by: m.by, tier: m.tier, name: m.name, members: 1, guild: m.guild });
      toast(`${m.by} wants you in a party for ${m.name} — open GUILD DUNGEONS to answer.`, 7000);
      return;
    }
    if (m.kind === "disbanded" || m.kind === "removed") {
      const wasMine = partyState && partyState.id === m.party;
      partyState = null;
      partyInvites = partyInvites.filter(i => i.party !== m.party);
      if (wasMine) {
        toast(m.kind === "removed" ? "You were removed from the party." : "The party broke up.", 4000);
        if (state.area.startsWith("interior_")) openDungeons();
      }
      return;
    }
    // roster / joined / left — the server sends the whole view, so just take it.
    if (m.view) {
      partyState = m.view;
      if (m.kind === "joined" && m.user !== state.user) toast(`${m.user} joined the party.`, 3000);
      if (m.kind === "left") toast(`${m.user} left the party.`, 3000);
      const menu = document.getElementById("menuTitle");
      if (menu && menu.textContent === "PARTY") openParty();
    }
  });

  NET.on("guild_dungeon", (m) => {
    if (m.kind === "start" && m.by !== state.user) {
      // The leader started the party's run — everyone loads the same floor.
      partyState = null;
      toast(`${m.by} is taking the party into ${ECON.GUILD_DUNGEONS[m.tier].name}.`, 5000);
      if (state.area === "neighborhood" || state.area.startsWith("interior_")) {
        // The server already has us in this run — join it, don't open another.
        gameCombat.startDungeon(m.tier, [], { runId: m.runId, seed: m.seed, state: m.state });
      }
    } else if (m.kind === "enemies") {
      // A guildmate's kills, applied to our copy of the floor.
      gameCombat.applyEnemyChanges(m.changed);
    } else if (m.kind === "floor") {
      // Whoever reported the stair moves the WHOLE party down it.
      gameCombat.adoptServerFloor(m);
    } else if (m.kind === "reward") {
      state.data.money = m.money;
      toast(`Guild dungeon cleared — your share ${money(m.gained)}.`, 5000);
      // A party member who did not call `complete` still gets their own roll
      // of the loot table; it arrives on this event rather than a reply.
      if (window.gameGear) gameGear.announceLoot(m.loot, m.gear);
      updateHUD();
    }
  });
  NET.on("mastery_level", (m) => {
    const info = ECON.MASTERY_INFO[m.skill];
    toast(`${info.emoji} ${info.label} mastery is now level ${m.level}.`, 5000);
    refresh();
  });
}

window.gameGuild = {
  refresh, myGuild, myRank,
  openBroker, createGuild, acceptInvite, declineInvite, browse,
  openHall, invite, setRank, kick, saveRates, spendSkill, leave,
  openBank, bank, openTreasury, treasury,
  openDungeons, openMastery, enterGuildHall,
  createParty, openParty, inviteToParty, kickFromParty, leaveParty, startParty,
  acceptParty, declineParty, refreshParty,
};
