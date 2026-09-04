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

  // For dev console / debugging
  window.fb = { fbGet: window.fbGet, fbPut: window.fbPut, fbPatch: window.fbPatch, fbPost: window.fbPost, fbDelete: window.fbDelete };

  // ---------------- "your client is out of date" check ----------------
  // The client is served from GitHub Pages and the backend from northpvp.net, so
  // a player can easily be running week-old JS out of their browser cache while
  // the server has moved on — which is exactly how a protocol change turns into
  // "everyone vanished when I moved". On startup we ask GitHub when the client
  // was last committed and compare it against the build stamp baked in below;
  // if the repo is newer than the files you're running, a yellow banner offers
  // a reload.
  //
  //   >>> BUMP CLIENT_BUILD ON EVERY CLIENT DEPLOY. <<<
  // Set it to (roughly) the time you push. It only has to be >= the commit you
  // are deploying and < the next one.
  // Stamp it at deploy time:
  //   sed -i "s|CLIENT_BUILD = \".*\"|CLIENT_BUILD = \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"|" js/net.js
  const CLIENT_BUILD = "2026-09-04T00:17:01Z";
  const GITHUB_REPO  = "howie10000/amanchat";
  // Only commits touching this path count, so a server-only change doesn't tell
  // every player their client is stale. Set to "" to watch the whole repo.
  const CLIENT_PATH  = "js";
  const VERSION_TTL  = 30 * 60 * 1000;   // don't re-ask GitHub more often than this
  // Slack between stamping CLIENT_BUILD and actually pushing the commit, so a
  // fresh deploy never flags itself.
  const BUILD_SLACK  = 10 * 60 * 1000;

  window.CLIENT_BUILD = CLIENT_BUILD;

  function showUpdateBanner(when) {
    const el = document.getElementById("updateBanner");
    if (!el) return;
    const d = document.getElementById("ubDetail");
    if (d) {
      const age = Date.now() - when;
      // Under a minute, or a clock ahead of ours — don't claim a bogus age.
      const ago = age < 60000 ? "just now"
        : age < 60 * 60000 ? `${Math.round(age / 60000)} min ago`
        : age < 48 * 3600000 ? `${Math.round(age / 3600000)} h ago`
        : `${Math.round(age / 86400000)} days ago`;
      d.textContent = `A newer version was published ${ago}. Reload to get it.`;
    }
    el.classList.remove("hidden");
  }

  async function latestCommitTime() {
    // Cached so a room full of players on one school IP doesn't burn through
    // GitHub's 60-requests-per-hour unauthenticated limit.
    try {
      const c = JSON.parse(localStorage.getItem("clientVersionCheck") || "null");
      if (c && Date.now() - c.at < VERSION_TTL) return c.when;
    } catch (e) {}
    const ask = async (path) => {
      const url = `https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=1`
        + (path ? `&path=${encodeURIComponent(path)}` : "");
      const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) return null;                       // 403 = rate limited, 404 = bad repo
      const list = await res.json();
      if (!Array.isArray(list) || !list.length) return null;
      const t = Date.parse(list[0].commit && list[0].commit.committer && list[0].commit.committer.date);
      return Number.isFinite(t) ? t : null;
    };
    // If CLIENT_PATH doesn't exist in the repo the filtered query comes back
    // empty; fall back to the whole repo rather than silently never warning.
    let when = await ask(CLIENT_PATH);
    if (when == null && CLIENT_PATH) when = await ask("");
    if (when != null) { try { localStorage.setItem("clientVersionCheck", JSON.stringify({ at: Date.now(), when })); } catch (e) {} }
    return when;
  }

  async function checkClientVersion() {
    try {
      const built = Date.parse(CLIENT_BUILD);
      if (!Number.isFinite(built)) return;
      const when = await latestCommitTime();
      if (when != null && when > built + BUILD_SLACK) showUpdateBanner(when);
    } catch (e) { /* never let a version check break the game */ }
  }
  // Not on the critical path — let the game boot first.
  setTimeout(checkClientVersion, 4000);
  window.checkClientVersion = checkClientVersion;
})();
