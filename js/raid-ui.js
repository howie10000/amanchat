/* RAID UI — THE ARCANE DEPTHS multi-guild raids.

   The raid board (every open raid in town), the raid lobby (create, invite
   anyone from any guild, accept / decline, join, leave, kick, promote,
   start), guild alliances, and the post-run results screen that shows how the
   purse was split guild by guild.

   Like guild.js, this file only renders what the server reports and asks it to
   change things. It never decides who may join, what anyone is paid, or which
   guild is credited — `DEPTHS.settleRunPurse` on the server does, and the
   results screen just shows its answer.

   Everything lives in one IIFE: guild.js already declares `esc`/`money` at the
   top level of the shared classic-script scope. */
(function () {
  "use strict";

  const W = (typeof window !== "undefined") ? window : globalThis;

  // ---------------- small helpers ----------------
  // Painted icon from js/item-icons.js, or '' when the library is absent/fails.
  function rIco(kind, arg, size, cls) {
    try { return (W.ItemIcons && W.ItemIcons.html(kind, arg, size, cls)) || ""; } catch (e) { return ""; }
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // A JS string literal that is safe inside a double-quoted onclick attribute.
  const js = (s) => esc(JSON.stringify(String(s == null ? "" : s)));
  const money = (n) => "$" + Math.max(0, Math.floor(+n || 0)).toLocaleString();
  function fmtMs(ms) {
    ms = Math.max(0, Math.round(+ms || 0));
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  const ECONg = () => W.ECON || {};
  const DEP = () => W.DEPTHS || null;
  // core.js declares `const state`: a script-scope global, never window.state.
  const ST = () => (typeof state !== "undefined" ? state : null);
  const me = () => { const s = ST(); return (s && s.user) || ""; };
  const myGid = () => { const g = W.gameGuild && W.gameGuild.myGuild ? W.gameGuild.myGuild() : null; return g ? g.id : null; };
  // toast() writes innerHTML: every raid note is plain text (player names,
  // guild tags, server errors), so escape it all.
  const note = (t, ms) => { if (typeof W.toast === "function") W.toast(esc(t), ms || 3500); };
  const menuTitle = () => { const el = W.document && W.document.getElementById("menuTitle"); return el ? el.textContent : ""; };
  const openMenu = (t, h, wide) => { if (typeof W.openMenu === "function") W.openMenu(t, h, wide); };
  function net(data) {
    if (typeof W.netGuildDungeon !== "function") return Promise.reject(new Error("Not connected."));
    return W.netGuildDungeon(data);
  }
  function netG(data) {
    if (typeof W.netGuild !== "function") return Promise.reject(new Error("Not connected."));
    return W.netGuild(data);
  }

  const PRIVACY = {
    invite: { label: "INVITE ONLY", desc: "Only the players you invite can join." },
    allies: { label: "ALLIES", desc: "Your guild and its allied guilds can join from the board." },
    open:   { label: "OPEN", desc: "Anyone in any guild can join from the board." },
  };

  // Theme palette as CSS custom properties, so a card or lobby wears its dungeon.
  function themeVars(tier) {
    const E = ECONg(), D = DEP();
    const cfg = (E.GUILD_DUNGEONS || {})[tier] || {};
    let t = null;
    try { t = D && (D.themeFor ? D.themeFor(tier) : null); } catch (e) { t = null; }
    if (!t && D && D.DUNGEON_THEMES) t = D.DUNGEON_THEMES[cfg.theme] || null;
    if (!t) return "";
    const f = t.floor || [20, 20, 40];
    return `--ad-floor:rgb(${f[0]},${f[1]},${f[2]});--ad-wall:${t.wall};--ad-cap:${t.cap};--ad-torch:${t.torch};--ad-fog:${t.fog};`;
  }
  const tierName = (tier) => { const d = (ECONg().GUILD_DUNGEONS || {})[tier]; return d ? d.name : String(tier || "?"); };
  const bossName = (id) => { const b = (ECONg().GUILD_BOSSES || {})[id]; return b ? b.name : ""; };
  const raidableTiers = () => {
    const E = ECONg(), all = E.GUILD_DUNGEONS || {};
    const order = (E.GUILD_DUNGEON_ORDER || []).concat(["raid_nexus", "arcane_depths"]);
    return order.filter(k => all[k] && all[k].raidable && all[k].mode !== "endless");
  };
  function raidLimits() {
    const R = (DEP() && DEP().RAID) || {};
    return { MIN: R.MIN || 2, MAX: R.MAX || 24, MAX_GUILDS: R.MAX_GUILDS || 6, MAX_PER_GUILD: R.MAX_PER_GUILD || 16, VEST_MS: R.VEST_MS || 86400000, CREDIT_SHARE: R.CREDIT_SHARE || 0.5 };
  }
  // The picked dungeon's name spelled in Elder Futhark for the hero banner.
  const FUTHARK = { a: "ᚨ", b: "ᛒ", c: "ᚲ", d: "ᛞ", e: "ᛖ", f: "ᚠ", g: "ᚷ", h: "ᚺ", i: "ᛁ", j: "ᛃ", k: "ᚲ", l: "ᛚ", m: "ᛗ", n: "ᚾ", o: "ᛟ",
    p: "ᛈ", q: "ᚲ", r: "ᚱ", s: "ᛊ", t: "ᛏ", u: "ᚢ", v: "ᚹ", w: "ᚹ", x: "ᛪ", y: "ᛃ", z: "ᛉ" };
  const runesOf = (name) => String(name || "").toLowerCase().replace(/^the\s+/, "").split(/\s+/).filter(Boolean)
    .map(w => [...w].map(c => FUTHARK[c] || "").join("")).filter(Boolean).join(" · ");
  const guildChip = (tag, mine) => `<span class="adTag${mine ? " mine" : ""}">[${esc(tag || "—")}]</span>`;

  // ---------------- state ----------------
  let raidState = null;     // RaidView of the lobby I'm in, or null
  let raidInvites = [];     // [{raid, from, tier, tag}]
  let lastBoard = [];
  let createTier = null;

  async function refresh() {
    try {
      const r = await net({ action: "raid_status" });
      raidState = r.raid || null;
      raidInvites = Array.isArray(r.invites) ? r.invites : [];
    } catch (e) { /* older server, or offline: keep what we had */ }
    return raidState;
  }

  // ---------------- RAID BOARD ----------------
  function renderBoard(rows, invites, err) {
    const L = raidLimits();
    let html = `<div class="adRaidHero">
        <div class="adRunes" aria-hidden="true">ᚱᚨᛁᛞ · ᛟᚠ · ᛗᚨᚾᚤ · ᚺᛟᚢᛊᛖᛊ</div>
        <b>MULTI-GUILD RAIDS</b>
        <p>Up to ${L.MAX} delvers from up to ${L.MAX_GUILDS} guilds in one run. Every guild is paid exactly as if it had run alone: its share of the purse is sized by how many of its members fought, its tithe goes to its <i>own</i> treasury, and its clear is credited to it.</p>
      </div>
      <div class="flexRow">
        <button class="menuBtn gold" onclick="gameRaidUI.openCreate()">OPEN A RAID LOBBY</button>
        <button class="menuBtn" onclick="gameRaidUI.openBoard()">REFRESH</button>
        <button class="menuBtn" onclick="gameRaidUI.openAlliances()">ALLIANCES</button>
      </div>`;
    if (err) html += `<p class="muted">${esc(err)}</p>`;
    if (invites && invites.length) {
      html += `<h3 class="section">YOU'VE BEEN SUMMONED</h3>`;
      for (const inv of invites) {
        html += `<div class="adRaidRow invite" style="${themeVars(inv.tier)}">
          <div class="info"><b>${esc(tierName(inv.tier))}</b> ${guildChip(inv.tag)}<br/>
            <small>${esc(inv.from)} wants you in their raid</small></div>
          <div class="flexRow">
            <button class="menuBtn green" onclick="gameRaidUI.accept(${js(inv.raid)})">ANSWER</button>
            <button class="menuBtn red" onclick="gameRaidUI.decline(${js(inv.raid)})">NO</button>
          </div></div>`;
      }
    }
    html += `<h3 class="section">OPEN RAIDS${rows && rows.length ? ` (${rows.length})` : ""}</h3>`;
    if (!rows || !rows.length) {
      html += `<p class="muted">No raid lobbies are open right now. Open one and invite whoever you trust — from any guild.</p>`;
    } else {
      for (const r of rows) {
        const pv = PRIVACY[r.privacy] || PRIVACY.open;
        const fill = Math.min(100, Math.round(((r.size | 0) / Math.max(1, r.max || L.MAX)) * 100));
        html += `<div class="adRaidRow" style="${themeVars(r.tier)}">
          <div class="info"><b>${esc(r.name || tierName(r.tier))}</b>${r.delve ? ` <span class="adDelveBadge">DELVE ${r.delve | 0}</span>` : ""}
            <span class="adPriv ${esc(r.privacy || "open")}">${pv.label}</span><br/>
            <small>led by ${esc(r.leader)} ${guildChip(r.leaderTag)} · ${r.size | 0}/${r.max || L.MAX} delvers${r.minMastery ? ` · combat Lv ${r.minMastery | 0}+` : ""}</small><br/>
            <span class="adGuildChips">${(r.guilds || []).map(t => guildChip(t)).join(" ")}</span>
            <div class="adFill"><i style="width:${fill}%"></i></div>
          </div>
          ${r.privacy === "invite" ? `<button class="menuBtn" disabled>INVITE ONLY</button>`
            : `<button class="menuBtn green" onclick="gameRaidUI.join(${js(r.id)})">JOIN</button>`}
        </div>`;
      }
    }
    html += `<button class="menuBtn" onclick="gameGuild.openDungeons()">BACK TO GUILD DUNGEONS</button>`;
    return html;
  }

  async function openBoard() {
    let rows = [], err = "";
    try { rows = ((await net({ action: "raid_board" })) || {}).raids || []; }
    catch (e) { err = e && e.message ? e.message : "The raid board is unavailable."; }
    lastBoard = rows;
    openMenu("RAID BOARD", renderBoard(rows, raidInvites, err), true);
  }

  async function open() {
    await refresh();
    if (raidState) return openLobby();
    return openBoard();
  }

  // ---------------- CREATE ----------------
  function delveCapFor(tier) {
    // The server enforces this; the picker just stays honest about what the
    // leader's guild has earned (Keystone Lore included).
    const g = W.gameGuild && W.gameGuild.myGuild ? W.gameGuild.myGuild() : null;
    const D = DEP();
    if (!g || !D || !D.guildMaxDelve) return 0;
    const rec = (g.depths && g.depths.tiers && g.depths.tiers[tier]) || null;
    const ks = (g.research && g.research.keystone) | 0;
    try { return D.guildMaxDelve(rec, ks) | 0; } catch (e) { return 0; }
  }
  function renderCreate(tier) {
    const tiers = raidableTiers();
    if (!tier || tiers.indexOf(tier) < 0) tier = tiers.indexOf("raid_nexus") >= 0 ? "raid_nexus" : tiers[0];
    const E = ECONg(), cfg = (E.GUILD_DUNGEONS || {})[tier] || {};
    const max = delveCapFor(tier);
    let html = `<div class="adRaidHero" style="${themeVars(tier)}">
      <div class="adRunes" aria-hidden="true">${esc(runesOf(cfg.name || tier))}</div>
      <b>${esc(cfg.name || tier)}</b>
      <p class="muted">${esc(cfg.blurb || "")}</p>
      <small>Boss: ${esc(bossName(cfg.boss))}${cfg.raidMin === 1 ? " · solo raids allowed" : cfg.raidMin ? ` · needs at least ${cfg.raidMin} delvers` : ""} · item level ${cfg.gearLvl || "?"}</small>
    </div>
    <h3 class="section">DUNGEON</h3><div class="adChoice">`;
    for (const k of tiers) {
      html += `<button class="menuBtn${k === tier ? " gold" : ""}" onclick="gameRaidUI.openCreate(${js(k)})">${esc(tierName(k))}</button>`;
    }
    html += `</div>
    <h3 class="section">DELVE LEVEL</h3>
    <div class="formRow"><input id="rcDelve" class="menuInput" type="number" min="0" max="${max}" value="0" />
      <small class="muted">0 – ${max} (the leader's guild ladder for this dungeon)</small></div>
    <h3 class="section">WHO MAY JOIN</h3><div class="adChoice">`;
    for (const k of Object.keys(PRIVACY)) {
      html += `<label class="adRadio"><input type="radio" name="rcPriv" value="${k}"${k === "allies" ? " checked" : ""}/> <b>${PRIVACY[k].label}</b><br/><small class="muted">${PRIVACY[k].desc}</small></label>`;
    }
    html += `</div>
    <h3 class="section">MINIMUM COMBAT MASTERY</h3>
    <div class="formRow"><input id="rcMin" class="menuInput" type="number" min="0" max="99" value="0" /></div>
    <div class="flexRow">
      <button class="menuBtn gold" onclick="gameRaidUI.create(${js(tier)})">OPEN THE LOBBY</button>
      <button class="menuBtn" onclick="gameRaidUI.openBoard()">BACK</button>
    </div>`;
    return html;
  }
  function openCreate(tier) {
    createTier = tier || createTier;
    openMenu("OPEN A RAID", renderCreate(createTier), true);
  }
  async function create(tier) {
    const d = W.document;
    const delve = Math.max(0, +((d && d.getElementById("rcDelve") || {}).value) | 0);
    const minMastery = Math.max(0, +((d && d.getElementById("rcMin") || {}).value) | 0);
    let privacy = "allies";
    try { const el = d && d.querySelector && d.querySelector('input[name="rcPriv"]:checked'); if (el) privacy = el.value; } catch (e) {}
    try {
      const res = await net({ action: "raid_create", tier, delve, privacy, minMastery });
      raidState = res.raid || null;
      openLobby();
    } catch (e) { note(e.message, 4500); }
  }

  // ---------------- LOBBY ----------------
  function renderLobby(v, viewer, guild) {
    if (!v) return `<p class="muted">You're not in a raid lobby.</p>`;
    const L = raidLimits();
    const cfg = (ECONg().GUILD_DUNGEONS || {})[v.tier] || {};
    const mineGid = guild ? guild.id : null;
    const min = v.min || (cfg.raidMin != null ? Math.max(1, cfg.raidMin | 0) : L.MIN);
    const size = (v.members || []).length;
    const pv = PRIVACY[v.privacy] || PRIVACY.open;
    let html = `<div class="adRaidHero" style="${themeVars(v.tier)}">
        <div class="adRunes" aria-hidden="true">ᚲᛟᚾᚲᛟᚱᛞ</div>
        <b>${esc(v.name || cfg.name || v.tier)}</b>${v.delve ? ` <span class="adDelveBadge">DELVE ${v.delve | 0}</span>` : ""}
        <span class="adPriv ${esc(v.privacy || "open")}">${pv.label}</span>
        <div class="muted">${size}/${v.max || L.MAX} delvers · ${(v.guilds || []).length}/${v.maxGuilds || L.MAX_GUILDS} guilds · led by ${esc(v.leader)}${v.minMastery ? ` · combat Lv ${v.minMastery | 0}+` : ""}</div>
        <div class="adFill"><i style="width:${Math.min(100, Math.round(size / Math.max(1, v.max || L.MAX) * 100))}%"></i></div>
      </div>
      <p class="muted">Each guild's contingent is paid like its own run and tithes to its own treasury. A contingent is credited with the clear when it has a member who has been in that guild for 24h and it dealt at least ${Math.round(L.CREDIT_SHARE * 100)}% of its fair share of the boss damage.</p>`;

    // Per-guild roster grouping.
    const groups = new Map();
    for (const m of v.members || []) {
      const k = m.gid || "__none__";
      if (!groups.has(k)) groups.set(k, { gid: m.gid, tag: m.tag, name: m.guildName, list: [] });
      groups.get(k).list.push(m);
    }
    for (const gv of v.guilds || []) if (!groups.has(gv.gid)) groups.set(gv.gid, { gid: gv.gid, tag: gv.tag, name: gv.name, list: [] });
    html += `<h3 class="section">CONTINGENTS</h3><div class="adContingents">`;
    for (const [, grp] of groups) {
      const mine = grp.gid && grp.gid === mineGid;
      html += `<div class="adContingent${mine ? " mine" : ""}">
        <div class="adContHead">${guildChip(grp.tag, mine)} <b>${esc(grp.name || (grp.gid ? "" : "No guild"))}</b> <small class="muted">${grp.list.length}/${v.maxPerGuild || L.MAX_PER_GUILD}</small></div>`;
      for (const m of grp.list) {
        let ctl = "";
        if (v.isLeader && m.user !== viewer) {
          ctl = `<button class="menuBtn" onclick="gameRaidUI.promote(${js(m.user)})">LEAD</button>
                 <button class="menuBtn red" onclick="gameRaidUI.kick(${js(m.user)})">REMOVE</button>`;
        }
        const vested = m.joinedAt && (Date.now() - m.joinedAt) >= L.VEST_MS;
        html += `<div class="friendItem adMember">
          <div class="info"><span class="statusDot ${m.online ? "online" : ""}"></span><b>${esc(m.user)}</b>
            ${m.leader ? `<small class="adLeadMark">RAID LEADER</small>` : ""}
            ${m.mastery ? `<small class="muted">combat ${m.mastery | 0}</small>` : ""}
            ${m.joinedAt && !vested ? `<small class="muted" title="Joined their guild under 24h ago">new blood</small>` : ""}</div>
          <div class="flexRow">${ctl}</div></div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;

    if (v.invited && v.invited.length) {
      html += `<h3 class="section">SUMMONED — WAITING TO ANSWER</h3><div class="adChips">`;
      for (const u of v.invited) html += `<span class="adChip">${esc(u)}</span>`;
      html += `</div>`;
    }

    // Invite from any guild: free text, plus shortcuts for online guildmates.
    const inRaid = new Set((v.members || []).map(m => m.user).concat(v.invited || []));
    const mates = ((guild && guild.members) || []).filter(m => m.online && !inRaid.has(m.user));
    html += `<h3 class="section">SUMMON A DELVER — ANY GUILD</h3>
      <div class="formRow"><input id="rInvite" class="menuInput" placeholder="player name" />
        <button class="menuBtn green" onclick="gameRaidUI.invite()">SUMMON</button></div>`;
    if (mates.length) {
      html += `<div class="adChips">`;
      for (const m of mates) html += `<button class="menuBtn" onclick="gameRaidUI.invite(${js(m.user)})">+ ${esc(m.user)}</button>`;
      html += `</div>`;
    }

    const ready = size >= min;
    html += `<div class="flexRow" style="margin-top:14px">
      ${v.isLeader
        ? `<button class="menuBtn red adStart" ${ready ? "" : "disabled"} onclick="gameRaidUI.start()">${ready ? "BEGIN THE RAID" : `NEED ${min - size} MORE`}</button>`
        : `<p class="muted">Waiting for ${esc(v.leader)} to begin.</p>`}
      <button class="menuBtn" onclick="gameRaidUI.leave()">LEAVE RAID</button>
      <button class="menuBtn" onclick="gameRaidUI.openBoard()">BOARD</button>
    </div>`;
    return html;
  }
  function openLobby() {
    if (!raidState) return openBoard();
    const g = W.gameGuild && W.gameGuild.myGuild ? W.gameGuild.myGuild() : null;
    openMenu("RAID LOBBY", renderLobby(raidState, me(), g), true);
  }
  const lobbyOpen = () => menuTitle() === "RAID LOBBY";
  const boardOpen = () => menuTitle() === "RAID BOARD";

  async function act(data, after) {
    try {
      const res = await net(data);
      if (res && "raid" in res && typeof res.raid === "object") raidState = res.raid;
      if (after) after(res);
      return res;
    } catch (e) { note(e.message, 4500); return null; }
  }
  function invite(user) {
    const d = W.document;
    const who = user || ((d && d.getElementById("rInvite")) || {}).value || "";
    if (!who.trim()) { note("Type a name."); return; }
    return act({ action: "raid_invite", user: who.trim() }, () => { note(`Summoned ${who.trim()}.`, 2500); openLobby(); });
  }
  const accept = (raid) => act({ action: "raid_accept", raid }, () => { raidInvites = raidInvites.filter(i => i.raid !== raid); openLobby(); });
  const decline = (raid) => act({ action: "raid_decline", raid }, () => { raidInvites = raidInvites.filter(i => i.raid !== raid); openBoard(); });
  const join = (raid) => act({ action: "raid_join", raid }, () => openLobby());
  const leave = () => act({ action: "raid_leave" }, () => { raidState = null; openBoard(); });
  const kick = (user) => act({ action: "raid_kick", user }, () => openLobby());
  const promote = (user) => act({ action: "raid_promote", user }, () => openLobby());
  async function start() {
    const v = raidState;
    if (typeof W.closeMenu === "function") W.closeMenu();
    try {
      const res = await net({ action: "raid_start" });
      raidState = null;
      launch(res, v);
    } catch (e) { note(e.message, 4500); if (raidState) openLobby(); }
  }
  // Load into the run. B2's startDungeon takes an optional 4th `opts`.
  function launch(res, v) {
    if (!res) return;
    const gc = W.gameCombat;
    if (!gc || typeof gc.startDungeon !== "function") return;
    gc.startDungeon(res.tier, [], { runId: res.runId, seed: res.seed, state: res.state, initiate: res.initiate || null },
      { delve: res.delve != null ? res.delve : (v && v.delve) || 0, raid: true });
  }

  // ---------------- PUSHES (event:'guild_raid') ----------------
  function onRaidEvent(m) {
    if (!m || !m.kind) return;
    if (m.kind === "invite") {
      raidInvites = raidInvites.filter(i => i.raid !== m.raid);
      raidInvites.push({ raid: m.raid, from: m.from, tier: m.tier, tag: m.tag });
      note(`${m.from} [${m.tag || "—"}] summons you to a raid on ${tierName(m.tier)} — open the RAID BOARD to answer.`, 8000);
      if (boardOpen()) openBoard();
      return;
    }
    if (m.kind === "update") {
      if (m.view) raidState = m.view;
      if (lobbyOpen()) openLobby();
      return;
    }
    if (m.kind === "disbanded") {
      const was = raidState && raidState.id === m.raid;
      raidInvites = raidInvites.filter(i => i.raid !== m.raid);
      if (was) {
        raidState = null;
        if (m.reason !== "started") { note(`The raid broke up${m.reason ? ` (${m.reason})` : ""}.`, 4500); if (lobbyOpen()) openBoard(); }
      }
      return;
    }
    if (m.kind === "dropped") {
      if (m.user === me()) {
        raidState = null;
        note(`You were left behind: ${m.reason || "you couldn't enter the raid"}.`, 6000);
        if (lobbyOpen()) openBoard();
      } else {
        note(`${m.user} was dropped from the raid${m.reason ? ` — ${m.reason}` : ""}.`, 4000);
      }
      return;
    }
    if (m.kind === "started") {
      // The normal guild_dungeon `start` push follows and loads us in.
      raidState = null;
      if (lobbyOpen() && typeof W.closeMenu === "function") W.closeMenu();
    }
  }

  // ---------------- ALLIANCES (the `guild` op) ----------------
  // Accepts either a map {gid:{since,name,tag}} or an array of rows.
  function allyRows(x) {
    if (!x) return [];
    if (Array.isArray(x)) return x.map(r => (typeof r === "string" ? { gid: r } : r)).filter(r => r && r.gid);
    return Object.keys(x).map(gid => Object.assign({ gid }, typeof x[gid] === "object" ? x[gid] : { since: x[gid] }));
  }
  function renderAlliances(g, directory) {
    if (!g) return `<p class="muted">You have no guild.</p>`;
    const officer = W.ECON && W.ECON.guildRankAtLeast ? W.ECON.guildRankAtLeast(g.myRank, "officer") : g.myRank !== "member";
    const names = {};
    for (const d of directory || []) names[d.id] = d;
    const label = (r) => { const d = names[r.gid] || r; return `${guildChip(d.tag)} <b>${esc(d.name || r.gid)}</b>`; };
    const allies = allyRows(g.allies), reqs = allyRows(g.allyRequests);
    let html = `<p>Allied guilds can join each other's <b>ALLIES</b> raids straight from the board. An alliance is mutual, you can hold ${5} at most, and only officers and the Master can make or break one.</p>`;
    html += `<h3 class="section">ALLIES (${allies.length}/5)</h3>`;
    if (!allies.length) html += `<p class="muted">No allies yet.</p>`;
    for (const a of allies) {
      html += `<div class="adRaidRow"><div class="info">${label(a)}<br/><small class="muted">${a.since ? "allied since " + new Date(a.since).toLocaleDateString() : ""}</small></div>
        ${officer ? `<button class="menuBtn red" onclick="gameRaidUI.ally('ally_remove', ${js(a.gid)})">BREAK</button>` : ""}</div>`;
    }
    if (reqs.length) {
      html += `<h3 class="section">PROPOSALS</h3>`;
      for (const r of reqs) {
        const incoming = r.dir ? r.dir === "in" : !r.outgoing;
        html += `<div class="adRaidRow"><div class="info">${label(r)}<br/><small class="muted">${incoming ? "wants to ally with you" : "awaiting their answer"}</small></div>
          ${officer && incoming ? `<div class="flexRow"><button class="menuBtn green" onclick="gameRaidUI.ally('ally_accept', ${js(r.gid)})">ALLY</button>
            <button class="menuBtn red" onclick="gameRaidUI.ally('ally_decline', ${js(r.gid)})">NO</button></div>` : ""}</div>`;
      }
    }
    if (officer) {
      const known = new Set(allies.map(a => a.gid).concat(reqs.map(r => r.gid), [g.id]));
      const cands = (directory || []).filter(d => d && d.id && !known.has(d.id));
      html += `<h3 class="section">PROPOSE AN ALLIANCE</h3>`;
      if (!cands.length) html += `<p class="muted">No other guilds to ask.</p>`;
      for (const d of cands.slice(0, 30)) {
        html += `<div class="adRaidRow"><div class="info">${guildChip(d.tag)} <b>${esc(d.name)}</b><br/>
          <small class="muted">${d.level ? `level ${d.level} · ` : ""}${d.members | 0} members · ${d.clears | 0} clears</small></div>
          <button class="menuBtn gold" onclick="gameRaidUI.ally('ally_request', ${js(d.id)})">PROPOSE</button></div>`;
      }
    }
    html += `<div class="flexRow"><button class="menuBtn" onclick="gameRaidUI.openBoard()">RAID BOARD</button>
      <button class="menuBtn" onclick="gameGuild.openHall()">BACK TO THE HALL</button></div>`;
    return html;
  }
  async function openAlliances() {
    const gg = W.gameGuild;
    if (gg && gg.refresh) { try { await gg.refresh(); } catch (e) {} }
    const g = gg && gg.myGuild ? gg.myGuild() : null;
    if (!g) { note("You have no guild."); return; }
    let dir = [];
    try { dir = ((await netG({ action: "browse" })) || {}).guilds || []; } catch (e) {}
    openMenu("ALLIANCES", renderAlliances(g, dir), true);
  }
  async function ally(action, gid) {
    try {
      await netG({ action, gid });
      note({ ally_request: "Proposal sent.", ally_accept: "Alliance sealed.", ally_decline: "Declined.", ally_remove: "Alliance broken." }[action] || "Done.", 3000);
    } catch (e) { note(e.message, 4500); }
    openAlliances();
  }

  // ---------------- POST-RUN RESULTS ----------------
  function chestName(t) {
    const rows = ECONg().CHEST_TIERS || [];
    const r = rows.find(x => x.tier === t) || rows[t | 0];
    return r ? r.name : ["Bronze", "Silver", "Gold", "Arcane"][t | 0] || "Bronze";
  }
  // Gems and runes by name ("Emerald I", "Rune of Haste"), never "emerald g1".
  function gemName(k) {
    try { const g = W.gameGear && W.gameGear.ui && W.gameGear.ui.gem(k); if (g && g.name) return g.name; } catch (e) {}
    const E = ECONg(), p = E.parseGem ? E.parseGem(k) : null;
    const def = p && (p.rune ? (E.RUNES || {})[p.type] : (E.GEMS || {})[p.type]);
    if (def && def.name) return p.rune ? def.name : def.name + " " + (["I", "II", "III", "IV", "V"][p.grade - 1] || "");
    return String(k).replace(/^rune_/, "rune of ").replace(/_/g, " ").replace(/:(\d)$/, " $1");
  }
  function gemColor(k) {
    try { const g = W.gameGear && W.gameGear.ui && W.gameGear.ui.gem(k); if (g && g.color) return g.color; } catch (e) {}
    return "#f472b6";
  }
  function matLine(mats) {
    const M = ECONg().MATERIALS || {};
    return Object.keys(mats || {}).filter(k => mats[k] > 0).map(k =>
      `<span class="adChip" style="--c:${esc((M[k] && M[k].color) || "#c4b5fd")}">${esc((M[k] && M[k].name) || k)} ×${mats[k] | 0}</span>`).join(" ");
  }
  function renderResults(res, viewer, guild) {
    res = res || {};
    const st = res.settlement || null;
    const mine = guild ? guild.id : null;
    const s = ST();
    const tier = res.tier || (s && s.dungeon && s.dungeon.tier) || lastTier || "";
    const cut = ECONg().GUILD_DUNGEON_CUT;
    const ct = res.chestTier | 0;
    let html = `<div class="adResHead" style="${themeVars(tier)}">
      <div class="adRunes" aria-hidden="true">ᚹᛁᚲᛏᛟᚱᚤ</div>
      <small>${res.segment ? "SANCTUARY REACHED" : st && st.raid ? "RAID CLEARED" : "DUNGEON CLEARED"}</small>
      <b>${esc(tierName(tier))}</b>
      <div class="adShare"><small>YOUR SHARE</small><span>${money(res.gained)}</span></div>
      <span class="adChest t${ct}">${rIco("chest", ct, 22)}${esc(chestName(ct))} chest</span>
    </div>`;
    if (st && st.withheld) html += `<p class="adWarn">Your cash share was withheld: you are still on cooldown for this dungeon. Your loot and XP were granted.</p>`;

    const d = res.delve;
    if (d && (d.level || d.clearMs)) {
      const up = d.upgrade | 0;
      html += `<div class="adDelveRes">
        <span><small>DELVE</small><b>${d.level | 0}</b></span>
        <span><small>TIME</small><b>${fmtMs(d.clearMs)}</b></span>
        <span><small>PAR</small><b>${d.parMs ? fmtMs(d.parMs) : "—"}</b></span>
        <span class="${d.timed ? "ok" : "bad"}"><small>${d.timed ? "TIMED" : "OVER PAR"}</small><b>${up ? "+" + up : d.timed ? "✓" : "×0.75"}</b></span>
        ${d.unlocked != null ? `<span><small>LADDER</small><b>L${d.unlocked | 0}</b></span>` : ""}
      </div>`;
      if (d.record || (res.records && (res.records.guildBest || res.records.weekly))) {
        html += `<p class="adRecord">${res.records && res.records.weekly ? "New weekly record! " : ""}${d.record || (res.records && res.records.guildBest) ? "New guild best for this dungeon." : ""}</p>`;
      }
    }

    if (st && st.perGuild) {
      const rows = Object.keys(st.perGuild).map(gid => Object.assign({ gid }, st.perGuild[gid]));
      rows.sort((a, b) => (b.nG | 0) - (a.nG | 0));
      html += `<h3 class="section">HOW THE PURSE WAS SPLIT</h3>
        <p class="muted">Purse ${money(st.gross != null ? st.gross : res.gross)} across ${st.N | 0} fighter${(st.N | 0) === 1 ? "" : "s"}. Each guild's share is sized by its head-count; ${cut != null ? Math.round(cut * 100) + "%" : "a tithe"} of it goes to its own treasury and the rest splits evenly — exactly what it would have earned running alone.</p>
        <div class="adPayWrap"><table class="adPay"><thead><tr><th>Guild</th><th>Fighters</th><th>Share</th><th>Tithe</th><th>Each</th><th>Clear</th></tr></thead><tbody>`;
      for (const r of rows) {
        const isMine = r.gid === mine || (mine == null && r.gid === "__none__");
        const none = r.gid === "__none__";
        const to = r.titheTo === "mayor" || none ? "to the Mayor" : `to ${r.tag ? "[" + esc(r.tag) + "]" : "its"} treasury`;
        html += `<tr class="${isMine ? "mine" : ""}">
          <td>${none ? `<i>No guild</i>` : `${guildChip(r.tag, isMine)} ${esc(r.name || "")}`}</td>
          <td>${r.nG != null ? r.nG | 0 : "—"}</td>
          <td>${r.grossG != null ? money(r.grossG) : "—"}</td>
          <td>${r.titheG != null ? money(r.titheG) : "—"}<br/><small class="muted">${to}</small></td>
          <td>${r.eachG != null ? money(r.eachG) : "—"}</td>
          <td>${r.credited ? `<span class="adOk">✓ credited</span>` : r.credited === false ? `<span class="adNo">not credited</span>` : "—"}</td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
      if (st.raid) html += `<p class="muted">Raid bonus: +10% Delver XP and one extra material roll for everyone.</p>`;
      if (rows.some(r => r.credited === false && r.titheTo === "guild")) {
        html += `<p class="muted">A contingent is credited with the clear only if it has a member vested 24h in that guild and dealt at least half its fair share of the boss damage. Its members are still paid in full.</p>`;
      }
    } else if (res.tithe != null) {
      html += `<p class="muted">Tithe to your guild treasury: ${money(res.tithe)}.</p>`;
    }

    const ml = matLine(res.mats);
    if (ml) html += `<h3 class="section">MATERIALS</h3><div class="adChips">${ml}</div>`;
    const gems = res.gems || {};
    const gk = Object.keys(gems).filter(k => gems[k] > 0);
    if (gk.length) html += `<div class="adChips">${gk.map(k => `<span class="adChip" style="--c:${esc(gemColor(k))}">${esc(gemName(k))} ×${gems[k] | 0}</span>`).join(" ")}</div>`;
    const dv = res.delver;
    if (dv) {
      html += `<h3 class="section">DELVER RANK</h3><p>+${(dv.gained | 0).toLocaleString()} XP · rank <b>${dv.rank | 0}</b>${dv.up && dv.up.length ? ` <span class="adOk">RANK UP → ${dv.up.map(x => x | 0).join(", ")}</span>` : ""}${dv.prestige ? ` · ✦${dv.prestige | 0}` : ""}</p>`;
    }
    if (res.codexNew && res.codexNew.length) html += `<p>New codex entries: <b>${res.codexNew.length}</b> <a href="#" class="adLink" onclick="window.gameCodex&&gameCodex.open&&gameCodex.open();return false;">open the Codex</a></p>`;
    if (res.achievements && res.achievements.length) {
      const A = ECONg().ACHIEVEMENT_BY_ID || {};
      html += `<p>Achievements: ${res.achievements.map(id => `<span class="adChip">${esc((A[id] && A[id].label) || id)}</span>`).join(" ")}</p>`;
    }
    if (res.overflow && res.overflow.length) html += `<p class="adWarn">${res.overflow.length} item${res.overflow.length === 1 ? "" : "s"} went to overflow — your pack is full. Claim them at the Armory within 7 days.</p>`;
    html += `<div class="flexRow"><button class="menuBtn gold" onclick="gameRaidUI.closeResults()">CONTINUE</button></div>`;
    return html;
  }
  // The claimer's `complete` reply carries no tier, and the dungeon may be
  // gone by the time the reveal finishes — remember the last run's tier.
  let lastTier = "";
  function noteTier(t) { if (t) lastTier = String(t); }
  function showResults(res) {
    const d = W.document;
    const s = ST();
    if (res && !res.tier && s && s.dungeon && s.dungeon.tier) res = Object.assign({}, res, { tier: s.dungeon.tier });
    if (!d || !d.body || !d.createElement) return;
    closeResults();
    const el = d.createElement("div");
    el.id = "adResults";
    el.className = "adResults";
    el.innerHTML = `<div class="adResBox">${renderResults(res, me(), W.gameGuild && W.gameGuild.myGuild ? W.gameGuild.myGuild() : null)}</div>`;
    d.body.appendChild(el);
  }
  function closeResults() {
    const d = W.document;
    const el = d && d.getElementById && d.getElementById("adResults");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  if (W.NET && typeof W.NET.on === "function") W.NET.on("guild_raid", onRaidEvent);

  W.gameRaidUI = {
    open, openBoard, openCreate, create, openLobby, refresh,
    invite, accept, decline, join, leave, kick, promote, start, launch,
    onRaidEvent, openAlliances, ally,
    showResults, closeResults, noteTier,
    state: () => raidState, invites: () => raidInvites.slice(),
    // pure renderers (tests)
    renderBoard, renderCreate, renderLobby, renderAlliances, renderResults, themeVars,
  };
})();
