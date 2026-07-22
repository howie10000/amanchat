/* net.js — WebSocket transport that exposes the Firebase-style API used elsewhere.
   Functions: fbGet / fbPut / fbPatch / fbPost / fbDelete / fbAuth
   Also: serverEvents.on("presence" | "notify" | "dm" | "duel" | "kicked", handler)
*/

(function () {
  const WS_URL = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";

  let ws = null;
  let connected = false;
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
    ws.onopen = () => {
      connected = true;
      console.log("[net] connected", WS_URL);
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
    if (connected) return Promise.resolve();
    return new Promise(r => readyQ.push(r));
  }

  async function rpc(op, args) {
    await whenReady();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        ws.send(JSON.stringify(Object.assign({ id, op }, args || {})));
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

  // Auth: returns { user, data }
  window.fbAuth   = (user, pass, register) => rpc("auth", { user, pass, register: !!register });

  // Presence — fast lane, no fbPut roundtrip; sends a single op the server uses for broadcast.
  window.netPresence = (data) => rpc("presence", { data });

  // For dev console / debugging
  window.fb = { fbGet: window.fbGet, fbPut: window.fbPut, fbPatch: window.fbPatch, fbPost: window.fbPost, fbDelete: window.fbDelete };
})();
