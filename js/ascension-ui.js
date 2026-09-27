/* THE SUNDERED CROWN II — the Ascension panel (window.gameAscensionUI).
   Opened from the dungeon HUD's "▲ Ascend" button (and gameAscensionUI.open()).
   Four tabs, all read from the `ascend` op (netAscend) so the server is the
   only source of truth:
     LADDER    every crown tier's guild best, the next level's modifiers and a
               "Start at Ascension N" pick that rides the next run start
     WEEKLY    this week's challenge boss + modifiers, done / not done
     MASTERY   per-boss rank & title, prestige tier from mastery points
     FORGE     essence recipes (craft) and sundering (mythic+ L11+ -> essence)
   Pure render helpers are exported for js/ascension-ui.test.js. */
(function () {
  "use strict";
  const W = typeof window !== "undefined" ? window : null;
  const A = { tab: "ladder", data: null, busy: false, flash: null, pickTier: null, pickLevel: 0, pickChallenge: false, sunderId: null };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const money = (n) => "$" + Math.round(+n || 0).toLocaleString();
  const E = () => (W && W.ECON) || null;
  const AS = () => (W && W.ASCEND) || null;

  function tierName(t) { const e = E(); return e && e.GUILD_DUNGEONS[t] ? e.GUILD_DUNGEONS[t].name : t; }
  function bossName(id) { const e = E(); return e && e.GUILD_BOSSES[id] ? e.GUILD_BOSSES[id].name : id; }
  function modChips(mods, all) {
    const byId = {}; for (const m of all || []) byId[m.id] = m;
    return (mods || []).map(id => { const m = byId[id] || { name: id, desc: "" }; return `<span class="ascMod" title="${esc(m.desc)}">${esc(m.name)}</span>`; }).join("");
  }
  function ladderHtml(d, pick) {
    const rows = Object.entries(d.tiers || {}).map(([t, r]) => {
      const sel = pick && pick.tier === t ? pick.level : 0;
      const opts = []; for (let L = 0; L <= Math.min(d.max, r.next); L++) opts.push(`<option value="${L}"${L === sel ? " selected" : ""}>${L ? "Ascension " + L : "Normal"}</option>`);
      return `<tr><td><b>${esc(tierName(t))}</b><br><small>guild best A${r.guildMax} · yours A${r.mine} · ${r.clears} ascended clears</small></td>
        <td>${modChips(r.mods, d.modifiers)}</td>
        <td><select class="ascPick" data-tier="${esc(t)}" onchange="gameAscensionUI.pick('${esc(t)}', this.value)">${opts.join("")}</select></td></tr>`;
    }).join("");
    return `<p class="ascLead">Every crown dungeon can be run at <b>Ascension 1-${d.max}</b> once your guild has cleared the level below. Each level adds boss health and damage and stacks modifiers; clears pay <b>Ascendant Essence</b>, extra crown shards and mastery.</p>
      <table class="ascTable"><thead><tr><th>Dungeon</th><th>Next level's modifiers</th><th>Start at</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="ascHint">${pick && pick.level ? `Your next <b>${esc(tierName(pick.tier))}</b> run starts at <b>Ascension ${pick.level}</b>.` : "Pick a level; it applies to your next run of that dungeon (party leaders too)."}</p>`;
  }
  function weeklyHtml(d, pick) {
    const w = d.weekly || {};
    return `<div class="ascCard${w.done ? " done" : ""}"><div class="ascCardTitle">WEEK ${w.week} — ${esc(w.name || tierName(w.tier))}</div>
      <div class="ascCardBoss">${esc(w.bossName || bossName(w.bossId))}</div>
      <div>${modChips(w.mods, d.modifiers)}</div>
      <div class="ascCardPay">Pays <b>${w.essence} essence</b> + <b>${w.crownShards} crown shards</b> on your first clear this week (scaled like Ascension ${w.level}).</div>
      ${w.done ? `<div class="ascDone">✓ cleared this week</div>` : `<button type="button" class="ascBtn${pick && pick.challenge ? " on" : ""}" onclick="gameAscensionUI.challenge(${pick && pick.challenge ? "false" : "true"})">${pick && pick.challenge ? "✓ Armed — start " + esc(tierName(w.tier)) : "Arm the challenge for my next run"}</button>`}
    </div>`;
  }
  function masteryHtml(d) {
    const as = AS();
    const rows = Object.entries(d.mastery || {}).sort((a, b) => b[1].kills - a[1].kills).map(([id, m]) => {
      const title = as ? as.masteryTitle(id, m.rank) : null;
      return `<tr><td><b>${esc(bossName(id))}</b></td><td>${esc(m.name)}${title ? ` <small>“${esc(title)}”</small>` : ""}</td><td>${m.kills}${m.next ? ` / ${m.next}` : ""}<div class="ascBar"><i style="width:${Math.round((m.frac || 0) * 100)}%"></i></div></td></tr>`;
    }).join("");
    return `<p class="ascLead">Prestige <b>${esc((d.prestige || {}).name || "Wanderer")}</b> — ${d.points | 0} mastery points (1 / 3 / 6 / 10 per boss rank).</p>
      <table class="ascTable"><thead><tr><th>Boss</th><th>Rank</th><th>Kills</th></tr></thead><tbody>${rows || `<tr><td colspan="3">No boss kills yet.</td></tr>`}</tbody></table>`;
  }
  function forgeHtml(d) {
    const e = E();
    const rows = (d.recipes || []).map(r => {
      const c = r.cost || {};
      const sig = e && e.MATERIALS[c.sigil] ? e.MATERIALS[c.sigil].name : c.sigil;
      return `<tr><td><b>${esc(r.name || r.id)}</b></td><td>${c.essence} essence · ${c.crown_shard} shards · ${c.sigils}× ${esc(sig)} · ${money(c.gold)}</td>
        <td><button type="button" class="ascBtn" ${r.can ? "" : "disabled"} onclick="gameAscensionUI.craft('${esc(r.id)}')">⚒ CRAFT</button></td></tr>`;
    }).join("");
    return `<p class="ascLead">You hold <b>${d.essence | 0} Ascendant Essence</b>. Essence comes from Ascension clears, the weekly challenge, and <b>sundering</b> a mythic-or-better item of level 11+.</p>
      <table class="ascTable"><thead><tr><th>Recipe (mythic)</th><th>Cost</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <div class="ascSunder"><input id="ascSunderId" placeholder="item id to sunder" value="${esc(A.sunderId || "")}"> <button type="button" class="ascBtn" onclick="gameAscensionUI.sunder(document.getElementById('ascSunderId').value)">Sunder</button><small>Unequipped, mythic+, level 11+. Gone for good.</small></div>`;
  }
  function render(d, tab, pick) {
    d = d || { tiers: {}, modifiers: [], weekly: {}, mastery: {}, recipes: [], max: 20 };
    const tabs = [["ladder", "LADDER"], ["weekly", "WEEKLY"], ["mastery", "MASTERY"], ["forge", "FORGE"]].map(([k, l]) => `<button type="button" class="ascTab${tab === k ? " on" : ""}" onclick="gameAscensionUI.open('${k}')">${l}</button>`).join("");
    const body = tab === "weekly" ? weeklyHtml(d, pick) : tab === "mastery" ? masteryHtml(d) : tab === "forge" ? forgeHtml(d) : ladderHtml(d, pick);
    return `<div class="ascPanel"><div class="ascTabs">${tabs}</div>${A.flash ? `<div class="ascFlash ${A.flash.kind}">${A.flash.html}</div>` : ""}${body}</div>`;
  }

  // ---------------------------------------------------------------- live
  async function call(data) { if (!W || typeof W.netAscend !== "function") throw new Error("The Ascension ladder is still being raised."); return W.netAscend(data); }
  async function load() { try { A.data = await call({ action: "status" }); return true; } catch (e) { A.flash = { kind: "warn", html: esc(e.message || e) }; return false; } }
  function currentPick() { return { tier: A.pickTier, level: A.pickLevel, challenge: A.pickChallenge }; }
  function paint() { if (W && typeof W.openMenu === "function") W.openMenu("ASCENSION", render(A.data, A.tab, currentPick()), true); }
  function open(tab) { if (typeof tab === "string") A.tab = tab; A.flash = null; paint(); return load().then(ok => { if (ok) paint(); return ok; }); }
  function pushPick() {
    const G = W && W.gameAscension;
    if (G && typeof G.setPick === "function") G.setPick({ ascension: A.pickLevel, challenge: A.pickChallenge, tier: A.pickTier || (A.data && A.data.weekly && A.pickChallenge ? A.data.weekly.tier : null) });
  }
  function pick(tier, level) { A.pickTier = tier; A.pickLevel = Math.max(0, level | 0); if (A.pickLevel) A.pickChallenge = false; pushPick(); paint(); }
  function challenge(on) { A.pickChallenge = !!on; if (on) { A.pickLevel = 0; A.pickTier = A.data && A.data.weekly ? A.data.weekly.tier : null; } pushPick(); paint(); }
  async function craft(id) {
    if (A.busy) return null; A.busy = true;
    try { const r = await call({ action: "craft", recipe: id }); A.data = r.status || A.data; A.flash = { kind: "success", html: `<b>${esc((r.crafted && E() ? E().gearName(r.crafted) : id))}</b> is yours.` }; if (W.gameGear && W.gameGear.load) try { W.gameGear.load(); } catch (e) {} return r; }
    catch (e) { A.flash = { kind: "warn", html: esc(e.message || e) }; return null; }
    finally { A.busy = false; paint(); }
  }
  async function sunder(id) {
    if (A.busy || !id) return null; A.busy = true; A.sunderId = id;
    try { const r = await call({ action: "sunder", piece: String(id).trim() }); A.flash = { kind: "success", html: `Sundered for <b>${r.essence} essence</b>.` }; A.sunderId = null; await load(); if (W.gameGear && W.gameGear.load) try { W.gameGear.load(); } catch (e) {} return r; }
    catch (e) { A.flash = { kind: "warn", html: esc(e.message || e) }; return null; }
    finally { A.busy = false; paint(); }
  }
  if (W && W.NET && W.NET.on) W.NET.on("ascend", (m) => { try { if (m && m.kind === "settled" && m.ascend && W.gameAscension) W.gameAscension.banner(m.ascend.record ? "ASCENSION " + m.ascend.ascension + " CLEARED" : "ASCENDED", (m.ascend.essence ? "+" + m.ascend.essence + " essence" : "") + (m.ascend.crownShards ? " · +" + m.ascend.crownShards + " crown shards" : ""), "#a5f3fc", 3000); } catch (e) { /* guarded */ } });

  const API = { open, pick, challenge, craft, sunder, load, render, ladderHtml, weeklyHtml, masteryHtml, forgeHtml, modChips, state: () => A };
  if (W) W.gameAscensionUI = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
