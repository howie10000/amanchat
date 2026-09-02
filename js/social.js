/* SOCIAL — friends list, instant messenger DMs */

let imPollTimer = null;

// Friends / Messenger now render inside the phone screen (window.phoneView),
// not a floating side panel.
function openSidePanelFriends() {
  window.phoneView("FRIENDS", "");
  renderFriendsList();
}
function openSidePanelDMs() {
  window.phoneView("MESSENGER", "");
  renderDMList();
}
function closeSidePanel() {
  if (imPollTimer) { clearInterval(imPollTimer); imPollTimer = null; }
  state.dmThread = null;
  if (window.phoneBackHome) window.phoneBackHome();
}
window.closeSidePanel = closeSidePanel;

async function renderFriendsList() {
  const body = document.getElementById("spBody");
  body.innerHTML = `
    <div class="flexBetween" style="margin-bottom:8px;">
      <input id="addFriendInput" placeholder="username..."
        style="flex:1;padding:7px;background:#0a0e15;border:1px solid #2a3344;color:white;border-radius:6px;" />
      <button class="menuBtn" onclick="sendFriendRequest()">Add</button>
    </div>
    <button class="menuBtn" style="width:100%;margin-bottom:10px;" onclick="openDirectoryPhone()">🌐 Search the player directory</button>
    <div id="friendsList"></div>
  `;
  const list = document.getElementById("friendsList");
  const friends = Object.keys(state.friends || {});
  if (!friends.length) {
    list.innerHTML = "<p class='muted'>No friends yet. Add someone above.</p>";
    return;
  }
  // Online check via presence
  const keys = (state.data && state.data.keys) || {};
  let html = "";
  for (const f of friends) {
    const p = state.others[f];
    const online = !!p;
    const hasKey = !!keys[f];
    html += `<div class="friendItem">
      <div class="info">
        <span class="statusDot ${online ? "online" : ""}"></span>
        <b>${f}</b>
      </div>
      <div class="flexRow">
        <button class="menuBtn" onclick="openDMThread('${f}')">Chat</button>
        <button class="menuBtn gold" onclick="challengeDuel('${f}')">Duel</button>
        <button class="menuBtn green" onclick="inviteCoop('${f}')">Quest</button>
        <button class="menuBtn ${hasKey ? "" : "gray"}" onclick="toggleKey('${f}')"
          title="${hasKey ? "Revoke your house key" : "Give your house key"}">${hasKey ? "🔑 Has Key" : "🔑 Give Key"}</button>
      </div>
    </div>`;
  }
  list.innerHTML = html;
}
// Give/revoke this friend a key to MY house. Stored on my own record
// (users/<me>/keys/<friend>), which enterOtherHome reads when they visit.
window.toggleKey = async (friend) => {
  state.data.keys = state.data.keys || {};
  if (state.data.keys[friend]) {
    delete state.data.keys[friend];
    await fbDelete(`users/${state.user}/keys/${friend}`);
    toast(`Took back ${friend}'s key.`);
  } else {
    state.data.keys[friend] = true;
    await fbPatch(`users/${state.user}/keys`, { [friend]: true });
    toast(`Gave ${friend} a key to your house.`);
  }
  renderFriendsList();
};
// Send a friend request to a specific username. Throws on a bad target so
// callers (directory, friends panel) can surface the reason.
async function sendFriendRequestTo(target) {
  target = (target || "").trim().toLowerCase();
  if (!target || target === state.user) throw new Error("Pick someone else.");
  if (state.friends && state.friends[target]) throw new Error(`Already friends with ${target}.`);
  const u = await fbGet(`users/${target}`);
  if (!u) throw new Error("No such user.");
  await fbPost(`inbox/${target}`, { kind: "friend_req", from: state.user, ts: Date.now() });
  toast(`Friend request sent to ${target}.`);
}
window.sendFriendRequestTo = sendFriendRequestTo;
window.sendFriendRequest = async () => {
  const el = document.getElementById("addFriendInput");
  try { await sendFriendRequestTo(el.value); el.value = ""; }
  catch (e) { toast(e.message || "Could not send request."); }
};

async function renderDMList() {
  const body = document.getElementById("spBody");
  // List all recent threads
  const all = (await fbGet(`dm_threads`)) || {};
  const myThreads = [];
  for (const [tid, t] of Object.entries(all)) {
    const parts = tid.split("__");
    if (parts.includes(state.user)) {
      const other = parts[0] === state.user ? parts[1] : parts[0];
      const msgs = t.messages ? Object.values(t.messages) : [];
      msgs.sort((a,b)=>b.ts - a.ts);
      const last = msgs[0];
      myThreads.push({ other, last });
    }
  }
  myThreads.sort((a,b) => (b.last?.ts || 0) - (a.last?.ts || 0));
  let html = `<p class="muted">Click a friend to start a chat. Messages vanish 7 days after they're sent.</p>`;
  if (!myThreads.length) html += `<p class="muted"><i>No conversations yet. Open Friends and click Chat.</i></p>`;
  for (const t of myThreads) {
    const tid = dmThreadId(state.user, t.other);
    const unseen = Math.max(0, (state.dmUnseen && state.dmUnseen[tid]) | 0);
    html += `<div class="friendItem" onclick="openDMThread('${t.other}')" style="cursor:pointer;">
      <div class="info">
        <span class="statusDot ${state.others[t.other] ? "online" : ""}"></span>
        <div>
          <b>${t.other}</b>${unseen ? ` <span class="dmCount">${unseen > 99 ? "99+" : unseen}</span>` : ""}
          <div class="muted" style="font-size:11px;">${t.last ? escapeHtml(t.last.text).slice(0, 36) : ""}${t.last ? " · " + formatTs(t.last.ts) : ""}</div>
        </div>
      </div>
    </div>`;
  }
  document.getElementById("spBody").innerHTML = html;
}

