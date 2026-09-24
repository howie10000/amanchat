# JOURNEY & ENDGAME — integration steps (for the lead, Wave C)

Engineer D's work lives in new files only: `js/shared/journey.js`, `server-node/guild-journey.js`, `js/journey-ui.js`, the `style.css` section `ARCANE DEPTHS JOURNEY`, and 3 tests. The design, with every number, is in `JOURNEY-AND-ENDGAME.md`. Below are the exact edits to make in files D was not allowed to touch. Every hunk is guarded with `try/catch`, so a journey bug can never break a payout or a login.

Anchors quote the current tree (B1's `server.js` as of 2026-09-22). Search for the quoted text; line numbers are not given because B1 is still editing.

**Order:** S1 → S8, then C1 → C4, then N1. Then run the tests at the end.

---

## Server (`server-node/server.js`)

### S1 — protect the record field

In `const PROTECTED_FIELDS = new Set([...` append `'journey'` to the last line:

```js
    'mastery', 'mats', 'gems', 'delve', 'codex', 'overflow', 'depthsBest', 'journey']);
```

(`compactUser` already drops an empty `journey`; nothing else to do for persistence.)

### S2 — make the four journey store keys server-only

In `canWrite`, right after `if (top === 'race_qualifier') return false;` add:

```js
    if (top === 'journey_boards' || top === 'journey_season' || top === 'journey_firsts' || top === 'journey_guilds') return false;
```

### S3 — create the module

Directly **after** the `const progress = createProgress({ ... });` block (anchor: `// ---- THE ARCANE DEPTHS progression (guild-progress.js) ----`) add:

```js
// ---- THE ARCANE DEPTHS journey & endgame (guild-journey.js) ----
const { createJourney } = require('./guild-journey.js');
const JOURNEY = require(path.join(JS_DIR, 'shared', 'journey.js'));
function broadcastAll(msg) {
    const s = JSON.stringify(msg);
    for (const c of clients) if (c.user && c.ws.readyState === c.ws.OPEN) { try { c.ws.send(s); } catch (e) {} }
}
const JOURNEY_SRV = createJourney({
    ECON, JOURNEY, store, userRec, guildIdOf, guildRec, pushTo,
    now: () => Date.now(),
    // leaderboards and world firsts skip hidden players and staff-geared runs, like delve_records
    lbBanned: (u) => lbBanned(u) || wearsStaffGear(u),
    moneyOf,
    addMoney: (user, u, n) => setMoney(user, u, moneyOf(u) + n),
    takeMoney: (user, u, n) => setMoney(user, u, moneyOf(u) - n),
    grantItems: (user, u, items) => progress.addItems(user, u, items, Date.now()),   // pack, then Lost & Found
    grantMats: (user, u, mats) => progress.addMats(user, u, mats),
    grantDelverXp: (user, u, n) => {
        const d = progress.delveOf(u), r0 = ECON.delverRank(d.xp).rank;
        d.xp += n;
        const r1 = ECON.delverRank(d.xp).rank;
        for (const p of ECON.DELVER_PERKS) if (p.kind === 'title' && p.rank > r0 && p.rank <= r1 && !d.titles.includes(p.value)) d.titles.push(p.value);
        store.put(`users/${user}/delve`, d);
    },
    grantTitle: (user, u, title) => {
        const d = progress.delveOf(u);
        if (!d.titles.includes(title)) { d.titles.push(title); store.put(`users/${user}/delve`, d); }
    },
    broadcast: broadcastAll,
    announce: (text) => {   // a News-feed post + the live 'announce' pop, exactly like an owner post
        const data = { text, by: 'The Arcane Depths', ts: Date.now() };
        store.put('announcements/' + pushId(), data);
        broadcastAll({ event: 'announce', data });
    },
    onlineUsers: () => [...byUser.keys()],
    eventOverrides: process.env.JOURNEY_AWAKENING_START
        ? { awakening: isNaN(+process.env.JOURNEY_AWAKENING_START) ? Date.parse(process.env.JOURNEY_AWAKENING_START) : +process.env.JOURNEY_AWAKENING_START }
        : {},
});
setInterval(() => { try { JOURNEY_SRV.tick(Date.now()); } catch (e) { console.error('[journey] tick', e); } }, 60000).unref();
```

- Titles go into `u.delve.titles`, so B1's `delver set_title` accepts them.
- Journey Delver XP uses the same rank-up title rule as `grantRunLoot`.
- The event start can be moved with env `JOURNEY_AWAKENING_START` (ms or ISO date). The default is 2026-09-24 00:00 UTC for 14 days.

### S4 — the op

1. In the RPC switch, extend the economy-op case (anchor: `case 'forge': case 'delver': {`):

   ```js
           case 'forge': case 'delver': case 'journey': {
   ```

2. In `const ECONOMY_OPS = {`, next to `forge(user, msg) { return progress.forgeOp(user, msg); },` add:

   ```js
       journey(user, msg) { return JOURNEY_SRV.op(user, msg); },
   ```

### S5 — login (Welcome Back detection, rested XP, lazy weekly/season rewards)

In `case 'auth':`. The call **must come before `bankSync`**, because bankSync moves `bankLast`, which is evidence of when the player was last seen. Replace:

```js
                const rec = userRec(user);
                try { bankSync(user, rec, Date.now()); } catch (e) { console.error('[bank] sync on login failed', e); }
                reply({ user, data: rec, role, mute: activeMute(user) });
```

with:

```js
                const rec = userRec(user);
                let journeyPush = [];
                try { journeyPush = JOURNEY_SRV.onLogin(user, rec, Date.now()); } catch (e) { console.error('[journey] login', e); }
                try { bankSync(user, rec, Date.now()); } catch (e) { console.error('[bank] sync on login failed', e); }
                reply({ user, data: rec, role, mute: activeMute(user) });
                for (const m of journeyPush) pushTo(user, m);
```

### S6 — story settlement (`settleRun`)

This is the hook that counts every clear for the Path, the Great Vault, the Challenge board, bounties, hunts, catch-up bonuses, mentors, Paragon, world firsts and guild titles.

In `function settleRun(run, user, now)`, insert **immediately before** the line `console.log(\`[guild-dungeon] ${cfg.name} cleared — $${gross} split ${S.N} ways ...`:

```js
    try {
        JOURNEY_SRV.onRunSettled({
            tier: run.tier, kind: run.kind, delve: run.delve | 0, timed, flawless, clearMs, parMs, now,
            guilds: run.guilds, memberGuild: run.memberGuild,
            members: Object.keys(results).map(m => ({
                user: m, u: userRec(m), loot: results[m].allGear, pending: run.pendingLoot[m] || [],
                delverGained: results[m].delver ? results[m].delver.gained : 0, tallies: run.tallies,
                dealt: (b.damage[m] || 0) > 0, spectator: run.spectators.has(m),
            })),
        });
    } catch (e) { console.error('[journey] settle', e); }
```

- It runs after every member's loot and XP have been granted, so journey bonuses stack on top.
- The reply to the claimer is unchanged. Every member instead gets a `journey {kind:'run'}` push that `js/journey-ui.js` turns into a toast.

### S7 — Arcane Depths segment settlement (`settleSegment`)

In `function settleSegment(run, user, kind, now)`, insert **immediately before** `run.depthPurse = 0; run.segDamage = {}; run.pendingLoot = {}; run.floorsDone = 0;`:

```js
    try {
        JOURNEY_SRV.onRunSettled({
            tier: 'arcane_depths', kind: run.kind, delve: 0, timed: false, floor: f, heart: !!heartBand && !leave, now,
            guilds: run.guilds, memberGuild: run.memberGuild,
            members: Object.keys(results).map(m => ({
                user: m, u: userRec(m), loot: results[m].allGear, pending: run.pendingLoot[m] || [],
                delverGained: results[m].delver ? results[m].delver.gained : 0, tallies: run.tallies,
                dealt: (run.segDamage[m] || 0) > 0, spectator: run.spectators.has(m),
            })),
        });
    } catch (e) { console.error('[journey] segment', e); }
```

`heart` is false on `depths_leave`, so a Heart kill counts once (at the sanctuary) and not again on leave.

### S8 — forge results (Path steps "The Arcane Forge", "Waste Nothing", "Tempered", "Ancient Light")

In `ECONOMY_OPS`, replace `forge(user, msg) { return progress.forgeOp(user, msg); },` with:

```js
    forge(user, msg) {
        const out = progress.forgeOp(user, msg);
        try {
            const a = String(msg.action || '');
            if (a === 'enhance' && out.result && !msg.seed) JOURNEY_SRV.onForge(user, null, { action: 'enhance', success: !!out.result.success, plus: out.item ? out.item.plus | 0 : 0 });
            else if ((a === 'salvage' || a === 'salvage_junk') && out.removed) JOURNEY_SRV.onForge(user, null, { action: 'salvage', count: out.removed.length });
            else if (a === 'ascend' && out.item) JOURNEY_SRV.onForge(user, null, { action: 'ascend' });
        } catch (e) { console.error('[journey] forge', e); }
        return out;
    },
```

(Staff seeded enhances are ignored.)

### S9 — Initiate scaling for new delvers (recommended; env `JOURNEY_INITIATE=0` disables it)

This covers solo or small parties of new players at delve 0 in Crypt, Forge or Void. Enemy and boss HP are ×0.70 / 0.80 / 0.90 for 1 / 2 / 3 members, and damage is ×0.80. Purse and loot are unchanged.

1. In `function startGuildRun`, right after the `const run = { ... };` object and **before** `features.initRun(run);`:

   ```js
       if (process.env.JOURNEY_INITIATE !== '0' && !endless) {
           try {
               const ini = JOURNEY_SRV.initiateFor({ tier, delve, kind: run.kind, members: [...set] });
               if (ini.active) { run.initiate = ini; run.partyHpMult *= ini.hpMult; run.bossDmgMult *= ini.dmgMult; }
           } catch (e) { console.error('[journey] initiate', e); }
       }
   ```

2. In `function bossHpExtra(...)`, before `if (TEST.bossHp) x *= TEST.bossHp;`:

   ```js
       if (run.initiate) x *= run.initiate.hpMult;
   ```

3. In `floorPlan`'s story branch (`if (run.continuous) Object.assign(c, {`), add this field so the maze rows hit softer:

   ```js
           dmgMult: (cfg.dmgMult || 1) * (run.initiate ? run.initiate.dmgMult : 1),
   ```

4. Optional: add `initiate: run.initiate || null` to the `start` push/reply (`const info = {` and the `return {` just after), so the client can show an "INITIATE" chip.

---

## Client

### C1 — `js/net.js` (one line)

After `window.netGear = (data) => rpc("gear", data);` add:

```js
  window.netJourney = (data) => rpc("journey", data || {}); // THE ARCANE DEPTHS journey & endgame
```

### C2 — `index.html` script tags

1. Add the shared module **after** `js/shared/depths.js` and before `js/shared/dungeon.js`:

   ```html
     <script defer src="js/shared/journey.js?v=depths-1"></script>
   ```

2. Add the UI **after** `js/loot-reveal.js`:

   ```html
     <script defer src="js/journey-ui.js?v=depths-1"></script>
   ```

3. Bump `style.css`'s cache-bust if it is versioned. `journey-ui.js` builds its own DOM (the tracker and overlays go on `document.body`), so no new containers are needed.

### C3 — phone app icon (`index.html` + `js/game.js`)

1. In the phone grid, after the News button (`data-act="announcements"`), add:

   ```html
                 <button class="actBtn app" data-act="journey"><span class="ico" style="--c:#a78bfa">✦</span><span>Journey</span></button>
   ```

2. In `js/game.js`, in the `.actBtn` dispatcher (after `else if (a === "announcements") phoneApp(openAnnouncements);`), add:

   ```js
       else if (a === "journey") { if (window.gameJourney) gameJourney.open(); else toast("The Journey is still waking up."); }
   ```

   The Journey opens in the centre menu (it is wide); that is intended.

### C4 — guild dungeons screen (`js/guild.js`, B4a's file)

In `dungeonsHtml`, right after the `adRaidBanner` block (anchor: `html += \`<div class="adRaidBanner">` … `</div>\`;`), add:

```js
  html += `<div class="adRaidBanner" style="border-color:#fde68a">
      <div><b>✦ THE DELVER'S JOURNEY</b><br/><small>Your Path, this week's Great Vault and Challenge, Mythic Hunts and artifacts.</small></div>
      <button class="menuBtn gold" onclick="window.gameJourney?gameJourney.open('week'):toast('The Journey is not open yet.')">OPEN</button></div>`;
```

Optional: in the guild hall, show `gameJourney.state().guildTitles` next to the guild name.

---

## News / launch

### N1 — the launch announcement (post once as an owner)

Post from the owner's News app, or `fbPost('announcements', {text, by, ts})`:

> ✦ THE ARCANE AWAKENING HAS BEGUN ✦ Three new dungeons beyond the Ashen Roost, multi-guild raids, the endless Arcane Depths, the Arcane Forge — and for the next two weeks every delve pays +50% Delver XP with bonus drops. Open the ✦ Journey app for your Awakening gift. New here? The Path of the Delver gives you gear, materials and cash at every step. Been away? A Returner's Cache is waiting for you.

World firsts post themselves to the same feed.

### N2 — proposed cosmetics (a shared-module diff for Wave C, optional)

The journey grants `u.cosmetics['aura:path_lantern']` and similar ids. They are listed in `JOURNEY.COSMETIC_DEFS` with `price: 1e9` and an `unlock` (the same sentinel Wave A uses).

- **What to do:** append them to `ECON.COSMETICS` (aura: `path_lantern, awakened_sigil, lantern_bearer, season_prism, paragon_glow`; pet: `ley_moth`; nameColor: `returner_gold`). B3 gives them draw branches; unknown ids already fall back.
- **Why:** until then `ownsCosmetic` treats an **unknown** id as free, so do not expose them in the barber UI before the diff.
- **Ownership:** it is `u.cosmetics[key:id]`, which `ownsCosmetic` already honours for defs with a price.

---

## Record fields and keys (summary)

| Where | Field / key | Notes |
|---|---|---|
| `users/<u>` | `journey` | **add to PROTECTED_FIELDS (S1)**; lazy; `compactUser` drops it when empty |
| top-level | `journey_boards`, `journey_season`, `journey_firsts`, `journey_guilds` | server-written only (S2); small and pruned (`tick`) |
| writes into existing fields | `u.delve.xp`, `u.delve.titles`, `u.mats`, `u.gear` / `u.overflow` (via `progress.addItems`), `u.cosmetics`, `u.money` (via `setMoney`), `announcements/<id>` | all through the deps in S3 |

---

## Tests to run after wiring

```sh
node js/journey.test.js            # pure rules (1,483 checks)
node server-node/journey.test.js   # module with an in-memory store (153)
node js/journey-ui.test.js         # headless UI against real server views (79)
cd server-node && node authority.test.js && node guild.test.js && node dungeon.test.js && node expedition.test.js && node gear.test.js
```

Suggested extra case for `authority.test.js`: `put users/<me>/journey {path:{n:22}}` must be refused once S1 lands.

### Playtest checklist

1. A fresh account: the ✦ tracker says "Answer the Call". Claim → 5 items in the Armory. Join a guild, wear 4, and claim through Act I (Initiate scaling on the Crypt solo).
2. With `JOURNEY_AWAKENING_START=<now>`: the login shows the Awakening cinematic → claim the gift. A crypt clear toasts "+… bonus Delver XP".
3. For a returner, stage it by editing the record: `journey.seen` = now−40d, and `createdAt` old. Re-login → Welcome Back cinematic → cache → Way Back step 1 after equipping a piece.
4. Clear the week's Mythic-bracket tier at its delve under par → the board shows the party. Next Monday: the rank reward toasts, and the Great Vault offers options → pick one.
5. Complete a daily bounty → claim. Complete a Mythic Hunt → +3 Hunt Marks; the artifact stage 4 progress moves.
