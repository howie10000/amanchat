/* CODEX — the collection log, achievements and the Delver Rank panel
   (Arcane Depths, B4b).

   Data comes from the server's `delver` op (MASTER-PLAN §6.6):
     status -> {rank, xp, into, need, prestige, perks, title, titles, codex,
                codexPages, achievements, weekly, stats}
   When that op is not there yet the panel falls back to whatever the login
   record carried (u.codex / u.delve), so it always renders. */
(function () {
  "use strict";
  const U = () => gameGear.ui;
  const esc = (s) => U().esc(s);

  const C = { tab: "codex", page: null, data: null, loading: false };
  const TABS = [["codex", "COLLECTION"], ["achievements", "ACHIEVEMENTS"], ["delver", "DELVER RANK"]];
  const ACH_CATS = { bane: "Bosses", feat: "Feats", loot: "Loot", codex: "Collection", delve: "Delving", depths: "The Arcane Depths", raid: "Raids", forge: "The Forge" };

  function call(msg) {
    if (typeof window.netDelver === "function") return window.netDelver(msg);
    return Promise.reject(new Error("offline"));
  }
  // Normalise whatever we have into the status shape.
  function local() {
    // `state` is core.js's script-scope const — never a window property.
    const d = (typeof state !== "undefined" && state && state.data) || {};
    const delve = d.delve || {};
    const r = ECON.delverRank(delve.xp || 0);
    return {
      rank: r.rank, xp: r.xp, into: r.into, need: r.need, prestige: r.prestige,
      title: delve.title || "", titles: delve.titles || [], codex: d.codex || {}, achievements: delve.ach || {},
      weekly: delve.weekly || {}, stats: delve.stats || {}, local: true,
    };
  }
  function data() { return C.data || local(); }
  async function load() {
    try {
      const res = await call({ action: "status" });
      if (res && typeof res === "object") C.data = res;
      return true;
    } catch (e) { return false; }
  }

  // ---------------- collection ----------------
  function entryOf(id) {
    if (/^tome:/.test(id)) {
      const t = ECON.TOMES[id.slice(5)];
      return { id, kind: "tome", name: t ? t.name : id, emoji: t ? t.emoji : "📕", rarity: t ? t.rarity : "legendary" };
    }
    const b = ECON.GEAR_BASE_BY_ID[id];
    if (!b) return { id, kind: "gear", name: U().title(id), emoji: "?" };
    return { id, kind: b.unique ? "unique" : b.set ? "set" : "gear", name: b.name, emoji: (ECON.GEAR_SLOT_INFO[b.slot] || {}).emoji || "", slot: b.slot, set: b.set };
  }
  function pageStats(tier, codex) {
    const ids = ECON.CODEX_PAGES[tier] || [];
    const have = (codex && codex.i) || {};
    const n = ids.filter(id => have[id]).length;
    return { have: n, total: ids.length, done: ids.length > 0 && n === ids.length };
  }
  function tile(id, codex) {
    const e = entryOf(id);
    const rec = ((codex && codex.i) || {})[id];
    const kindCls = "k-" + e.kind;
    const b = ECON.GEAR_BASE_BY_ID[id];
    const best0 = rec ? (ECON.GEAR_RARITIES[rec[0] | 0] || "fine") : (b && (b.unique || b.set) ? "legendary" : "fine");
    const ico = e.kind === "tome" ? U().icon("tome", id.slice(5), 44, "", e.emoji)
      : U().icon("gear", { id, base: id, slot: e.slot, lvl: b ? b.lvl || 1 : 1, rarity: best0, uq: b && b.unique ? id : undefined, set: e.set }, 44, "", e.emoji);
    if (!rec) {
      return `<div class="adCx unfound ${kindCls}" title="Not found yet"><span class="adCxIco">${ico}</span><span class="adCxName">???</span>
        <small>${e.kind === "unique" ? "Unique" : e.kind === "set" ? "Set piece" : e.kind === "tome" ? "Tome" : ECON.GEAR_SLOT_INFO[e.slot] ? ECON.GEAR_SLOT_INFO[e.slot].label : ""}</small></div>`;
    }
    const best = ECON.GEAR_RARITIES[rec[0] | 0] || "fine";
    const r = U().rar(best);
    return `<div class="adCx found ${kindCls} adR-${best}" style="--rc:${r.color};--rg:${r.glow || r.color}" title="${esc(e.name)} — best ${r.label}, found ${rec[1] | 0}×">
      <span class="adCxIco">${ico}</span><span class="adCxName">${esc(e.name)}</span>
      <small><b style="color:${r.color}">${r.label}</b> · ×${rec[1] | 0}</small></div>`;
  }
  function fmtMs(ms) { if (!ms) return "—"; const s = Math.round(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function renderCodex() {
    const d = data(), codex = d.codex || {};
    const tiers = ECON.GUILD_DUNGEON_ORDER.filter(t => ECON.CODEX_PAGES[t]);
    if (!C.page || !ECON.CODEX_PAGES[C.page]) C.page = tiers[0];
    const total = tiers.reduce((s, t) => s + (ECON.CODEX_PAGES[t] || []).length, 0);
    const found = Object.keys(codex.i || {}).length;
    const side = tiers.map(t => {
      const ps = pageStats(t, codex), pct = ps.total ? Math.round(100 * ps.have / ps.total) : 0;
      return `<button class="adCxPage ${t === C.page ? "on" : ""} ${ps.done ? "done" : ""}" onclick="gameCodex.page('${t}')">
        <b>${U().icon("tier", t, 22, "", "")}${esc(U().dungeonName(t))}</b><span class="adBar"><i style="width:${pct}%"></i></span><small>${ps.have}/${ps.total}${ps.done ? " ✓" : ""}</small></button>`;
    }).join("");
    const tier = C.page, row = ECON.DUNGEON_LOOT[tier] || {}, cfg = ECON.GUILD_DUNGEONS[tier] || {};
    const ps = pageStats(tier, codex), ids = ECON.CODEX_PAGES[tier] || [];
    const reward = ECON.CODEX_PAGE_REWARDS && ECON.CODEX_PAGE_REWARDS[tier];
    const hat = reward && (ECON.COSMETICS.hat || []).find(h => h.id === reward.hat);
    const groups = [
      ["Uniques", ids.filter(id => entryOf(id).kind === "unique")],
      ["Set pieces", ids.filter(id => entryOf(id).kind === "set")],
      ["Armory pieces", ids.filter(id => entryOf(id).kind === "gear")],
      ["Tomes", ids.filter(id => entryOf(id).kind === "tome")],
    ].filter(g => g[1].length);
    const kills = codex.b || {};
    const bossRow = [row.boss, cfg.mini].filter(Boolean).map(b => `<span class="adKill">${U().icon("boss", b, 20, "", "")}<b>${(kills[b] | 0).toLocaleString()}</b> ${esc(U().bossName(b))}</span>`).join("");
    const main = `<div class="adCxHead">
        <div><h3>${esc(U().dungeonName(tier))}</h3><small class="muted">iLvl ${row.lvl || "?"} · fastest ${fmtMs((codex.f || {})[tier])} · deepest delve ${(codex.d || {})[tier] | 0}</small></div>
        <div class="adCxPct"><b>${ps.total ? Math.round(100 * ps.have / ps.total) : 0}%</b><small>${ps.have}/${ps.total}</small></div>
      </div>
      <div class="adKills">${bossRow}</div>
      ${reward ? `<div class="adCxReward ${ps.done ? "done" : ""}"><b>${ps.done ? "PAGE COMPLETE" : "Complete the page"}</b> —
        ${hat ? `hat <i>${esc(hat.name)}</i>, ` : ""}title <i>“${esc(reward.title)}”</i>${reward.sigil ? `, ${reward.sigil.n} ${esc(U().matName(reward.sigil.id))}` : ""}</div>` : ""}
      ${groups.map(([label, list]) => `<h4 class="adCxGroup">${label} <small>${list.filter(id => (codex.i || {})[id]).length}/${list.length}</small></h4>
        <div class="adCxGrid">${list.map(id => tile(id, codex)).join("")}</div>`).join("")}`;
    const allKills = ECON.GUILD_BOSS_ORDER.concat(ECON.GUILD_MINIS, ECON.GUILD_SPECIAL_BOSSES || [])
      .map(b => `<span class="adKill ${kills[b] ? "" : "zero"}">${U().icon("boss", b, 20, "", "")}<b>${(kills[b] | 0).toLocaleString()}</b> ${esc(U().bossName(b))}</span>`).join("");
    return `<div class="adCxTop"><b>${found}</b> of ${total} entries found. Silhouettes are pieces you have never looted. Staff-granted pieces never count.</div>
      <div class="adCxLayout"><div class="adCxSide">${side}</div><div class="adCxMain">${main}</div></div>
      <h3 class="section">BOSS KILLS</h3><div class="adKills all">${allKills}</div>`;
  }

  // ---------------- achievements ----------------
  function achProgress(a, s) {
    const cx = (s.codex) || {}, st = (s.delve && s.delve.stats) || {};
    let m = /^bane_(\w+)_(\d)$/.exec(a.id);
    if (m) { const n = [0, 10, 100, 500][+m[2]]; return [(cx.b || {})[m[1]] | 0, n]; }
    if (a.id === "collector_100") return [Object.keys(cx.i || {}).length, 100];
    if (a.id === "collector_300") return [Object.keys(cx.i || {}).length, 300];
    m = /^concord_(\d)$/.exec(a.id); if (m) return [st.raids | 0, [0, 10, 50, 200][+m[1]]];
    const tallies = { goblin_slayer: ["goblins", 25], vaultbreaker: ["vaults", 10], trialmaster: ["trials", 25], secret_keeper: ["secrets", 50], plus_ten: ["maxPlus", 10], plus_twelve: ["maxPlus", 12] };
    if (tallies[a.id]) return [st[tallies[a.id][0]] | 0, tallies[a.id][1]];
    m = /^delve_(\d+)$/.exec(a.id);
    if (m) return [Object.values(cx.d || {}).reduce((x, v) => Math.max(x, v | 0), 0), +m[1]];
    m = /^depths_(\d+)$/.exec(a.id);
    if (m) return [Math.max(st.depthsFloor | 0, (s.depthsBest && s.depthsBest.floor) | 0), +m[1]];
    return null;
  }
  function rewardText(r) {
    if (!r) return "";
    const p = [];
    if (r.dust) p.push(r.dust + " dust");
    if (r.shard) p.push(r.shard + " shards");
    if (r.ember) p.push(r.ember + " embers");
    if (r.title) p.push("title “" + r.title + "”");
    if (r.cosmetic) p.push(U().title(String(r.cosmetic).split(":")[1] || r.cosmetic));
    return p.join(" · ");
  }
  function renderAchievements() {
    const d = data(), have = d.achievements || {};
    const s = { codex: d.codex || {}, delve: { stats: d.stats || {} }, depthsBest: d.stats && d.stats.depthsBest };
    const done = ECON.ACHIEVEMENTS.filter(a => have[a.id]).length;
    let html = `<div class="adCxTop"><b>${done}</b> of ${ECON.ACHIEVEMENTS.length} achievements earned.</div>`;
    const cats = {};
    for (const a of ECON.ACHIEVEMENTS) (cats[a.cat] = cats[a.cat] || []).push(a);
    for (const [cat, list] of Object.entries(cats)) {
      html += `<h4 class="adCxGroup">${esc(ACH_CATS[cat] || U().title(cat))} <small>${list.filter(a => have[a.id]).length}/${list.length}</small></h4><div class="adAchGrid">`;
      for (const a of list) {
        const ts = have[a.id];
        const pr = ts ? null : achProgress(a, s);
        const pct = pr ? Math.min(100, Math.round(100 * pr[0] / Math.max(1, pr[1]))) : 0;
        html += `<div class="adAch ${ts ? "done" : ""}"><span class="adAchIco">${U().icon("achievement", a.id, 28, "", ts ? "★" : "☆")}</span><div>
          <b>${esc(a.label)}</b><small>${esc(rewardText(a.reward))}</small>
          ${ts ? `<small class="adAchWhen">${typeof ts === "number" && ts > 1e9 ? new Date(ts).toLocaleDateString() : "earned"}</small>`
            : pr ? `<span class="adBar"><i style="width:${pct}%"></i></span><small>${pr[0].toLocaleString()}/${pr[1].toLocaleString()}</small>` : ""}
          </div></div>`;
      }
      html += `</div>`;
    }
    return html;
  }

  // ---------------- delver rank ----------------
  function renderDelver() {
    const d = data();
    const rank = d.rank | 0 || 1, into = +d.into || 0, need = +d.need || ECON.delverXpForNext(rank);
    const pct = Math.min(100, Math.round(100 * into / Math.max(1, need)));
    const perksHave = new Set((d.perks || []).filter(p => p.have).map(p => p.id));
    const perkRow = (p) => {
      const got = perksHave.has(p.id) || p.rank <= rank;
      return `<div class="adPerk ${got ? "got" : ""}"><span class="adPerkRank">${p.rank}</span><span>${esc(p.label)}</span></div>`;
    };
    const nodes = ECON.DELVER_PERKS.reduce((m, p) => { (m[p.rank] = m[p.rank] || []).push(p); return m; }, {});
    const track = Object.keys(nodes).map(Number).sort((a, b) => a - b).map(r =>
      `<span class="adTrackNode ${r <= rank ? "got" : ""}" style="left:${(100 * (r - 1) / 59).toFixed(2)}%" title="${esc("Rank " + r + ": " + nodes[r].map(p => p.label).join(", "))}"></span>`).join("");
    const titles = Array.from(new Set([""].concat(d.titles || [])));
    const cosm = [];
    for (const kind of Object.keys(ECON.COSMETICS)) for (const c of ECON.COSMETICS[kind]) if (c.unlock) cosm.push(Object.assign({ kind }, c));
    const u = { delve: { xp: d.xp, ach: d.achievements || {} }, codex: d.codex || {} };
    const weeklyTiers = (d.weekly && d.weekly.tiers) || {};
    const stats = d.stats || {};
    const stars = d.prestige ? `<div class="adStars">${"★".repeat(Math.min(10, d.prestige))}${d.prestige > 10 ? ` ×${d.prestige}` : ""}</div>` : "";
    const next = ECON.DELVER_PERKS.find(p => p.rank > rank);
    return `<div class="adDelverHero">
        <div class="adRankSigil"><b>${rank}</b><small>RANK</small></div>
        <div class="adDelverMain">
          <div class="adDelverTitle">${d.title ? `“${esc(d.title)}”` : `<span class="muted">No title worn</span>`}</div>
          ${stars}
          <div class="adIXpBar"><i style="width:${pct}%"></i><span>${Math.floor(into).toLocaleString()} / ${Math.floor(need).toLocaleString()} XP</span></div>
          <small class="muted">${rank >= ECON.DELVER_MAX_RANK ? "Rank 60 — every further rank-worth of XP earns a Prestige Star." : next ? `Next perk at rank ${next.rank}: ${esc(next.label)}` : ""}</small>
        </div>
      </div>
      <div class="adTrack"><i style="width:${(100 * (Math.min(rank, 60) - 1) / 59).toFixed(2)}%"></i>${track}</div>
      <p class="muted">Delver XP comes from every guild run: floors, elites, minis, bosses, trials and vaults — more at higher delves, double for each dungeon's first clear of the week. Perks never add damage.</p>
      <div class="adDelverCols">
        <div><h4 class="adCxGroup">Perks</h4><div class="adPerks">${ECON.DELVER_PERKS.map(perkRow).join("")}</div></div>
        <div>
          <h4 class="adCxGroup">Title</h4>
          <div class="adTitlePick"><select class="menuInput" id="adTitleSel">${titles.map(t => `<option value="${esc(t)}" ${t === (d.title || "") ? "selected" : ""}>${t ? esc(t) : "(none)"}</option>`).join("")}</select>
            <button class="menuBtn gold" onclick="gameCodex.setTitle()">WEAR</button></div>
          <h4 class="adCxGroup">Cosmetic unlocks</h4>
          <div class="adCosm">${cosm.map(c => { const ok = ECON.cosmeticUnlockOk(c, u);
            const how = String(c.unlock).replace(/^delver:/, "Rank ").replace(/^codex:(.*)$/, (m, t) => "Codex: " + U().dungeonName(t)).replace(/^ach:(.*)$/, (m, a) => "Achievement: " + ((ECON.ACHIEVEMENT_BY_ID[a] || {}).label || a))
              .replace(/^journey:(.*)$/, (m, k) => "Journey: " + ({ path: "walk the whole Path", awakening: "the Awakening", paragon: "reach Paragon", season: "a Season reward", lantern: "carry the Lantern", returner: "come back after a long absence" }[k] || U().title(k)));
            return `<span class="${ok ? "got" : ""}"><b>${esc(c.name)}</b> <small>${esc(U().title(c.kind))} · ${esc(how)}</small></span>`; }).join("")}</div>
          <h4 class="adCxGroup">This week's first clears <small>${esc(d.weekly && d.weekly.wk || "")}</small></h4>
          <div class="adWeekly">${ECON.GUILD_DUNGEON_ORDER.map(t => `<span class="${weeklyTiers[t] ? "got" : ""}">${weeklyTiers[t] ? "✓" : "○"} ${esc(U().dungeonName(t))}</span>`).join("")}</div>
          <small class="muted">The first clear of each dungeon every week rolls a guaranteed Legendary, a Gilded Key and double Delver XP.</small>
          <h4 class="adCxGroup">Tallies</h4>
          <div class="adTallies">${[["goblins", "Goblins"], ["vaults", "Vaults"], ["trials", "Trials"], ["secrets", "Secrets"], ["raids", "Raid clears"], ["maxPlus", "Best enhancement"]]
            .map(([k, l]) => `<span><b>${k === "maxPlus" ? "+" + (stats[k] | 0) : (stats[k] | 0).toLocaleString()}</b> ${l}</span>`).join("")}</div>
        </div>
      </div>`;
  }

  function render() {
    const body = C.tab === "achievements" ? renderAchievements() : C.tab === "delver" ? renderDelver() : renderCodex();
    return `<div id="adCodexRoot" class="adCodex">
      <div class="adNav">${TABS.map(([id, l]) => `<button class="menuBtn ${C.tab === id ? "gold" : "gray"}" onclick="gameCodex.tab('${id}')">${l}</button>`).join("")}
        <span class="adNavGap"></span><button class="menuBtn gray" onclick="gameGear.openArmory()">← ARMORY</button></div>
      ${data().local && !C.loading ? `<p class="muted adOffline">Showing your saved record — live numbers arrive with the Delver service.</p>` : ""}
      ${body}</div>`;
  }
  function title() { return C.tab === "delver" ? "DELVER RANK" : C.tab === "achievements" ? "ACHIEVEMENTS" : "THE CODEX"; }
  function paint() {
    const root = typeof document !== "undefined" && document.getElementById && document.getElementById("adCodexRoot");
    // Closed while the status load was in flight: don't re-open over another menu.
    if (root && root.parentNode) root.outerHTML = render();
  }
  function open(tab) {
    if (typeof tab === "string" && TABS.some(t => t[0] === tab)) C.tab = tab;
    else if (typeof tab === "string" && ECON.CODEX_PAGES && ECON.CODEX_PAGES[tab]) { C.tab = "codex"; C.page = tab; } // a tier key opens its page
    C.loading = true;
    openMenu(title(), render(), true);
    load().then(() => { C.loading = false; paint(); });
  }
  function setTab(t) { C.tab = t; const h = typeof document !== "undefined" && document.getElementById && document.getElementById("menuTitle"); if (h) h.textContent = title(); paint(); }
  function page(t) { C.page = t; paint(); }
  async function setTitle() {
    const el = typeof document !== "undefined" && document.getElementById && document.getElementById("adTitleSel");
    const t = el ? el.value : "";
    try {
      const res = await call({ action: "set_title", title: t });
      if (C.data) C.data.title = res && res.title != null ? res.title : t;
      toast(t ? `You are now “${esc(t)}”.` : "Title removed.", 2500);
      paint();
    } catch (e) { toast(esc(e.message) === "offline" ? "Titles arrive with the Delver service." : esc(e.message), 3000); }
  }

  window.gameCodex = {
    open, render, tab: setTab, page, setTitle,
    cached: () => C.data,
    // A settlement's delver block ({xp, rank, prestige,…}) keeps the cache fresh.
    noteDelver: (dv) => {
      if (!dv || typeof dv !== "object" || !C.data) return;
      const r = ECON.delverRank(dv.xp);
      Object.assign(C.data, { xp: r.xp, rank: r.rank, into: r.into, need: r.need, prestige: r.prestige });
    },
    _state: C,
  };
})();
