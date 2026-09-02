/* ============================================================
   GRAPHICS — drawing helpers for character, furniture, buildings.
   No emojis in-game.
   ============================================================ */

// ---------- CHARACTER ----------
// appearance: { skin, hair, hairColor, shirt, pants, hat, hatColor,
//               accessory, aura, pet, nameColor }
// The last four are cosmetics bought at Trim & Style (see COSMETICS in
// game.js); everything is carried in presence so other players see it.
const DEFAULT_APPEARANCE = {
  skin: "#f5d0a9", hair: "short",
  hairColor: "#3f2210", shirt: "#3b82f6",
  pants: "#1e293b", hat: "none", hatColor: "#dc2626",
  accessory: "none", aura: "none", pet: "none", nameColor: "",
};

// Emotes float above the head for EMOTE_TTL ms; presence carries {id, ts}.
const EMOTES = [
  { id: "wave",   icon: "👋", label: "Wave" },
  { id: "laugh",  icon: "😂", label: "Laugh" },
  { id: "heart",  icon: "❤️", label: "Love" },
  { id: "fire",   icon: "🔥", label: "Fire" },
  { id: "cool",   icon: "😎", label: "Cool" },
  { id: "cry",    icon: "😭", label: "Cry" },
  { id: "angry",  icon: "😡", label: "Angry" },
  { id: "shrug",  icon: "🤷", label: "Shrug" },
  { id: "dance",  icon: "💃", label: "Dance" },
  { id: "gg",     icon: "🎮", label: "GG" },
  { id: "money",  icon: "🤑", label: "Rich" },
  { id: "skull",  icon: "💀", label: "Dead" },
  { id: "clown",  icon: "🤡", label: "Clown" },
  { id: "think",  icon: "🤔", label: "Hmm" },
  { id: "party",  icon: "🎉", label: "Party" },
  { id: "sleep",  icon: "😴", label: "Sleep" },
];
const EMOTE_TTL = 2600;

