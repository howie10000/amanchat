/* THE ARCANE DEPTHS — JOURNEY UI (the Delver's Journey window, the quest
   tracker, the Welcome Back cinematic, the Arcane Awakening banner, the Great
   Vault picker, Paragon, Mythic Hunts, artifacts, the weekly Challenge board
   and the season ladder).

   Renders what the `journey` op says (server-node/guild-journey.js) and asks
   it to change things. It never decides progress. Needs window.netJourney
   (one line in net.js — see docs/arcane-depths/JOURNEY-INTEGRATION.md); without
   it every entry point degrades to a toast. Exposes window.gameJourney. */
(function () {
  "use strict";
  const W = typeof window !== "undefined" ? window : globalThis;
  const J = () => W.JOURNEY || null;
  // core.js declares `const state` at top level: a global binding, not a window property.
  const ST = () => (typeof state !== "undefined" ? state : null) || null;
  let view = null;             // last JourneyView
  let tab = "path";
  let busy = false;
  let vaultConfirm = -1;       // index waiting for the second click
  let welcomeShownFor = 0;     // pending.days we already showed this session
  let eventShown = {};
  let booted = false;
  let trackerCollapsed = false;
  try { trackerCollapsed = W.localStorage && W.localStorage.getItem("jnTrackerMin") === "1"; } catch (e) {}

  // ---------------------------------------------------------------- helpers
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const jsq = (s) => esc(JSON.stringify(String(s == null ? "" : s)));
  const num = (n) => Math.max(0, Math.floor(+n || 0)).toLocaleString("en-US");
  const pctW = (have, need) => Math.max(0, Math.min(100, Math.round(((+have || 0) / Math.max(1, +need || 1)) * 100)));
  function say(t, ms) { if (typeof W.toast === "function") W.toast(t, ms || 3200); }
  function fmtLeft(ms) {
    ms = Math.max(0, +ms || 0);
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return d > 0 ? d + "d " + h + "h" : h > 0 ? h + "h " + m + "m" : m + "m";
  }
  function fmtMs(ms) { ms = Math.max(0, Math.round(+ms || 0)); const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  const now = () => (view && view.now ? view.now + (Date.now() - (view._got || Date.now())) : Date.now());
  const rarityColor = (r) => ((W.ECON && W.ECON.GEAR_RARITY_INFO && W.ECON.GEAR_RARITY_INFO[r]) || {}).color || "#e2e8f0";
  const rarityLabel = (r) => ((W.ECON && W.ECON.GEAR_RARITY_INFO && W.ECON.GEAR_RARITY_INFO[r]) || {}).label || r || "";
  function call(req) {
    if (typeof W.netJourney !== "function") return Promise.reject(new Error("The Journey is still waking up — try again in a moment."));
    return W.netJourney(req);
  }
  function linesHtml(lines, cls) {
    return `<div class="jnRewards ${cls || ""}">` + (lines || []).map(l => {
      const style = l.color ? ` style="--jn-c:${esc(l.color)}"` : "";
      return `<span class="jnChip ${esc(l.kind)}"${style}>${esc(l.label)}</span>`;
    }).join("") + `</div>`;
  }
  function bar(have, need, cls) {
    return `<div class="jnBar ${cls || ""}"><i style="width:${pctW(have, need)}%"></i><span>${num(have)} / ${num(need)}</span></div>`;
  }
  function itemCards(items) {
    return `<div class="jnItems">` + (items || []).map((it, i) => `<div class="jnItem" style="--jn-c:${esc(rarityColor(it.rarity))};--jn-i:${i}">
      <b>${esc(it.name || it.base)}</b><small>${esc(rarityLabel(it.rarity))} · L${esc(it.lvl)} ${esc(it.slot)}</small></div>`).join("") + `</div>`;
  }
  function grantSummary(g) {
    if (!g) return "";
    const bits = [];
    if (g.items && g.items.length) bits.push(g.items.length + (g.items.length === 1 ? " item" : " items"));
    for (const [k, n] of Object.entries(g.mats || {})) bits.push(n + " " + k.replace(/_/g, " "));
    if (g.money) bits.push("$" + num(g.money));
    if (g.dxp) bits.push(num(g.dxp) + " Delver XP");
    for (const t of g.titles || []) bits.push("title “" + t + "”");
    return bits.join(", ");
  }

  // ---------------------------------------------------------------- renderers (pure: view -> html)
  function tabsHtml(active, v) {
    const dot = (on) => on ? `<i class="jnDot"></i>` : "";
    const bountyReady = v && v.bounties && v.bounties.daily.concat(v.bounties.hunts).some(b => !b.claimed && b.p >= b.n);
    const vaultReady = v && v.vault && v.vault.prev && v.vault.prev.picked < 0 && v.vault.prev.options.length;
    const tabs = [
      ["path", "✦ PATH", v && (v.path.claimable || (v.ret && v.ret.pending))],
      ["week", "⌛ THIS WEEK", bountyReady || vaultReady],
      ["paragon", "✧ PARAGON", false],
      ["artifacts", "⚜ ARTIFACTS", false],
      ["season", "☾ SEASON", false],
      ["lantern", "🏮 LANTERN", false],
      ["firsts", "⚡ FIRSTS", false],
    ];
    return `<div class="jnTabs">` + tabs.map(([id, label, d]) =>
      `<button class="jnTab${id === active ? " on" : ""}" onclick="gameJourney.open(${jsq(id)})">${label}${dot(d)}</button>`).join("") + `</div>`;
  }
  function eventBannerHtml(v) {
    return (v.events || []).map(e => `<div class="jnEvent">
      <div class="jnEventRunes">ᚨ ᚱ ᚲ ᚨ ᚾ ᛖ</div>
      <b>${esc(e.name)}</b><small>${esc(e.blurb)} · ends in ${fmtLeft(e.endsAt - now())} · +${Math.round((e.xp || 0) * 100)}% Delver XP and bonus drops</small>
      ${e.giftReady ? `<div class="jnEventGift">${linesHtml(e.gift)}<button class="menuBtn gold jnGlowBtn" onclick="gameJourney.eventClaim(${jsq(e.id)})">CLAIM THE AWAKENING GIFT</button></div>` : `<small class="jnDone">Gift claimed ✓</small>`}
    </div>`).join("");
  }
  function pathHtml(v) {
    const p = v.path;
    let html = eventBannerHtml(v);
    if (v.ret && v.ret.pending) {
      html += `<div class="jnReturn"><b>WELCOME BACK, DELVER</b><small>You were away ${num(v.ret.pending.days)} days. A ${esc(v.ret.pending.name)}'s cache is waiting.</small>
        <button class="menuBtn gold jnGlowBtn" onclick="gameJourney.showWelcome()">OPEN IT</button></div>`;
    }
    if (v.ret && v.ret.chain) {
      const c = v.ret.chain;
      html += `<div class="jnChain"><div class="jnHead"><b>THE WAY BACK</b><small>${c.n + 1} / ${c.total}</small></div>
        <div class="jnStepName">${esc(c.step.name)}</div><small class="jnHint">${esc(c.step.hint)}</small>
        ${bar(c.prog.have, c.prog.need, "cyan")}${linesHtml(c.step.lines)}
        ${c.prog.done ? `<button class="menuBtn green jnGlowBtn" onclick="gameJourney.retClaim(${jsq(c.step.id)})">CLAIM</button>` : ""}</div>`;
    }
    if (v.ret && v.ret.runs > 0) html += `<div class="jnNote">🜂 Returner's Blessing: <b>${num(v.ret.runs)}</b> runs left at +50% Delver XP with bonus materials.</div>`;
    if (v.rested && v.rested.pool > 0) html += `<div class="jnNote rested">☽ Ley Rest: your next <b>${num(v.rested.pool)}</b> Delver XP counts double.</div>`;
    if (p.done) {
      html += `<div class="jnHero done"><div class="jnSigil"></div><b>THE PATH IS WALKED</b><small>Pathfinder of the Depths. The late game is yours: the Great Vault, the weekly Challenge, Mythic Hunts, artifacts, the season ladder and Paragon.</small></div>`;
    } else {
      const act = (p.acts || [])[p.step.act] || {};
      html += `<div class="jnHero" style="--jn-act:${esc(act.color || "#a78bfa")}">
        <div class="jnSigil"></div>
        <small class="jnAct">${esc(act.name || "")} · STEP ${p.n + 1} OF ${p.total}</small>
        <div class="jnStepName">${esc(p.step.name)}</div>
        <p class="jnHint">${esc(p.step.hint)}</p>
        ${bar(Math.min(p.prog.have, p.prog.need), p.prog.need, p.claimable ? "gold" : "")}
        ${linesHtml(p.step.lines)}
        ${p.claimable ? `<button class="menuBtn gold jnGlowBtn jnBig" onclick="gameJourney.claim(${jsq(p.step.id)})">✦ CLAIM REWARD</button>` : `<small class="muted">Progress is counted by the server when you finish runs.</small>`}
      </div>`;
    }
    html += `<div class="jnTimeline">`;
    (p.acts || []).forEach((a, ai) => {
      html += `<div class="jnActRow" style="--jn-act:${esc(a.color)}"><small>${esc(a.name)}</small><div class="jnNodes">`;
      p.steps.filter(s => s.act === ai).forEach(s => {
        html += `<span class="jnNode ${esc(s.state)}" title="${esc(s.name)}">${s.state === "done" ? "✓" : s.state === "current" ? "✦" : "·"}</span>`;
      });
      html += `</div></div>`;
    });
    html += `</div>`;
    return html;
  }
  function vaultHtml(v) {
    const vt = v.vault;
    let html = `<div class="jnPanel jnVault"><div class="jnHead"><b>⚱ THE GREAT VAULT</b><small>resets in ${fmtLeft(v.challenge.endsAt - now())}</small></div>`;
    const prev = vt.prev;
    if (prev && prev.options.length) {
      if (prev.picked >= 0) html += `<p class="jnDone">You chose from last week's vault ✓</p>`;
      else html += `<p class="jnHint">Last week's deeds opened these. <b>Choose one</b> — the others fade.</p>`;
      html += `<div class="jnVaultOpts">` + prev.options.map((o, i) => {
        const picked = prev.picked === i, dim = prev.picked >= 0 && !picked, conf = vaultConfirm === i && prev.picked < 0;
        return `<button class="jnVaultOpt${picked ? " picked" : ""}${dim ? " dim" : ""}${conf ? " confirm" : ""}" style="--jn-c:${esc(rarityColor(o.rarity))}"
          ${prev.picked >= 0 ? "disabled" : `onclick="gameJourney.vaultPick(${i})"`}>
          <small>${esc(o.row === "delve" ? "DUNGEONS" : o.row === "depths" ? "DEPTHS" : "RAIDS")}</small>
          <b>${o.kind === "cache" ? "Materials Cache" : esc(rarityLabel(o.rarity)) + " " + esc(o.slot)}</b>
          <span>${o.kind === "cache" ? "" : "Item level " + esc(o.lvl)}</span>${linesHtml(o.lines, "mini")}
          ${conf ? `<em>Click again to take it</em>` : ""}</button>`;
      }).join("") + `</div>`;
    } else html += `<p class="muted">No vault to open this week — clear dungeons now to fill next week's.</p>`;
    html += `<small class="jnSub">THIS WEEK'S PROGRESS (opens next week)</small><div class="jnSlots">`;
    for (const s of vt.cur.slots) {
      const label = s.row === "delve" ? s.need + (s.need === 1 ? " clear" : " clears") : s.row === "depths" ? "floor " + s.need : s.need + (s.need === 1 ? " raid" : " raids");
      html += `<div class="jnSlot${s.unlocked ? " on" : ""}" style="--jn-c:${esc(s.unlocked ? rarityColor(s.rarity) : "#475569")}">
        <b>${s.unlocked ? esc(rarityLabel(s.rarity)) : "🔒"}</b><small>${esc(label)}</small>${s.unlocked ? `<small>L${esc(s.lvl)}</small>` : `<small>${num(Math.min(s.have, s.need))}/${num(s.need)}</small>`}</div>`;
    }
    return html + `</div></div>`;
  }
  function challengeHtml(v) {
    const c = v.challenge;
    const bracket = (b) => `<div class="jnBracket ${esc(b.id)}"><div class="jnHead"><b>${esc(b.name)}</b><small>${esc(b.tierName)} · delve ${esc(b.delve)}+ · under par</small></div>
      ${b.got ? `<small class="jnDone">Qualified this week ✓${b.myRank ? " · you are <b>#" + b.myRank + "</b>" : ""}</small>` : `<small class="jnHint">Clear it once this week for the Challenger's Cache.</small>`}
      <ol class="jnBoard">${(b.top || []).slice(0, 5).map(r => `<li${r.members && ST() && r.members.includes(ST().user) ? ' class="me"' : ""}><b>#${r.rank}</b><span>${esc((r.tags || []).map(t => "[" + t + "]").join(" "))} ${esc((r.members || []).join(", "))}</span><em>${fmtMs(r.ms)}</em></li>`).join("") || "<li class='muted'>No one yet. Be first.</li>"}</ol></div>`;
    return `<div class="jnPanel"><div class="jnHead"><b>⚔ WEEKLY CHALLENGE</b><small>ends in ${fmtLeft(c.endsAt - now())}</small></div>
      <div class="jnBrackets">${bracket(c.initiate)}${bracket(c.mythic)}</div>
      <button class="menuBtn" onclick="gameJourney.showBoard()">FULL LEADERBOARD</button></div>`;
  }
  function bountiesHtml(v) {
    const b = v.bounties;
    const row = (x) => {
      const ready = !x.claimed && x.p >= x.n;
      return `<div class="jnBounty ${esc(x.diff)}${ready ? " ready" : ""}${x.claimed ? " claimed" : ""}">
        <span class="jnDiff">${esc(x.diff === "hunt" ? "MYTHIC HUNT" : x.diff.toUpperCase())}</span>
        <div class="jnBountyBody"><b>${esc(x.text)}</b>${bar(Math.min(x.p, x.n), x.n, ready ? "gold" : "")}${linesHtml(x.lines, "mini")}</div>
        ${x.claimed ? `<span class="jnDone">✓</span>` : ready ? `<button class="menuBtn gold" onclick="gameJourney.bountyClaim(${jsq(x.id)})">CLAIM</button>` : ""}</div>`;
    };
    return `<div class="jnPanel"><div class="jnHead"><b>☠ MYTHIC HUNTS · BOUNTY BOARD</b><small>new bounties in ${fmtLeft(b.resetAt - now())}</small></div>
      ${b.daily.map(row).join("")}<small class="jnSub">THIS WEEK'S MYTHIC HUNTS · Hunt Marks: <b>${num(v.marks.hunt)}</b></small>${b.hunts.map(row).join("")}</div>`;
  }
  function weekHtml(v) { return vaultHtml(v) + challengeHtml(v) + bountiesHtml(v); }
  function paragonHtml(v) {
    const p = v.paragon;
    if (!p.active) {
      return `<div class="jnHero"><div class="jnSigil"></div><b>PARAGON</b><p class="jnHint">Beyond Delver Rank 60 the ranks never end. Every Paragon level pays materials; milestones bring titles and cosmetics.</p>
        <small>${num(p.toStart)} Delver XP until Rank 60.</small></div>`;
    }
    return `<div class="jnHero paragon"><div class="jnSigil"></div><small class="jnAct">PARAGON</small>
      <div class="jnParagonNum">${num(p.level)}</div>${bar(p.into, p.need, "violet")}
      <small>Each level: 25 dust · every 5th: +3 shards · every 10th: +1 Mythic Ember and a Gilded Key.</small>
      ${p.next ? `<div class="jnMilestone"><small>NEXT MILESTONE · PARAGON ${esc(p.next.level)}</small>${linesHtml(p.next.lines)}</div>` : ""}</div>`;
  }
  function artifactsHtml(v) {
    return `<p class="jnHint">Every boss hides an artifact: its signature weapon reborn at item level 10, <b>Ancient</b>, already +5. Five stages, many weeks.</p><div class="jnArts">` +
      v.artifacts.map(a => `<div class="jnArt${a.done ? " done" : ""}">
        <div class="jnHead"><b>${esc(a.name)}</b><small>${esc(a.bossName)}</small></div>
        <div class="jnStages">${Array.from({ length: a.total }, (_, i) => `<i class="${i < a.stage ? "on" : i === a.stage ? "cur" : ""}"></i>`).join("")}</div>
        ${a.done ? `<small class="jnDone">Forged ✓ · title “${esc(a.title)}”</small>` : `<small>${esc(a.need.text)}</small>${bar(a.need.have, a.need.need, a.need.ok ? "gold" : "")}
        ${a.need.ok ? `<button class="menuBtn ${a.stage === a.total - 1 ? "gold jnGlowBtn" : "green"}" onclick="gameJourney.artifact(${jsq(a.id)})">${a.stage === a.total - 1 ? "FORGE IT" : "ADVANCE"}</button>` : ""}`}
      </div>`).join("") + `</div>`;
  }
  function seasonHtml(v) {
    const s = v.season;
    return `<div class="jnHero season"><div class="jnSigil"></div><small class="jnAct">SEASON ${esc(s.number)} · THE DEPTHS LADDER</small>
      <div class="jnStepName">${s.f > 0 ? "Floor " + num(s.f) : "No floor banked yet"}</div>
      <small>${s.bracket ? esc(s.bracket) + " bracket" : "Bank floor 5 to enter the Ember bracket"}${s.myRank ? " · rank #" + s.myRank : ""} · ends in ${fmtLeft(s.endsAt - now())}</small></div>
      <div class="jnLadder">${s.brackets.map(b => `<div class="jnRung${s.f >= b.f ? " on" : ""}"><b>${esc(b.name)}</b><small>floor ${esc(b.f)}+</small>${linesHtml(b.lines, "mini")}</div>`).join("")}</div>
      <p class="jnHint">Top 10 at floor 20+ become the <b>Hand of the Heart</b> for the season.</p>
      <ol class="jnBoard">${(s.top || []).map((r, i) => `<li${ST() && r.user === ST().user ? ' class="me"' : ""}><b>#${i + 1}</b><span>${r.tag ? "[" + esc(r.tag) + "] " : ""}${esc(r.user)}</span><em>floor ${num(r.f)}</em></li>`).join("") || "<li class='muted'>The ladder is empty. Descend.</li>"}</ol>`;
  }
  function lanternHtml(v) {
    const l = v.lantern;
    return `<div class="jnHero lantern"><div class="jnSigil"></div><small class="jnAct">LANTERN-BEARERS</small>
      <div class="jnParagonNum">${num(v.marks.lantern)}</div><small>Lantern Marks</small>
      <p class="jnHint">Veterans (Delver Rank 30+) earn a mark for every newcomer they carry through a clear — up to ${esc(l.perDay)} a day. Newcomers in the party get +20% Delver XP.</p>
      <small>Today: ${num(l.today)} / ${num(l.perDay)} · all time: ${num(l.total)}</small></div>
      <div class="jnShop">${l.shop.map(x => `<div class="jnShopRow"><b>${esc(x.name)}</b><small>${num(x.cost)} marks${x.once ? " · once" : ""}</small>
        ${x.once && x.bought ? `<span class="jnDone">Owned ✓</span>` : `<button class="menuBtn" ${v.marks.lantern < x.cost ? "disabled" : ""} onclick="gameJourney.lanternBuy(${jsq(x.id)})">BUY</button>`}</div>`).join("")}</div>`;
  }
  function firstsHtml(list, v) {
    const titles = (v && v.guildTitles) || [];
    return (titles.length ? `<div class="jnPanel"><div class="jnHead"><b>YOUR GUILD'S PRESTIGE TITLES</b></div>${titles.map(t => `<div class="jnTitle"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></div>`).join("")}</div>` : "") +
      `<div class="jnPanel"><div class="jnHead"><b>⚡ WORLD FIRSTS</b></div>` +
      ((list || []).map(f => `<div class="jnFirst"><b>${esc(f.text)}</b><small>${new Date(f.at).toLocaleDateString()}</small></div>`).join("") || `<p class="muted">No world firsts yet. The first Delve 5 clear of the Starlit Archive is still out there…</p>`) + `</div>`;
  }
  function trackerHtml(v) {
    if (!v) return "";
    const n = J() ? J().nextAction : null;
    const next = v.next || (n ? n({}) : { text: "" });
    const p = v.path;
    const prog = p && !p.done && p.prog ? bar(Math.min(p.prog.have, p.prog.need), p.prog.need, p.claimable ? "gold" : "") : "";
    const alert = next.kind !== "path" || (p && p.claimable);
    return `<div class="jnTrackHead" onclick="gameJourney.open()"><span class="jnOrb${alert ? " alert" : ""}">✦</span>
        <b>${p && !p.done ? esc(p.step.name) : "THE DELVER'S JOURNEY"}</b>
        <button class="jnMin" onclick="event.stopPropagation();gameJourney.toggleTracker()">${trackerCollapsed ? "+" : "–"}</button></div>
      ${trackerCollapsed ? "" : `<div class="jnTrackBody" onclick="gameJourney.open()">${prog}<small>${esc(next.text)}</small>
        ${v.stats && v.stats.paragon ? `<small class="jnPara">Paragon ${num(v.stats.paragon)}</small>` : ""}</div>`}`;
  }
  function welcomeHtml(pending, opened) {
    const runes = "ᚹ ᛖ ᛚ ᚲ ᛟ ᛗ ᛖ · ᛒ ᚨ ᚲ ᚲ";
    let html = `<div class="jnWbRings"><i></i><i></i><i></i></div><div class="jnWbMotes">${"<span></span>".repeat(18)}</div>
      <div class="jnWbCard"><div class="jnWbRunes">${runes}</div>
      <h1>WELCOME BACK, DELVER</h1>`;
    if (!opened) {
      html += `<p class="jnWbSub">You were gone <b>${num(pending.days)} days</b>. The Depths remembered you.</p>
        <p>While you were away the leylines tore open: three new dungeons beyond the Roost, multi-guild raids, the endless Arcane Depths, the Arcane Forge, and a whole Path of rewards.</p>
        <div class="jnWbCache"><small>${esc(pending.name).toUpperCase()}'S CACHE</small>${linesHtml(pending.lines)}
        <small>+ Returner's Blessing for ${num(pending.runs)} runs: +50% Delver XP, bonus materials, catch-up gear.</small></div>
        <button class="menuBtn gold jnGlowBtn jnBig" onclick="gameJourney.retOpen()">✦ OPEN THE CACHE</button>
        <button class="jnLater" onclick="gameJourney.closeWelcome()">later</button>`;
    } else {
      const hasGuild = !!(W.gameGuild && W.gameGuild.myGuild && W.gameGuild.myGuild());
      html += `<p class="jnWbSub">${hasGuild ? "Your gear has been lifted to the depths your guild now walks." : "Fresh gear, forged for the depths that wait below."}</p>${itemCards(opened.items)}
        ${linesHtml((opened.lines || []).filter(l => l.kind !== "gear"))}
        <p>Your road back starts now: <b>The Way Back</b>, five steps with rewards at each.</p>
        <button class="menuBtn gold jnGlowBtn jnBig" onclick="gameJourney.closeWelcome();gameJourney.open('path')">BEGIN THE WAY BACK</button>`;
    }
    return html + `</div>`;
  }
  function awakeningHtml(e) {
    return `<div class="jnWbRings awakening"><i></i><i></i><i></i></div><div class="jnWbMotes">${"<span></span>".repeat(24)}</div>
      <div class="jnWbCard awakening"><div class="jnWbRunes">ᚨ ᚱ ᚲ ᚨ ᚾ ᛖ · ᚨ ᚹ ᚨ ᚲ ᛖ ᚾ ᛁ ᛜ</div>
      <h1>${esc(e.name).toUpperCase()}</h1><p class="jnWbSub">${esc(e.blurb)}</p>
      <p>Until it ends: <b>+${Math.round((e.xp || 0) * 100)}% Delver XP</b>, bonus Arcane Dust on every clear and a chance at extra Epic gear. Everyone gets a gift.</p>
      ${linesHtml(e.gift)}
      <button class="menuBtn gold jnGlowBtn jnBig" onclick="gameJourney.eventClaim(${jsq(e.id)});gameJourney.closeWelcome()">✦ CLAIM THE GIFT</button>
      <button class="jnLater" onclick="gameJourney.closeWelcome()">later</button></div>`;
  }
  function bodyHtml(v, t, extra) {
    switch (t) {
      case "week": return weekHtml(v);
      case "paragon": return paragonHtml(v);
      case "artifacts": return artifactsHtml(v);
      case "season": return seasonHtml(v);
      case "lantern": return lanternHtml(v);
      case "firsts": return firstsHtml(extra, v);
      default: return pathHtml(v);
    }
  }
  function shellHtml(v, t, extra) {
    return `<div class="jnWrap">${tabsHtml(t, v)}<div class="jnBody">${bodyHtml(v, t, extra)}</div></div>`;
  }
  function boardHtml(b) {
    return `<div class="jnWrap">` + b.brackets.map(x => `<div class="jnPanel"><div class="jnHead"><b>${esc(x.name)}</b><small>${esc(x.tierName)} · delve ${esc(x.delve)}+ · week ${esc(b.week)}</small></div>
      <ol class="jnBoard">${x.rows.map(r => `<li${ST() && (r.members || []).includes(ST().user) ? ' class="me"' : ""}><b>#${r.rank}</b><span>${esc((r.tags || []).map(t => "[" + t + "]").join(" "))} ${esc((r.members || []).join(", "))}</span><em>${fmtMs(r.ms)} · d${esc(r.dl)}</em></li>`).join("") || "<li class='muted'>Empty.</li>"}</ol>
      <small class="jnSub">REWARDS (paid next week)</small>${x.rewards.map(r => `<div class="jnRankRw"><b>Top ${esc(r.upTo)}</b>${linesHtml(r.lines, "mini")}</div>`).join("")}</div>`).join("") +
      `<button class="menuBtn" onclick="gameJourney.open('week')">BACK</button></div>`;
  }

  // ---------------------------------------------------------------- DOM: tracker + overlays
  function el(id) { return (W.document && W.document.getElementById(id)) || null; }
  // The tracker belongs to the neighbourhood and its interiors only. It lives
  // on <body> (outside the scaled #stage), so it would paint over every menu,
  // the race, the sea, the casino tables and the phone's touch controls.
  function menuShown() { const m = el("menu"); return !!(m && !m.classList.contains("hidden")); }
  function trackerAllowed() {
    const s = ST();
    if (!view || !s || !s.user || s.dungeon) return false;
    const a = String(s.area || "");
    if (a !== "neighborhood" && !(a.indexOf("interior_") === 0 && a !== "interior_casino")) return false;
    if (menuShown() || (W.gameRace && W.gameRace.active)) return false;
    // Full-screen moments: the loot reveal / results, Welcome Back, the race overlay.
    if (el("adResults") || el("jnWelcome") || el("adReveal") || (W.document.querySelector && W.document.querySelector(".race-overlay, .adRv"))) return false;
    return true;
  }
  function renderTracker() {
    if (!W.document || !W.document.body) return;
    let t = el("jnTracker");
    const hide = !trackerAllowed();
    if (!t) {
      if (hide) return;
      t = W.document.createElement("div");
      t.id = "jnTracker";
      t.className = "jnTracker";
      W.document.body.appendChild(t);
    }
    t.classList.toggle("hidden", hide);
    t.classList.toggle("min", trackerCollapsed);
    // Desktop: tuck it just under the money/HP card (which scales with the
    // stage) instead of a fixed spot that overlapped it. Phones use the CSS
    // top-centre placement, clear of the touch sticks.
    try {
      const touch = W.document.documentElement.classList.contains("touch-ui");
      const hud = el("hud");
      if (!hide && !touch && hud && hud.getBoundingClientRect) {
        const r = hud.getBoundingClientRect();
        if (r.width > 0) { t.style.left = Math.round(r.left) + "px"; t.style.top = Math.round(r.bottom + 8) + "px"; t.style.transform = "none"; }
      } else if (t.style) { t.style.left = ""; t.style.top = ""; t.style.transform = ""; }
    } catch (e) {}
    if (!hide) t.innerHTML = trackerHtml(view);
  }
  function overlay(html, cls) {
    closeWelcome();
    if (!W.document || !W.document.body) return;
    const o = W.document.createElement("div");
    o.id = "jnWelcome";
    o.className = "jnWelcome " + (cls || "");
    o.innerHTML = html;
    W.document.body.appendChild(o);
  }
  function closeWelcome() {
    const o = el("jnWelcome");
    if (o && o.parentNode) o.parentNode.removeChild(o);
  }
  function showWelcome() {
    if (!view || !view.ret || !view.ret.pending) { say("No Returner's Cache is waiting for you."); return; }
    welcomeShownFor = view.ret.pending.days;
    overlay(welcomeHtml(view.ret.pending, null), "wb");
  }
  function showAwakening(id) {
    const e = view && (view.events || []).find(x => x.id === id && x.giftReady);
    if (!e) return;
    eventShown[id] = 1;
    overlay(awakeningHtml(e), "aw");
  }
  // After a refresh: pop the most important thing once per session.
  function autoPop() {
    if (!view) return;
    if (view.ret && view.ret.pending && welcomeShownFor !== view.ret.pending.days) { showWelcome(); return; }
    const e = (view.events || []).find(x => x.giftReady && !eventShown[x.id]);
    if (e) showAwakening(e.id);
  }

  // ---------------------------------------------------------------- data + actions
  function adopt(res) {
    if (!res) return;
    if (res.journey) { view = res.journey; view._got = Date.now(); }
    if (res.money != null && ST() && ST().data) ST().data.money = res.money;
    if (typeof W.updateHUD === "function") { try { W.updateHUD(); } catch (e) {} }
    for (const g of res.granted || []) announceGrant(g);
    renderTracker();
  }
  // Journey grants (the Initiate's Satchel, a Returner's Cache, vault picks,
  // artifacts, catch-up items) land in the pack server-side and the reply
  // carries no gear view: pull it so the Armory isn't stale (QA B4).
  function refreshGear() {
    if (W.gameGear && typeof W.gameGear.refresh === "function") { try { W.gameGear.refresh(); } catch (e) {} }
  }
  function announceGrant(g) {
    if (!g) return;
    if (g.source === "challenge") say(`⚔ Weekly Challenge: you placed #${g.rank} — ${grantSummary(g.reward)}`, 7000);
    else if (g.source === "season") say(`☾ Season ${g.season} ended: floor ${g.floor}${g.rank ? " (#" + g.rank + ")" : ""} — ${grantSummary(g.reward)}`, 8000);
    else if (g.source === "paragon") say(`✧ PARAGON ${g.levels[g.levels.length - 1]}!`, 5000);
  }
  async function refresh() {
    try { adopt(await call({ action: "status" })); } catch (e) { return null; }
    if (isMenuOpen()) rerender();
    return view;
  }
  function isMenuOpen() { const m = el("menu"); return !!(m && !m.classList.contains("hidden") && el("jnRoot")); }
  function rerender(extra) {
    if (!view || typeof W.openMenu !== "function") return;
    W.openMenu("✦ THE DELVER'S JOURNEY", `<div id="jnRoot">${shellHtml(view, tab, extra)}</div>`, true);
  }
  async function open(t) {
    if (t) tab = t;
    vaultConfirm = -1;
    if (!view) { await refresh(); if (!view) { say("The Journey is still waking up — try again in a moment."); return; } }
    if (tab === "firsts") {
      let list = [];
      try { const r = await call({ action: "firsts" }); list = (r.result && r.result.list) || []; adopt(r); } catch (e) {}
      rerender(list);
      return;
    }
    rerender();
    if (tab === "path") refresh();
  }
  async function act(req, after) {
    if (busy) return null;
    busy = true;
    try {
      const res = await call(req);
      adopt(res);
      if (req.action !== "status" && req.action !== "firsts" && req.action !== "board") refreshGear();
      if (after) after(res.result || {});
      return res;
    } catch (e) { say(esc(e.message || String(e)), 4200); return null; }
    finally { busy = false; }
  }
  const claim = (id) => act({ action: "claim", step: id }, (r) => { say(`✦ Step complete — ${grantSummary(r)}`, 5200); celebrate(); rerender(); });
  const retClaim = (id) => act({ action: "ret_claim", step: id }, (r) => { say(`🜂 The Way Back — ${grantSummary(r)}`, 5200); rerender(); });
  const eventClaim = (id) => act({ action: "event_claim", fid: id }, (r) => { say(`✦ The Awakening answers — ${grantSummary(r)}`, 6000); if (isMenuOpen()) rerender(); });
  const bountyClaim = (id) => act({ action: "bounty_claim", fid: id }, (r) => { say(`☠ Bounty claimed — ${grantSummary(r)}`, 5000); rerender(); });
  const lanternBuy = (id) => act({ action: "lantern_buy", item: id }, (r) => { say(`🏮 ${grantSummary(r)}`, 4200); rerender(); });
  const artifact = (id) => act({ action: "artifact", fid: id }, (r) => {
    if (r.item) { say(`⚜ ${esc(r.item.name)} is forged!${r.first ? " " + esc(r.first) : ""}`, 8000); celebrate(); }
    else say(`⚜ Stage complete: ${esc(r.stage)}`, 4000);
    rerender();
  });
  async function vaultPick(idx) {
    if (vaultConfirm !== idx) { vaultConfirm = idx; rerender(); return; }
    vaultConfirm = -1;
    await act({ action: "vault_pick", idx }, (r) => { say(`⚱ The Great Vault opens — ${grantSummary(r)}`, 6000); celebrate(); rerender(); });
  }
  async function retOpen() {
    const res = await act({ action: "ret_open" });
    if (res && res.result) { welcomeShownFor = -1; overlay(welcomeHtml(null, res.result), "wb opened"); }
  }
  async function showBoard() {
    try { const r = await call({ action: "board" }); adopt(r); W.openMenu("⚔ WEEKLY CHALLENGE", `<div id="jnRoot">${boardHtml(r.result)}</div>`, true); }
    catch (e) { say(esc(e.message)); }
  }
  function toggleTracker() {
    trackerCollapsed = !trackerCollapsed;
    try { W.localStorage && W.localStorage.setItem("jnTrackerMin", trackerCollapsed ? "1" : "0"); } catch (e) {}
    renderTracker();
  }
  // A brief burst of arcane light over the page.
  function celebrate() {
    if (!W.document || !W.document.body) return;
    const b = W.document.createElement("div");
    b.className = "jnBurst";
    b.innerHTML = "<i></i><i></i><i></i>";
    W.document.body.appendChild(b);
    setTimeout(() => { if (b.parentNode) b.parentNode.removeChild(b); }, 1600);
  }

  // ---------------------------------------------------------------- pushes (event:'journey')
  function onEvent(m) {
    if (!m || !m.kind) return;
    switch (m.kind) {
      case "welcome_back": refresh().then(() => autoPop()); break;
      case "event": refresh().then(() => autoPop()); break;
      case "granted": announceGrant(m.grant); refresh(); refreshGear(); break;
      case "run": onRunReward(m.run); break;
      case "world_first": say("⚡ " + esc(m.text), 9000); break;
      case "guild_title": say("🏰 Your guild earned: " + esc((m.names || []).join(", ")), 7000); break;
      default: break;
    }
  }
  // Summarise one settled run's journey outcome.
  function onRunReward(r) {
    if (!r) return;
    const bits = [];
    if (r.xp && r.xp.bonus) bits.push(`+${num(r.xp.bonus)} bonus Delver XP`);
    if (r.bonus && r.bonus.items && r.bonus.items.length) bits.push(`${r.bonus.items.length} catch-up ${r.bonus.items.length === 1 ? "item" : "items"}`);
    if (r.lantern) bits.push(`+${r.lantern} Lantern ${r.lantern === 1 ? "Mark" : "Marks"}`);
    for (const c of r.challenge || []) if (c.first) bits.push(`Challenge cache (${c.bracket})`);
    for (const b of r.bounties || []) bits.push(`bounty done: ${b.text}`);
    if (r.paragon) bits.push(`PARAGON ${r.paragon.level}!`);
    if (r.path && r.path.claimable) bits.push(`Path step ready: ${r.path.name}`);
    if (bits.length) setTimeout(() => say("✦ " + esc(bits.join(" · ")), 6500), 2600);
    for (const f of r.firsts || []) say("⚡ " + esc(f), 9000);
    if (r.bonus && r.bonus.items && r.bonus.items.length) refreshGear();
    refresh();
  }

  // ---------------------------------------------------------------- boot
  function loggedIn() {
    if (!ST() || !ST().user) return false;
    const ls = el("loginScreen");
    return !(ls && !ls.classList.contains("hidden") && ls.style && ls.style.display !== "none");
  }
  function boot() {
    if (W.NET && typeof W.NET.on === "function") {
      W.NET.on("journey", onEvent);
      W.NET.on("open", () => { if (booted) setTimeout(refresh, 1500); });
    }
    // Hide / show the tracker the moment a menu opens or closes, not on the next 2 s tick.
    try {
      const m = el("menu");
      if (m && typeof W.MutationObserver === "function") new W.MutationObserver(() => renderTracker()).observe(m, { attributes: true, attributeFilter: ["class"] });
    } catch (e) {}
    if (typeof setInterval === "function" && typeof W.document !== "undefined" && !W.__jnNoTimers) {
      setInterval(() => {
        if (!loggedIn()) return;
        if (!booted) { booted = true; refresh().then(() => autoPop()); return; }
        renderTracker();
      }, 2000);
      setInterval(() => { if (booted && loggedIn()) refresh(); }, 90000);
    }
  }

  W.gameJourney = {
    open, refresh, onEvent, onRunReward, claim, retOpen, retClaim, eventClaim, vaultPick, bountyClaim, artifact, lanternBuy,
    showBoard, showWelcome, showAwakening, closeWelcome, toggleTracker, renderTracker,
    state: () => view,
    _render: { tabsHtml, pathHtml, weekHtml, vaultHtml, challengeHtml, bountiesHtml, paragonHtml, artifactsHtml, seasonHtml, lanternHtml,
      firstsHtml, trackerHtml, welcomeHtml, awakeningHtml, shellHtml, boardHtml, linesHtml },
  };
  boot();
})();
