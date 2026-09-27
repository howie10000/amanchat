/* UI GUIDE — plain-language help for the Arcane Depths and Sundered Crown screens.

   window.gameGuide (every caller guards it: `window.gameGuide && gameGuide.x()`):
     term(key, label?)        inline glossary word -> an HTML chip that explains itself on tap, focus or hover
     explain(key)             [title, text] for a glossary key
     tour(id) / autoTour(id)  guided coach marks over the open screen; auto = only the first time
     replay(id), seen(id), forget(id)
     helpBtn(id, label?)      "? How this works" button that replays a tour
     nextDungeon(rows)        which story dungeon a guild should do next, and why
     unlockChain(key, rows)   the uncleared dungeons standing between a guild and `key`, easiest first
     fightHelp(bossId)        {style, label, how, steps[]} — the plain "how to beat it" text for any boss
     bossIntro(bossId, opts)  the primer card, once per boss the first time you meet it (opts.force replays)
     CUES / cueHtml(kind)     one colour + icon language for "strike now / hold / wait / tip"

   Pure where it can be (tested in js/ui-guide.test.js); the DOM parts no-op without a document.
   Seen-flags live in localStorage (a per-player convenience) with an in-memory fallback. */
(function (W) {
  "use strict";
  const doc = () => (typeof document !== "undefined" && document && document.createElement ? document : null);
  const EC = () => W.ECON || {};
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const jsq = (s) => esc(JSON.stringify(String(s == null ? "" : s)));

  // ------------------------------------------------------------ seen flags
  const mem = {};
  const KEY = (id) => "gd.seen." + id;
  function seen(id) {
    if (mem[id]) return true;
    try { if (W.localStorage && W.localStorage.getItem(KEY(id)) === "1") return (mem[id] = true); } catch (e) {}
    return false;
  }
  function markSeen(id) { mem[id] = true; try { if (W.localStorage) W.localStorage.setItem(KEY(id), "1"); } catch (e) {} }
  function forget(id) { delete mem[id]; try { if (W.localStorage) W.localStorage.removeItem(KEY(id)); } catch (e) {} }

  // ------------------------------------------------------------ colour + icon language
  // The same four cues everywhere: the crown boss HUD, the fight primer, the legend.
  const CUES = {
    strike: { icon: "⚔", color: "#fde047", label: "STRIKE", text: "Your opening — hit it now" },
    hold:   { icon: "✋", color: "#f87171", label: "HOLD", text: "Don't hit — it will punish you" },
    wait:   { icon: "⏳", color: "#c4b5fd", label: "WAIT", text: "It can't be hurt right now — dodge and wait" },
    tip:    { icon: "›", color: "#cbd5e1", label: "TIP", text: "What to do next" },
  };
  function cueHtml(kind, text) {
    const c = CUES[kind] || CUES.tip;
    return `<span class="gdCue" style="--cue:${c.color}"><i aria-hidden="true">${c.icon}</i><b>${esc(c.label)}</b>${text === false ? "" : `<small>${esc(text || c.text)}</small>`}</span>`;
  }
  function legendHtml() {
    return `<div class="gdLegend" aria-label="What the boss prompts mean">${["strike", "hold", "wait"].map(k => cueHtml(k)).join("")}</div>`;
  }

  // ------------------------------------------------------------ glossary
  const GLOSSARY = {
    delve: ["Delve level", "A harder setting for a dungeon your guild has already cleared. Delve 0 is normal. Every level adds enemy health and damage but pays more money and better loot. Beat the target time to unlock the next level."],
    par: ["Target time (par)", "Clear the dungeon faster than this for a bonus and to unlock the next delve level. It is NOT a time limit — you can take longer, you just earn a little less."],
    purse: ["Payout", "The most money one clear pays. It is split between everyone who hit the boss, after your guild's cut."],
    ilvl: ["Item level", "How strong the gear from this dungeon is. Higher item level = bigger stats."],
    affix: ["Weekly affixes", "Extra rules that change every Monday, like tougher or faster enemies. Each one only switches on at the delve level on its chip (L4+ = delve 4 and deeper). Delve 0 never has them."],
    clears: ["Clears", "How many times your guild has beaten this dungeon. Any member's clear counts."],
    best: ["Best delve", "The hardest delve level your guild has cleared here."],
    besttime: ["Best time", "Your guild's fastest clear of this dungeon."],
    sealed: ["Locked dungeon", "Your guild opens it by clearing the dungeon listed. Any member's clear counts for everyone in the guild."],
    raidable: ["Raidable", "Can also be run as a raid: up to 24 players from up to 6 guilds, each guild paid as if it ran alone."],
    stage: ["Early / Mid / Late", "Who a dungeon is aimed at: EARLY for new guilds, MID after a few clears, LATE for end-game gear."],
    mini: ["Mini boss", "A guardian partway through the dungeon. Beat it to break the seal on the way to the final boss."],
    crown_art: ["Crown Art", "A special ability dropped by bosses (mostly the four ♛ Sundered Crown dungeons). Equip up to two, then press F or C in a dungeon to use them."],
    crown_shard: ["Crown Shard", "Dropped by the Sundered Crown dungeons. Spend shards plus gold to rank up a Crown Art without waiting for duplicates."],
    art_rank: ["Art rank", "Crown Arts go from rank 1 to 5. Each rank hits harder and recovers faster. Duplicates you find merge automatically: going from rank r to r+1 takes r copies."],
    copies: ["Copies", "Finding a Crown Art you already own gives you a copy. Copies merge by themselves to raise the art's rank. At rank 5 copies turn into Crown Shards."],
    dust: ["Arcane Dust", "The common forge material. Drops from every guild dungeon and from salvaging gear. Spent on enhancing."],
    shard: ["Void Shard", "An uncommon forge material from guild dungeons and salvage. Spent on reforging, sockets and set forging."],
    ember: ["Mythic Ember", "A rare forge material from high-level dungeons and Mythic salvage. Spent on ascending and on the top enhance levels."],
    gilded_key: ["Gilded Key", "Opens a gilded chest at the end of a run for an extra roll of loot."],
    gems: ["Gems", "Set them into a piece's sockets for bonus stats. They drop from boss chests, champions and vaults."],
    sigil: ["Sigils", "Boss trophies. Set forging spends them to craft that boss's set pieces."],
    dxp: ["Delver XP", "Your personal dungeon experience. It raises your Delver Rank, which unlocks pack space, titles and cosmetics. Perks never add damage."],
    tithe: ["Guild cut", "The share of each clear's money that goes into your guild treasury."],
    keys: ["Run keys", "Silver keys open silver chests. The gold key opens the gold chest. Three vault shards open the Arcane Vault. They only last for this run."],
    initiate: ["Initiate", "New delvers get easier enemies for their first runs. It fades as you gain Delver Rank."],
    beast: ["BEAST fight", "It charges in a straight line. Stand in front of a pillar, dodge the charge, and it crashes and is stunned — hit it then."],
    duelist: ["DUELIST fight", "A swordsman who moves around the arena. Never hit its glowing guard (it counters). Strike right after its combos and dashes."],
    twins: ["TWINS fight", "Two bosses. Only the exposed one (bright outline) takes damage. Kill both close together or the first one gets back up."],
    multiform: ["MULTI-FORM fight", "Changes shape as it loses health. Each form has a different weak spot — follow the prompt under its health bar."],
    classic: ["CLASSIC fight", "Break the glowing weak points first. When they are gone, the head opens up."],
    exposed: ["Exposed / Veiled", "The Twin Monarchs swap every few seconds. Only the EXPOSED one can be hurt. The VEILED one ignores your hits."],
    set: ["Set piece (✦)", "Part of a gear set. Wearing 2 or 4 pieces of the same set turns on extra bonuses."],
    unique: ["Unique (◈)", "A one-of-a-kind item with a special effect that no other gear has."],
  };
  function explain(key) { return GLOSSARY[key] || null; }
  // An inline term. span+role=button so it can sit inside cards and buttons' neighbours without nesting <button>s.
  function term(key, label) {
    const g = GLOSSARY[key];
    const txt = label == null ? (g ? g[0] : key) : label;
    if (!g) return esc(txt);
    return `<span class="gdTerm" role="button" tabindex="0" data-gd-term="${esc(key)}" aria-label="${esc(txt)} — what is this?">${esc(txt)}</span>`;
  }

  // ------------------------------------------------------------ popover (glossary)
  let pop = null, popFor = null;
  function popEl() {
    const d = doc(); if (!d) return null;
    if (!pop) { pop = d.createElement("div"); pop.id = "gdPop"; pop.className = "gdPop"; pop.setAttribute("role", "tooltip"); pop.hidden = true; d.body.appendChild(pop); }
    return pop;
  }
  function place(el, anchor, prefer) {
    const d = doc(); if (!d || !el || !anchor || !anchor.getBoundingClientRect) return;
    const r = anchor.getBoundingClientRect(), vw = W.innerWidth || 1280, vh = W.innerHeight || 800;
    el.style.left = "0px"; el.style.top = "0px";
    const w = el.offsetWidth || 260, h = el.offsetHeight || 80;
    let x = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
    let y = prefer === "above" ? r.top - h - 10 : r.bottom + 10;
    if (y + h > vh - 8) y = r.top - h - 10;
    if (y < 8) y = Math.min(vh - h - 8, r.bottom + 10);
    el.style.left = Math.round(x) + "px"; el.style.top = Math.round(Math.max(8, y)) + "px";
  }
  function showTerm(anchor) {
    const key = anchor && anchor.getAttribute && anchor.getAttribute("data-gd-term");
    const g = key && GLOSSARY[key]; const el = popEl();
    if (!g || !el) return;
    el.innerHTML = `<b>${esc(g[0])}</b><span>${esc(g[1])}</span>`;
    el.hidden = false; popFor = anchor;
    const id = "gdPop"; anchor.setAttribute("aria-describedby", id);
    place(el, anchor);
  }
  function hideTerm() { if (pop) pop.hidden = true; if (popFor && popFor.removeAttribute) popFor.removeAttribute("aria-describedby"); popFor = null; }
  let installed = false;
  function install() {
    const d = doc(); if (!d || installed || !d.addEventListener) return;
    installed = true;
    const termOf = (e) => e.target && e.target.closest ? e.target.closest("[data-gd-term]") : null;
    d.addEventListener("click", (e) => {
      const t = termOf(e);
      if (t) { e.preventDefault(); e.stopPropagation(); if (popFor === t && pop && !pop.hidden) hideTerm(); else showTerm(t); return; }
      if (pop && !pop.hidden && !(e.target.closest && e.target.closest("#gdPop"))) hideTerm();
    }, true);
    d.addEventListener("keydown", (e) => {
      const t = termOf(e);
      if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); showTerm(t); return; }
      if (e.key === "Escape" && pop && !pop.hidden) { hideTerm(); }
    }, true);
    d.addEventListener("focusin", (e) => { const t = termOf(e); if (t) showTerm(t); });
    d.addEventListener("focusout", (e) => { if (termOf(e)) hideTerm(); });
    d.addEventListener("mouseover", (e) => { const t = termOf(e); if (t && t !== popFor) showTerm(t); });
    d.addEventListener("mouseout", (e) => { const t = termOf(e); if (t && (!e.relatedTarget || !t.contains(e.relatedTarget))) hideTerm(); });
    W.addEventListener && W.addEventListener("scroll", hideTerm, true);
  }

  // ------------------------------------------------------------ guided tours
  // Steps anchor to a selector inside the open menu; a missing anchor is skipped.
  const TOURS = {
    board: { title: "Guild dungeons", steps: [
      { sel: ".gdNext", title: "Start here", text: "This is the dungeon your guild should do next. Press CREATE PARTY, invite guildmates (or go alone), then START THE RUN." },
      { sel: ".adTierCard.open .adTierTitle", title: "Each card is one dungeon", text: "They are listed easiest first. The coloured tags say how strong its gear is (ITEM LV) and who it is for (EARLY / MID / LATE)." },
      { sel: ".adTierCard.open .gdHow", title: "How the boss fights", text: "Every boss plays differently. Read this line (or press HOW TO FIGHT) before you go in." },
      { sel: ".adTierCard.open .adStats", title: "Your guild's record", text: "Tap any dotted word for a plain explanation — like TARGET TIME, which is a bonus goal, not a time limit." },
      { sel: ".adTierCard.sealed .adSeal", title: "Locked dungeons", text: "Clear the dungeons listed here, in order, to open it. Any guildmate's clear counts." },
      { sel: ".scArtsBanner, .gdBanners", title: "Crown Arts, raids and your Journey", text: "Special abilities, big multi-guild fights and your personal quest line live here. Come back to them after a few clears." },
    ] },
    arts: { title: "Crown Arts", steps: [
      { sel: ".gdSteps", title: "How Crown Arts work", text: "Bosses drop these abilities. Equip two, then press F or C in a dungeon. Duplicates rank them up automatically." },
      { sel: ".scSlots", title: "Your two slots", text: "Pick an art you own, then tap F or C (or drag it here). Arts only work inside dungeons." },
      { sel: ".scGrid", title: "Your collection", text: "Dark cards are arts you have not found yet. Tap one to see what it does and where it drops." },
      { sel: ".scDetail", title: "Details and rank-ups", text: "See the numbers, which dungeons drop it (🔒 = your guild has not opened that dungeon yet) and how to rank it up." },
    ] },
    forge: { title: "The Arcane Forge", steps: [
      { sel: ".adForgeWallet", title: "Your materials", text: "Tap any material to see what it is for and where it drops. Dungeons and salvage give you more." },
      { sel: ".adForgeTabs", title: "What the Forge can do", text: "Each tab is one kind of upgrade. The line under the tabs explains the one you are on." },
      { sel: ".adForgePick", title: "Pick a piece", text: "Choose an item on the left. The right side shows the cost and what will change before you spend anything." },
    ] },
    armory: { title: "The Armory", steps: [
      { sel: ".statRow", title: "Your totals", text: "Attack, defence and health from everything you wear. They apply in every dungeon." },
      { sel: ".adCard .gdVerdict", title: "Upgrade or not?", text: "Every item in your pack says if it beats what you wear in that slot. Green ▲ = upgrade." },
      { sel: ".adNavForge, .scNavArts", title: "Make it stronger", text: "The Forge upgrades gear. Crown Arts are your two special abilities (F and C)." },
    ] },
    run: { title: "In a dungeon", noFocus: true, steps: [
      { sel: "#adRunHud .adHud-top", title: "Difficulty and clock", text: "DELVE is the difficulty. The clock counts up; beat the TARGET time for a bonus. It is not a time limit." },
      { sel: "#adRunHud .adHud-keys", title: "Keys you pick up", text: "Silver keys open silver chests, the gold key opens the gold chest, three vault shards open the Arcane Vault." },
      { sel: "#dungeonArtsBtn", title: "Crown Arts", text: "Your special abilities. Equip them here, then press F or C to use them (the two round buttons on a phone)." },
      { sel: "#dungeonQuestToggle", title: "Objective", text: "The banner at the top says what to do: find the guardian, break the seal, then face the boss." },
    ] },
  };
  let tourState = null;
  function tourEl() {
    const d = doc(); if (!d) return null;
    let el = d.getElementById("gdTour");
    if (!el) {
      el = d.createElement("div"); el.id = "gdTour"; el.className = "gdTour"; el.hidden = true;
      el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "false"); el.setAttribute("aria-labelledby", "gdTourTitle");
      d.body.appendChild(el);
      el.addEventListener("keydown", (e) => {
        if (!tourState) return;
        if (e.key === "Escape") { e.preventDefault(); endTour(); }
        else if (e.key === "ArrowRight") { e.preventDefault(); stepTour(1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); stepTour(-1); }
      });
    }
    return el;
  }
  function visible(n) { return !!(n && n.getClientRects && n.getClientRects().length && !n.closest(".hidden")); }
  function findStep(steps, i, dir) {
    const d = doc();
    for (; i >= 0 && i < steps.length; i += dir) {
      const s = steps[i];
      if (!s.sel) return i;
      const n = d.querySelector(s.sel);
      if (visible(n)) return i;
    }
    return -1;
  }
  function clearSpot() { const d = doc(); if (d) d.querySelectorAll(".gdSpot").forEach(n => n.classList.remove("gdSpot")); }
  function showStep() {
    const d = doc(), el = tourEl(); if (!d || !el || !tourState) return;
    const { id, i } = tourState, T = TOURS[id], s = T.steps[i];
    clearSpot();
    const n = s.sel ? d.querySelector(s.sel) : null;
    if (n) { n.classList.add("gdSpot"); try { n.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {} }
    const total = tourState.order.length, at = tourState.order.indexOf(i) + 1;
    el.innerHTML = `<div class="gdTourHead"><small>${esc(T.title)} · ${at} of ${total}</small><button type="button" class="gdX" aria-label="Close the guide" onclick="gameGuide.endTour()">×</button></div>
      <b id="gdTourTitle">${esc(s.title)}</b><p>${esc(s.text)}</p>
      <div class="gdTourBtns"><button type="button" class="menuBtn gray" onclick="gameGuide.endTour()">SKIP</button>
        ${at > 1 ? `<button type="button" class="menuBtn gray" onclick="gameGuide.stepTour(-1)">← BACK</button>` : ""}
        <button type="button" class="menuBtn gold gdNextBtn" onclick="gameGuide.stepTour(1)">${at === total ? "GOT IT" : "NEXT →"}</button></div>`;
    el.hidden = false;
    const go = () => { if (tourState && n) place(el, n); else { el.style.left = "50%"; el.style.top = "20%"; } };
    go(); setTimeout(go, 350);   // after the smooth scroll settles
    const b = !T.noFocus && el.querySelector(".gdNextBtn"); if (b && b.focus) try { b.focus({ preventScroll: true }); } catch (e) {}
  }
  function tour(id) {
    const d = doc(), T = TOURS[id];
    if (!d || !T) return false;
    install();
    const order = [];
    for (let i = 0; i < T.steps.length; i++) if (findStep(T.steps, i, 1) === i) order.push(i);
    if (!order.length) return false;
    tourState = { id, i: order[0], order, back: d.activeElement };
    markSeen("tour." + id);
    showStep();
    if (tourState.watch) clearInterval(tourState.watch);
    // End with the screen: a closed menu takes its tour with it.
    tourState.watch = setInterval(() => {
      if (!tourState) return;
      const s = TOURS[tourState.id].steps[tourState.i];
      const n = s && s.sel ? d.querySelector(s.sel) : null;
      if (s && s.sel && !visible(n)) endTour();
    }, 600);
    return true;
  }
  function stepTour(dir) {
    if (!tourState) return;
    const k = tourState.order.indexOf(tourState.i) + (dir < 0 ? -1 : 1);
    if (k < 0) return;
    if (k >= tourState.order.length) return endTour();
    tourState.i = tourState.order[k]; showStep();
  }
  function endTour() {
    const el = tourEl(); clearSpot();
    if (el) el.hidden = true;
    if (tourState) { clearInterval(tourState.watch); const b = tourState.back; tourState = null; if (b && b.focus) try { b.focus({ preventScroll: true }); } catch (e) {} }
  }
  // First visit only. Deferred so the menu that asked has painted.
  function autoTour(id) {
    if (!doc() || seen("tour." + id) || tourState) return false;
    setTimeout(() => { if (!seen("tour." + id) && !tourState) tour(id); }, 450);
    return true;
  }
  const replay = (id) => tour(id);
  function helpBtn(id, label) {
    return `<button type="button" class="gdHelpBtn" onclick="gameGuide.replay(${jsq(id)})" aria-label="${esc((label || "How this works") + " — guided tour")}"><i aria-hidden="true">?</i>${esc(label || "How this works")}</button>`;
  }

  // ------------------------------------------------------------ what next / what's locked
  function ladder() { const E = EC(); return (E.STORY_LADDER || E.GUILD_DUNGEON_ORDER || []).slice(); }
  function rowMap(rows) { const m = {}; for (const r of rows || []) if (r && r.key) m[r.key] = r; return m; }
  // -> {key, kind:'first'|'next'|'delve', why} | null
  function nextDungeon(rows) {
    const E = EC(), by = rowMap(rows), L = ladder().filter(k => by[k] && E.GUILD_DUNGEONS && E.GUILD_DUNGEONS[k]);
    if (!L.length) return null;
    const anyClear = L.some(k => (by[k].clears | 0) > 0);
    const open = L.filter(k => by[k].unlocked);
    const fresh = open.find(k => !(by[k].clears | 0));
    if (fresh) {
      const cfg = E.GUILD_DUNGEONS[fresh];
      const opens = L.filter(k => (E.GUILD_DUNGEONS[k] || {}).unlockAfter === fresh).map(k => E.GUILD_DUNGEONS[k].name);
      const why = !anyClear ? "The easiest dungeon, open to every guild. Go in solo or with guildmates."
        : "The easiest dungeon your guild has not beaten yet" + (opens.length ? " — clearing it opens " + opens.join(" and ") + "." : ".");
      return { key: fresh, kind: anyClear ? "next" : "first", why, gearLvl: cfg.gearLvl };
    }
    // Everything open is cleared: push the delve ladder on the hardest open tier.
    const top = open[open.length - 1];
    if (!top) return null;
    const r = by[top];
    return { key: top, kind: "delve", why: (r.maxDelve | 0) > (r.best | 0)
      ? `Every open dungeon is cleared. Try a higher delve level here (up to ${r.maxDelve | 0}) for better loot.`
      : "Every open dungeon is cleared. Beat the target time here to unlock a higher delve level." };
  }
  // The uncleared dungeons standing between a guild and `key`, easiest first.
  function unlockChain(key, rows) {
    const E = EC(), by = rowMap(rows), out = [], guard = new Set();
    let p = ((E.GUILD_DUNGEONS || {})[key] || {}).unlockAfter;
    while (p && !guard.has(p)) {
      guard.add(p);
      const r = by[p];
      if (r && (r.clears | 0) > 0) break;
      out.unshift(p);
      p = ((E.GUILD_DUNGEONS || {})[p] || {}).unlockAfter;
    }
    return out;
  }

  // ------------------------------------------------------------ boss fight help
  const FIGHT = {
    gorehorn: ["Stand in front of a stone pillar and watch for the red charge lane.", "Step out of the lane: he rams the pillar and is STUNNED — hit him hard (×2 damage).", "Each pillar breaks after two crashes. Below half health he charges three times in a row."],
    briar_matron: ["She burrows and pops out of one of the four bramble patches.", "You can't hit her while she is underground — watch the patches.", "Step out of the green root circles before they close."],
    kael: ["He runs, dashes and swings combos. Dodge sideways, not backwards.", "When he glows white and the prompt says GUARD, do NOT hit — he counters.", "Hit him right after a dash or combo. At 60% he makes copies: the real Kael has a shadow."],
    pit_champion: ["His shield blocks every hit from the front.", "Walk around to his side or back — he turns slowly.", "He is open for a moment after his shield charge."],
    twin_monarchs: ["Only the EXPOSED twin (bright outline) can be hurt. The VEILED one ignores hits.", "They swap every few seconds — the prompt counts down the swap.", "When one falls, kill the other within 15 seconds or the first one gets back up."],
    veiled_assassin: ["She turns invisible, then appears BEHIND you.", "Keep moving, and turn around when she vanishes.", "Hit her right after her strike lands."],
    kael_crownbound: ["Kael again, stronger — same rules.", "Never hit his white guard; strike after his dashes and combos.", "At half health he brings his copies back: find the one with a shadow."],
    sundered_king: ["Knight form: like Kael — don't hit the guard, punish the combos.", "At 60% he becomes a giant: hit a HAND while it rests on the floor, or him when he KNEELS.", "At 25% crown shards circle him: break them all to SUNDER him (×1.5 damage)."],
  };
  const STYLE_OF = { beast: "BEAST", duelist: "DUELIST", twins: "TWINS", multiform: "MULTI-FORM", parts: "CLASSIC" };
  function fightHelp(bossId) {
    const E = EC(), b = (E.GUILD_BOSSES || {})[bossId];
    const style = E.bossArchetype ? E.bossArchetype(bossId) : (b && b.archetype) || "parts";
    const g = GLOSSARY[style === "parts" ? "classic" : style] || GLOSSARY.classic;
    const partName = (b && b.partName) || "weak point";
    const steps = FIGHT[bossId] || [`Break its glowing ${partName}s first — click or swing at them.`, "When the last one breaks, the head opens: now it takes full damage.", "Red shapes on the floor are attacks: step out before they fill."];
    return { style, label: STYLE_OF[style] || "CLASSIC", how: g[1], steps, name: b ? b.name : bossId };
  }
  let bossCard = null, bossTimer = 0;
  function bossIntro(bossId, opts) {
    opts = opts || {};
    const d = doc(); if (!d) return false;
    const key = "boss." + bossId;
    if (!opts.force && seen(key)) return false;
    const f = fightHelp(bossId);
    markSeen(key);
    if (!bossCard) {
      bossCard = d.createElement("div"); bossCard.id = "gdBoss"; bossCard.className = "gdBoss";
      bossCard.setAttribute("role", "dialog"); bossCard.setAttribute("aria-labelledby", "gdBossTitle");
      bossCard.addEventListener("keydown", (e) => { if (e.key === "Escape") closeBoss(); });
      d.body.appendChild(bossCard);
    }
    bossCard.innerHTML = `<div class="gdBossHead"><small>HOW TO BEAT</small><button type="button" class="gdX" aria-label="Close" onclick="gameGuide.closeBoss()">×</button></div>
      <b id="gdBossTitle">${esc(f.name)}</b> <span class="scArch a-${esc(f.style)}">${esc(f.label)}</span>
      <ol>${f.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>${legendHtml()}
      <button type="button" class="menuBtn gold" onclick="gameGuide.closeBoss()">GOT IT</button>`;
    bossCard.classList.toggle("modal", !!opts.force);
    bossCard.hidden = false;
    clearTimeout(bossTimer);
    // In a fight it steps aside by itself; opened from a menu it waits for you.
    if (!opts.force) bossTimer = setTimeout(closeBoss, 16000);
    else { const b = bossCard.querySelector(".menuBtn"); if (b && b.focus) try { b.focus({ preventScroll: true }); } catch (e) {} }
    return true;
  }
  function closeBoss() { clearTimeout(bossTimer); if (bossCard) bossCard.hidden = true; }

  // ------------------------------------------------------------ small shared renderers
  // "Unlocks after: A → B → C" for a sealed card.
  function chainHtml(key, rows) {
    const E = EC(), chain = unlockChain(key, rows);
    if (!chain.length) return "";
    const names = chain.map(k => `<b>${esc((E.GUILD_DUNGEONS[k] || {}).name || k)}</b>`);
    return `<span class="gdChain">${chain.length === 1 ? "1 clear away" : chain.length + " clears away, in order"}: ${names.join(" → ")}</span>`;
  }
  // Humanise an internal cosmetic key ("aura:awakened_sigil" -> "Aura: Awakening Sigil").
  function cosmeticName(k) {
    const m = /^(hat|aura|pet|accessory|nameColor):(.+)$/.exec(String(k || ""));
    if (!m) return String(k || "");
    const list = (EC().COSMETICS || {})[m[1]] || [];
    const hit = list.find(c => c.id === m[2]);
    const type = { hat: "Hat", aura: "Aura", pet: "Pet", accessory: "Accessory", nameColor: "Name colour" }[m[1]];
    return type + ": " + (hit ? hit.name : m[2].replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
  }
  function prettyLabel(s) { return String(s == null ? "" : s).replace(/\b(hat|aura|pet|accessory|nameColor):([a-z0-9_]+)/g, (all) => cosmeticName(all)); }

  install();
  W.gameGuide = {
    GLOSSARY, CUES, TOURS, term, explain, cueHtml, legendHtml,
    tour, autoTour, replay, stepTour, endTour, helpBtn, seen, markSeen, forget,
    nextDungeon, unlockChain, chainHtml, fightHelp, bossIntro, closeBoss, cosmeticName, prettyLabel,
    _t: { showTerm, hideTerm, install, tourState: () => tourState },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = W.gameGuide;
})(typeof window !== "undefined" ? window : globalThis);