// Auras: a ring of little particles that orbit the player. Purely a function
// of time so every client animates the same thing with no synced state.
function drawAura(ctx, x, y, kind) {
  if (!kind || kind === "none") return;
  const t = Date.now() / 1000;
  ctx.save();
  if (kind === "sparkle") {
    for (let i = 0; i < 7; i++) {
      const ang = t * 1.6 + i * (Math.PI * 2 / 7);
      const px = x + Math.cos(ang) * 20, py = y - 4 + Math.sin(ang) * 12 + Math.sin(t * 5 + i) * 3;
      ctx.fillStyle = i % 2 ? "#fde68a" : "#ffffff";
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 7 + i);
      ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === "fire") {
    for (let i = 0; i < 10; i++) {
      const ph = (t * 1.4 + i * 0.37) % 1;
      const px = x + Math.sin(i * 2.1 + t * 3) * 12, py = y + 12 - ph * 34;
      ctx.fillStyle = ph < 0.4 ? "#fbbf24" : ph < 0.75 ? "#f97316" : "#ef4444";
      ctx.globalAlpha = 0.85 * (1 - ph);
      ctx.beginPath(); ctx.arc(px, py, 4 * (1 - ph) + 1, 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === "rainbow") {
    for (let i = 0; i < 12; i++) {
      const ang = t * 2 + i * (Math.PI / 6);
      ctx.fillStyle = `hsl(${(i * 30 + t * 120) % 360},100%,60%)`;
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(x + Math.cos(ang) * 22, y - 2 + Math.sin(ang) * 14, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === "hearts") {
    ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.6 + i * 0.25) % 1;
      ctx.globalAlpha = 1 - ph;
      ctx.fillText("❤", x + Math.sin(ph * 6 + i) * 10 - 10 + i * 7, y - 20 - ph * 30);
    }
  } else if (kind === "shadow") {
    ctx.fillStyle = "#4c1d95";
    for (let i = 0; i < 8; i++) {
      const ph = (t * 0.9 + i * 0.125) % 1;
      ctx.globalAlpha = 0.5 * (1 - ph);
      ctx.beginPath(); ctx.arc(x + Math.sin(i * 1.7 + t * 2) * 14, y + 10 - ph * 30, 5, 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === "gold") {
    for (let i = 0; i < 6; i++) {
      const ph = (t * 0.8 + i * (1 / 6)) % 1;
      ctx.globalAlpha = 1 - ph;
      ctx.font = "bold 9px sans-serif"; ctx.fillStyle = "#fbbf24"; ctx.textAlign = "center";
      ctx.fillText("$", x - 14 + (i * 6) % 28, y + 8 - ph * 36);
    }
  } else if (kind === "electric") {
    ctx.strokeStyle = "#7dd3fc"; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9;
    for (let i = 0; i < 3; i++) {
      const ang = t * 6 + i * 2.1;
      ctx.beginPath();
      let px = x + Math.cos(ang) * 18, py = y - 6 + Math.sin(ang) * 12;
      ctx.moveTo(px, py);
      for (let s = 0; s < 3; s++) { px += (Math.random() - 0.5) * 12; py += (Math.random() - 0.5) * 12; ctx.lineTo(px, py); }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Pets trot along behind their owner (offset by facing) and bob a little.
function drawPet(ctx, x, y, kind, facing) {
  if (!kind || kind === "none") return;
  const t = Date.now() / 1000;
  const off = { down: [-22, -6], up: [-22, 6], left: [22, 2], right: [-22, 2] }[facing || "down"] || [-22, 0];
  const px = x + off[0], py = y + off[1] + Math.sin(t * 6) * 1.5;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(px, py + 10, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
  if (kind === "cat" || kind === "dog") {
    const body = kind === "cat" ? "#f59e0b" : "#a16207";
    ctx.fillStyle = body;
    roundRect(ctx, px - 8, py - 2, 16, 9, 3, true, false);      // body
    ctx.beginPath(); ctx.arc(px + 7, py - 4, 5, 0, Math.PI * 2); ctx.fill(); // head
    if (kind === "cat") { ctx.beginPath(); ctx.moveTo(px + 3, py - 7); ctx.lineTo(px + 5, py - 12); ctx.lineTo(px + 7, py - 7); ctx.moveTo(px + 7, py - 7); ctx.lineTo(px + 9, py - 12); ctx.lineTo(px + 11, py - 7); ctx.fill(); }
    else { ctx.fillStyle = "#713f12"; ctx.fillRect(px + 2, py - 7, 3, 6); ctx.fillRect(px + 10, py - 7, 3, 6); }
    ctx.fillStyle = body;
    ctx.fillRect(px - 6, py + 6, 3, 4); ctx.fillRect(px + 3, py + 6, 3, 4);  // legs
    ctx.strokeStyle = body; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px - 8, py); ctx.quadraticCurveTo(px - 14, py - 6 + Math.sin(t * 8) * 3, px - 12, py - 9); ctx.stroke(); // tail
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(px + 8, py - 5, 1.5, 1.5);
  } else if (kind === "duck") {
    ctx.fillStyle = "#fde047";
    ctx.beginPath(); ctx.ellipse(px, py + 2, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + 6, py - 5, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f97316"; ctx.fillRect(px + 9, py - 5, 5, 2.5);
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(px + 7, py - 7, 1.5, 1.5);
  } else if (kind === "ghost") {
    ctx.globalAlpha = 0.75; ctx.fillStyle = "#e0f2fe";
    ctx.beginPath(); ctx.arc(px, py - 4, 8, Math.PI, 0); ctx.lineTo(px + 8, py + 8);
    for (let i = 0; i < 4; i++) ctx.lineTo(px + 8 - (i + 0.5) * 4, py + (i % 2 ? 8 : 5));
    ctx.lineTo(px - 8, py + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(px - 3, py - 5, 2, 3); ctx.fillRect(px + 2, py - 5, 2, 3);
  } else if (kind === "dragon") {
    ctx.fillStyle = "#16a34a";
    roundRect(ctx, px - 9, py - 2, 18, 9, 4, true, false);
    ctx.beginPath(); ctx.arc(px + 9, py - 5, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#15803d";   // wings
    const flap = Math.sin(t * 10) * 4;
    ctx.beginPath(); ctx.moveTo(px - 4, py - 1); ctx.lineTo(px - 10, py - 12 - flap); ctx.lineTo(px + 2, py - 4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px + 2, py - 1); ctx.lineTo(px + 6, py - 12 - flap); ctx.lineTo(px + 6, py - 4); ctx.fill();
    ctx.fillStyle = "#f97316"; ctx.beginPath(); ctx.arc(px + 15, py - 5, 2 + Math.sin(t * 9), 0, Math.PI * 2); ctx.fill(); // breath
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(px + 10, py - 6, 1.5, 1.5);
  } else if (kind === "robot") {
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(px - 7, py - 6, 14, 14);
    ctx.fillStyle = "#0ea5e9"; ctx.fillRect(px - 4, py - 3, 3, 3); ctx.fillRect(px + 1, py - 3, 3, 3);
    ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(px, py - 10, 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#64748b"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py - 6); ctx.lineTo(px, py - 9); ctx.stroke();
  }
  ctx.restore();
}

function drawCharacter(ctx, x, y, appearance, opts = {}) {
  const a = Object.assign({}, DEFAULT_APPEARANCE, appearance || {});
  const facing = opts.facing || "down";
  const walking = opts.walking || 0;

  drawPet(ctx, x, y, a.pet, facing);

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  drawAura(ctx, x, y, a.aura);

  // Legs
  const legSwing = Math.sin(walking * 0.3) * 3;
  ctx.fillStyle = a.pants;
  ctx.fillRect(x - 7, y + 6, 6, 10 + legSwing);
  ctx.fillRect(x + 1, y + 6, 6, 10 - legSwing);

  // Body (shirt)
  ctx.fillStyle = a.shirt;
  roundRect(ctx, x - 9, y - 4, 18, 14, 3, true, false);
  // Shirt outline
  ctx.strokeStyle = shadeColor(a.shirt, -25);
  ctx.lineWidth = 1.5;
  roundRect(ctx, x - 9, y - 4, 18, 14, 3, false, true);

  // Arms
  ctx.fillStyle = a.shirt;
  ctx.fillRect(x - 12, y - 2, 4, 8);
  ctx.fillRect(x + 8, y - 2, 4, 8);
  // Hands
  ctx.fillStyle = a.skin;
  ctx.fillRect(x - 12, y + 5, 4, 4);
  ctx.fillRect(x + 8, y + 5, 4, 4);

  // Head
  ctx.fillStyle = a.skin;
  ctx.beginPath();
  ctx.arc(x, y - 12, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shadeColor(a.skin, -35);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Hair
  if (a.hair !== "bald") {
    ctx.fillStyle = a.hairColor;
    if (a.hair === "short") {
      ctx.beginPath();
      ctx.arc(x, y - 14, 9, Math.PI, Math.PI * 2);
      ctx.fill();
    } else if (a.hair === "long") {
      ctx.beginPath();
      ctx.arc(x, y - 14, 9, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 9, y - 14, 18, 8);
    } else if (a.hair === "mohawk") {
      ctx.fillRect(x - 2, y - 24, 4, 12);
    } else if (a.hair === "afro") {
      ctx.beginPath();
      ctx.arc(x, y - 16, 12, 0, Math.PI * 2);
      ctx.fill();
    } else if (a.hair === "buzz") {
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(x, y - 14, 9, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Hat
  if (a.hat && a.hat !== "none") {
    ctx.fillStyle = a.hatColor;
    if (a.hat === "cap") {
      ctx.fillRect(x - 9, y - 19, 18, 4);
      ctx.fillRect(x - 14, y - 16, 8, 2);
    } else if (a.hat === "tophat") {
      ctx.fillRect(x - 9, y - 18, 18, 2);
      ctx.fillRect(x - 6, y - 28, 12, 12);
    } else if (a.hat === "beanie") {
      ctx.beginPath();
      ctx.arc(x, y - 14, 10, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 10, y - 14, 20, 3);
    } else if (a.hat === "crown") {
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 18);
      ctx.lineTo(x - 9, y - 23);
      ctx.lineTo(x - 5, y - 20);
      ctx.lineTo(x - 2, y - 26);
      ctx.lineTo(x + 2, y - 20);
      ctx.lineTo(x + 5, y - 26);
      ctx.lineTo(x + 9, y - 20);
      ctx.lineTo(x + 9, y - 18);
      ctx.closePath();
      ctx.fill();
    } else if (a.hat === "cowboy") {
      ctx.fillRect(x - 14, y - 19, 28, 3);
      roundRect(ctx, x - 7, y - 28, 14, 10, 3, true, false);
      ctx.fillStyle = shadeColor(a.hatColor, -40); ctx.fillRect(x - 7, y - 21, 14, 2);
    } else if (a.hat === "wizard") {
      ctx.beginPath(); ctx.moveTo(x - 12, y - 18); ctx.lineTo(x + 12, y - 18); ctx.lineTo(x + 2, y - 40); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fde68a"; ctx.font = "8px sans-serif"; ctx.textAlign = "center"; ctx.fillText("★", x, y - 26);
    } else if (a.hat === "halo") {
      ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(x, y - 27 + Math.sin(Date.now() / 300), 9, 3, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (a.hat === "horns") {
      ctx.fillStyle = a.hatColor;
      ctx.beginPath(); ctx.moveTo(x - 9, y - 16); ctx.lineTo(x - 12, y - 27); ctx.lineTo(x - 4, y - 19); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 9, y - 16); ctx.lineTo(x + 12, y - 27); ctx.lineTo(x + 4, y - 19); ctx.fill();
    } else if (a.hat === "headphones") {
      ctx.strokeStyle = a.hatColor; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y - 13, 11, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = a.hatColor; roundRect(ctx, x - 13, y - 16, 5, 7, 2, true, false); roundRect(ctx, x + 8, y - 16, 5, 7, 2, true, false);
    } else if (a.hat === "bandana") {
      ctx.fillRect(x - 9, y - 19, 18, 5);
      ctx.beginPath(); ctx.moveTo(x + 8, y - 17); ctx.lineTo(x + 15, y - 12); ctx.lineTo(x + 9, y - 14); ctx.fill();
    } else if (a.hat === "party") {
      ctx.beginPath(); ctx.moveTo(x - 7, y - 18); ctx.lineTo(x + 7, y - 18); ctx.lineTo(x, y - 34); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(x - 3, y - 25, 6, 2);
      ctx.fillStyle = "#f472b6"; ctx.beginPath(); ctx.arc(x, y - 34, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (a.hat === "chef") {
      ctx.fillStyle = "#fafaf9";
      ctx.fillRect(x - 8, y - 22, 16, 5);
      ctx.beginPath(); ctx.arc(x - 5, y - 26, 5, 0, Math.PI * 2); ctx.arc(x, y - 28, 6, 0, Math.PI * 2); ctx.arc(x + 5, y - 26, 5, 0, Math.PI * 2); ctx.fill();
    } else if (a.hat === "pirate") {
      ctx.fillStyle = "#0a0a0a";
      ctx.beginPath(); ctx.moveTo(x - 15, y - 18); ctx.quadraticCurveTo(x, y - 34, x + 15, y - 18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center"; ctx.fillText("☠", x, y - 21);
    }
  }

  // Eyes
  ctx.fillStyle = "#0a0a0a";
  if (facing === "down") {
    ctx.fillRect(x - 4, y - 13, 2, 2);
    ctx.fillRect(x + 2, y - 13, 2, 2);
  } else if (facing === "up") {
    // back of head — no eyes
  } else if (facing === "left") {
    ctx.fillRect(x - 5, y - 13, 2, 2);
  } else {
    ctx.fillRect(x + 3, y - 13, 2, 2);
  }

  // Accessories (face) — skipped when facing away
  if (a.accessory && a.accessory !== "none" && facing !== "up") {
    const ex = facing === "left" ? -2 : facing === "right" ? 2 : 0;
    if (a.accessory === "glasses") {
      ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1;
      ctx.strokeRect(x - 6 + ex, y - 14, 5, 4); ctx.strokeRect(x + 1 + ex, y - 14, 5, 4);
      ctx.beginPath(); ctx.moveTo(x - 1 + ex, y - 12); ctx.lineTo(x + 1 + ex, y - 12); ctx.stroke();
    } else if (a.accessory === "sunglasses") {
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(x - 7 + ex, y - 15, 6, 4); ctx.fillRect(x + 1 + ex, y - 15, 6, 4);
      ctx.fillRect(x - 1 + ex, y - 14, 2, 1);
    } else if (a.accessory === "eyepatch") {
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(x + 1 + ex, y - 15, 5, 5);
      ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 9, y - 16); ctx.lineTo(x + 9, y - 12); ctx.stroke();
    } else if (a.accessory === "mask") {
      ctx.fillStyle = "#e5e7eb";
      roundRect(ctx, x - 7 + ex, y - 10, 14, 6, 2, true, false);
    } else if (a.accessory === "monocle") {
      ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x + 3 + ex, y - 12, 3.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 6 + ex, y - 10); ctx.lineTo(x + 8 + ex, y - 3); ctx.stroke();
    } else if (a.accessory === "mustache") {
      ctx.fillStyle = a.hairColor === "#fafaf9" ? "#a3a3a3" : a.hairColor;
      ctx.beginPath(); ctx.ellipse(x - 3 + ex, y - 8, 4, 1.6, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 3 + ex, y - 8, 4, 1.6, -0.3, 0, Math.PI * 2); ctx.fill();
    } else if (a.accessory === "scarf") {
      ctx.fillStyle = "#dc2626";
      roundRect(ctx, x - 9, y - 5, 18, 4, 2, true, false);
      ctx.fillRect(x + 4, y - 3, 4, 9);
    } else if (a.accessory === "chain") {
      ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 3); ctx.quadraticCurveTo(x, y + 4, x + 6, y - 3); ctx.stroke();
      ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(x, y + 1, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Emote (floats up and fades)
  if (opts.emote && opts.emote.id) {
    const age = Date.now() - (opts.emote.ts || 0);
    if (age >= 0 && age < EMOTE_TTL) {
      const e = EMOTES.find(m => m.id === opts.emote.id);
      if (e) {
        const k = age / EMOTE_TTL;
        const pop = age < 200 ? easeOutBack(age / 200) : 1;
        ctx.save();
        ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        ctx.font = `${Math.round(22 * pop)}px sans-serif`; ctx.textAlign = "center";
        ctx.fillText(e.icon, x + 18, y - 30 - k * 22);
        ctx.restore();
      }
    }
  }
}

// ---------- CHAT BUBBLE STACK ----------
// Up to CHAT_STACK_MAX bubbles float above a character's head, newest at the
// bottom. When a new line arrives the older ones slide up fast, then the new
// one pops in underneath them. Everything is derived from message timestamps,
// so remote players animate identically without syncing any animation state.
const CHAT_STACK_MAX = 3;
const CHAT_TTL   = 9000; // ms a bubble stays up
const CHAT_SLIDE = 170;  // ms the older bubbles take to slide up
const CHAT_POP   = 130;  // ms the new bubble takes to pop in
const CHAT_ROW_H = 26;   // vertical gap between stacked bubbles
const CHAT_BASE_Y = -52; // offset of the bottom (newest) bubble from feet

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutBack(t) { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

// Normalizes whatever presence gave us into [{text, ts}], newest first,
// dropping expired lines. Accepts a bare string for backwards compatibility
// with any client still sending the old single-message field.
function normalizeMsgs(msgs) {
  const now = Date.now();
  let list;
  if (!msgs) return [];
  if (typeof msgs === "string") list = msgs ? [{ text: msgs, ts: now }] : [];
  else if (Array.isArray(msgs)) list = msgs.map(m => (typeof m === "string" ? { text: m, ts: now } : { text: m.text || m.t || "", ts: m.ts || 0 }));
  else return [];
  return list
    .filter(m => m.text && now - m.ts < CHAT_TTL)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, CHAT_STACK_MAX);
}

function drawChatStack(ctx, x, y, msgs) {
  const list = normalizeMsgs(msgs);
  if (!list.length) return;
  const now = Date.now();
  const slideAge = now - list[0].ts;
  const slide = easeOutCubic(clamp01(slideAge / CHAT_SLIDE));

  // Draw oldest first so the newest bubble lands on top of the stack.
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    let rowY, scale = 1;
    if (i === 0) {
      // Newest: waits for the slide to finish, then pops in.
      if (slideAge < CHAT_SLIDE) continue;
      scale = easeOutBack(clamp01((slideAge - CHAT_SLIDE) / CHAT_POP));
      rowY = CHAT_BASE_Y;
    } else {
      // Older: glide from the slot it used to occupy up to its new one.
      rowY = CHAT_BASE_Y - (i - 1 + slide) * CHAT_ROW_H;
    }
    // Fade the last moments of a bubble's life instead of blinking it away.
    const life = now - m.ts;
    const alpha = life > CHAT_TTL - 500 ? clamp01((CHAT_TTL - life) / 500) : 1;
    drawBubble(ctx, x, y + rowY, m.text, alpha, scale, i === 0);
  }
}

function drawBubble(ctx, x, by, text, alpha, scale, isNewest) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  const w = Math.min(230, ctx.measureText(text).width + 18);
  const h = 22;
  if (scale !== 1) { ctx.translate(x, by + h); ctx.scale(scale, scale); ctx.translate(-x, -(by + h)); }
  ctx.fillStyle = "rgba(0,0,0,.85)";
  roundRect(ctx, x - w/2, by, w, h, 6, true, false);
  ctx.strokeStyle = isNewest ? "#fbbf24" : "rgba(251,191,36,.45)";
  ctx.lineWidth = 1;
  roundRect(ctx, x - w/2, by, w, h, 6, false, true);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, by + 15);
  if (isNewest) {
    ctx.fillStyle = "rgba(0,0,0,.85)";
    ctx.beginPath();
    ctx.moveTo(x - 4, by + h); ctx.lineTo(x + 4, by + h); ctx.lineTo(x, by + h + 5);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// Name tag: your own name is gold, everyone else white — unless they bought a
// name colour. Staff get a badge in front of the name (role comes from the
// server-stamped presence, so it can't be faked).
const ROLE_TAG = { owner: "👑 ", admin: "🛡️ " };
function drawNameAndBubble(ctx, x, y, name, msgs, isYou, appearance, role) {
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  const custom = appearance && appearance.nameColor;
  let color = custom || (isYou ? "#fbbf24" : "#fff");
  if (custom === "rainbow") color = `hsl(${(Date.now() / 12) % 360},100%,65%)`;
  ctx.fillStyle = color;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  const label = (ROLE_TAG[role] || "") + name;
  ctx.strokeText(label, x, y - 26);
  ctx.fillText(label, x, y - 26);
  drawChatStack(ctx, x, y, msgs);
}

// ---------- BUILDING ----------
// VEGAS. An art-deco casino tower in black & gold rather than the usual shop
// box: stepped crown, gold pilasters, lit floors, an illuminated marquee, a
// porte-cochère over the entrance, a rooftop beacon and sweeping searchlights.
// Drawn from the ground up so the ground-floor doorway still lines up with
// the door hitbox (door rect at x + w/2 ± doorHalf, bottom 44px).
function drawTower(ctx, b) {
  const t = Date.now();
  const storeys = b.storeys || 4;
  const cx = b.x + b.w / 2;
  const base = b.y + b.h;
  const half = b.doorHalf || 46;
  const GOLD = "#d4a017", GOLD_LT = "#f5d270", GOLD_DK = "#7a5a0c";

  // Layout: crown occupies the top ~72px; shaft below it; ground floor 74px.
  const crownH = 72;
  const shaftTop = b.y + crownH;
  const groundTop = base - 74;
  const shaftH = groundTop - shaftTop;
  const inset = 18;                                  // shaft narrower than podium
  const sx = b.x + inset, sw = b.w - inset * 2;

  // ---- Searchlights (behind everything) ----
  for (let i = 0; i < 2; i++) {
    const a = Math.sin(t / 2100 + i * 2.4) * 0.5 + (i ? 0.42 : -0.42);
    ctx.save();
    ctx.translate(cx + (i ? 1 : -1) * (b.w / 2 - 34), b.y + 40);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, 0, -230);
    g.addColorStop(0, "rgba(255,236,170,.32)");
    g.addColorStop(1, "rgba(255,236,170,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.lineTo(30, -230); ctx.lineTo(-30, -230);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---- Ground shadow ----
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(b.x + 8, base - 6, b.w, 14);

  // ---- Podium (ground floor, full width) ----
  const podium = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
  podium.addColorStop(0, "#0c0a07"); podium.addColorStop(0.5, "#1c170e"); podium.addColorStop(1, "#0c0a07");
  ctx.fillStyle = podium;
  ctx.fillRect(b.x, groundTop, b.w, 74);
  // Polished black granite band with faint reflection
  ctx.fillStyle = "rgba(255,255,255,.04)";
  ctx.fillRect(b.x, groundTop + 4, b.w, 10);

  // ---- Shaft (main tower body) ----
  const body = ctx.createLinearGradient(sx, 0, sx + sw, 0);
  body.addColorStop(0, "#07060a"); body.addColorStop(0.3, "#141019"); body.addColorStop(0.55, "#0f0c12"); body.addColorStop(1, "#050407");
  ctx.fillStyle = body;
  ctx.fillRect(sx, shaftTop, sw, shaftH);

  // Lit floors — each storey a warm band of glass with mullions, lighting
  // shifting slowly so the building breathes rather than flickers.
  const floorH = shaftH / storeys;
  const panes = 9;
  const paneW = (sw - 28) / panes;
  for (let row = 0; row < storeys; row++) {
    const fy = shaftTop + row * floorH;
    const glassTop = fy + 8, glassH = floorH - 18;
    // Base warm glow for the whole floor
    const warmth = 0.55 + 0.45 * Math.sin(t / 2600 + row * 1.9);
    ctx.fillStyle = `rgba(255,205,110,${0.10 + 0.12 * warmth})`;
    ctx.fillRect(sx + 14, glassTop, sw - 28, glassH);
    for (let col = 0; col < panes; col++) {
      const wx = sx + 14 + col * paneW;
      const l = Math.sin(t / 1800 + row * 2.3 + col * 1.31);
      // three states: bright, dim amber, dark — mostly lit
      ctx.fillStyle = l > 0.15 ? "#ffd98a" : l > -0.55 ? "#8a6a2c" : "#1a1510";
      ctx.fillRect(wx + 2, glassTop, paneW - 4, glassH);
      // upper pane highlight
      ctx.fillStyle = "rgba(255,255,255,.10)";
      ctx.fillRect(wx + 2, glassTop, paneW - 4, 3);
    }
    // Spandrel (dark band between floors) with gold hairline
    ctx.fillStyle = "#0a0810";
    ctx.fillRect(sx + 10, fy + floorH - 10, sw - 20, 10);
    ctx.fillStyle = "rgba(212,160,23,.5)";
    ctx.fillRect(sx + 10, fy + floorH - 10, sw - 20, 1);
  }

  // Gold pilasters / vertical fins running the full shaft
  const fins = [sx + 4, sx + sw / 4, sx + sw / 2, sx + sw * 3 / 4, sx + sw - 8];
  const finG = ctx.createLinearGradient(0, shaftTop, 0, groundTop);
  finG.addColorStop(0, GOLD_LT); finG.addColorStop(0.5, GOLD); finG.addColorStop(1, GOLD_DK);
  ctx.fillStyle = finG;
  for (const fx of fins) ctx.fillRect(fx, shaftTop, 4, shaftH);
  // Edge pilasters (wider)
  ctx.fillRect(sx - 4, shaftTop, 5, shaftH);
  ctx.fillRect(sx + sw - 1, shaftTop, 5, shaftH);
  // Shaft outline
  ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5;
  ctx.strokeRect(sx - 4, shaftTop, sw + 8, shaftH);

  // ---- Stepped art-deco crown ----
  // Three tiers narrowing upward, each with a gold cap line.
  const tiers = [
    { w: sw + 8, h: 14 },
    { w: sw - 40, h: 16 },
    { w: sw - 100, h: 18 },
  ];
  let ty = shaftTop;
  for (const tier of tiers) {
    ty -= tier.h;
    ctx.fillStyle = "#0d0a12";
    ctx.fillRect(cx - tier.w / 2, ty, tier.w, tier.h);
    ctx.fillStyle = GOLD;
    ctx.fillRect(cx - tier.w / 2, ty, tier.w, 2);
    ctx.fillStyle = "rgba(212,160,23,.35)";
    ctx.fillRect(cx - tier.w / 2, ty + tier.h - 1, tier.w, 1);
    // sunburst ribs on each tier
    ctx.fillStyle = "rgba(212,160,23,.55)";
    const ribs = Math.max(3, Math.floor(tier.w / 22));
    for (let i = 0; i <= ribs; i++) {
      ctx.fillRect(cx - tier.w / 2 + i * (tier.w / ribs) - 1, ty + 3, 2, tier.h - 5);
    }
  }
  // Spire + beacon
  const spireTop = ty - 18;
  ctx.fillStyle = GOLD;
  ctx.fillRect(cx - 2, spireTop, 4, 18);
  const beacon = 0.5 + 0.5 * Math.sin(t / 380);
  ctx.save();
  ctx.shadowColor = `rgba(255,80,80,${0.6 + 0.4 * beacon})`;
  ctx.shadowBlur = 14 + 10 * beacon;
  ctx.fillStyle = beacon > 0.5 ? "#ff5a5a" : "#b02020";
  ctx.beginPath(); ctx.arc(cx, spireTop - 2, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ---- "VEGAS" rooftop sign — serif, gold, neon halo ----
  const glow = 0.55 + 0.45 * Math.abs(Math.sin(t / 700));
  ctx.save();
  ctx.font = "bold 36px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  const signY = ty + 30;   // sits within the crown tiers, below the beacon
  // dark backing plate behind lettering
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(cx - 88, signY - 30, 176, 38);
  ctx.strokeStyle = "rgba(212,160,23,.5)"; ctx.lineWidth = 1;
  ctx.strokeRect(cx - 88.5, signY - 30.5, 177, 39);
  ctx.shadowColor = `rgba(255,214,100,${glow})`;
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#ffe08a";
  ctx.fillText(b.label, cx, signY);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(90,60,0,.9)"; ctx.lineWidth = 1;
  ctx.strokeText(b.label, cx, signY);
  ctx.restore();

  // ---- Marquee (illuminated, chasing bulbs) ----
  const mx = b.x + 22, mw = b.w - 44, my = groundTop - 4, mh = 26;
  ctx.fillStyle = "#1a0606";
  ctx.fillRect(mx, my, mw, mh);
  const marq = ctx.createLinearGradient(0, my, 0, my + mh);
  marq.addColorStop(0, "#3a0a0a"); marq.addColorStop(1, "#160404");
  ctx.fillStyle = marq;
  ctx.fillRect(mx + 3, my + 3, mw - 6, mh - 6);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
  ctx.strokeRect(mx, my, mw, mh);
  const bulbs = 22;
  const phase = (t / 140 | 0);
  for (let i = 0; i < bulbs; i++) {
    const on = (phase + i) % 4 !== 0;
    const bx = mx + 6 + i * (mw - 12) / (bulbs - 1);
    ctx.fillStyle = on ? "#fff1b8" : "#5a4010";
    ctx.beginPath(); ctx.arc(bx, my - 4, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx, my + mh + 4, 2.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "#f5deb3";
  ctx.font = "bold 12px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("SLOTS  ·  TABLES  ·  HIGH ROLLERS", cx, my + mh / 2 + 1);

  // ---- Porte-cochère over the entrance ----
  const awW = half * 2 + 44, awY = base - 44 - 14;
  // canopy
  ctx.fillStyle = "#0e0b08";
  ctx.fillRect(cx - awW / 2, awY, awW, 12);
  ctx.fillStyle = GOLD;
  ctx.fillRect(cx - awW / 2, awY, awW, 2);
  ctx.fillRect(cx - awW / 2, awY + 10, awW, 2);
  // downlights under the canopy
  ctx.fillStyle = "rgba(255,220,140,.9)";
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.arc(cx - awW / 2 + 14 + i * (awW - 28) / 4, awY + 13, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  // columns flanking the door
  const colG = ctx.createLinearGradient(0, awY, 0, base);
  colG.addColorStop(0, GOLD_LT); colG.addColorStop(0.5, GOLD); colG.addColorStop(1, GOLD_DK);
  ctx.fillStyle = colG;
  ctx.fillRect(cx - half - 16, awY + 12, 8, base - awY - 12);
  ctx.fillRect(cx + half + 8, awY + 12, 8, base - awY - 12);
  ctx.fillStyle = "#0a0806";
  ctx.fillRect(cx - half - 18, base - 6, 12, 6);
  ctx.fillRect(cx + half + 6, base - 6, 12, 6);

  // ---- Grand doorway (geometry fixed: matches doorHalf on the record) ----
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(cx - half, base - 44, half * 2, 44);
  const doorGlow = ctx.createLinearGradient(0, base - 44, 0, base);
  doorGlow.addColorStop(0, "rgba(255,210,120,.55)");
  doorGlow.addColorStop(1, "rgba(255,210,120,.12)");
  ctx.fillStyle = doorGlow;
  ctx.fillRect(cx - half + 6, base - 38, half * 2 - 12, 38);
  // double-door split + brass handles
  ctx.fillStyle = "rgba(0,0,0,.6)";
  ctx.fillRect(cx - 1, base - 38, 2, 38);
  ctx.fillStyle = GOLD_LT;
  ctx.fillRect(cx - 7, base - 22, 3, 8);
  ctx.fillRect(cx + 4, base - 22, 3, 8);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
  ctx.strokeRect(cx - half, base - 44, half * 2, 44);
  // Red carpet out the front
  ctx.fillStyle = "#991b1b";
  ctx.fillRect(cx - half + 8, base, half * 2 - 16, 34);
  ctx.fillStyle = "#fcd34d";
  ctx.fillRect(cx - half + 8, base, 3, 34);
  ctx.fillRect(cx + half - 11, base, 3, 34);
  // Velvet rope stanchions along the carpet edge
  ctx.fillStyle = GOLD;
  for (let i = 0; i < 2; i++) {
    const sxp = i ? cx + half - 4 : cx - half + 1;
    ctx.fillRect(sxp, base + 4, 3, 22);
    ctx.beginPath(); ctx.arc(sxp + 1.5, base + 4, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = "#b91c1c"; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - half + 2, base + 10);
  ctx.quadraticCurveTo(cx - half + 4, base + 22, cx - half + 8, base + 24);
  ctx.moveTo(cx + half - 3, base + 10);
  ctx.quadraticCurveTo(cx + half - 5, base + 22, cx + half - 9, base + 24);
  ctx.stroke();

  // Pavement light spill from the entrance
  ctx.fillStyle = `rgba(255,214,120,${0.10 + 0.05 * glow})`;
  ctx.fillRect(cx - half - 20, base, half * 2 + 40, 6);

  ctx.textBaseline = "alphabetic";
}

function drawBuildingBox(ctx, b) {
  if (b.tower) return drawTower(ctx, b);

  const t = Date.now();
  // Drop shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(b.x + 4, b.y + b.h - 6, b.w, 8);
  // Walls
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x, b.y + 18, b.w, b.h - 18);
  // Brick/panel texture so walls aren't flat colour
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  for (let yy = b.y + 26; yy < b.y + b.h - 12; yy += 14) {
    for (let xx = b.x + ((yy / 14) % 2 ? 0 : 13); xx < b.x + b.w - 6; xx += 26) {
      ctx.fillRect(xx, yy, 22, 10);
    }
  }
  // Stone trim along bottom
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(b.x, b.y + b.h - 12, b.w, 12);
  // Roof
  ctx.fillStyle = b.roofColor || "#1f2937";
  ctx.beginPath();
  ctx.moveTo(b.x - 8, b.y + 24);
  ctx.lineTo(b.x + b.w / 2, b.y - 8);
  ctx.lineTo(b.x + b.w + 8, b.y + 24);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 2; ctx.stroke();
  // Roof shingles (lines)
  ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(b.x - 8 + i * 6, b.y + 24 - i * 6);
    ctx.lineTo(b.x + b.w + 8 - i * 6, b.y + 24 - i * 6);
    ctx.stroke();
  }
  // Grand: columns + steps for Town Hall
  if (b.grand) {
    ctx.fillStyle = "#fafaf9";
    for (const cx of [b.x + 18, b.x + b.w - 30]) {
      ctx.fillRect(cx, b.y + 60, 12, b.h - 90);
      ctx.fillRect(cx - 2, b.y + 56, 16, 6);
      ctx.fillRect(cx - 2, b.y + b.h - 36, 16, 6);
      ctx.fillStyle = "rgba(0,0,0,.12)";
      for (let fx = 0; fx < 3; fx++) ctx.fillRect(cx + 3 + fx * 3, b.y + 62, 1, b.h - 98);
      ctx.fillStyle = "#fafaf9";
    }
    ctx.fillStyle = "#a8a29e";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(b.x - 8 + i * 4, b.y + b.h + i * 6, b.w + 16 - i * 8, 6);
    }
    ctx.fillStyle = "#fafaf9";
    ctx.fillRect(b.x + b.w / 2 - 1, b.y - 30, 2, 24);
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(b.x + b.w / 2 + 1, b.y - 28, 16, 10);
  }

  drawShopFront(ctx, b, t);

  // Sign board (hung under the eaves)
  ctx.fillStyle = "#000c";
  roundRect(ctx, b.x + 10, b.y + 8, b.w - 20, 18, 4, true, false);
  ctx.strokeStyle = b.signColor || "#fbbf24"; ctx.lineWidth = 1.5;
  roundRect(ctx, b.x + 10, b.y + 8, b.w - 20, 18, 4, false, true);
  ctx.fillStyle = b.signColor || "#fbbf24";
  ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(b.label, b.x + b.w / 2, b.y + 21);
}

// Per-trade shop front. Everything below the roofline that makes a building
// read as a bank / a furniture store / a barber rather than a coloured box:
// the display window, the door, and whatever props belong on the pavement.
function drawShopFront(ctx, b, t) {
  const cx = b.x + b.w / 2;
  const sill = b.y + b.h - 12;      // top of the plinth
  const winY = b.y + 44, winH = 52; // display window band

  // Awning helper (striped, with scalloped hem)
  function awning(c1, c2) {
    const ax = b.x + 8, aw = b.w - 16, ay = b.y + 28, ah = 16;
    for (let i = 0; i * 16 < aw; i++) {
      ctx.fillStyle = i % 2 ? c1 : c2;
      ctx.fillRect(ax + i * 16, ay, Math.min(16, aw - i * 16), ah);
    }
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(ax, ay + ah - 3, aw, 3);
    for (let i = 0; i * 16 < aw; i++) {
      ctx.beginPath();
      ctx.fillStyle = i % 2 ? c1 : c2;
      ctx.arc(ax + i * 16 + 8, ay + ah, 8, 0, Math.PI);
      ctx.fill();
    }
  }
  // Lit display window helper
  function window2(x, y, w, h, glass) {
    ctx.fillStyle = glass || "#bae6fd";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(255,255,255,.25)";
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x + w * 0.45, y); ctx.lineTo(x + w * 0.7, y); ctx.lineTo(x + w * 0.25, y + h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }
  // Standard door
  function door(col, knobCol) {
    const dw = 32, dh = 44;
    ctx.fillStyle = "#1c0a04";
    ctx.fillRect(cx - dw / 2 - 3, b.y + b.h - dh - 3, dw + 6, dh + 3);
    ctx.fillStyle = col || "#3f2210";
    ctx.fillRect(cx - dw / 2, b.y + b.h - dh, dw, dh);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fillRect(cx - dw / 2 + 4, b.y + b.h - dh + 5, dw - 8, 14);
    ctx.fillStyle = knobCol || "#fcd34d";
    ctx.beginPath(); ctx.arc(cx + 9, b.y + b.h - dh / 2, 2.4, 0, Math.PI * 2); ctx.fill();
  }

  switch (b.type) {
    case "bank": {
      // Marble face, columns, a vault door behind glass, coin planters
      ctx.fillStyle = "#e7e5e4";
      ctx.fillRect(b.x + 6, b.y + 30, b.w - 12, b.h - 42);
      ctx.fillStyle = "rgba(0,0,0,.06)";
      for (let i = 0; i < 5; i++) ctx.fillRect(b.x + 10 + i * 9, b.y + 34, 2, b.h - 50);
      ctx.fillStyle = "#f5f5f4";
      for (const px of [b.x + 20, b.x + b.w - 32]) {
        ctx.fillRect(px, b.y + 40, 12, b.h - 58);
        ctx.fillRect(px - 3, b.y + 36, 18, 6);
        ctx.fillRect(px - 3, b.y + b.h - 22, 18, 6);
      }
      window2(cx - 46, winY, 92, winH, "#cbd5e1");
      // vault wheel visible through the glass
      ctx.fillStyle = "#475569";
      ctx.beginPath(); ctx.arc(cx, winY + winH / 2, 17, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fcd34d"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, winY + winH / 2, 17, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = t / 1400 + i * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 5, winY + winH / 2 + Math.sin(a) * 5);
        ctx.lineTo(cx + Math.cos(a) * 15, winY + winH / 2 + Math.sin(a) * 15);
        ctx.stroke();
      }
      door("#334155", "#fcd34d");
      // gold $ emblem in the gable
      ctx.fillStyle = "#fcd34d"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("$", cx, b.y + 16);
      break;
    }
    case "furniture": {
      awning("#5b21b6", "#7c3aed");
      window2(b.x + 16, winY + 6, b.w - 32, winH + 4);
      // a sofa and a standing lamp on display
      const sx = cx - 18, sy = winY + winH * 0.75;
      ctx.fillStyle = "#0ea5e9";
      roundRect(ctx, sx - 24, sy - 12, 52, 16, 4, true, false);
      roundRect(ctx, sx - 24, sy - 20, 52, 10, 4, true, false);
      ctx.fillStyle = "#38bdf8";
      roundRect(ctx, sx - 20, sy - 12, 20, 10, 3, true, false);
      roundRect(ctx, sx + 2, sy - 12, 20, 10, 3, true, false);
      ctx.fillStyle = "#7c4a18";
      ctx.fillRect(b.x + b.w - 44, sy - 26, 3, 26);
      ctx.fillStyle = "#fde68a";
      ctx.beginPath();
      ctx.moveTo(b.x + b.w - 50, sy - 26); ctx.lineTo(b.x + b.w - 34, sy - 26); ctx.lineTo(b.x + b.w - 37, sy - 38);
      ctx.lineTo(b.x + b.w - 47, sy - 38); ctx.closePath(); ctx.fill();
      door("#5b21b6");
      break;
    }
    case "lootbox": {
      awning("#9d174d", "#db2777");
      window2(b.x + 16, winY + 6, b.w - 32, winH + 4, "#fbcfe8");
      // stack of wrapped boxes
      const bx = cx, by = winY + winH + 2;
      const boxes = [[bx - 30, by - 20, 26, "#f472b6"], [bx + 4, by - 20, 26, "#a78bfa"], [bx - 13, by - 44, 26, "#fbbf24"]];
      for (const [x, y, sz, col] of boxes) {
        ctx.fillStyle = col; ctx.fillRect(x, y, sz, sz);
        ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, sz, sz);
        ctx.fillStyle = "#fef3c7";
        ctx.fillRect(x + sz / 2 - 2, y, 4, sz);
        ctx.fillRect(x, y + sz / 2 - 2, sz, 4);
      }
      // sparkles
      for (let i = 0; i < 5; i++) {
        const a = t / 400 + i * 1.3;
        ctx.fillStyle = `rgba(253,224,71,${0.4 + 0.4 * Math.sin(a)})`;
        ctx.beginPath();
        ctx.arc(bx - 34 + i * 17, by - 54 + Math.sin(a) * 5, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      door("#9d174d");
      break;
    }
    case "quest": {
      // Stone keep: rough blocks, battlements, torches, crossed swords
      ctx.fillStyle = "#57534e";
      ctx.fillRect(b.x + 4, b.y + 26, b.w - 8, b.h - 38);
      ctx.fillStyle = "rgba(0,0,0,.16)";
      for (let yy = b.y + 32; yy < b.y + b.h - 14; yy += 16) {
        for (let xx = b.x + 8 + ((yy / 16) % 2 ? 0 : 15); xx < b.x + b.w - 12; xx += 30) {
          ctx.fillRect(xx, yy, 26, 12);
        }
      }
      ctx.fillStyle = "#44403c";
      for (let i = 0; i * 26 < b.w - 8; i++) ctx.fillRect(b.x + 4 + i * 26, b.y + 20, 16, 12);
      // shield + crossed swords
      ctx.save();
      ctx.translate(cx, winY + 26);
      ctx.fillStyle = "#9ca3af";
      for (const dir of [-1, 1]) {
        ctx.save(); ctx.rotate(dir * 0.6);
        ctx.fillRect(-2.5, -30, 5, 44);
        ctx.fillStyle = "#7c4a18"; ctx.fillRect(-8, 12, 16, 4);
        ctx.fillStyle = "#9ca3af";
        ctx.restore();
      }
      ctx.fillStyle = "#b91c1c";
      ctx.beginPath();
      ctx.moveTo(-16, -14); ctx.lineTo(16, -14); ctx.lineTo(16, 6); ctx.lineTo(0, 20); ctx.lineTo(-16, 6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#fcd34d"; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      // torches either side of the door
      for (const tx of [cx - 44, cx + 44]) {
        ctx.fillStyle = "#3f2210"; ctx.fillRect(tx - 2, sill - 34, 4, 20);
        const f = 0.7 + 0.3 * Math.sin(t / 120 + tx);
        ctx.fillStyle = `rgba(251,146,60,${f})`;
        ctx.beginPath(); ctx.ellipse(tx, sill - 40, 5, 9 * f, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(253,224,71,${f})`;
        ctx.beginPath(); ctx.ellipse(tx, sill - 38, 2.5, 5 * f, 0, 0, Math.PI * 2); ctx.fill();
      }
      // arched door
      ctx.fillStyle = "#3f2210";
      ctx.beginPath();
      ctx.moveTo(cx - 18, b.y + b.h);
      ctx.lineTo(cx - 18, b.y + b.h - 30);
      ctx.arc(cx, b.y + b.h - 30, 18, Math.PI, 0);
      ctx.lineTo(cx + 18, b.y + b.h);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#1c0a04"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#78716c";
      for (let i = 0; i < 4; i++) ctx.fillRect(cx - 18, b.y + b.h - 40 + i * 11, 36, 2);
      break;
    }
    case "job": {
      // Office block: grid of lit windows, clock, briefcase sign
      ctx.fillStyle = "#1e40af";
      ctx.fillRect(b.x + 6, b.y + 28, b.w - 12, b.h - 40);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 6; col++) {
          const wx = b.x + 16 + col * ((b.w - 32) / 6);
          const wy = b.y + 36 + row * 26;
          const lit = Math.sin(t / 1500 + row * 1.7 + col * 2.3) > -0.2;
          ctx.fillStyle = lit ? "#fde68a" : "#1e3a8a";
          ctx.fillRect(wx, wy, (b.w - 32) / 6 - 8, 18);
          ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 1;
          ctx.strokeRect(wx, wy, (b.w - 32) / 6 - 8, 18);
        }
      }
      // wall clock
      ctx.fillStyle = "#e5e7eb";
      ctx.beginPath(); ctx.arc(cx, b.y + b.h - 44, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#1f2937"; ctx.lineWidth = 2; ctx.stroke();
      const d = new Date();
      for (const [len, val, per] of [[6, d.getHours() % 12 + d.getMinutes() / 60, 12], [10, d.getMinutes(), 60]]) {
        const a = (val / per) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(cx, b.y + b.h - 44);
        ctx.lineTo(cx + Math.cos(a) * len, b.y + b.h - 44 + Math.sin(a) * len); ctx.stroke();
      }
      door("#1e3a8a", "#e5e7eb");
      break;
    }
    case "barber": {
      awning("#f8fafc", "#0ea5e9");
      window2(b.x + 18, winY + 8, b.w - 36, winH, "#e0f2fe");
      // mirror + chair silhouette in the window
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(cx - 30, winY + 14, 24, 30);
      ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 2; ctx.strokeRect(cx - 30, winY + 14, 24, 30);
      ctx.fillStyle = "#334155";
      ctx.fillRect(cx + 8, winY + 30, 20, 16);
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(cx + 11, winY + 22, 14, 10);
      // animated barber pole
      const px = b.x + 12, py = sill - 52;
      ctx.fillStyle = "#e2e8f0";
      roundRect(ctx, px - 6, py, 12, 46, 5, true, false);
      ctx.save();
      ctx.beginPath(); roundRect(ctx, px - 6, py, 12, 46, 5, false, false); ctx.clip();
      for (let i = -6; i < 8; i++) {
        const off = ((t / 26) % 16) + i * 16;
        ctx.fillStyle = "#dc2626";
        ctx.beginPath();
        ctx.moveTo(px - 8, py + off); ctx.lineTo(px + 8, py + off - 8);
        ctx.lineTo(px + 8, py + off); ctx.lineTo(px - 8, py + off + 8);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 2;
      roundRect(ctx, px - 6, py, 12, 46, 5, false, true);
      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath(); ctx.arc(px, py - 3, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px, py + 49, 5, 0, Math.PI * 2); ctx.fill();
      door("#0c4a6e", "#e2e8f0");
      break;
    }
    case "plaza": {
      // Open arcade: three arches, bunting, planters
      ctx.fillStyle = "#fed7aa";
      ctx.fillRect(b.x + 6, b.y + 28, b.w - 12, b.h - 40);
      for (let i = 0; i < 3; i++) {
        const ax = b.x + 34 + i * ((b.w - 68) / 2);
        ctx.fillStyle = "#7c2d12";
        ctx.beginPath();
        ctx.moveTo(ax - 22, b.y + b.h - 12);
        ctx.lineTo(ax - 22, b.y + b.h - 52);
        ctx.arc(ax, b.y + b.h - 52, 22, Math.PI, 0);
        ctx.lineTo(ax + 22, b.y + b.h - 12);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,.35)";
        ctx.beginPath();
        ctx.moveTo(ax - 16, b.y + b.h - 12);
        ctx.lineTo(ax - 16, b.y + b.h - 50);
        ctx.arc(ax, b.y + b.h - 50, 16, Math.PI, 0);
        ctx.lineTo(ax + 16, b.y + b.h - 12);
        ctx.closePath(); ctx.fill();
      }
      // bunting across the front
      const cols = ["#ef4444", "#fbbf24", "#22c55e", "#3b82f6", "#a855f7"];
      for (let i = 0; i * 22 < b.w - 16; i++) {
        const fx = b.x + 12 + i * 22;
        const sag = Math.sin(i * 0.9) * 3;
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath();
        ctx.moveTo(fx, b.y + 32 + sag); ctx.lineTo(fx + 16, b.y + 32 + sag); ctx.lineTo(fx + 8, b.y + 46 + sag);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case "mayor": {
      window2(b.x + 26, b.y + 52, 34, 34, "#bae6fd");
      window2(b.x + b.w - 60, b.y + 52, 34, 34, "#bae6fd");
      // Clock face in the pediment
      ctx.fillStyle = "#fef3c7";
      ctx.beginPath(); ctx.arc(cx, b.y + 62, 20, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#7c2d12"; ctx.lineWidth = 3; ctx.stroke();
      const d2 = new Date();
      ctx.strokeStyle = "#1f2937";
      for (const [len, val, per, lw] of [[9, d2.getHours() % 12 + d2.getMinutes() / 60, 12, 3], [15, d2.getMinutes(), 60, 2]]) {
        const a = (val / per) * Math.PI * 2 - Math.PI / 2;
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(cx, b.y + 62);
        ctx.lineTo(cx + Math.cos(a) * len, b.y + 62 + Math.sin(a) * len); ctx.stroke();
      }
      // double doors
      ctx.fillStyle = "#7c2d12";
      ctx.fillRect(cx - 30, b.y + b.h - 50, 60, 50);
      ctx.strokeStyle = "#3f2210"; ctx.lineWidth = 2;
      ctx.strokeRect(cx - 30, b.y + b.h - 50, 60, 50);
      ctx.beginPath(); ctx.moveTo(cx, b.y + b.h - 50); ctx.lineTo(cx, b.y + b.h); ctx.stroke();
      ctx.fillStyle = "#fcd34d";
      ctx.beginPath(); ctx.arc(cx - 7, b.y + b.h - 24, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 7, b.y + b.h - 24, 2.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    default: {
      window2(b.x + 14, b.y + 32, 26, 26);
      window2(b.x + b.w - 40, b.y + 32, 26, 26);
      door();
    }
  }
}

// A house with some character: per-owner colour scheme, a porch with posts,
// a gabled roof with a dormer, a garden path, hedges and a mailbox. Everything
// is derived from the owner's name so a given house always looks the same.
function houseHash(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const HOUSE_WALLS = ["#e7e5e4", "#fde68a", "#bfdbfe", "#fecaca", "#d9f99d", "#e9d5ff", "#cffafe", "#fed7aa"];
const HOUSE_ROOFS = ["#7f1d1d", "#1e3a8a", "#3f2210", "#166534", "#4c1d95", "#7c2d12", "#0f172a", "#831843"];

// `style` is the owner's paint job ({ wall, roof }) bought at FURNITURELAND;
// without one the colours are derived from the name as before.
function drawHouse(ctx, r, name, isYou, style) {
  const t = Date.now();
  const h = houseHash(name);
  const wall = (style && style.wall) || (isYou ? "#fef9c3" : HOUSE_WALLS[h % HOUSE_WALLS.length]);
  const roof = (style && style.roof) || (isYou ? "#b45309" : HOUSE_ROOFS[(h >> 3) % HOUSE_ROOFS.length]);
  const eaveY = r.y + 34;

  // Ground shadow
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h + 2, r.w * 0.52, 9, 0, 0, Math.PI * 2); ctx.fill();

  // Garden path up to the door
  ctx.fillStyle = "#d6d3d1";
  ctx.fillRect(r.x + r.w / 2 - 16, r.y + r.h, 32, 40);
  ctx.fillStyle = "#a8a29e";
  for (let i = 0; i < 4; i++) ctx.fillRect(r.x + r.w / 2 - 16, r.y + r.h + 2 + i * 10, 32, 2);

  // Walls + clapboard siding
  ctx.fillStyle = wall;
  ctx.fillRect(r.x, eaveY, r.w, r.h - 34);
  ctx.fillStyle = "rgba(0,0,0,0.055)";
  for (let yy = eaveY + 7; yy < r.y + r.h; yy += 9) ctx.fillRect(r.x, yy, r.w, 3);
  ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 2;
  ctx.strokeRect(r.x, eaveY, r.w, r.h - 34);

  // Roof (gable) with overhang and shingle rows
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(r.x - 14, eaveY + 6);
  ctx.lineTo(r.x + r.w / 2, r.y - 12);
  ctx.lineTo(r.x + r.w + 14, eaveY + 6);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#1c0a04"; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const f = i / 5;
    ctx.beginPath();
    ctx.moveTo(r.x - 14 + f * (r.w / 2 + 14), eaveY + 6 - f * (eaveY + 18 - r.y));
    ctx.lineTo(r.x + r.w + 14 - f * (r.w / 2 + 14), eaveY + 6 - f * (eaveY + 18 - r.y));
    ctx.stroke();
  }
  // Dormer window in the roof
  ctx.fillStyle = wall;
  ctx.fillRect(r.x + r.w / 2 - 15, r.y + 6, 30, 22);
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(r.x + r.w / 2 - 19, r.y + 8);
  ctx.lineTo(r.x + r.w / 2, r.y - 6);
  ctx.lineTo(r.x + r.w / 2 + 19, r.y + 8);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fde68a";
  ctx.fillRect(r.x + r.w / 2 - 8, r.y + 12, 16, 13);
  ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1.2;
  ctx.strokeRect(r.x + r.w / 2 - 8, r.y + 12, 16, 13);

  // Chimney with a curl of smoke
  ctx.fillStyle = "#7f1d1d";
  ctx.fillRect(r.x + r.w - 44, r.y + 2, 16, 30);
  ctx.fillStyle = "#57534e";
  ctx.fillRect(r.x + r.w - 46, r.y - 2, 20, 6);
  for (let i = 0; i < 3; i++) {
    const a = t / 900 + i * 0.9;
    ctx.fillStyle = `rgba(226,232,240,${0.25 - i * 0.06})`;
    ctx.beginPath();
    ctx.arc(r.x + r.w - 36 + Math.sin(a) * 6, r.y - 10 - i * 11, 5 + i * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Windows with shutters and sills
  for (const wx of [r.x + 18, r.x + r.w - 54]) {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(wx - 2, eaveY + 20, 40, 32);
    ctx.fillStyle = "#fde68a";
    ctx.fillRect(wx, eaveY + 22, 36, 28);
    ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(wx + 18, eaveY + 22); ctx.lineTo(wx + 18, eaveY + 50);
    ctx.moveTo(wx, eaveY + 36); ctx.lineTo(wx + 36, eaveY + 36);
    ctx.stroke();
    ctx.strokeRect(wx, eaveY + 22, 36, 28);
    ctx.fillStyle = roof;
    ctx.fillRect(wx - 9, eaveY + 21, 7, 30);
    ctx.fillRect(wx + 38, eaveY + 21, 7, 30);
    ctx.fillStyle = "#a8a29e";
    ctx.fillRect(wx - 10, eaveY + 51, 56, 4);
    // window box of flowers
    ctx.fillStyle = "#7c4a18";
    ctx.fillRect(wx - 4, eaveY + 55, 44, 7);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = ["#fda4af", "#fcd34d", "#f9a8d4"][(h + i) % 3];
      ctx.beginPath(); ctx.arc(wx + 2 + i * 9, eaveY + 54, 2.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Porch roof + posts over the door
  const px = r.x + r.w / 2;
  ctx.fillStyle = roof;
  ctx.fillRect(px - 42, r.y + r.h - 62, 84, 8);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(px - 38, r.y + r.h - 54, 6, 54);
  ctx.fillRect(px + 32, r.y + r.h - 54, 6, 54);

  // Front door with step
  ctx.fillStyle = "#1c0a04";
  ctx.fillRect(px - 19, r.y + r.h - 48, 38, 48);
  ctx.fillStyle = isYou ? "#b45309" : "#3f2210";
  ctx.fillRect(px - 17, r.y + r.h - 46, 34, 46);
  ctx.fillStyle = "rgba(255,255,255,.10)";
  ctx.fillRect(px - 12, r.y + r.h - 41, 24, 15);
  ctx.fillStyle = "#fcd34d";
  ctx.beginPath(); ctx.arc(px + 11, r.y + r.h - 23, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#a8a29e";
  ctx.fillRect(px - 24, r.y + r.h, 48, 5);
  // porch light
  const lit = 0.55 + 0.45 * Math.abs(Math.sin(t / 700 + h));
  ctx.fillStyle = `rgba(253,224,71,${lit})`;
  ctx.beginPath(); ctx.arc(px - 26, r.y + r.h - 42, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(253,224,71,${lit * 0.18})`;
  ctx.beginPath(); ctx.arc(px - 26, r.y + r.h - 42, 15, 0, Math.PI * 2); ctx.fill();

  // Hedges along the frontage and a mailbox
  for (let i = 0; i < 4; i++) {
    const hx = r.x + 8 + i * 22;
    ctx.fillStyle = "#15803d";
    ctx.beginPath(); ctx.arc(hx, r.y + r.h + 6, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#166534";
    ctx.beginPath(); ctx.arc(hx - 3, r.y + r.h + 3, 5, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 4; i++) {
    const hx = r.x + r.w - 8 - i * 22;
    ctx.fillStyle = "#15803d";
    ctx.beginPath(); ctx.arc(hx, r.y + r.h + 6, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#166534";
    ctx.beginPath(); ctx.arc(hx - 3, r.y + r.h + 3, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "#78716c";
  ctx.fillRect(r.x + r.w / 2 + 26, r.y + r.h + 16, 3, 18);
  ctx.fillStyle = isYou ? "#fbbf24" : "#3b82f6";
  roundRect(ctx, r.x + r.w / 2 + 20, r.y + r.h + 8, 18, 11, 4, true, false);
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(r.x + r.w / 2 + 23, r.y + r.h + 12, 6, 2);

  // Name plate
  ctx.fillStyle = "rgba(0,0,0,.72)";
  roundRect(ctx, r.x + r.w / 2 - 52, r.y - 26, 104, 19, 5, true, false);
  ctx.strokeStyle = isYou ? "#fbbf24" : "rgba(255,255,255,.25)"; ctx.lineWidth = 1.5;
  roundRect(ctx, r.x + r.w / 2 - 52, r.y - 26, 104, 19, 5, false, true);
  ctx.fillStyle = isYou ? "#fbbf24" : "#fff";
  ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(name, r.x + r.w / 2, r.y - 12);
}

// ---------- FURNITURE DRAWING ----------
function drawFurniture(ctx, f, def, opts = {}) {
  const x = f.x, y = f.y;
  const w = def.w, h = def.h;
  const c = def.color, a = def.accent || shadeColor(c, -25);
  ctx.save();
  switch (def.kind) {
    case "sofa":
    case "armchair": {
      // base
      roundFill(ctx, x - w/2, y - h/2 + h*0.25, w, h*0.75, 6, c);
      // back
      roundFill(ctx, x - w/2, y - h/2, w, h*0.45, 6, shadeColor(c, -10));
      // cushions
      ctx.fillStyle = shadeColor(c, 15);
      const cushions = def.kind === "armchair" ? 1 : (w > 90 ? 3 : 2);
      const cw = (w - 6) / cushions - 4;
      for (let i = 0; i < cushions; i++) {
        roundFill(ctx, x - w/2 + 3 + i * (cw + 4), y - 4, cw, h*0.55, 4, shadeColor(c, 15));
      }
      // arms
      ctx.fillStyle = shadeColor(c, -15);
      ctx.fillRect(x - w/2, y - h/2 + 4, 6, h - 6);
      ctx.fillRect(x + w/2 - 6, y - h/2 + 4, 6, h - 6);
      break;
    }
    case "chair": {
      ctx.fillStyle = c; ctx.fillRect(x - w/2, y - 2, w, h*0.4);
      ctx.fillStyle = a; ctx.fillRect(x - w/2 + 2, y - h/2, w - 4, h*0.5);
      // legs
      ctx.fillStyle = shadeColor(c, -25);
      ctx.fillRect(x - w/2 + 2, y + h*0.4 - 2, 3, h*0.4);
      ctx.fillRect(x + w/2 - 5, y + h*0.4 - 2, 3, h*0.4);
      break;
    }
    case "officechair": {
      ctx.fillStyle = c; roundFill(ctx, x - w/2, y - h/2, w, h*0.55, 4, c);
      ctx.fillStyle = shadeColor(c, -15); ctx.fillRect(x - 2, y, 4, h*0.4);
      // wheel base
      ctx.fillStyle = a;
      ctx.beginPath(); ctx.arc(x, y + h*0.4, 6, 0, Math.PI*2); ctx.fill();
      break;
    }
    case "bed": {
      // mattress
      roundFill(ctx, x - w/2, y - h/2 + 6, w, h - 6, 6, "#fef3c7");
      ctx.strokeStyle = "#c0a85b"; ctx.lineWidth = 1;
      roundStroke(ctx, x - w/2, y - h/2 + 6, w, h - 6, 6);
      // headboard
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, 12, 4, c);
      // pillow
      ctx.fillStyle = "#fff";
      roundFill(ctx, x - w/2 + 8, y - h/2 + 12, w - 16, 16, 4, "#fff");
      // blanket
      ctx.fillStyle = a;
      roundFill(ctx, x - w/2, y - h/2 + 32, w, h - 38, 4, a);
      break;
    }
    case "canopybed": {
      // posts
      ctx.fillStyle = "#3f2210";
      ctx.fillRect(x - w/2, y - h/2 - 18, 6, h);
      ctx.fillRect(x + w/2 - 6, y - h/2 - 18, 6, h);
      // canopy
      ctx.fillStyle = def.accent;
      ctx.fillRect(x - w/2 - 4, y - h/2 - 18, w + 8, 6);
      // bed
      roundFill(ctx, x - w/2 + 6, y - h/2 + 6, w - 12, h - 6, 6, "#fef3c7");
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2 + 6, y - h/2 + 32, w - 12, h - 38, 4, c);
      break;
    }
    case "table":
    case "desk": {
      ctx.fillStyle = c; roundFill(ctx, x - w/2, y - h/2, w, h, 4, c);
      ctx.strokeStyle = a; ctx.lineWidth = 2;
      roundStroke(ctx, x - w/2, y - h/2, w, h, 4);
      ctx.fillStyle = a;
      ctx.fillRect(x - w/2 + 4, y + h/2 - 4, 4, 4);
      ctx.fillRect(x + w/2 - 8, y + h/2 - 4, 4, 4);
      break;
    }
    case "roundtable": {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x, y, w/2, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = a; ctx.lineWidth = 2; ctx.stroke();
      break;
    }
    case "glasstable": {
      ctx.fillStyle = "rgba(186,230,253,0.6)";
      roundFill(ctx, x - w/2, y - h/2, w, h, 4, "rgba(186,230,253,0.6)");
      ctx.strokeStyle = "#475569"; ctx.lineWidth = 2;
      roundStroke(ctx, x - w/2, y - h/2, w, h, 4);
      break;
    }
    case "gamingdesk": {
      ctx.fillStyle = c; roundFill(ctx, x - w/2, y - h/2, w, h, 4, c);
      // RGB strip
      ctx.fillStyle = a; ctx.fillRect(x - w/2, y + h/2 - 3, w, 3);
      // monitor
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(x - 24, y - h/2 - 10, 48, 24);
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(x - 22, y - h/2 - 8, 44, 20);
      break;
    }
    case "floorlamp": {
      ctx.fillStyle = c; ctx.fillRect(x - 1, y - h/2 + 12, 2, h - 12);
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.moveTo(x - 12, y - h/2 + 12);
      ctx.lineTo(x + 12, y - h/2 + 12);
      ctx.lineTo(x + 8, y - h/2);
      ctx.lineTo(x - 8, y - h/2);
      ctx.closePath();
      ctx.fill();
      // base
      ctx.fillStyle = c; ctx.fillRect(x - 6, y + h/2 - 2, 12, 2);
      // glow
      if (opts.lit) {
        ctx.fillStyle = "rgba(253,224,71,0.25)";
        ctx.beginPath(); ctx.arc(x, y - h/2 + 6, 30, 0, Math.PI*2); ctx.fill();
      }
      break;
    }
    case "tablelamp": {
      ctx.fillStyle = c; ctx.fillRect(x - 6, y + h/2 - 6, 12, 6);
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.moveTo(x - 10, y - h/2);
      ctx.lineTo(x + 10, y - h/2);
      ctx.lineTo(x + 6, y - h/2 + 16);
      ctx.lineTo(x - 6, y - h/2 + 16);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "chandelier": {
      ctx.strokeStyle = "#92400e"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - h/2); ctx.lineTo(x, y - 10); ctx.stroke();
      ctx.fillStyle = c;
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        const cx = x + Math.cos(ang) * 18, cy = y + Math.sin(ang) * 8;
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI*2); ctx.fill();
      }
      break;
    }
    case "plant": {
      // pot
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.moveTo(x - 10, y + h/2 - 14);
      ctx.lineTo(x + 10, y + h/2 - 14);
      ctx.lineTo(x + 8, y + h/2);
      ctx.lineTo(x - 8, y + h/2);
      ctx.closePath();
      ctx.fill();
      // leaves
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x, y - 4, 12, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x - 8, y - 8, 8, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 8, y - 8, 8, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - 14, 9, 0, Math.PI*2); ctx.fill();
      break;
    }
    case "rug": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 6, c);
      ctx.strokeStyle = a; ctx.lineWidth = 3;
      roundStroke(ctx, x - w/2 + 6, y - h/2 + 6, w - 12, h - 12, 4);
      ctx.strokeStyle = a; ctx.lineWidth = 1;
      roundStroke(ctx, x - w/2, y - h/2, w, h, 6);
      break;
    }
    case "persianrug": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 4, c);
      ctx.fillStyle = a;
      // diamonds pattern
      for (let r = -h/2 + 12; r < h/2 - 8; r += 18) {
        for (let cc = -w/2 + 12; cc < w/2 - 8; cc += 18) {
          ctx.beginPath();
          ctx.moveTo(x + cc, y + r - 4);
          ctx.lineTo(x + cc + 4, y + r);
          ctx.lineTo(x + cc, y + r + 4);
          ctx.lineTo(x + cc - 4, y + r);
          ctx.closePath(); ctx.fill();
        }
      }
      break;
    }
    case "tv": {
      ctx.fillStyle = "#0a0a0a";
      roundFill(ctx, x - w/2, y - h/2, w, h, 3, "#0a0a0a");
      ctx.fillStyle = a;
      ctx.fillRect(x - w/2 + 3, y - h/2 + 3, w - 6, h - 6);
      // animated screen shimmer (static)
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(x - w/2 + 3, y - h/2 + 3, w - 6, 2);
      // stand
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(x - 12, y + h/2, 24, 4);
      break;
    }
    case "computer": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 4, c);
      ctx.fillStyle = a;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#22d3ee"; ctx.fillRect(x - 14, y + h/2 - 4, 4, 2);
      break;
    }
    case "speaker": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 3, c);
      ctx.fillStyle = a;
      ctx.beginPath(); ctx.arc(x, y - h/4, w*0.3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y + h/4, w*0.25, 0, Math.PI*2); ctx.fill();
      break;
    }
    case "painting": {
      ctx.fillStyle = a;
      ctx.fillRect(x - w/2 - 3, y - h/2 - 3, w + 6, h + 6);
      ctx.fillStyle = c;
      ctx.fillRect(x - w/2, y - h/2, w, h);
      // abstract strokes
      ctx.strokeStyle = shadeColor(c, 30); ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - w/2 + 4, y - h/2 + 6);
      ctx.lineTo(x + w/2 - 6, y - h/4);
      ctx.lineTo(x - w/4, y + h/4);
      ctx.lineTo(x + w/2 - 4, y + h/2 - 4);
      ctx.stroke();
      break;
    }
    case "bookshelf": {
      ctx.fillStyle = c;
      ctx.fillRect(x - w/2, y - h/2, w, h);
      ctx.fillStyle = a;
      const shelves = Math.floor(h / 22);
      const sh = h / shelves;
      for (let i = 0; i < shelves; i++) {
        const sy = y - h/2 + i * sh + 3;
        for (let j = 0; j < 6; j++) {
          ctx.fillStyle = ["#dc2626","#3b82f6","#10b981","#a855f7","#fcd34d","#0a0a0a"][j];
          ctx.fillRect(x - w/2 + 4 + j * 8, sy, 6, sh - 6);
        }
      }
      ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1;
      ctx.strokeRect(x - w/2, y - h/2, w, h);
      break;
    }
    case "dresser":
    case "wardrobe": {
      ctx.fillStyle = c;
      ctx.fillRect(x - w/2, y - h/2, w, h);
      ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1;
      ctx.strokeRect(x - w/2, y - h/2, w, h);
      // drawers
      const rows = def.kind === "wardrobe" ? 1 : 3;
      for (let i = 0; i < rows; i++) {
        const dy = y - h/2 + (i + 0.5) * (h / rows);
        ctx.fillStyle = a;
        ctx.fillRect(x - 3, dy - 1, 6, 2);
      }
      break;
    }
    case "fridge": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 4, c);
      ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - w/2, y - 6); ctx.lineTo(x + w/2, y - 6); ctx.stroke();
      ctx.fillStyle = a;
      ctx.fillRect(x + w/2 - 6, y - h/2 + 8, 3, 8);
      ctx.fillRect(x + w/2 - 6, y, 3, 8);
      break;
    }
    case "stove": {
      ctx.fillStyle = c;
      ctx.fillRect(x - w/2, y - h/2, w, h);
      // burners
      ctx.fillStyle = a;
      for (let i = 0; i < 4; i++) {
        const px = x - w/4 + (i % 2) * (w/2);
        const py = y - h/4 + Math.floor(i / 2) * (h/2);
        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI*2); ctx.fill();
      }
      break;
    }
    case "sink": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 6, c);
      ctx.fillStyle = a;
      ctx.fillRect(x - 2, y - h/2 - 8, 4, 10);
      break;
    }
    case "counter": {
      ctx.fillStyle = c;
      ctx.fillRect(x - w/2, y - h/2, w, h);
      ctx.strokeStyle = a; ctx.lineWidth = 2;
      ctx.strokeRect(x - w/2, y - h/2, w, h);
      break;
    }
    case "microwave":
    case "toaster":
    case "coffeemachine": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 3, c);
      ctx.fillStyle = a;
      ctx.fillRect(x - w/2 + 3, y - h/2 + 3, w - 12, h - 6);
      break;
    }
    case "toilet": {
      ctx.fillStyle = c;
      ctx.fillRect(x - w/2, y - h/2, w, h*0.4);
      roundFill(ctx, x - w/2 + 2, y - h/2 + h*0.3, w - 4, h*0.6, 6, c);
      break;
    }
    case "bathtub": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 12, c);
      ctx.fillStyle = a;
      roundFill(ctx, x - w/2 + 4, y - h/2 + 4, w - 8, h - 8, 8, a);
      break;
    }
    case "shower": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 6, c);
      ctx.strokeStyle = a; ctx.lineWidth = 2;
      roundStroke(ctx, x - w/2, y - h/2, w, h, 6);
      ctx.fillStyle = "#bae6fd";
      ctx.beginPath(); ctx.arc(x + w/3, y - h/3, 4, 0, Math.PI*2); ctx.fill();
      break;
    }
    case "mirror": {
      ctx.fillStyle = a;
      ctx.fillRect(x - w/2, y - h/2, w, h);
      ctx.fillStyle = c;
      ctx.fillRect(x - w/2 + 3, y - h/2 + 3, w - 6, h - 6);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.moveTo(x - w/2 + 6, y - h/2 + 6);
      ctx.lineTo(x + w/2 - 12, y - h/2 + 6);
      ctx.lineTo(x - w/2 + 6, y + h/2 - 18);
      ctx.closePath(); ctx.fill();
      break;
    }
    case "vase": {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - h/2);
      ctx.lineTo(x + 6, y - h/2);
      ctx.lineTo(x + 10, y - 4);
      ctx.lineTo(x + 6, y + h/2);
      ctx.lineTo(x - 6, y + h/2);
      ctx.lineTo(x - 10, y - 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = a; ctx.lineWidth = 1; ctx.stroke();
      break;
    }
    case "candle": {
      ctx.fillStyle = c;
      ctx.fillRect(x - 4, y - h/2 + 6, 8, h - 6);
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.moveTo(x, y - h/2);
      ctx.lineTo(x - 3, y - h/2 + 6);
      ctx.lineTo(x + 3, y - h/2 + 6);
      ctx.closePath(); ctx.fill();
      break;
    }
    case "statue":
    case "trophy": {
      ctx.fillStyle = a;
      ctx.fillRect(x - 10, y + h/2 - 8, 20, 8);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y - h/4, 7, 0, Math.PI*2); ctx.fill();
      ctx.fillRect(x - 6, y - h/4 + 4, 12, h/2);
      if (def.kind === "trophy") {
        ctx.beginPath();
        ctx.arc(x - 12, y - h/4 + 4, 5, 0, Math.PI);
        ctx.arc(x + 12, y - h/4 + 4, 5, 0, Math.PI);
        ctx.fill();
      }
      break;
    }
    case "arcade": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 4, c);
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(x - w/2 + 4, y - h/2 + 6, w - 8, h*0.4);
      ctx.fillStyle = a;
      ctx.fillRect(x - w/2 + 6, y - h/2 + 8, w - 12, h*0.35);
      // joystick
      ctx.fillStyle = "#dc2626";
      ctx.beginPath(); ctx.arc(x, y + 6, 3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#fcd34d";
      ctx.beginPath(); ctx.arc(x - 8, y + 12, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 8, y + 12, 2, 0, Math.PI*2); ctx.fill();
      break;
    }
    case "jukebox": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 8, c);
      ctx.fillStyle = a;
      ctx.beginPath(); ctx.arc(x, y - 6, 10, 0, Math.PI); ctx.fill();
      ctx.fillStyle = "#0a0a0a"; ctx.fillRect(x - 12, y + 2, 24, 4);
      ctx.fillRect(x - 12, y + 10, 24, 4);
      break;
    }
    case "pooltable": {
      ctx.fillStyle = a;
      roundFill(ctx, x - w/2 - 4, y - h/2 - 4, w + 8, h + 8, 6, a);
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 4, c);
      // pockets
      ctx.fillStyle = "#0a0a0a";
      const pkts = [[-w/2,-h/2],[0,-h/2],[w/2,-h/2],[-w/2,h/2],[0,h/2],[w/2,h/2]];
      for (const [px,py] of pkts) { ctx.beginPath(); ctx.arc(x+px,y+py,4,0,Math.PI*2); ctx.fill(); }
      // balls
      const bc = ["#fafaf9","#dc2626","#fcd34d","#3b82f6","#10b981"];
      for (let i = 0; i < bc.length; i++) {
        ctx.fillStyle = bc[i];
        ctx.beginPath(); ctx.arc(x - 20 + i*10, y, 3, 0, Math.PI*2); ctx.fill();
      }
      break;
    }
    case "dartboard": {
      const r = w/2;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = a;
      ctx.beginPath(); ctx.arc(x, y, r*0.7, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x, y, r*0.4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#16a34a";
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill();
      break;
    }
    case "fishtank": {
      ctx.fillStyle = "rgba(14,165,233,0.7)";
      ctx.fillRect(x - w/2, y - h/2, w, h);
      ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 2;
      ctx.strokeRect(x - w/2, y - h/2, w, h);
      ctx.fillStyle = "#fcd34d";
      ctx.beginPath();
      ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y - 3); ctx.lineTo(x + 4, y + 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(x - w/2, y + h/2 - 6, w, 6);
      break;
    }
    case "fireplace": {
      ctx.fillStyle = c;
      ctx.fillRect(x - w/2, y - h/2, w, h);
      // fire box
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(x - w/2 + 10, y - h/2 + 10, w - 20, h - 14);
      // flames
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.moveTo(x - 14, y + h/2 - 6);
      ctx.quadraticCurveTo(x - 6, y - 6, x, y + h/2 - 14);
      ctx.quadraticCurveTo(x + 6, y - 4, x + 14, y + h/2 - 6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fcd34d";
      ctx.beginPath();
      ctx.moveTo(x - 6, y + h/2 - 6);
      ctx.quadraticCurveTo(x, y, x + 6, y + h/2 - 6);
      ctx.closePath(); ctx.fill();
      break;
    }
    case "hottub": {
      ctx.fillStyle = a;
      ctx.beginPath(); ctx.arc(x, y, w/2, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x, y, w/2 - 6, 0, Math.PI*2); ctx.fill();
      // bubbles
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + (Date.now() / 400);
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * (w/3), y + Math.sin(ang) * (h/3), 2, 0, Math.PI*2);
        ctx.fill();
      }
      break;
    }
    case "treadmill": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h*0.7, 4, c);
      ctx.fillStyle = a;
      ctx.fillRect(x - w/2 + 4, y, w - 8, h*0.3);
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(x - 10, y - h/2 + 4, 20, 6);
      break;
    }
    case "piano": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 4, c);
      // keys
      ctx.fillStyle = "#fff";
      ctx.fillRect(x - w/2 + 6, y + h/4, w - 12, 12);
      ctx.fillStyle = "#0a0a0a";
      for (let i = 1; i < 8; i++) {
        ctx.fillRect(x - w/2 + 6 + i * (w-12)/8, y + h/4, 2, 8);
      }
      break;
    }
    case "vending": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 4, c);
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(x - w/2 + 4, y - h/2 + 4, w - 8, h*0.6);
      ctx.fillStyle = a;
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 3; j++)
          ctx.fillRect(x - w/2 + 6 + j*8, y - h/2 + 6 + i*8, 6, 6);
      break;
    }
    case "safe": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 4, c);
      ctx.fillStyle = a;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#0a0a0a";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y - 5); ctx.stroke();
      break;
    }
    case "slotmachine": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 4, c);
      ctx.fillStyle = a;
      ctx.fillRect(x - w/2 + 4, y - h/4, w - 8, h*0.4);
      // reels
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(x - w/2 + 6, y - h/4 + 2, w - 12, h*0.35);
      // lever
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(x + w/2 - 2, y - h/4, 3, h/3);
      break;
    }
    case "punching": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2 + 6, w, h - 8, 8, c);
      ctx.strokeStyle = a; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - h/2 + 6); ctx.lineTo(x, y - h/2);
      ctx.stroke();
      break;
    }
    case "console": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 3, c);
      ctx.fillStyle = a;
      ctx.fillRect(x - w/2 + 4, y - h/2 + 3, w - 8, 2);
      break;
    }
    case "grandfatherclock": {
      ctx.fillStyle = c;
      roundFill(ctx, x - w/2, y - h/2, w, h, 4, c);
      ctx.fillStyle = a;
      ctx.beginPath(); ctx.arc(x, y - h/2 + 18, 12, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#0a0a0a";
      ctx.beginPath(); ctx.moveTo(x, y - h/2 + 18); ctx.lineTo(x, y - h/2 + 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - h/2 + 18); ctx.lineTo(x + 6, y - h/2 + 18); ctx.stroke();
      break;
    }
    case "curtain": {
      ctx.fillStyle = c;
      ctx.fillRect(x - w/2, y - h/2, w, h);
      ctx.strokeStyle = a; ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(x - w/2 + i*(w/6), y - h/2);
        ctx.lineTo(x - w/2 + i*(w/6), y + h/2);
        ctx.stroke();
      }
      break;
    }
    case "globe": {
      ctx.fillStyle = "#7c4a18";
      ctx.fillRect(x - 10, y + h/2 - 8, 20, 8);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x, y - 4, w/2, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = a;
      ctx.beginPath(); ctx.arc(x - 3, y - 6, 4, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 4, y, 3, 0, Math.PI*2); ctx.fill();
      break;
    }
    case "trash": {
      ctx.fillStyle = c;
      ctx.fillRect(x - w/2, y - h/2 + 4, w, h - 4);
      ctx.fillStyle = a;
      ctx.fillRect(x - w/2 - 2, y - h/2, w + 4, 4);
      break;
    }
    default: {
      ctx.fillStyle = c || "#888";
      ctx.fillRect(x - w/2, y - h/2, w, h);
      ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1;
      ctx.strokeRect(x - w/2, y - h/2, w, h);
    }
  }
  // selection highlight (build mode)
  if (opts.selected) {
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x - w/2 - 3, y - h/2 - 3, w + 6, h + 6);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

// ---------- helpers ----------
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
function roundFill(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, r, true, false);
}
function roundStroke(ctx, x, y, w, h, r) {
  roundRect(ctx, x, y, w, h, r, false, true);
}
function shadeColor(hex, amt) {
  if (!hex || !hex.startsWith("#")) return "#888";
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 0xff) + amt, b = (n & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

window.GFX = {
  drawCharacter, drawNameAndBubble, drawChatStack, drawBuildingBox, drawTower, drawHouse,
  CHAT_STACK_MAX, CHAT_TTL,
  drawFurniture, roundRect, roundFill, roundStroke, shadeColor,
  DEFAULT_APPEARANCE, EMOTES, EMOTE_TTL, drawAura, drawPet,
  HOUSE_WALLS, HOUSE_ROOFS,
};
