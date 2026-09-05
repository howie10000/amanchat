/* net.js — WebSocket transport that exposes the Firebase-style API used elsewhere.
   Functions: fbGet / fbPut / fbPatch / fbPost / fbDelete / fbAuth
   Also: serverEvents.on("presence" | "notify" | "dm" | "duel" | "kicked", handler)
*/

(function () {
  // Client is hosted on GitHub Pages; the realtime backend always lives at
  // northpvp.net regardless of what origin served this page. Same-origin
  // (location.host) only works when the backend itself serves the client,
  // e.g. local dev via `node server.js` with STATIC_DIR pointing at the game.
  const BACKEND_HOST = "northpvp.net";
  const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const WS_URL = isLocal
    ? (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws"
    : "wss://" + BACKEND_HOST + "/ws";

  let ws = null;
  let connected = false;
  // Credentials from the last successful auth, kept in memory only so a
  // dropped socket can log itself back in. Without this, a reconnect came up
  // unauthenticated and every later call failed with "not authed" until the
  // player reloaded the page — which on school wifi is most of a lunch break.
  let lastAuth = null;
  let reauthing = false;
  let nextId = 1;
  const pending = new Map();        // id -> {resolve, reject}
  const readyQ  = [];               // waiters until first connect
  const eventHandlers = {};         // name -> fn[]

  const NET = {
    on(event, fn) {
      (eventHandlers[event] = eventHandlers[event] || []).push(fn);
    },
    isConnected() { return connected; },
  };
  window.NET = NET;

  function emit(event, data) {
    const list = eventHandlers[event];
    if (!list) return;
    for (const fn of list) {
      try { fn(data); } catch (e) { console.error("[net] handler error", event, e); }
    }
  }

  function connect() {
    ws = new WebSocket(WS_URL);
    ws.onopen = async () => {
      connected = true;
      console.log("[net] connected", WS_URL);
      if (lastAuth && !reauthing) {
        // Re-auth before releasing anything queued, so the first call out of
        // the gate isn't rejected.
        reauthing = true;
        try {
          await rpc("auth", { user: lastAuth.user, pass: lastAuth.pass, register: false });
          console.log("[net] re-authenticated as", lastAuth.user);
        } catch (e) {
          console.warn("[net] re-auth failed", e.message);
        }
        reauthing = false;
      }
      while (readyQ.length) readyQ.shift()();
      emit("open", {});
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.id != null && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        if (msg.ok === false) p.reject(new Error(msg.err || "rpc failed"));
        else p.resolve(msg.data);
        return;
      }
      if (msg.event) emit(msg.event, msg);
    };
    ws.onclose = () => {
      connected = false;
      console.warn("[net] disconnected, retrying in 1s");
      // reject all pending so callers don't hang forever
      for (const [, p] of pending) p.reject(new Error("disconnected"));
      pending.clear();
      emit("close", {});
      setTimeout(connect, 1000);
    };
    ws.onerror = (err) => {
      console.error("[net] error", err);
    };
  }
  connect();

  function whenReady() {
    // reauthing lets the auth call itself through while everything else waits.
    if (connected && !reauthing) return Promise.resolve();
    return new Promise(r => readyQ.push(r));
  }

  async function rpc(op, args) {
    if (op !== "auth" || !reauthing) await whenReady();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        // protocol fields last so an op argument can never clobber the rpc id
        ws.send(JSON.stringify(Object.assign({}, args || {}, { id, op })));
      } catch (e) {
        pending.delete(id);
        reject(e);
      }
    });
  }

  // -------- Firebase-style API (drop-in replacements) --------
  window.fbGet    = (path)            => rpc("get",   { path });
  window.fbPut    = (path, value)     => rpc("put",   { path, value });
  window.fbPatch  = (path, value)     => rpc("patch", { path, value });
  window.fbDelete = (path)            => rpc("del",   { path });
  // fbPost returns { name: "<auto-id>" } to match the existing Firebase REST response shape.
  window.fbPost   = (path, value)     => rpc("post",  { path, value });

  // Auth: returns { user, data }. The credentials are cached in memory so a
  // reconnect can restore the session (see ws.onopen).
  window.fbAuth   = async (user, pass, register) => {
    const res = await rpc("auth", { user, pass, register: !!register });
    lastAuth = { user, pass };
    return res;
  };

  // Presence — fast lane, no fbPut roundtrip; sends a single op the server uses for broadcast.
  window.netPresence = (data) => rpc("presence", { data });
  // Server-authoritative identity check: returns { user, role, mute }. Used to
  // re-verify staff powers (e.g. teleport) rather than trusting client state.
  window.netWhoami = () => rpc("whoami", {});
  // Staff-only: a single player's live area/position. Presence is area-scoped,
  // so teleporting to someone in another area needs a direct lookup.
  window.netWhereIs = (user) => rpc("whereis", { user });
  // Staff: delete an account outright — record, references and login — and list
  // logins whose player record is already gone (see purgeUser on the server).
  window.netDeleteUser = (user) => rpc("delete_user", { user });
  window.netGhostAccounts = () => rpc("ghost_accounts", {});
  // Richest-players board, ranked by the server so leaderboard bans hold.
  window.netLeaderboard = () => rpc("leaderboard", {});
  // Server-authoritative economy ops (see docs/SERVER-AUTHORITY.md).
  window.netCasino = (data) => rpc("casino", data);
  // `id` is the rpc envelope field, so the purchase id travels as `item`.
  window.netBuy    = (data) => rpc("buy", Object.assign({}, data, { item: data && data.id }));

  // Server-authoritative economy ops (see docs/SERVER-AUTHORITY.md). Each
  // resolves with the op's `data` (always includes the caller's new `money`).
  window.netBank = (data) => rpc("bank", data);
  window.netEarn = (data) => rpc("earn", data);
  window.netFish = (data) => rpc("fish", data);
  window.netFurnitureSet = (data) => rpc("furniture_set", data);
  window.netHome = (data) => rpc("home", data);          // server-checked house entry
  window.netTreasury = (data) => rpc("treasury", data);  // Mayor's Treasury (staff)
  window.netFarm = (data) => rpc("farm", data);          // personal farm + rotating seed stall
  window.netCook = (data) => rpc("cook", data);          // cooking pot: meals -> luck
  window.netKraken = (data) => rpc("kraken", data);      // sea-beast boss fight (status / hit)
  window.netGuild = (data) => rpc("guild", data);        // guilds: ranks, bank, treasury, skills
  window.netMastery = (data) => rpc("mastery", data || {}); // per-skill mastery tracks
  window.netGuildDungeon = (data) => rpc("guild_dungeon", data); // guild runs + their bosses
  window.netGear = (data) => rpc("gear", data);          // dungeon loot: equip / take off / sell

  // For dev console / debugging
  window.fb = { fbGet: window.fbGet, fbPut: window.fbPut, fbPatch: window.fbPatch, fbPost: window.fbPost, fbDelete: window.fbDelete };

  // ---------------- "your client is out of date" check ----------------
  // The client is served from GitHub Pages and the backend from northpvp.net, so
  // a player can easily be running week-old JS out of their browser cache while
  // the server has moved on — which is exactly how a protocol change turns into
  // "everyone vanished when I moved".
  //
  // This compares the bytes the browser ACTUALLY RAN against the bytes currently
  // deployed, for every script on the page:
  //   cache:"force-cache" -> the HTTP-cache entry the <script> tag was served
  //   cache:"no-store"    -> what the origin is serving right now
  // Differ on any file and the running copy is stale. Nothing to maintain: no
  // version constant to bump, no GitHub API (so no rate limits), and it cannot
  // false-positive — if the bytes match, you are on the deployed build.
  // A first-ever load has no cache entry, so force-cache fetches from the network
  // too, both sides match, and no banner appears.
  const VERSION_TTL = 15 * 60 * 1000;   // re-check at most this often per browser

  function showUpdateBanner(lastModified) {
    const el = document.getElementById("updateBanner");
    if (!el) return;
    const d = document.getElementById("ubDetail");
    if (d) {
      const when = lastModified ? Date.parse(lastModified) : NaN;
      let detail = "A newer version has been published. Reload to get it.";
      if (Number.isFinite(when)) {
        const age = Date.now() - when;
        const ago = age < 60000 ? "just now"
          : age < 60 * 60000 ? Math.round(age / 60000) + " min ago"
          : age < 48 * 3600000 ? Math.round(age / 3600000) + " h ago"
          : Math.round(age / 86400000) + " days ago";
        detail = "A newer version was published " + ago + ". Reload to get it.";
      }
      d.textContent = detail;
    }
    el.classList.remove("hidden");
  }

  // The game's own scripts, straight off the page — so a file added later is
  // covered automatically.
  function clientScriptUrls() {
    const here = location.origin;
    return [...document.querySelectorAll("script[src]")]
      .map(el => el.src)
      .filter(u => { try { return new URL(u, location.href).origin === here; } catch (e) { return false; } });
  }

  async function checkClientVersion(force) {
    try {
      if (!force) {
        try {
          const c = JSON.parse(localStorage.getItem("clientVersionCheck") || "null");
          if (c && Date.now() - c.at < VERSION_TTL) {
            if (c.stale) showUpdateBanner(c.lastModified);
            return !!c.stale;
          }
        } catch (e) {}
      }
      let stale = false, lastModified = null;
      for (const url of clientScriptUrls()) {
        let ran, live;
        try {
          const [a, b] = await Promise.all([
            fetch(url, { cache: "force-cache" }),
            fetch(url, { cache: "no-store" }),
          ]);
          if (!a.ok || !b.ok) continue;              // can't tell — don't guess
          lastModified = b.headers.get("last-modified") || lastModified;
          [ran, live] = await Promise.all([a.text(), b.text()]);
        } catch (e) { continue; }                    // offline / blocked: stay quiet
        if (ran.length !== live.length || ran !== live) { stale = true; break; }
      }
      try { localStorage.setItem("clientVersionCheck", JSON.stringify({ at: Date.now(), stale, lastModified })); } catch (e) {}
      if (stale) showUpdateBanner(lastModified);
      return stale;
    } catch (e) { return false; }                    // never let this break the game
  }

  // Not on the critical path — let the game boot first.
  setTimeout(() => checkClientVersion(false), 4000);
  window.checkClientVersion = checkClientVersion;
})();