function dmThreadId(a, b) { return [a, b].sort().join("__"); }

async function openDMThread(other) {
  state.dmThread = other;
  const tid = dmThreadId(state.user, other);
  if (window.markThreadSeen) markThreadSeen(other);   // clears the unseen badge for this chat
  document.getElementById("spTitle").textContent = "Chat with " + other;
  document.getElementById("spBody").innerHTML = `
    <button class="imBack" onclick="renderDMList()">← Back</button>
    <div class="imThread">
      <div class="imMessages" id="imMsgs"></div>
      <div class="imInput">
        <input id="imInput" placeholder="Type a message..." maxlength="300"
          onkeydown="if(event.key==='Enter') sendIM('${other}')" />
        <button class="menuBtn" onclick="sendIM('${other}')">Send</button>
      </div>
    </div>
  `;
  setTimeout(() => document.getElementById("imInput")?.focus(), 50);
  renderIMMessages(tid);
  if (imPollTimer) clearInterval(imPollTimer);
  // Server pushes `dm` events live, so no poll needed. Keep a slow safety refresh.
  imPollTimer = setInterval(() => renderIMMessages(tid), 5000);
}
// Live DM updates from the server
if (window.NET) NET.on("dm", (m) => {
  if (state.dmThread && dmThreadId(state.user, state.dmThread) === m.thread) {
    renderIMMessages(m.thread);
  }
});
window.openDMThread = openDMThread;

async function renderIMMessages(tid) {
  const t = await fbGet(`dm_threads/${tid}`);
  const msgs = t && t.messages ? Object.values(t.messages) : [];
  msgs.sort((a,b)=>a.ts - b.ts);
  const el = document.getElementById("imMsgs");
  if (!el) return;
  if (window.markThreadSeen && state.dmThread) markThreadSeen(state.dmThread);
  el.innerHTML = "";
  let lastDay = "";
  for (const m of msgs.slice(-100)) {
    const day = dayKey(m.ts);
    if (day !== lastDay) {
      lastDay = day;
      const sep = document.createElement("div");
      sep.className = "imDay";
      sep.textContent = dayLabel(m.ts);
      el.appendChild(sep);
    }
    const div = document.createElement("div");
    div.className = "imBubble " + (m.from === state.user ? "me" : "them");
    div.innerHTML = escapeHtml(m.text) +
      `<span class="ts" title="${escapeHtml(new Date(m.ts).toLocaleString())}">${formatTs(m.ts)}</span>`;
    el.appendChild(div);
  }
  const note = document.createElement("div");
  note.className = "imDay muted";
  note.style.fontStyle = "italic";
  note.textContent = "Messages disappear 7 days after they're sent.";
  el.appendChild(note);
  el.scrollTop = el.scrollHeight;
}
function formatTs(ts) {
  const d = new Date(ts); return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function dayLabel(ts) {
  const d = new Date(ts), today = new Date();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (dayKey(ts) === dayKey(today.getTime())) return "Today";
  if (dayKey(ts) === dayKey(y.getTime())) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: (d.getFullYear() !== today.getFullYear() ? "numeric" : undefined) });
}
window.sendIM = async (other) => {
  const inp = document.getElementById("imInput");
  const text = inp.value.trim();
  if (!text) return;
  inp.value = "";
  const tid = dmThreadId(state.user, other);
  await fbPost(`dm_threads/${tid}/messages`, { from: state.user, text: text.slice(0,300), ts: Date.now() });
  // Notify them
  await fbPost(`inbox/${other}`, { kind: "dm", from: state.user, preview: text, ts: Date.now() });
  renderIMMessages(tid);
};

window.challengeDuel = async (target) => {
  const stake = parseInt(prompt(`Stake amount to duel ${target} for:`, "100"));
  if (!stake || stake < 10) return;
  if (state.data.money < stake) { toast("Not enough money."); return; }
  await fbPost(`inbox/${target}`, { kind: "duel", from: state.user, stake, ts: Date.now() });
  toast(`Duel challenge sent to ${target}. Waiting for them to accept...`);
  // Don't enter the duel screen yet — that used to drop the challenger into
  // an empty arena alone. combat.js's NET.on("duel") listener brings both
  // sides in together the moment the target accepts (which is what actually
  // creates the duels/<id> doc).
};

window.inviteCoop = async (target) => {
  const tier = prompt("Quest tier (easy / medium / hard):", "easy");
  if (!tier || !["easy","medium","hard"].includes(tier)) return;
  await fbPost(`inbox/${target}`, { kind: "quest", from: state.user, tier, ts: Date.now() });
  toast(`Quest invite sent to ${target}.`);
  // Start ourselves into the quest as leader
  state.party = { leader: state.user, partnerId: target };
  startDungeon(tier);
};

function startCoopQuest(leader, tier) {
  state.party = { leader, partnerId: leader };
  startDungeon(tier);
  toast(`Joined ${leader}'s ${tier} quest!`);
}

window.gameSocial = {
  openSidePanelFriends, openSidePanelDMs, closeSidePanel,
  renderFriendsList, renderDMList, openDMThread, dmThreadId,
  startCoopQuest, sendFriendRequestTo,
};
