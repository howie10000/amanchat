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

// Every non-tower building gets its own dedicated renderer below. They all
// respect the same contract as the collision code in world.js: the solid box
// is b.y+24 .. b.y+b.h-4, the door gap is centred on b.x+b.w/2 with half-width
// (b.doorHalf || 22) (60 for the grand Town Hall) in the bottom 30px (50px for
// Town Hall). Decoration may rise above b.y and poke slightly past the sides,
// but the pavement in front of the door stays flat (steps / mats / light only).
function drawBuildingBox(ctx, b) {
  if (b.tower) return drawTower(ctx, b);
  const fn = BUILDING_RENDERERS[b.type] || drawGenericShop;
  fn(ctx, b);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

// ---- shared helpers for the town buildings ----
const TB = {
  // Soft drop shadow + pavement apron in front of the door. `steps` draws a
  // flight of thin steps instead of a welcome mat.
  ground(ctx, b, half, o) {
    o = o || {};
    const cx = b.x + b.w / 2, base = b.y + b.h;
    ctx.fillStyle = "rgba(0,0,0,.30)";
    ctx.beginPath(); ctx.ellipse(cx + 6, base + 3, b.w * 0.56, 11, 0, 0, Math.PI * 2); ctx.fill();
    const aw = o.apronW || half * 2 + 32;
    ctx.fillStyle = o.apron || "#cfc9c0";
    ctx.fillRect(cx - aw / 2, base, aw, o.apronH || 22);
    ctx.fillStyle = "rgba(0,0,0,.14)";
    ctx.fillRect(cx - aw / 2, base, aw, 2);
    if (o.steps) {
      for (let i = 0; i < o.steps; i++) {
        ctx.fillStyle = i % 2 ? (o.stepA || "#b9b2a8") : (o.stepB || "#cbc4ba");
        ctx.fillRect(cx - aw / 2 - i * 5, base + i * 6, aw + i * 10, 6);
        ctx.fillStyle = "rgba(0,0,0,.16)";
        ctx.fillRect(cx - aw / 2 - i * 5, base + i * 6 + 5, aw + i * 10, 1);
      }
    } else {
      ctx.fillStyle = o.mat || "#7f1d1d";
      ctx.fillRect(cx - half + 3, base + 5, half * 2 - 6, 12);
      ctx.fillStyle = "rgba(255,255,255,.16)";
      ctx.fillRect(cx - half + 6, base + 8, half * 2 - 12, 6);
    }
  },
  // Warm light spilling out of a doorway onto the pavement.
  spill(ctx, cx, base, w, col, a) {
    ctx.fillStyle = `rgba(${col},${a})`;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, base); ctx.lineTo(cx + w / 2, base);
    ctx.lineTo(cx + w / 2 + 12, base + 20); ctx.lineTo(cx - w / 2 - 12, base + 20);
    ctx.closePath(); ctx.fill();
  },
  // Sign plate with centred text.
  plate(ctx, x, y, w, h, text, bg, fg, border, font) {
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, h, 4, true, false);
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1.5; roundRect(ctx, x, y, w, h, 4, false, true); }
    ctx.fillStyle = fg;
    ctx.font = font || "bold 13px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    ctx.textBaseline = "alphabetic";
  },
  // Real-time analogue clock.
  clock(ctx, x, y, r, face, rim, hands) {
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rim; ctx.lineWidth = Math.max(2, r / 6);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = hands;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const L = i % 3 ? 2 : 4;
      ctx.fillRect(x + Math.cos(a) * (r - 4) - 1, y + Math.sin(a) * (r - 4) - 1, L > 2 ? 2 : 1.5, L > 2 ? 2 : 1.5);
    }
    const d = new Date();
    ctx.strokeStyle = hands; ctx.lineCap = "round";
    for (const [len, val, per, lw] of [[r * 0.5, d.getHours() % 12 + d.getMinutes() / 60, 12, 2.5], [r * 0.75, d.getMinutes() + d.getSeconds() / 60, 60, 1.8]]) {
      const a = (val / per) * Math.PI * 2 - Math.PI / 2;
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
    }
    ctx.lineCap = "butt";
    ctx.fillStyle = hands;
    ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
  },
  // A flag flying to the right of (x, y) that ripples in the wind.
  flag(ctx, x, y, w, h, col, t, seed) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let i = 0; i <= 6; i++) ctx.lineTo(x + i * w / 6, y + Math.sin(t / 170 + i * 0.9 + seed) * 3 * (i / 6));
    for (let i = 6; i >= 0; i--) ctx.lineTo(x + i * w / 6, y + h + Math.sin(t / 170 + i * 0.9 + seed) * 3 * (i / 6));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.fillRect(x, y, 2, h);
  },
  // A window whose light breathes slowly. `seed` decorrelates neighbours.
  litWindow(ctx, x, y, w, h, t, seed, frame, warm) {
    const l = 0.5 + 0.5 * Math.sin(t / 2400 + seed * 1.7);
    ctx.fillStyle = warm === false ? `rgba(180,220,255,${0.45 + 0.4 * l})` : `rgba(255,${205 + (20 * l) | 0},${110 + (40 * l) | 0},${0.55 + 0.4 * l})`;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fillRect(x, y, w, Math.max(2, h * 0.12));
    if (frame) { ctx.strokeStyle = frame; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h); }
  },
  // Simple flame (no shadowBlur — cheap enough for loops).
  flame(ctx, x, y, s, t, seed) {
    const f = 0.75 + 0.25 * Math.sin(t / 90 + seed) + 0.1 * Math.sin(t / 37 + seed * 3);
    const lean = Math.sin(t / 140 + seed) * 1.5;
    ctx.fillStyle = `rgba(251,146,60,${0.25})`;
    ctx.beginPath(); ctx.arc(x, y - s * 0.4, s * 1.5 * f, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fb923c";
    ctx.beginPath(); ctx.ellipse(x + lean * 0.5, y - s * 0.5, s * 0.55, s * f, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fde68a";
    ctx.beginPath(); ctx.ellipse(x + lean * 0.3, y - s * 0.35, s * 0.28, s * 0.55 * f, 0, 0, Math.PI * 2); ctx.fill();
  },
  // Rotating searchlight / spotlight beam from (x, y), angle a radians from "up".
  beam(ctx, x, y, a, len, col, spread) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, 0, -len);
    g.addColorStop(0, `rgba(${col},.30)`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.lineTo(spread || 22, -len); ctx.lineTo(-(spread || 22), -len);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  },
  // Scalloped striped awning.
  awning(ctx, x, y, w, h, c1, c2, step) {
    step = step || 16;
    for (let i = 0; i * step < w; i++) {
      ctx.fillStyle = i % 2 ? c1 : c2;
      ctx.fillRect(x + i * step, y, Math.min(step, w - i * step), h);
    }
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(x, y + h - 3, w, 3);
    for (let i = 0; i * step < w; i++) {
      ctx.fillStyle = i % 2 ? c1 : c2;
      ctx.beginPath(); ctx.arc(x + i * step + step / 2, y + h, step / 2, 0, Math.PI); ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.fillRect(x, y, w, 3);
  },
  // Potted plant.
  plant(ctx, x, y, t, seed) {
    ctx.fillStyle = "#9a3412";
    ctx.fillRect(x - 7, y - 12, 14, 12);
    ctx.fillStyle = "#c2410c";
    ctx.fillRect(x - 8, y - 14, 16, 4);
    const sway = Math.sin(t / 900 + seed) * 1.5;
    ctx.fillStyle = "#15803d";
    ctx.beginPath(); ctx.ellipse(x + sway, y - 22, 9, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#22c55e";
    ctx.beginPath(); ctx.ellipse(x + sway - 3, y - 26, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + sway + 4, y - 25, 4, 4, 0, 0, Math.PI * 2); ctx.fill();
  },
};

// ================= TOWN HALL =================
// Neoclassical civic palace: domed rotunda with a gold lantern, pediment with
// a working clock, six fluted columns, a 120px-wide arched portal (matching the
// grand door gap), grand stair, twin flagpoles.
function drawTownHall(ctx, b) {
  const t = Date.now();
  const cx = b.x + b.w / 2, base = b.y + b.h, half = 60;
  const CREAM = "#f4ecd9", CREAM_DK = "#dccfb3", STONE = "#bfb195", GOLD = "#d4a017", GOLD_LT = "#f7dc84";

  // Ground + grand stair spanning the whole facade
  TB.ground(ctx, b, half, { steps: 4, apronW: b.w + 12, apron: "#d8d2c8" });

  // ---- Dome (behind the pediment) ----
  ctx.fillStyle = CREAM_DK;
  ctx.fillRect(cx - 40, b.y - 4, 80, 64);          // drum
  ctx.fillStyle = "rgba(0,0,0,.12)";
  for (let i = 0; i < 6; i++) ctx.fillRect(cx - 40 + i * 15, b.y - 2, 3, 58);  // drum pilasters
  const domeG = ctx.createLinearGradient(cx - 48, 0, cx + 48, 0);
  domeG.addColorStop(0, "#5b8a72"); domeG.addColorStop(0.45, "#8fc4a6"); domeG.addColorStop(1, "#3f6b56");
  ctx.fillStyle = domeG;
  ctx.beginPath(); ctx.arc(cx, b.y - 2, 40, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {                     // dome ribs
    const a = Math.PI + i * Math.PI / 5;
    ctx.beginPath(); ctx.moveTo(cx, b.y - 2); ctx.lineTo(cx + Math.cos(a) * 40, b.y - 2 + Math.sin(a) * 40); ctx.stroke();
  }
  // Lantern + gold finial
  ctx.fillStyle = CREAM;
  ctx.fillRect(cx - 7, b.y - 50, 14, 12);
  ctx.fillStyle = "rgba(0,0,0,.2)";
  ctx.fillRect(cx - 4, b.y - 48, 3, 8); ctx.fillRect(cx + 1, b.y - 48, 3, 8);
  ctx.fillStyle = GOLD;
  ctx.beginPath(); ctx.moveTo(cx - 10, b.y - 50); ctx.lineTo(cx, b.y - 55); ctx.lineTo(cx + 10, b.y - 50); ctx.closePath(); ctx.fill();
  const shine = 0.5 + 0.5 * Math.sin(t / 600);
  ctx.fillStyle = `rgba(255,230,140,${0.25 + 0.25 * shine})`;
  ctx.beginPath(); ctx.arc(cx, b.y - 50, 4 + 1 * shine, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = GOLD_LT;
  ctx.beginPath(); ctx.arc(cx, b.y - 51, 2.5, 0, Math.PI * 2); ctx.fill();

  // ---- Flagpoles ----
  for (const s of [-1, 1]) {
    const px = cx + s * (b.w / 2 - 6);
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(px - 1.5, b.y - 40, 3, 102);
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(px, b.y - 42, 3, 0, Math.PI * 2); ctx.fill();
    TB.flag(ctx, px + 1.5, b.y - 36, 30, 18, s < 0 ? "#dc2626" : "#1d4ed8", t, s * 2);
    ctx.fillStyle = "#fde68a";
    ctx.beginPath(); ctx.arc(px + 12, b.y - 27 + Math.sin(t / 170 + 2.2 + s * 2) * 1.5, 3, 0, Math.PI * 2); ctx.fill();
  }

  // ---- Main wall ----
  const wallG = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
  wallG.addColorStop(0, CREAM_DK); wallG.addColorStop(0.5, CREAM); wallG.addColorStop(1, CREAM_DK);
  ctx.fillStyle = wallG;
  ctx.fillRect(b.x, b.y + 74, b.w, b.h - 74);
  ctx.fillStyle = "rgba(0,0,0,.06)";
  for (let yy = b.y + 86; yy < base; yy += 14) ctx.fillRect(b.x, yy, b.w, 1.5);
  // rusticated plinth
  ctx.fillStyle = STONE;
  ctx.fillRect(b.x, base - 14, b.w, 14);
  ctx.fillStyle = "rgba(0,0,0,.12)";
  for (let xx = b.x; xx < b.x + b.w; xx += 24) ctx.fillRect(xx, base - 14, 1.5, 14);

  // Tall arched windows between the columns
  for (const s of [-1, 1]) {
    for (const off of [79, 105]) {
      const wx = cx + s * off - 6;
      ctx.fillStyle = "#6b5a3a";
      ctx.fillRect(wx - 1, b.y + 92, 14, 58);
      TB.litWindow(ctx, wx, b.y + 94, 12, 54, t, off + s * 3, null, true);
    }
  }

  // ---- Columns ----
  for (const s of [-1, 1]) {
    for (const off of [66, 92, 118]) {
      const colx = cx + s * off;
      const g = ctx.createLinearGradient(colx - 6, 0, colx + 6, 0);
      g.addColorStop(0, "#d9cfb6"); g.addColorStop(0.35, "#fffaf0"); g.addColorStop(1, "#b7aa8c");
      ctx.fillStyle = g;
      ctx.fillRect(colx - 6, b.y + 80, 12, base - 22 - b.y - 80);
      ctx.fillStyle = "rgba(0,0,0,.10)";
      for (let f = 0; f < 3; f++) ctx.fillRect(colx - 4 + f * 4, b.y + 84, 1, base - 30 - b.y - 84);
      ctx.fillStyle = "#fffaf0";
      ctx.fillRect(colx - 9, b.y + 74, 18, 7);       // capital
      ctx.fillRect(colx - 9, base - 22, 18, 8);      // base
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.fillRect(colx - 9, b.y + 80, 18, 1); ctx.fillRect(colx - 9, base - 22, 18, 1);
    }
  }

  // ---- Entablature with the frieze inscription ----
  ctx.fillStyle = CREAM;
  ctx.fillRect(b.x - 6, b.y + 56, b.w + 12, 20);
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.fillRect(b.x - 6, b.y + 56, b.w + 12, 2); ctx.fillRect(b.x - 6, b.y + 74, b.w + 12, 2);
  ctx.fillStyle = "#7c2d12";
  ctx.font = "bold 15px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(b.label, cx, b.y + 67);
  ctx.fillStyle = GOLD;
  ctx.fillRect(cx - 100, b.y + 66, 28, 2); ctx.fillRect(cx + 72, b.y + 66, 28, 2);

  // ---- Pediment with clock ----
  ctx.fillStyle = CREAM;
  ctx.beginPath(); ctx.moveTo(b.x - 6, b.y + 56); ctx.lineTo(cx, b.y + 12); ctx.lineTo(b.x + b.w + 6, b.y + 56); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = CREAM_DK;
  ctx.beginPath(); ctx.moveTo(b.x + 14, b.y + 52); ctx.lineTo(cx, b.y + 22); ctx.lineTo(b.x + b.w - 14, b.y + 52); ctx.closePath(); ctx.fill();
  TB.clock(ctx, cx, b.y + 40, 13, "#fffbeb", "#7c2d12", "#1f2937");
  ctx.fillStyle = GOLD;                              // laurel accents
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.ellipse(cx + s * (22 + i * 9), b.y + 48 - i * 2, 4, 2, s * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---- Grand arched portal (120px wide, 50px tall gap) ----
  const dh = 64;
  ctx.fillStyle = "#3b2a14";
  ctx.beginPath(); ctx.moveTo(cx - half - 4, base); ctx.lineTo(cx - half - 4, base - dh + 24);
  ctx.arc(cx, base - dh + 24, half + 4, Math.PI, 0); ctx.lineTo(cx + half + 4, base); ctx.closePath(); ctx.fill();
  const glow = ctx.createLinearGradient(0, base - dh, 0, base);
  glow.addColorStop(0, "rgba(255,214,130,.85)"); glow.addColorStop(1, "rgba(255,190,90,.35)");
  ctx.fillStyle = "#1a120a";
  ctx.beginPath(); ctx.moveTo(cx - half, base); ctx.lineTo(cx - half, base - dh + 24);
  ctx.arc(cx, base - dh + 24, half, Math.PI, 0); ctx.lineTo(cx + half, base); ctx.closePath(); ctx.fill();
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.moveTo(cx - half + 6, base); ctx.lineTo(cx - half + 6, base - dh + 24);
  ctx.arc(cx, base - dh + 24, half - 6, Math.PI, 0); ctx.lineTo(cx + half - 6, base); ctx.closePath(); ctx.fill();
  // fanlight spokes
  ctx.strokeStyle = "#3b2a14"; ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    const a = Math.PI + i * Math.PI / 6;
    ctx.beginPath(); ctx.moveTo(cx, base - dh + 24); ctx.lineTo(cx + Math.cos(a) * half, base - dh + 24 + Math.sin(a) * half); ctx.stroke();
  }
  ctx.fillStyle = "#3b2a14";
  ctx.fillRect(cx - half, base - dh + 22, half * 2, 3);
  // three dark-oak doors with brass panels
  for (let i = 0; i < 3; i++) {
    const dx = cx - half + 4 + i * (half * 2 - 8) / 3, dw = (half * 2 - 8) / 3 - 4;
    ctx.fillStyle = "rgba(60,36,14,.55)";
    ctx.fillRect(dx, base - dh + 26, dw, dh - 26);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1;
    ctx.strokeRect(dx + 4, base - dh + 30, dw - 8, 12);
    ctx.strokeRect(dx + 4, base - dh + 46, dw - 8, 14);
    ctx.fillStyle = GOLD_LT;
    ctx.fillRect(dx + dw - 8, base - 22, 2.5, 7);
  }
  // lamps flanking the portal
  for (const s of [-1, 1]) {
    const lx = cx + s * (half + 16);
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(lx - 1.5, base - 52, 3, 30);
    ctx.fillStyle = `rgba(255,230,150,${0.75 + 0.2 * Math.sin(t / 300 + s)})`;
    ctx.beginPath(); ctx.moveTo(lx - 5, base - 52); ctx.lineTo(lx + 5, base - 52); ctx.lineTo(lx + 3, base - 62); ctx.lineTo(lx - 3, base - 62); ctx.closePath(); ctx.fill();
  }
  TB.spill(ctx, cx, base, half * 2, "255,214,120", 0.16 + 0.05 * shine);
}

// ================= FIRST BANK =================
// Granite temple of money: balustraded parapet, rotating gold coin sign, four
// columns, barred windows, a vault door standing ajar on a glowing interior,
// bronze lions, sweeping security lamps and a ticker of gold glints.
function drawBank(ctx, b) {
  const t = Date.now();
  const cx = b.x + b.w / 2, base = b.y + b.h, half = b.doorHalf || 22;
  const GOLD = "#d4a017", GOLD_LT = "#f7dc84";
  TB.ground(ctx, b, half, { steps: 3, apronW: 120, apron: "#bdb7ae", stepA: "#a39d94", stepB: "#b6b0a6" });

  // Security lamps sweep (behind facade)
  for (const s of [-1, 1]) {
    const a = Math.PI + Math.sin(t / 1900 + s) * 0.45;
    TB.beam(ctx, cx + s * (b.w / 2 - 22), b.y + 62, a, 120, "220,235,255", 16);
  }

  // Body
  const g = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
  g.addColorStop(0, "#6b7280"); g.addColorStop(0.5, "#9ca3af"); g.addColorStop(1, "#5b6470");
  ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y + 24, b.w, b.h - 24);
  ctx.fillStyle = "rgba(0,0,0,.14)";                  // granite courses
  for (let yy = b.y + 60; yy < base; yy += 16) {
    ctx.fillRect(b.x, yy, b.w, 1.5);
    for (let xx = b.x + ((yy / 16 | 0) % 2 ? 0 : 20); xx < b.x + b.w; xx += 40) ctx.fillRect(xx, yy, 1.5, 16);
  }
  ctx.fillStyle = "rgba(255,255,255,.08)";
  ctx.fillRect(b.x, b.y + 24, b.w, 6);

  // Parapet with balusters + attic block
  ctx.fillStyle = "#4b5563";
  ctx.fillRect(b.x - 6, b.y + 20, b.w + 12, 8);
  ctx.fillStyle = "#9ca3af";
  ctx.fillRect(b.x - 6, b.y + 6, b.w + 12, 4);
  for (let xx = b.x - 2; xx < b.x + b.w + 4; xx += 10) ctx.fillRect(xx, b.y + 10, 4, 10);
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(cx - 44, b.y - 6, 88, 30);
  ctx.fillStyle = "#374151";
  ctx.fillRect(cx - 48, b.y - 10, 96, 5);

  // Rotating coin sign on a bracket above the attic
  ctx.fillStyle = "#374151";
  ctx.fillRect(cx - 1.5, b.y - 44, 3, 36);
  const sx = Math.cos(t / 700);
  ctx.save();
  ctx.translate(cx, b.y - 44);
  ctx.scale(Math.max(0.08, Math.abs(sx)), 1);
  ctx.fillStyle = sx > 0 ? GOLD : "#a67c0f";
  ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = GOLD_LT; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#3b2a05";
  ctx.font = "bold 22px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("$", 0, 1);
  ctx.restore();
  const gl = 0.5 + 0.5 * Math.sin(t / 350);
  ctx.fillStyle = `rgba(255,220,120,${0.15 + 0.15 * gl})`;
  ctx.beginPath(); ctx.arc(cx, b.y - 44, 24 + 4 * gl, 0, Math.PI * 2); ctx.fill();

  // Entablature with name + gold glint ticker
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(b.x - 4, b.y + 34, b.w + 8, 26);
  ctx.fillStyle = GOLD;
  ctx.fillRect(b.x - 4, b.y + 34, b.w + 8, 2); ctx.fillRect(b.x - 4, b.y + 58, b.w + 8, 2);
  ctx.fillStyle = GOLD_LT;
  ctx.font = "bold 15px Georgia, 'Times New Roman', serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(b.label, cx, b.y + 47);
  for (let i = 0; i < 6; i++) {                        // ticker of glints sliding along the cornice
    const gx = b.x + ((t / 18 + i * 60) % (b.w + 8)) - 4;
    const ga = 0.5 + 0.5 * Math.sin(t / 120 + i);
    ctx.fillStyle = `rgba(255,236,160,${ga})`;
    ctx.fillRect(gx - 4, b.y + 33, 8, 1.5); ctx.fillRect(gx - 1, b.y + 30, 2, 7);
  }

  // Columns + barred windows between them
  for (const s of [-1, 1]) {
    const wx = cx + s * 59 - 9;
    ctx.fillStyle = "#111827";
    ctx.fillRect(wx, b.y + 72, 18, 60);
    TB.litWindow(ctx, wx + 2, b.y + 74, 14, 56, t, s * 3, null, true);
    ctx.fillStyle = "#1f2937";
    for (let i = 0; i < 3; i++) ctx.fillRect(wx + 4 + i * 5, b.y + 72, 1.5, 60);
    ctx.fillRect(wx, b.y + 100, 18, 1.5);
    for (const off of [40, 78]) {
      const colx = cx + s * off;
      const cg = ctx.createLinearGradient(colx - 7, 0, colx + 7, 0);
      cg.addColorStop(0, "#9ca3af"); cg.addColorStop(0.4, "#e5e7eb"); cg.addColorStop(1, "#6b7280");
      ctx.fillStyle = cg;
      ctx.fillRect(colx - 7, b.y + 66, 14, base - 20 - b.y - 66);
      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(colx - 10, b.y + 60, 20, 7); ctx.fillRect(colx - 10, base - 20, 20, 8);
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.fillRect(colx - 10, b.y + 66, 20, 1); ctx.fillRect(colx - 10, base - 20, 20, 1);
    }
  }

  // Vault entrance: dark opening + glowing interior + door swung ajar
  const dh = 46;
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(cx - half - 6, base - dh - 6, half * 2 + 12, dh + 6);
  const vg = ctx.createLinearGradient(0, base - dh, 0, base);
  vg.addColorStop(0, `rgba(255,214,110,${0.6 + 0.2 * gl})`); vg.addColorStop(1, "rgba(255,190,90,.2)");
  ctx.fillStyle = vg;
  ctx.fillRect(cx - half, base - dh, half * 2, dh);
  ctx.fillStyle = GOLD;                                // gold bars glinting inside
  for (let i = 0; i < 3; i++) ctx.fillRect(cx - 12 + i * 9, base - 12, 7, 4);
  ctx.save();                                          // the round vault door, ajar on the left hinge
  ctx.translate(cx - half + 2, base - dh / 2 - 2);
  ctx.scale(0.42, 1);
  ctx.fillStyle = "#64748b";
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = GOLD_LT; ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const a = t / 1600 + i * Math.PI / 3;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * -13, Math.sin(a) * -13); ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); ctx.stroke();
  }
  ctx.fillStyle = "#cbd5e1";
  ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 2;
  ctx.strokeRect(cx - half - 6, base - dh - 6, half * 2 + 12, dh + 6);

  // Bronze lions on plinths flanking the steps
  for (const s of [-1, 1]) {
    const lx = cx + s * 86;
    ctx.fillStyle = "#4b5563";
    ctx.fillRect(lx - 14, base - 12, 28, 12);
    ctx.fillStyle = "#374151";
    ctx.fillRect(lx - 16, base - 14, 32, 3);
    ctx.fillStyle = "#92400e";
    ctx.beginPath(); ctx.ellipse(lx + s * 2, base - 22, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#78350f";
    ctx.beginPath(); ctx.arc(lx - s * 9, base - 30, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#b45309";
    ctx.beginPath(); ctx.arc(lx - s * 10, base - 30, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fde68a";
    ctx.fillRect(lx - s * 12 - 1, base - 31, 2, 2);
    ctx.fillStyle = "#92400e";
    ctx.fillRect(lx - 10, base - 18, 4, 6); ctx.fillRect(lx + 6, base - 18, 4, 6);
  }
  // security lamp fixtures
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#111827";
    ctx.fillRect(cx + s * (b.w / 2 - 22) - 5, b.y + 58, 10, 6);
    ctx.fillStyle = "#e0f2fe";
    ctx.fillRect(cx + s * (b.w / 2 - 22) - 3, b.y + 63, 6, 2);
  }
  TB.spill(ctx, cx, base, half * 2 + 4, "255,214,120", 0.12 + 0.05 * gl);
}

// ================= FURNITURELAND =================
// Big-box showroom with a stage-lit display window that cycles a turntable of
// furniture, a striped canopy, and a giant armchair rocking on the roof.
function drawFurnitureland(ctx, b) {
  const t = Date.now();
  const cx = b.x + b.w / 2, base = b.y + b.h, half = b.doorHalf || 22;
  const PURPLE = "#5b21b6", PURPLE_DK = "#3b0d8e", ORANGE = "#f59e0b";
  TB.ground(ctx, b, half, { mat: "#6d28d9", apron: "#d6d0c8" });

  // Body: cream panels with purple base band
  const g = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
  g.addColorStop(0, "#e9e2f5"); g.addColorStop(0.5, "#f8f5fd"); g.addColorStop(1, "#ddd3ee");
  ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y + 24, b.w, b.h - 24);
  ctx.fillStyle = "rgba(0,0,0,.05)";
  for (let xx = b.x + 20; xx < b.x + b.w; xx += 40) ctx.fillRect(xx, b.y + 24, 2, b.h - 24);
  ctx.fillStyle = PURPLE_DK;
  ctx.fillRect(b.x, base - 10, b.w, 10);
  // Roof parapet
  ctx.fillStyle = PURPLE;
  ctx.fillRect(b.x - 4, b.y + 20, b.w + 8, 10);
  ctx.fillStyle = "rgba(255,255,255,.2)";
  ctx.fillRect(b.x - 4, b.y + 20, b.w + 8, 3);

  // Rooftop sign
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(cx - 82, b.y - 14, 4, 34); ctx.fillRect(cx + 78, b.y - 14, 4, 34);
  TB.plate(ctx, cx - 90, b.y - 26, 180, 30, b.label, PURPLE, "#fde68a", ORANGE, "bold 17px sans-serif");
  // Giant rocking armchair on the roof (right)
  const rock = Math.sin(t / 700) * 0.06;
  ctx.save();
  ctx.translate(b.x + b.w - 34, b.y + 20);
  ctx.rotate(rock);
  ctx.fillStyle = ORANGE;
  roundRect(ctx, -24, -46, 48, 30, 8, true, false);   // back
  ctx.fillStyle = "#d97706";
  roundRect(ctx, -26, -22, 52, 18, 6, true, false);   // seat
  ctx.fillStyle = ORANGE;
  roundRect(ctx, -30, -30, 10, 26, 4, true, false);   // arms
  roundRect(ctx, 20, -30, 10, 26, 4, true, false);
  ctx.fillStyle = "#92400e";
  ctx.fillRect(-22, -4, 5, 6); ctx.fillRect(17, -4, 5, 6);
  ctx.fillStyle = "rgba(255,255,255,.25)";
  roundRect(ctx, -20, -42, 40, 8, 4, true, false);
  ctx.restore();
  // floor lamp on the roof (left) with a glowing shade
  ctx.fillStyle = "#374151";
  ctx.fillRect(b.x + 28, b.y - 20, 3, 40); ctx.fillRect(b.x + 20, b.y + 17, 19, 3);
  const lg = 0.7 + 0.3 * Math.sin(t / 900);
  ctx.fillStyle = `rgba(253,224,71,${0.2 * lg})`;
  ctx.beginPath(); ctx.arc(b.x + 29.5, b.y - 22, 20, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fde68a";
  ctx.beginPath(); ctx.moveTo(b.x + 18, b.y - 20); ctx.lineTo(b.x + 41, b.y - 20); ctx.lineTo(b.x + 36, b.y - 36); ctx.lineTo(b.x + 23, b.y - 36); ctx.closePath(); ctx.fill();

  // Striped canopy
  TB.awning(ctx, b.x + 6, b.y + 34, b.w - 12, 14, "#7c3aed", "#fbbf24", 18);

  // ---- Showroom window (stage) ----
  const wx = b.x + 12, wy = b.y + 56, ww = b.w - 24, wh = base - 48 - wy;
  const stage = ctx.createLinearGradient(0, wy, 0, wy + wh);
  stage.addColorStop(0, "#1e1b4b"); stage.addColorStop(0.7, "#312e81"); stage.addColorStop(1, "#4c1d95");
  ctx.fillStyle = stage;
  ctx.fillRect(wx, wy, ww, wh);
  ctx.fillStyle = "#3730a3";
  ctx.fillRect(wx, wy + wh - 10, ww, 10);              // stage floor
  // three spotlights from the top rail
  for (let i = 0; i < 3; i++) {
    const lx = wx + ww * (0.25 + 0.25 * i);
    const sw = Math.sin(t / 1300 + i * 2) * 0.25;
    ctx.save();
    ctx.translate(lx, wy);
    ctx.rotate(sw);
    ctx.fillStyle = `rgba(255,240,200,${0.14 + 0.05 * Math.sin(t / 400 + i)})`;
    ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.lineTo(26, wh); ctx.lineTo(-26, wh); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#111827";
    ctx.fillRect(lx - 5, wy, 10, 6);
  }
  // turntable of furniture: 4 items, each on for ~3.2s with a fade
  const CYC = 3200, n = 4;
  const idx = Math.floor(t / CYC) % n, ph = (t % CYC) / CYC;
  const fade = ph < 0.15 ? ph / 0.15 : ph > 0.85 ? (1 - ph) / 0.15 : 1;
  const spin = Math.cos(t / 900);
  ctx.save();
  ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
  ctx.translate(cx, wy + wh - 12);
  ctx.globalAlpha = fade;
  ctx.scale(0.35 + 0.65 * Math.abs(spin), 1);
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath(); ctx.ellipse(0, 4, 44, 5, 0, 0, Math.PI * 2); ctx.fill();
  if (idx === 0) {                                     // sofa
    ctx.fillStyle = "#0ea5e9";
    roundRect(ctx, -36, -30, 72, 14, 5, true, false);
    roundRect(ctx, -38, -18, 76, 16, 5, true, false);
    ctx.fillStyle = "#38bdf8";
    roundRect(ctx, -32, -18, 30, 11, 4, true, false); roundRect(ctx, 2, -18, 30, 11, 4, true, false);
    ctx.fillStyle = "#7c4a18";
    ctx.fillRect(-34, -2, 5, 5); ctx.fillRect(29, -2, 5, 5);
  } else if (idx === 1) {                              // floor lamp
    ctx.fillStyle = "#7c4a18";
    ctx.fillRect(-2, -48, 4, 48); ctx.fillRect(-12, -3, 24, 4);
    ctx.fillStyle = "#fde68a";
    ctx.beginPath(); ctx.moveTo(-18, -48); ctx.lineTo(18, -48); ctx.lineTo(12, -68); ctx.lineTo(-12, -68); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(253,224,71,.25)";
    ctx.beginPath(); ctx.arc(0, -48, 22, 0, Math.PI); ctx.fill();
  } else if (idx === 2) {                              // bed
    ctx.fillStyle = "#7c4a18";
    ctx.fillRect(-42, -40, 6, 40); ctx.fillRect(36, -26, 6, 26);
    ctx.fillStyle = "#f472b6";
    roundRect(ctx, -40, -22, 80, 18, 4, true, false);
    ctx.fillStyle = "#fbcfe8";
    roundRect(ctx, -40, -22, 80, 6, 3, true, false);
    ctx.fillStyle = "#fff";
    roundRect(ctx, -36, -30, 22, 9, 3, true, false);
  } else {                                             // armchair
    ctx.fillStyle = "#f59e0b";
    roundRect(ctx, -18, -40, 36, 24, 6, true, false);
    ctx.fillStyle = "#d97706";
    roundRect(ctx, -22, -20, 44, 16, 5, true, false);
    ctx.fillStyle = "#f59e0b";
    roundRect(ctx, -26, -26, 9, 22, 4, true, false); roundRect(ctx, 17, -26, 9, 22, 4, true, false);
  }
  ctx.restore();
  // price tag swinging in the window
  ctx.save();
  ctx.translate(wx + ww - 26, wy);
  ctx.rotate(Math.sin(t / 800) * 0.12);
  ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 14); ctx.stroke();
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(-10, 14, 20, 12);
  ctx.fillStyle = "#7c2d12"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("SALE", 0, 21);
  ctx.restore();
  // glass reflection + frame
  ctx.fillStyle = "rgba(255,255,255,.10)";
  ctx.beginPath(); ctx.moveTo(wx, wy + wh); ctx.lineTo(wx + ww * 0.35, wy); ctx.lineTo(wx + ww * 0.5, wy); ctx.lineTo(wx + ww * 0.15, wy + wh); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#1f2937"; ctx.lineWidth = 3;
  ctx.strokeRect(wx, wy, ww, wh);
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(cx - 1.5, wy, 3, wh);

  // Sliding glass doors
  const dh = 42;
  ctx.fillStyle = "#312e81";
  ctx.fillRect(cx - half - 4, base - dh - 4, half * 2 + 8, dh + 4);
  ctx.fillStyle = `rgba(190,230,255,${0.75 + 0.1 * lg})`;
  ctx.fillRect(cx - half, base - dh, half * 2, dh);
  ctx.fillStyle = "rgba(255,255,255,.3)";
  ctx.fillRect(cx - half + 3, base - dh + 3, half - 5, dh - 8);
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(cx - 1, base - dh, 2, dh);
  ctx.fillStyle = "#7c3aed";
  ctx.fillRect(cx - half, base - dh + 20, half * 2, 3);
  // Shopping cart parked by the corner
  const kx = b.x + b.w - 30, ky = base + 6;
  ctx.strokeStyle = "#6b7280"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(kx - 12, ky); ctx.lineTo(kx - 9, ky + 10); ctx.lineTo(kx + 9, ky + 10); ctx.lineTo(kx + 12, ky); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(kx + 12, ky); ctx.lineTo(kx + 16, ky - 6); ctx.stroke();
  ctx.fillStyle = "#374151";
  ctx.beginPath(); ctx.arc(kx - 7, ky + 13, 2, 0, Math.PI * 2); ctx.arc(kx + 7, ky + 13, 2, 0, Math.PI * 2); ctx.fill();
  TB.spill(ctx, cx, base, half * 2, "200,230,255", 0.12);
}

// ================= MYSTERY BOXES =================
// Dark carnival magic shop: crooked roof and chimney, chasing-bulb marquee,
// spotlights, and a giant hovering box on the roof that pops open on a cycle
// and spews sparkles while question marks drift up.
function drawMysteryBoxes(ctx, b) {
  const t = Date.now();
  const cx = b.x + b.w / 2, base = b.y + b.h, half = b.doorHalf || 22;
  const PLUM = "#3b0764", PLUM_LT = "#6b21a8", GOLD = "#fbbf24";
  TB.ground(ctx, b, half, { mat: "#581c87", apron: "#c9c2d2" });

  // Spotlights behind everything
  for (const s of [-1, 1]) {
    const a = Math.sin(t / 1700 + s * 1.3) * 0.5 + s * 0.35;
    TB.beam(ctx, cx + s * (b.w / 2 - 20), b.y + 22, a, 150, "216,180,254", 20);
  }

  // Walls
  const g = ctx.createLinearGradient(0, b.y, 0, base);
  g.addColorStop(0, PLUM_LT); g.addColorStop(1, PLUM);
  ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y + 24, b.w, b.h - 24);
  ctx.fillStyle = "rgba(0,0,0,.18)";
  for (let yy = b.y + 40; yy < base - 12; yy += 14) {
    for (let xx = b.x + ((yy / 14 | 0) % 2 ? 0 : 14); xx < b.x + b.w - 8; xx += 28) ctx.fillRect(xx, yy, 24, 10);
  }
  ctx.fillStyle = "#1e0a3a";
  ctx.fillRect(b.x, base - 10, b.w, 10);
  ctx.fillStyle = GOLD;
  ctx.fillRect(b.x, base - 10, b.w, 1.5);

  // Crooked roof
  ctx.fillStyle = "#1e0a3a";
  ctx.beginPath(); ctx.moveTo(b.x - 8, b.y + 30); ctx.lineTo(cx - 24, b.y - 14); ctx.lineTo(b.x + b.w + 8, b.y + 26); ctx.lineTo(b.x + b.w + 8, b.y + 32); ctx.lineTo(b.x - 8, b.y + 36); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(b.x - 8, b.y + 30); ctx.lineTo(cx - 24, b.y - 14); ctx.lineTo(b.x + b.w + 8, b.y + 26); ctx.stroke();
  ctx.strokeStyle = "rgba(251,191,36,.25)"; ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath(); ctx.moveTo(b.x - 8 + i * 22, b.y + 30 - i * 9); ctx.lineTo(b.x + b.w + 8 - i * 24, b.y + 26 - i * 8.5); ctx.stroke();
  }
  // Crooked chimney with smoke
  ctx.save();
  ctx.translate(b.x + b.w - 44, b.y + 8);
  ctx.rotate(0.18);
  ctx.fillStyle = "#4c1d95";
  ctx.fillRect(-7, -30, 14, 34);
  ctx.fillStyle = "#2e1065";
  ctx.fillRect(-9, -34, 18, 6);
  ctx.restore();
  for (let i = 0; i < 4; i++) {
    const p = ((t / 1400) + i * 0.25) % 1;
    ctx.fillStyle = `rgba(216,180,254,${0.35 * (1 - p)})`;
    ctx.beginPath(); ctx.arc(b.x + b.w - 50 + p * 14 + Math.sin(p * 6 + i) * 4, b.y - 30 - p * 34, 3 + p * 6, 0, Math.PI * 2); ctx.fill();
  }

  // ---- The giant hovering mystery box ----
  const cyc = (t % 5200) / 5200;
  const open = cyc < 0.35 ? 0 : cyc < 0.5 ? (cyc - 0.35) / 0.15 : cyc < 0.8 ? 1 : 1 - (cyc - 0.8) / 0.2;
  const hover = Math.sin(t / 800) * 5;
  const bx = cx + 30, by = b.y - 34 + hover, bs = 36;
  ctx.fillStyle = "rgba(0,0,0,.25)";                   // shadow on the roof
  ctx.beginPath(); ctx.ellipse(bx, b.y + 4, 22 - hover, 5, 0, 0, Math.PI * 2); ctx.fill();
  if (open > 0) {                                      // light column + sparkles
    ctx.fillStyle = `rgba(253,224,71,${0.25 * open})`;
    ctx.beginPath(); ctx.moveTo(bx - bs / 2 + 4, by); ctx.lineTo(bx + bs / 2 - 4, by); ctx.lineTo(bx + 30, by - 90); ctx.lineTo(bx - 30, by - 90); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 10; i++) {
      const p = ((t / 900) + i * 0.1) % 1;
      const ang = i * 0.63;
      const px = bx + Math.sin(ang) * 30 * p, py = by - 8 - p * 70 + Math.sin(t / 200 + i) * 3;
      const ss = 2 + 2 * (1 - p);
      ctx.fillStyle = i % 3 === 0 ? `rgba(244,114,182,${open * (1 - p)})` : `rgba(253,224,71,${open * (1 - p)})`;
      ctx.beginPath(); ctx.moveTo(px, py - ss); ctx.lineTo(px + ss, py); ctx.lineTo(px, py + ss); ctx.lineTo(px - ss, py); ctx.closePath(); ctx.fill();
    }
  }
  ctx.fillStyle = "#db2777";                            // box body
  ctx.fillRect(bx - bs / 2, by, bs, bs);
  ctx.fillStyle = "#9d174d";
  ctx.fillRect(bx + bs / 2 - 8, by, 8, bs);
  ctx.fillStyle = GOLD;
  ctx.fillRect(bx - 3, by, 6, bs); ctx.fillRect(bx - bs / 2, by + bs / 2 - 3, bs, 6);
  ctx.strokeStyle = "#1e0a3a"; ctx.lineWidth = 1.5; ctx.strokeRect(bx - bs / 2, by, bs, bs);
  ctx.fillStyle = "#fde68a"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("?", bx - 10, by + bs * 0.72);
  ctx.save();                                          // lid hinged at the back
  ctx.translate(bx - bs / 2 - 2, by);
  ctx.rotate(-open * 1.9);
  ctx.fillStyle = "#f472b6";
  ctx.fillRect(0, -8, bs + 4, 8);
  ctx.fillStyle = GOLD;
  ctx.fillRect(bs / 2 - 1, -8, 6, 8);
  ctx.strokeStyle = "#1e0a3a"; ctx.strokeRect(0, -8, bs + 4, 8);
  ctx.restore();
  // Question marks drifting up from the box
  ctx.font = "bold 14px sans-serif";
  for (let i = 0; i < 3; i++) {
    const p = ((t / 2600) + i / 3) % 1;
    ctx.fillStyle = `rgba(253,224,71,${(1 - p) * 0.9})`;
    ctx.fillText("?", bx - 26 + i * 26 + Math.sin(t / 500 + i * 2) * 6, by - 14 - p * 50);
  }

  // Marquee sign with chasing bulbs
  const mx = b.x + 10, my = b.y + 40, mw = b.w - 20, mh = 24;
  ctx.fillStyle = "#1e0a3a";
  roundRect(ctx, mx, my, mw, mh, 4, true, false);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5;
  roundRect(ctx, mx, my, mw, mh, 4, false, true);
  const phase = (t / 130) | 0;
  for (let i = 0; i < 14; i++) {
    const on = (phase + i) % 3 !== 0;
    ctx.fillStyle = on ? "#fff1b8" : "#6b4e10";
    const bxx = mx + 6 + i * (mw - 12) / 13;
    ctx.beginPath(); ctx.arc(bxx, my - 3, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bxx, my + mh + 3, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = GOLD;
  ctx.font = "bold 14px Georgia, 'Times New Roman', serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(b.label, cx, my + mh / 2 + 1);

  // Round glowing windows with box silhouettes inside
  for (const s of [-1, 1]) {
    const wx = cx + s * 64, wy = b.y + 100;
    const pl = 0.5 + 0.5 * Math.sin(t / 700 + s);
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(wx, wy, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${140 + 60 * pl | 0},${40 + 30 * pl | 0},${200 + 40 * pl | 0},1)`;
    ctx.beginPath(); ctx.arc(wx, wy, 19, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.fillRect(wx - 10, wy - 2, 9, 9); ctx.fillRect(wx + 1, wy - 2, 9, 9); ctx.fillRect(wx - 4, wy - 12, 9, 9);
    ctx.fillStyle = "rgba(255,255,255,.2)";
    ctx.beginPath(); ctx.arc(wx - 6, wy - 7, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#1e0a3a"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(wx - 19, wy); ctx.lineTo(wx + 19, wy); ctx.moveTo(wx, wy - 19); ctx.lineTo(wx, wy + 19); ctx.stroke();
  }
  // Velvet curtain doorway
  const dh = 44;
  ctx.fillStyle = "#1e0a3a";
  ctx.fillRect(cx - half - 5, base - dh - 6, half * 2 + 10, dh + 6);
  ctx.fillStyle = `rgba(216,180,254,${0.25 + 0.15 * Math.sin(t / 500)})`;
  ctx.fillRect(cx - half, base - dh, half * 2, dh);
  for (const s of [-1, 1]) {                           // curtains drawn to the sides
    ctx.fillStyle = "#9d174d";
    ctx.beginPath();
    ctx.moveTo(cx + s * half, base - dh);
    ctx.lineTo(cx + s * (half - 14), base - dh);
    ctx.quadraticCurveTo(cx + s * (half - 4), base - dh / 2, cx + s * (half - 12), base);
    ctx.lineTo(cx + s * half, base); ctx.closePath(); ctx.fill();
    ctx.fillStyle = GOLD;
    ctx.fillRect(cx + s * (half - 8) - 2, base - dh / 2 - 1, 4, 4);
  }
  ctx.fillStyle = GOLD;
  ctx.fillRect(cx - half - 5, base - dh - 6, half * 2 + 10, 4);
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(cx - half + i * half / 2, base - dh - 1, 2, 0, Math.PI); ctx.fill(); }
  TB.spill(ctx, cx, base, half * 2, "216,180,254", 0.16);
}

// ================= ADVENTURERS GUILD =================
// Stone-and-timber tavern fortress: crenellated corner tower with a banner,
// half-timbered upper storey, swinging shield sign, flickering torches,
// crossed swords over the door and a parchment quest board.
function drawGuild(ctx, b) {
  const t = Date.now();
  const cx = b.x + b.w / 2, base = b.y + b.h, half = b.doorHalf || 22;
  TB.ground(ctx, b, half, { mat: "#7f1d1d", apron: "#b8ad9c" });

  const stone = (x, y, w, h) => {
    ctx.fillStyle = "#6b6560";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(0,0,0,.2)";
    for (let yy = y + 6; yy < y + h - 4; yy += 14) {
      for (let xx = x + ((yy / 14 | 0) % 2 ? 2 : 16); xx < x + w - 6; xx += 28) ctx.fillRect(xx, yy, 24, 10);
    }
    ctx.fillStyle = "rgba(255,255,255,.06)";
    ctx.fillRect(x, y, w, 3);
  };

  // Lower storey stone, upper storey half-timber
  stone(b.x, base - 78, b.w, 78);
  ctx.fillStyle = "#efe6d2";
  ctx.fillRect(b.x + 2, b.y + 36, b.w - 4, base - 78 - b.y - 36);
  ctx.fillStyle = "#3f2a1a";
  ctx.fillRect(b.x, b.y + 34, b.w, 5); ctx.fillRect(b.x, base - 82, b.w, 5);
  for (let i = 0; i <= 5; i++) ctx.fillRect(b.x + 2 + i * (b.w - 8) / 5, b.y + 36, 5, base - 78 - b.y - 36);
  ctx.strokeStyle = "#3f2a1a"; ctx.lineWidth = 4;
  for (let i = 0; i < 5; i++) {                        // diagonal braces
    const x0 = b.x + 4 + i * (b.w - 8) / 5, x1 = x0 + (b.w - 8) / 5;
    ctx.beginPath();
    if (i % 2) { ctx.moveTo(x0, base - 82); ctx.lineTo(x1, b.y + 40); } else { ctx.moveTo(x0, b.y + 40); ctx.lineTo(x1, base - 82); }
    ctx.stroke();
  }
  // Gabled slate roof
  ctx.fillStyle = "#374151";
  ctx.beginPath(); ctx.moveTo(b.x - 10, b.y + 40); ctx.lineTo(cx + 20, b.y + 2); ctx.lineTo(b.x + b.w + 10, b.y + 40); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#111827"; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(b.x - 10 + i * 18, b.y + 40 - i * 7); ctx.lineTo(b.x + b.w + 10 - i * 14, b.y + 40 - i * 6.5); ctx.stroke();
  }

  // Crenellated corner tower (left) rising above the roof, with banner
  const tx = b.x - 6, tw = 54, ttop = b.y - 46;
  stone(tx, ttop, tw, base - ttop);
  ctx.fillStyle = "#57534e";
  for (let i = 0; i < 4; i++) ctx.fillRect(tx + i * 14, ttop - 10, 10, 12);
  ctx.fillStyle = "#1c1917";
  ctx.fillRect(tx + tw / 2 - 2, ttop + 16, 4, 16);     // arrow slit
  ctx.fillStyle = `rgba(255,200,110,${0.6 + 0.3 * Math.sin(t / 900)})`;
  ctx.fillRect(tx + tw / 2 - 1, ttop + 18, 2, 12);
  ctx.fillStyle = "#3f2a1a";
  ctx.fillRect(tx + tw / 2 - 1.5, ttop - 34, 3, 26);
  TB.flag(ctx, tx + tw / 2 + 1.5, ttop - 32, 24, 14, "#b91c1c", t, 1);
  // hanging banner on the tower face
  ctx.fillStyle = "#7f1d1d";
  ctx.beginPath(); ctx.moveTo(tx + 10, ttop + 42); ctx.lineTo(tx + tw - 10, ttop + 42); ctx.lineTo(tx + tw - 10, ttop + 84 + Math.sin(t / 600) * 2); ctx.lineTo(tx + tw / 2, ttop + 94 + Math.sin(t / 600) * 2); ctx.lineTo(tx + 10, ttop + 84 + Math.sin(t / 600) * 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(tx + 8, ttop + 40, tw - 16, 3);
  ctx.beginPath(); ctx.moveTo(tx + tw / 2, ttop + 54); ctx.lineTo(tx + tw / 2 + 7, ttop + 66); ctx.lineTo(tx + tw / 2, ttop + 74); ctx.lineTo(tx + tw / 2 - 7, ttop + 66); ctx.closePath(); ctx.fill();

  // Name board over the door
  TB.plate(ctx, cx - 66, b.y + 50, 132, 22, b.label, "#3f2a1a", "#fde68a", "#fbbf24", "bold 11px Georgia, serif");
  ctx.fillStyle = "#1c1917";
  ctx.fillRect(cx - 62, b.y + 46, 3, 6); ctx.fillRect(cx + 59, b.y + 46, 3, 6);

  // Crossed swords above the door
  ctx.save();
  ctx.translate(cx, base - 62);
  for (const d of [-1, 1]) {
    ctx.save(); ctx.rotate(d * 0.7);
    ctx.fillStyle = "#cbd5e1"; ctx.fillRect(-2, -20, 4, 30);
    ctx.fillStyle = "#e5e7eb"; ctx.fillRect(-2, -20, 1.5, 30);
    ctx.fillStyle = "#7c4a18"; ctx.fillRect(-7, 8, 14, 3); ctx.fillRect(-1.5, 11, 3, 8);
    ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(0, 20, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Upper windows with warm light + leaded panes
  for (const s of [-1, 1]) {
    const wx = cx + s * 86 - 10;
    ctx.fillStyle = "#3f2a1a";
    ctx.fillRect(wx - 2, b.y + 48, 24, 30);
    TB.litWindow(ctx, wx, b.y + 50, 20, 26, t, s * 5, null, true);
    ctx.strokeStyle = "#3f2a1a"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(wx + 10, b.y + 50); ctx.lineTo(wx + 10, b.y + 76); ctx.moveTo(wx, b.y + 63); ctx.lineTo(wx + 20, b.y + 63); ctx.stroke();
  }

  // Quest notice board (right of door) with parchments
  const nb = cx + 46;
  ctx.fillStyle = "#5b3a1e";
  ctx.fillRect(nb, base - 56, 50, 40);
  ctx.strokeStyle = "#2c1a0c"; ctx.lineWidth = 2; ctx.strokeRect(nb, base - 56, 50, 40);
  ctx.fillStyle = "#3f2a1a";
  ctx.fillRect(nb - 4, base - 60, 58, 5);
  const notes = [[4, 4, 16, 14, "#fef3c7"], [24, 3, 20, 12, "#fde68a"], [6, 22, 18, 12, "#fef3c7"], [28, 19, 16, 15, "#fed7aa"]];
  for (const [nx, ny, nw, nh, col] of notes) {
    ctx.fillStyle = col; ctx.fillRect(nb + nx, base - 56 + ny, nw, nh);
    ctx.fillStyle = "rgba(0,0,0,.35)";
    for (let l = 3; l < nh - 2; l += 3) ctx.fillRect(nb + nx + 2, base - 56 + ny + l, nw - 4, 1);
    ctx.fillStyle = "#dc2626"; ctx.beginPath(); ctx.arc(nb + nx + nw / 2, base - 56 + ny + 1, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "#fde68a"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("QUESTS", nb + 25, base - 58);

  // Swinging shield sign on a bracket (left of door)
  ctx.save();
  ctx.translate(cx - 96, base - 74);
  ctx.fillStyle = "#1c1917";
  ctx.fillRect(-4, -2, 30, 4); ctx.fillRect(-4, -2, 4, 14);
  ctx.translate(20, 2);
  ctx.rotate(Math.sin(t / 750) * 0.18);
  ctx.strokeStyle = "#1c1917"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-6, 8); ctx.moveTo(6, 0); ctx.lineTo(6, 8); ctx.stroke();
  ctx.fillStyle = "#b91c1c";
  ctx.beginPath(); ctx.moveTo(-14, 8); ctx.lineTo(14, 8); ctx.lineTo(14, 26); ctx.lineTo(0, 38); ctx.lineTo(-14, 26); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(-1.5, 12, 3, 20); ctx.fillRect(-9, 18, 18, 3);
  ctx.restore();

  // Torches flanking the arched door
  for (const s of [-1, 1]) {
    const px = cx + s * (half + 12);
    ctx.fillStyle = "#1c1917"; ctx.fillRect(px - 2, base - 48, 4, 4);
    ctx.fillStyle = "#5b3a1e"; ctx.fillRect(px - 2, base - 64, 4, 18);
    ctx.fillStyle = "#3f2a1a"; ctx.fillRect(px - 4, base - 66, 8, 5);
    TB.flame(ctx, px, base - 66, 7, t, s * 4);
  }
  // Arched oak door with iron bands
  const dh = 46;
  ctx.fillStyle = "#292524";
  ctx.beginPath(); ctx.moveTo(cx - half - 4, base); ctx.lineTo(cx - half - 4, base - dh + half + 4);
  ctx.arc(cx, base - dh + half + 4, half + 4, Math.PI, 0); ctx.lineTo(cx + half + 4, base); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#5b3a1e";
  ctx.beginPath(); ctx.moveTo(cx - half, base); ctx.lineTo(cx - half, base - dh + half);
  ctx.arc(cx, base - dh + half, half, Math.PI, 0); ctx.lineTo(cx + half, base); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.18)";
  for (let i = 0; i < 5; i++) ctx.fillRect(cx - half + 3 + i * (half * 2 - 6) / 5, base - dh + 4, 1.5, dh - 4);
  ctx.fillStyle = "#57534e";
  ctx.fillRect(cx - half, base - 34, half * 2, 3); ctx.fillRect(cx - half, base - 16, half * 2, 3);
  ctx.fillStyle = "#1c1917";
  for (let i = 0; i < 4; i++) { ctx.fillRect(cx - half + 4 + i * (half * 2 - 8) / 3 - 1, base - 34, 2, 3); ctx.fillRect(cx - half + 4 + i * (half * 2 - 8) / 3 - 1, base - 16, 2, 3); }
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath(); ctx.arc(cx + 8, base - 24, 2.5, 0, Math.PI * 2); ctx.fill();
  const fl = 0.5 + 0.5 * Math.sin(t / 110);
  TB.spill(ctx, cx, base, half * 2 + 12, "251,146,60", 0.10 + 0.05 * fl);
}

// ================= JOBS CENTER =================
// Glass-and-steel office: blue curtain wall with a moving reflection and lit
// floors, rooftop antenna with a blinking beacon, scrolling "NOW HIRING" LED
// band, lobby clock, revolving door and potted plants.
function drawJobsCenter(ctx, b) {
  const t = Date.now();
  const cx = b.x + b.w / 2, base = b.y + b.h, half = b.doorHalf || 22;
  TB.ground(ctx, b, half, { steps: 2, apronW: 110, apron: "#c8ccd2", stepA: "#9ca3af", stepB: "#b4bac2" });

  // Curtain wall
  const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, base);
  g.addColorStop(0, "#1e3a8a"); g.addColorStop(0.5, "#2563eb"); g.addColorStop(1, "#1e40af");
  ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y + 24, b.w, b.h - 24);
  // Lit floors
  const floors = 4, fTop = b.y + 58, fH = (base - 46 - fTop) / floors, cols = 7, cW = (b.w - 16) / cols;
  for (let r = 0; r < floors; r++) {
    const fy = fTop + r * fH;
    for (let c = 0; c < cols; c++) {
      const l = Math.sin(t / 2100 + r * 1.9 + c * 1.37);
      ctx.fillStyle = l > 0.2 ? "#dbeafe" : l > -0.5 ? "#60a5fa" : "#1e3a8a";
      ctx.fillRect(b.x + 8 + c * cW + 1.5, fy + 2, cW - 3, fH - 6);
    }
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(b.x + 4, fy + fH - 4, b.w - 8, 4);
  }
  // Mullions
  ctx.fillStyle = "#94a3b8";
  for (let c = 0; c <= cols; c++) ctx.fillRect(b.x + 8 + c * cW - 1, fTop, 2, base - 46 - fTop);
  // Moving reflection sweep, clipped to the wall
  ctx.save();
  ctx.beginPath(); ctx.rect(b.x, b.y + 24, b.w, base - 46 - b.y - 24); ctx.clip();
  const rx = b.x - 80 + ((t / 14) % (b.w + 160));
  ctx.fillStyle = "rgba(255,255,255,.13)";
  ctx.beginPath(); ctx.moveTo(rx, base); ctx.lineTo(rx + 26, base); ctx.lineTo(rx + 90, b.y); ctx.lineTo(rx + 64, b.y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.06)";
  ctx.beginPath(); ctx.moveTo(rx + 34, base); ctx.lineTo(rx + 44, base); ctx.lineTo(rx + 108, b.y); ctx.lineTo(rx + 98, b.y); ctx.closePath(); ctx.fill();
  ctx.restore();
  // Steel frame
  ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 2;
  ctx.strokeRect(b.x, b.y + 24, b.w, b.h - 24);

  // Roof: parapet, mechanical box, antenna mast
  ctx.fillStyle = "#334155";
  ctx.fillRect(b.x - 4, b.y + 18, b.w + 8, 8);
  ctx.fillStyle = "#475569";
  ctx.fillRect(b.x + b.w - 60, b.y + 4, 36, 16);
  ctx.fillStyle = "#1e293b";
  for (let i = 0; i < 4; i++) ctx.fillRect(b.x + b.w - 56 + i * 8, b.y + 8, 3, 8);
  const ax = b.x + b.w - 20;
  ctx.fillStyle = "#94a3b8";
  ctx.fillRect(ax - 1.5, b.y - 56, 3, 76);
  ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ax - 12, b.y + 18); ctx.lineTo(ax, b.y - 20); ctx.lineTo(ax + 12, b.y + 18); ctx.stroke();
  ctx.fillRect(ax - 8, b.y - 30, 16, 2); ctx.fillRect(ax - 5, b.y - 44, 10, 2);
  const blink = (t % 1200) < 250;
  ctx.fillStyle = blink ? "rgba(255,80,80,.35)" : "rgba(255,80,80,0)";
  ctx.beginPath(); ctx.arc(ax, b.y - 58, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = blink ? "#ff4d4d" : "#7f1d1d";
  ctx.beginPath(); ctx.arc(ax, b.y - 58, 3, 0, Math.PI * 2); ctx.fill();

  // Name plate on the parapet
  TB.plate(ctx, cx - 70, b.y - 4, 140, 24, b.label, "#0f172a", "#e0f2fe", "#94a3b8", "bold 14px sans-serif");

  // LED "NOW HIRING" ticker
  const lx = b.x + 8, ly = b.y + 32, lw = b.w - 16, lh = 18;
  ctx.fillStyle = "#020617";
  ctx.fillRect(lx, ly, lw, lh);
  ctx.save();
  ctx.beginPath(); ctx.rect(lx + 2, ly, lw - 4, lh); ctx.clip();
  ctx.font = "bold 12px monospace"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const msg = "NOW HIRING  ●  APPLY INSIDE  ●  GOOD PAY  ●  ";
  const mwid = ctx.measureText(msg).width;
  const off = (t / 22) % mwid;
  ctx.fillStyle = "#f87171";
  ctx.fillText(msg + msg, lx + 4 - off, ly + lh / 2 + 1);
  ctx.restore();
  ctx.strokeStyle = "#475569"; ctx.lineWidth = 1; ctx.strokeRect(lx, ly, lw, lh);

  // Lobby band
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(b.x + 4, base - 46, b.w - 8, 46);
  ctx.fillStyle = "#94a3b8";
  ctx.fillRect(b.x + 4, base - 46, b.w - 8, 3);
  ctx.fillStyle = "#cbd5e1";
  for (let xx = b.x + 4; xx < b.x + b.w - 4; xx += 22) ctx.fillRect(xx, base - 8, 11, 8);
  TB.clock(ctx, cx - 62, base - 24, 11, "#f8fafc", "#1e293b", "#1e293b");
  ctx.fillStyle = "#1e293b"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("OPEN 9-5", cx + 62, base - 34);
  ctx.fillStyle = "#2563eb"; ctx.fillRect(cx + 48, base - 30, 28, 1.5);
  TB.plant(ctx, cx - half - 14, base, t, 1);
  TB.plant(ctx, cx + half + 14, base, t, 2);

  // Revolving door
  const r = half;
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(cx - r - 3, base - r - 6, r * 2 + 6, r + 6);
  ctx.fillStyle = "rgba(191,219,254,.85)";
  ctx.beginPath(); ctx.arc(cx, base - 2, r, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, base - 2, r, Math.PI, 0); ctx.closePath(); ctx.clip();
  ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2.5;
  const ra = t / 900;
  for (let i = 0; i < 4; i++) {
    const a = ra + i * Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(cx, base - 2); ctx.lineTo(cx + Math.cos(a) * r, base - 2 + Math.sin(a) * r * 0.9); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, base - 2, r, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = "#1e293b";
  ctx.beginPath(); ctx.arc(cx, base - 2, 3, 0, Math.PI * 2); ctx.fill();
  TB.spill(ctx, cx, base, r * 2, "191,219,254", 0.14);
}

// ================= TRIM & STYLE =================
// Art-deco salon: stepped cream parapet with teal fluting, pink neon script,
// a spinning barber pole, a porthole window with a hair-dryer chair inside,
// scissors motif, and a striped awning.
function drawBarber(ctx, b) {
  const t = Date.now();
  const cx = b.x + b.w / 2, base = b.y + b.h, half = b.doorHalf || 22;
  const CREAM = "#fdf6e3", TEAL = "#0e7490", TEAL_LT = "#22d3ee", PINK = "#f472b6";
  TB.ground(ctx, b, half, { mat: "#0e7490", apron: "#d9d4cc" });

  // Body
  const g = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
  g.addColorStop(0, "#efe4c9"); g.addColorStop(0.5, CREAM); g.addColorStop(1, "#e9dcc0");
  ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y + 24, b.w, b.h - 24);
  ctx.fillStyle = TEAL;
  ctx.fillRect(b.x, base - 12, b.w, 12);
  ctx.fillStyle = "rgba(255,255,255,.25)";
  ctx.fillRect(b.x, base - 12, b.w, 2);
  // Stepped deco parapet
  ctx.fillStyle = CREAM;
  ctx.fillRect(b.x - 4, b.y + 18, b.w + 8, 10);
  ctx.fillRect(cx - 74, b.y + 2, 148, 22);
  ctx.fillRect(cx - 44, b.y - 14, 88, 20);
  ctx.fillStyle = TEAL;
  ctx.fillRect(b.x - 4, b.y + 18, b.w + 8, 2); ctx.fillRect(cx - 74, b.y + 2, 148, 2); ctx.fillRect(cx - 44, b.y - 14, 88, 2);
  for (let i = 0; i < 5; i++) { ctx.fillRect(cx - 110 + i * 8, b.y + 22, 2, 6); ctx.fillRect(cx + 78 + i * 8, b.y + 22, 2, 6); }
  for (let i = 0; i < 4; i++) { ctx.fillRect(cx - 68 + i * 7, b.y + 8, 2, 12); ctx.fillRect(cx + 46 + i * 7, b.y + 8, 2, 12); }
  ctx.fillStyle = TEAL_LT;
  ctx.fillRect(cx - 44, b.y - 16, 88, 2);
  // Neon script sign
  const flick = Math.sin(t / 90) > -0.92 ? 1 : 0.5;
  ctx.save();
  ctx.font = "italic bold 17px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = `rgba(244,114,182,${0.9 * flick})`;
  ctx.shadowBlur = 14;
  ctx.fillStyle = flick > 0.6 ? "#ffd6ea" : "#c2467f";
  ctx.fillText(b.label, cx, b.y - 2);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(157,23,77,.7)"; ctx.lineWidth = 0.8;
  ctx.strokeText(b.label, cx, b.y - 2);
  ctx.restore();

  // Deco sunburst motif on the parapet tiers
  ctx.strokeStyle = PINK; ctx.lineWidth = 1.5;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + s * (0.25 + i * 0.3);
      ctx.beginPath(); ctx.moveTo(cx + s * 90, b.y + 26); ctx.lineTo(cx + s * 90 + Math.cos(a) * 14, b.y + 26 + Math.sin(a) * 14); ctx.stroke();
    }
  }

  // Awning
  TB.awning(ctx, b.x + 8, b.y + 40, b.w - 16, 14, TEAL, "#f8fafc", 14);

  // Porthole window (right) with dryer chairs inside
  const px = cx + 56, py = b.y + 104, pr = 30;
  ctx.fillStyle = TEAL;
  ctx.beginPath(); ctx.arc(px, py, pr + 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#cffafe";
  ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = "#e0f2fe"; ctx.fillRect(px - pr, py + 12, pr * 2, pr);   // floor
  for (let i = 0; i < 2; i++) {                        // dryer chairs
    const chx = px - 14 + i * 26;
    ctx.fillStyle = "#334155"; ctx.fillRect(chx - 8, py + 4, 16, 12); ctx.fillRect(chx - 2, py + 16, 4, 6);
    ctx.fillStyle = PINK; roundRect(ctx, chx - 7, py - 6, 14, 12, 3, true, false);
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath(); ctx.arc(chx, py - 12, 9, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(253,224,71,${0.3 + 0.3 * Math.sin(t / 400 + i * 2)})`;
    ctx.beginPath(); ctx.arc(chx, py - 12, 6, Math.PI, 0); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,.35)";
  ctx.beginPath(); ctx.arc(px - 10, py - 12, 10, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px - pr, py); ctx.lineTo(px + pr, py); ctx.moveTo(px, py - pr); ctx.lineTo(px, py + pr); ctx.stroke();

  // Left window with neon scissors
  const lx = cx - 56, ly = b.y + 104;
  ctx.fillStyle = TEAL; ctx.fillRect(lx - 30, ly - 30, 60, 60);
  ctx.fillStyle = "#0f172a"; ctx.fillRect(lx - 26, ly - 26, 52, 52);
  const sg = 0.6 + 0.4 * Math.sin(t / 500);
  ctx.strokeStyle = `rgba(34,211,238,${sg})`; ctx.lineWidth = 3; ctx.lineCap = "round";
  const sa = Math.sin(t / 600) * 0.15;
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(lx + d * 4 + Math.sin(sa) * -d * 2, ly + 16); ctx.lineTo(lx - d * 12, ly - 14); ctx.stroke();
    ctx.beginPath(); ctx.arc(lx + d * 9, ly + 20, 5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.lineCap = "butt";
  ctx.fillStyle = `rgba(244,114,182,${sg})`;
  ctx.beginPath(); ctx.arc(lx, ly + 2, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2; ctx.strokeRect(lx - 26, ly - 26, 52, 52);

  // Spinning barber pole (left edge)
  const bpx = b.x + 12, bpy = base - 76, bph = 50;
  ctx.fillStyle = "#94a3b8";
  ctx.fillRect(bpx - 9, bpy - 6, 18, 5); ctx.fillRect(bpx - 9, bpy + bph + 1, 18, 5);
  ctx.beginPath(); ctx.arc(bpx, bpy - 8, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bpx, bpy + bph + 8, 5, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.rect(bpx - 7, bpy, 14, bph); ctx.clip();
  ctx.fillStyle = "#f8fafc"; ctx.fillRect(bpx - 7, bpy, 14, bph);
  const stripeP = 24, off = (t / 18) % stripeP;
  for (let i = -2; i * stripeP < bph + stripeP * 2; i++) {
    const y0 = bpy + i * stripeP + off;
    ctx.fillStyle = "#dc2626";
    ctx.beginPath(); ctx.moveTo(bpx - 7, y0); ctx.lineTo(bpx + 7, y0 - 10); ctx.lineTo(bpx + 7, y0 - 3); ctx.lineTo(bpx - 7, y0 + 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#2563eb";
    ctx.beginPath(); ctx.moveTo(bpx - 7, y0 + 12); ctx.lineTo(bpx + 7, y0 + 2); ctx.lineTo(bpx + 7, y0 + 9); ctx.lineTo(bpx - 7, y0 + 19); ctx.closePath(); ctx.fill();
  }
  const cyl = ctx.createLinearGradient(bpx - 7, 0, bpx + 7, 0);
  cyl.addColorStop(0, "rgba(0,0,0,.35)"); cyl.addColorStop(0.3, "rgba(255,255,255,.35)"); cyl.addColorStop(0.6, "rgba(255,255,255,0)"); cyl.addColorStop(1, "rgba(0,0,0,.4)");
  ctx.fillStyle = cyl; ctx.fillRect(bpx - 7, bpy, 14, bph);
  ctx.restore();
  ctx.strokeStyle = "#475569"; ctx.lineWidth = 1.5; ctx.strokeRect(bpx - 7, bpy, 14, bph);

  // Chrome-framed glass door
  const dh = 44;
  ctx.fillStyle = "#334155";
  ctx.fillRect(cx - half - 4, base - dh - 4, half * 2 + 8, dh + 4);
  ctx.fillStyle = "rgba(207,250,254,.9)";
  ctx.fillRect(cx - half, base - dh, half * 2, dh);
  ctx.fillStyle = "rgba(255,255,255,.35)";
  ctx.fillRect(cx - half + 3, base - dh + 3, 10, dh - 8);
  ctx.fillStyle = "#94a3b8";
  ctx.fillRect(cx - 1, base - dh, 2, dh);
  ctx.fillRect(cx - half, base - dh + 18, half * 2, 2);
  ctx.fillStyle = PINK; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("OPEN", cx, base - dh + 9);
  TB.spill(ctx, cx, base, half * 2, "244,114,182", 0.12);
}

// ================= TOWN PLAZA =================
// Open market hall: terracotta colonnade with three arches (the centre one is
// the door), striped stall canopies in the side arches, a glowing fountain
// light in the middle, twinkling string lights, planters and a bell tower.
function drawPlaza(ctx, b) {
  const t = Date.now();
  const cx = b.x + b.w / 2, base = b.y + b.h, half = b.doorHalf || 22;
  const TERRA = "#c2410c", TERRA_DK = "#7c2d12", CREAM = "#fde9cf";
  TB.ground(ctx, b, half, { steps: 2, apronW: 140, apron: "#d8c8b0", stepA: "#b89a78", stepB: "#cbb391" });

  // Walls (stucco)
  const g = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
  g.addColorStop(0, "#f3d9b8"); g.addColorStop(0.5, CREAM); g.addColorStop(1, "#efd1ab");
  ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y + 24, b.w, b.h - 24);
  ctx.fillStyle = "rgba(0,0,0,.05)";
  for (let i = 0; i < 12; i++) ctx.fillRect(b.x + 6 + ((i * 37) % (b.w - 20)), b.y + 50 + ((i * 53) % 80), 10, 3);
  // Tile roof band
  ctx.fillStyle = TERRA;
  ctx.fillRect(b.x - 8, b.y + 22, b.w + 16, 18);
  ctx.fillStyle = "#9a3412";
  for (let row = 0; row < 2; row++) {
    for (let xx = b.x - 8 + (row ? 6 : 0); xx < b.x + b.w + 8; xx += 12) {
      ctx.beginPath(); ctx.arc(xx + 6, b.y + 30 + row * 8, 6, Math.PI, 0); ctx.fill();
    }
  }
  ctx.fillStyle = TERRA_DK;
  ctx.fillRect(b.x - 8, b.y + 38, b.w + 16, 3);
  // Frieze with the name
  ctx.fillStyle = TERRA_DK;
  ctx.fillRect(b.x + 4, b.y + 44, b.w - 8, 20);
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(b.x + 4, b.y + 44, b.w - 8, 1.5); ctx.fillRect(b.x + 4, b.y + 62, b.w - 8, 1.5);
  ctx.fillStyle = "#fde68a";
  ctx.font = "bold 14px Georgia, 'Times New Roman', serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(b.label, cx, b.y + 55);

  // Bell tower on the roof
  const bt = cx, btTop = b.y - 44;
  ctx.fillStyle = "#f3d9b8";
  ctx.fillRect(bt - 16, btTop, 32, 68);
  ctx.fillStyle = "rgba(0,0,0,.1)";
  ctx.fillRect(bt + 10, btTop, 6, 68);
  ctx.fillStyle = TERRA;
  ctx.beginPath(); ctx.moveTo(bt - 22, btTop); ctx.lineTo(bt, btTop - 18); ctx.lineTo(bt + 22, btTop); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath(); ctx.arc(bt, btTop - 20, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3b1d0e";
  ctx.beginPath(); ctx.moveTo(bt - 9, btTop + 34); ctx.lineTo(bt - 9, btTop + 16); ctx.arc(bt, btTop + 16, 9, Math.PI, 0); ctx.lineTo(bt + 9, btTop + 34); ctx.closePath(); ctx.fill();
  ctx.save();
  ctx.translate(bt, btTop + 12);
  ctx.rotate(Math.sin(t / 520) * 0.35);
  ctx.fillStyle = "#d4a017";
  ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-7, 12); ctx.lineTo(7, 12); ctx.lineTo(5, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#7a5a0c";
  ctx.beginPath(); ctx.arc(0, 14, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Arches: side arches hold market stalls, centre arch is the open door
  const arches = [[cx - 72, 24, "stall", 0], [cx, half + 4, "door", 1], [cx + 72, 24, "stall", 2]];
  const archTop = base - 72;
  for (const [ax, ar, kind, i] of arches) {
    ctx.fillStyle = TERRA_DK;
    ctx.beginPath(); ctx.moveTo(ax - ar - 4, base); ctx.lineTo(ax - ar - 4, archTop);
    ctx.arc(ax, archTop, ar + 4, Math.PI, 0); ctx.lineTo(ax + ar + 4, base); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#3b1d0e";
    ctx.beginPath(); ctx.moveTo(ax - ar, base); ctx.lineTo(ax - ar, archTop);
    ctx.arc(ax, archTop, ar, Math.PI, 0); ctx.lineTo(ax + ar, base); ctx.closePath(); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.moveTo(ax - ar, base); ctx.lineTo(ax - ar, archTop);
    ctx.arc(ax, archTop, ar, Math.PI, 0); ctx.lineTo(ax + ar, base); ctx.closePath(); ctx.clip();
    if (kind === "stall") {
      const c1 = i === 0 ? "#dc2626" : "#16a34a";
      ctx.fillStyle = "#5b3a1e";
      ctx.fillRect(ax - ar, base - 22, ar * 2, 22);            // counter
      ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(ax - ar, base - 22, ar * 2, 2);
      for (let k = 0; k < 4; k++) {                              // produce crates
        ctx.fillStyle = k % 2 ? "#f59e0b" : "#ef4444";
        ctx.beginPath(); ctx.arc(ax - 15 + k * 10, base - 26, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#3f2a1a";
      ctx.fillRect(ax - ar + 2, base - 46, 3, 24); ctx.fillRect(ax + ar - 5, base - 46, 3, 24);
      for (let k = 0; k * 8 < ar * 2; k++) {                     // striped canopy
        ctx.fillStyle = k % 2 ? c1 : "#fef3c7";
        ctx.fillRect(ax - ar + k * 8, base - 54, 8, 10);
      }
      for (let k = 0; k * 8 < ar * 2; k++) {
        ctx.fillStyle = k % 2 ? c1 : "#fef3c7";
        ctx.beginPath(); ctx.arc(ax - ar + k * 8 + 4, base - 44, 4, 0, Math.PI); ctx.fill();
      }
      const lamp = 0.6 + 0.4 * Math.sin(t / 700 + i);
      ctx.fillStyle = `rgba(255,214,120,${0.12 * lamp})`;
      ctx.fillRect(ax - ar, archTop - ar, ar * 2, base - archTop + ar);
    } else {
      // fountain light: pulsing radial glow in the passage
      const pulse = 0.6 + 0.4 * Math.sin(t / 900);
      const rg = ctx.createRadialGradient(ax, base - 30, 2, ax, base - 30, 40);
      rg.addColorStop(0, `rgba(165,243,252,${0.75 * pulse})`); rg.addColorStop(0.5, `rgba(125,211,252,${0.3 * pulse})`); rg.addColorStop(1, "rgba(125,211,252,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(ax - ar, archTop - ar, ar * 2, base - archTop + ar);
      for (let k = 0; k < 6; k++) {                              // rising water sparkle
        const p = ((t / 1500) + k / 6) % 1;
        ctx.fillStyle = `rgba(224,242,254,${(1 - p) * 0.9})`;
        ctx.beginPath(); ctx.arc(ax + Math.sin(k * 2.1) * 12 * p, base - 10 - p * 50, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "rgba(255,214,120,.18)";
      ctx.fillRect(ax - ar, archTop - ar, ar * 2, base - archTop + ar);
    }
    ctx.restore();
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ax - ar - 2, base); ctx.lineTo(ax - ar - 2, archTop); ctx.arc(ax, archTop, ar + 2, Math.PI, 0); ctx.lineTo(ax + ar + 2, base); ctx.stroke();
    ctx.fillStyle = "#fbbf24";                                   // keystone
    ctx.fillRect(ax - 4, archTop - ar - 6, 8, 8);
  }
  // Pilasters between the arches
  for (const px of [cx - 36, cx + 36]) {
    ctx.fillStyle = "#f3d9b8"; ctx.fillRect(px - 5, b.y + 68, 10, base - b.y - 68);
    ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.fillRect(px + 2, b.y + 68, 3, base - b.y - 68);
    ctx.fillStyle = TERRA; ctx.fillRect(px - 7, b.y + 66, 14, 5);
  }

  // Twinkling string lights strung along the front
  const cols = ["#f87171", "#fbbf24", "#4ade80", "#60a5fa", "#e879f9"];
  ctx.strokeStyle = "#1c1917"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(b.x - 6, b.y + 68);
  ctx.quadraticCurveTo(cx - 55, b.y + 84, cx, b.y + 70); ctx.quadraticCurveTo(cx + 55, b.y + 84, b.x + b.w + 6, b.y + 68);
  ctx.stroke();
  for (let i = 0; i < 16; i++) {
    const u = i / 15, xx = b.x - 6 + u * (b.w + 12);
    const seg = u < 0.5 ? u * 2 : (u - 0.5) * 2;
    const yy = b.y + 68 + 8 * Math.sin(seg * Math.PI);
    const tw = Math.sin(t / 230 + i * 1.7);
    ctx.fillStyle = tw > -0.3 ? cols[i % cols.length] : "#44403c";
    ctx.beginPath(); ctx.arc(xx, yy + 4, 2.6, 0, Math.PI * 2); ctx.fill();
    if (tw > 0.6) { ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.arc(xx, yy + 4, 5, 0, Math.PI * 2); ctx.fill(); }
  }
  // Planters
  TB.plant(ctx, b.x + 8, base, t, 3);
  TB.plant(ctx, b.x + b.w - 8, base, t, 4);
  TB.spill(ctx, cx, base, half * 2 + 8, "165,243,252", 0.16);
}

// Fallback for any building type without a bespoke renderer.
function drawGenericShop(ctx, b) {
  const t = Date.now();
  const cx = b.x + b.w / 2, base = b.y + b.h, half = b.doorHalf || 22;
  TB.ground(ctx, b, half, {});
  ctx.fillStyle = b.color || "#78716c";
  ctx.fillRect(b.x, b.y + 24, b.w, b.h - 24);
  ctx.fillStyle = b.roofColor || "#1f2937";
  ctx.beginPath(); ctx.moveTo(b.x - 8, b.y + 26); ctx.lineTo(cx, b.y - 8); ctx.lineTo(b.x + b.w + 8, b.y + 26); ctx.closePath(); ctx.fill();
  TB.litWindow(ctx, b.x + 16, b.y + 44, 30, 30, t, 1, "#111", true);
  TB.litWindow(ctx, b.x + b.w - 46, b.y + 44, 30, 30, t, 2, "#111", true);
  ctx.fillStyle = "#3f2210";
  ctx.fillRect(cx - half, base - 44, half * 2, 44);
  TB.plate(ctx, b.x + 10, b.y + 8, b.w - 20, 18, b.label, "#000c", b.signColor || "#fbbf24", b.signColor || "#fbbf24", "bold 12px sans-serif");
}

const BUILDING_RENDERERS = {
  mayor: drawTownHall,
  bank: drawBank,
  furniture: drawFurnitureland,
  lootbox: drawMysteryBoxes,
  quest: drawGuild,
  job: drawJobsCenter,
  barber: drawBarber,
  plaza: drawPlaza,
};


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
//
// Four archetypes are picked by houseHash: cottage, two-storey colonial,
// modern flat-roof, alpine chalet. Contract: footprint r (240x200), door
// centred on r.x+r.w/2 in the bottom 48px (collision gap ±22), pavement
// r.y+r.h-14 .. r.y+r.h+46 kept flat (path, stepping stones, hedges only
// outside the door corridor), owner plate at r.y-24..r.y-6 (the address plate
// world.js draws lives at r.y-42..r.y-26). Cheap: no shadowBlur, one gradient
// at most per house, everything else flat fills.
function houseNight() {
  try {
    if (window.gameScenery && typeof gameScenery.timeOfDay === "function") {
      const tod = gameScenery.timeOfDay();               // 0 = midnight, 0.5 = noon
      return Math.max(0, Math.min(1, (Math.abs(tod - 0.5) - 0.22) / 0.1));
    }
  } catch (e) { /* scenery not loaded yet */ }
  return 0;
}

function drawHouse(ctx, r, name, isYou, style) {
  const t = Date.now();
  const h = houseHash(name);
  const wall = (style && style.wall) || (isYou ? "#fef9c3" : HOUSE_WALLS[h % HOUSE_WALLS.length]);
  const roof = (style && style.roof) || (isYou ? "#b45309" : HOUSE_ROOFS[(h >> 3) % HOUSE_ROOFS.length]);
  const wallDk = shadeColor(wall, -28), wallLt = shadeColor(wall, 18);
  const roofDk = shadeColor(roof, -30), roofLt = shadeColor(roof, 22);
  const trim = "#f8fafc";
  const kind = (h >> 6) % 4;                              // 0 cottage, 1 colonial, 2 modern, 3 chalet
  const night = houseNight();
  const cx = r.x + r.w / 2, base = r.y + r.h;
  const flip = (h >> 9) & 1 ? -1 : 1;                     // mirrors chimney / tree side

  // ---- shared ground ----
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath(); ctx.ellipse(cx + 4, base + 2, r.w * 0.54, 10, 0, 0, Math.PI * 2); ctx.fill();
  // lawn apron
  ctx.fillStyle = "rgba(34,120,50,.18)";
  ctx.fillRect(r.x - 6, base - 2, r.w + 12, 46);
  // driveway (modern / colonial) on the flip side
  if (kind === 1 || kind === 2) {
    const dx = flip > 0 ? r.x + r.w - 62 : r.x + 10;
    ctx.fillStyle = "#9ca3af";
    ctx.fillRect(dx, base, 52, 46);
    ctx.fillStyle = "rgba(0,0,0,.12)";
    for (let i = 0; i < 4; i++) ctx.fillRect(dx, base + 4 + i * 11, 52, 1.5);
  }
  // garden path with stepping stones
  ctx.fillStyle = "#d6d3d1";
  ctx.fillRect(cx - 18, base, 36, 46);
  ctx.fillStyle = "#a8a29e";
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.ellipse(cx + (i % 2 ? 5 : -5), base + 8 + i * 11, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  // hedges / picket fence along the frontage, clear of the door corridor
  if (kind === 2) {
    ctx.fillStyle = "#e5e7eb";
    for (const [x0, x1] of [[r.x - 4, cx - 30], [cx + 30, r.x + r.w + 4]]) {
      ctx.fillRect(x0, base + 12, x1 - x0, 2);
      for (let x = x0; x < x1; x += 10) ctx.fillRect(x, base + 6, 3, 12);
    }
  } else {
    for (const [x0, x1] of [[r.x + 2, cx - 34], [cx + 34, r.x + r.w - 2]]) {
      for (let x = x0 + 8; x < x1; x += 18) {
        ctx.fillStyle = "#15803d";
        ctx.beginPath(); ctx.arc(x, base + 8, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#22c55e";
        ctx.beginPath(); ctx.arc(x - 3, base + 4, 4.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // ---- walls ----
  const eave = kind === 1 ? r.y + 36 : kind === 2 ? r.y + 30 : kind === 3 ? r.y + 70 : r.y + 46;
  const wx0 = kind === 3 ? r.x + 24 : r.x, ww = kind === 3 ? r.w - 48 : r.w;
  ctx.fillStyle = wall;
  ctx.fillRect(wx0, eave, ww, base - eave);
  if (kind === 2) {                                       // modern: contrasting dark side block
    ctx.fillStyle = wallDk;
    ctx.fillRect(flip > 0 ? r.x + r.w - 70 : r.x, eave - 8, 70, base - eave + 8);
    ctx.fillStyle = "rgba(255,255,255,.08)";
    for (let yy = eave; yy < base; yy += 6) ctx.fillRect(flip > 0 ? r.x + r.w - 70 : r.x, yy, 70, 1);
  } else if (kind === 3) {                                // chalet: timber boards
    ctx.fillStyle = "rgba(0,0,0,.08)";
    for (let yy = eave + 6; yy < base; yy += 8) ctx.fillRect(wx0, yy, ww, 2);
    ctx.fillStyle = "#5b3a1e";
    ctx.fillRect(wx0, base - 60, ww, 4);
  } else {                                                // clapboard siding
    ctx.fillStyle = "rgba(0,0,0,.055)";
    for (let yy = eave + 7; yy < base; yy += 9) ctx.fillRect(wx0, yy, ww, 3);
  }
  ctx.fillStyle = wallLt;                                 // corner boards / lit edge
  ctx.fillRect(wx0, eave, 4, base - eave);
  ctx.fillStyle = wallDk;
  ctx.fillRect(wx0 + ww - 4, eave, 4, base - eave);
  ctx.fillStyle = "#78716c";                              // foundation
  ctx.fillRect(wx0, base - 6, ww, 6);

  // ---- window helper (curtains + night glow) ----
  const win = (x, y, w, hh, seed) => {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(x - 2, y - 2, w + 4, hh + 4);
    ctx.fillStyle = "#dbeafe";
    ctx.fillRect(x, y, w, hh);
    const on = night * (0.55 + 0.45 * ((h >> (seed % 7)) & 1 ? 1 : 0.5 + 0.5 * Math.sin(t / 3000 + seed)));
    if (on > 0.02) { ctx.fillStyle = `rgba(253,224,71,${on * 0.95})`; ctx.fillRect(x, y, w, hh); }
    ctx.fillStyle = kind === 2 ? "rgba(255,255,255,.35)" : roof;           // curtains
    if (kind !== 2) { ctx.fillRect(x, y, w * 0.22, hh); ctx.fillRect(x + w * 0.78, y, w * 0.22, hh); }
    ctx.fillStyle = "rgba(255,255,255,.28)";
    ctx.fillRect(x + w * 0.22, y, w * 0.2, hh * 0.45);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(x + w / 2 - 1, y, 2, hh);
    if (kind !== 2) ctx.fillRect(x, y + hh / 2 - 1, w, 2);
    ctx.fillStyle = trim;
    ctx.fillRect(x - 6, y + hh + 2, w + 12, 3);           // sill
    if (on > 0.05) { ctx.fillStyle = `rgba(253,224,71,${on * 0.10})`; ctx.fillRect(x - 8, y + hh + 5, w + 16, 12); }
  };
  const shutters = (x, y, w, hh) => {
    ctx.fillStyle = roofDk;
    ctx.fillRect(x - 10, y - 1, 7, hh + 2); ctx.fillRect(x + w + 3, y - 1, 7, hh + 2);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    for (let i = 0; i < 3; i++) { ctx.fillRect(x - 9, y + 3 + i * hh / 3, 5, 1.5); ctx.fillRect(x + w + 4, y + 3 + i * hh / 3, 5, 1.5); }
  };
  const flowerBox = (x, y, w, seed) => {
    ctx.fillStyle = "#7c4a18"; ctx.fillRect(x, y, w, 7);
    ctx.fillStyle = "#15803d"; ctx.fillRect(x, y - 2, w, 3);
    for (let i = 0; i < w / 9; i++) {
      ctx.fillStyle = ["#fda4af", "#fcd34d", "#f9a8d4", "#f87171"][(h + i + seed) % 4];
      ctx.beginPath(); ctx.arc(x + 5 + i * 9, y - 3, 2.6, 0, Math.PI * 2); ctx.fill();
    }
  };
  const chimney = (x, y, hgt, seed) => {
    ctx.fillStyle = "#7f1d1d"; ctx.fillRect(x, y, 16, hgt);
    ctx.fillStyle = "rgba(0,0,0,.18)";
    for (let yy = y + 4; yy < y + hgt; yy += 7) ctx.fillRect(x + ((yy / 7 | 0) % 2 ? 0 : 5), yy, 6, 3);
    ctx.fillStyle = "#57534e"; ctx.fillRect(x - 2, y - 4, 20, 6);
    for (let i = 0; i < 4; i++) {
      const p = ((t / 2600) + i * 0.25 + seed * 0.1) % 1;
      ctx.fillStyle = `rgba(226,232,240,${0.3 * (1 - p)})`;
      ctx.beginPath(); ctx.arc(x + 8 + Math.sin(p * 5 + i) * 6 + p * 6, y - 8 - p * 30, 3 + p * 6, 0, Math.PI * 2); ctx.fill();
    }
  };

  // ---- archetype bodies ----
  if (kind === 0) {
    // COTTAGE: gable roof with shaded slope, dormer, chimney, porch with rail
    ctx.fillStyle = roof;
    ctx.beginPath(); ctx.moveTo(r.x - 14, eave + 6); ctx.lineTo(cx, r.y - 10); ctx.lineTo(r.x + r.w + 14, eave + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = roofDk;                               // shaded slope
    ctx.beginPath(); ctx.moveTo(cx, r.y - 10); ctx.lineTo(r.x + r.w + 14, eave + 6); ctx.lineTo(cx, eave + 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.22)"; ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const f = i / 5;
      ctx.beginPath();
      ctx.moveTo(r.x - 14 + f * (r.w / 2 + 14), eave + 6 - f * (eave + 16 - r.y));
      ctx.lineTo(r.x + r.w + 14 - f * (r.w / 2 + 14), eave + 6 - f * (eave + 16 - r.y));
      ctx.stroke();
    }
    ctx.fillStyle = roofLt; ctx.fillRect(r.x - 14, eave + 4, r.w + 28, 3);   // eave board
    ctx.strokeStyle = "#1c0a04"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r.x - 14, eave + 6); ctx.lineTo(cx, r.y - 10); ctx.lineTo(r.x + r.w + 14, eave + 6); ctx.stroke();
    // dormer
    ctx.fillStyle = wall; ctx.fillRect(cx - 16, r.y + 12, 32, 24);
    ctx.fillStyle = roofDk;
    ctx.beginPath(); ctx.moveTo(cx - 21, r.y + 14); ctx.lineTo(cx, r.y - 2); ctx.lineTo(cx + 21, r.y + 14); ctx.closePath(); ctx.fill();
    win(cx - 8, r.y + 18, 16, 14, 3);
    chimney(flip > 0 ? r.x + r.w - 52 : r.x + 36, r.y + 8, 30, 1);
    // windows + shutters + flower boxes
    for (const wxp of [r.x + 24, r.x + r.w - 62]) {
      shutters(wxp, eave + 22, 38, 32);
      win(wxp, eave + 22, 38, 32, wxp);
      flowerBox(wxp - 4, eave + 60, 46, wxp);
    }
    // porch
    ctx.fillStyle = roofDk; ctx.fillRect(cx - 46, base - 66, 92, 8);
    ctx.fillStyle = roof; ctx.fillRect(cx - 46, base - 66, 92, 3);
    ctx.fillStyle = trim;
    ctx.fillRect(cx - 42, base - 58, 6, 58); ctx.fillRect(cx + 36, base - 58, 6, 58);
    ctx.fillRect(cx - 42, base - 30, 18, 3); ctx.fillRect(cx + 24, base - 30, 18, 3);
    for (let i = 0; i < 3; i++) { ctx.fillRect(cx - 38 + i * 6, base - 30, 2, 26); ctx.fillRect(cx + 26 + i * 6, base - 30, 2, 26); }
  } else if (kind === 1) {
    // COLONIAL: two storeys, hipped roof, twin chimneys, weathervane, portico
    ctx.fillStyle = roof;
    ctx.beginPath(); ctx.moveTo(r.x - 12, eave + 4); ctx.lineTo(r.x + 40, r.y - 8); ctx.lineTo(r.x + r.w - 40, r.y - 8); ctx.lineTo(r.x + r.w + 12, eave + 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = roofDk;
    ctx.beginPath(); ctx.moveTo(r.x + r.w - 40, r.y - 8); ctx.lineTo(r.x + r.w + 12, eave + 4); ctx.lineTo(r.x + r.w - 60, eave + 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.22)"; ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const f = i / 4;
      ctx.beginPath(); ctx.moveTo(r.x - 12 + f * 52, eave + 4 - f * (eave + 12 - r.y)); ctx.lineTo(r.x + r.w + 12 - f * 52, eave + 4 - f * (eave + 12 - r.y)); ctx.stroke();
    }
    ctx.fillStyle = roofLt; ctx.fillRect(r.x + 40, r.y - 9, r.w - 80, 3);   // ridge
    ctx.strokeStyle = "#1c0a04"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r.x - 12, eave + 4); ctx.lineTo(r.x + 40, r.y - 8); ctx.lineTo(r.x + r.w - 40, r.y - 8); ctx.lineTo(r.x + r.w + 12, eave + 4); ctx.stroke();
    ctx.fillStyle = trim; ctx.fillRect(r.x - 12, eave + 2, r.w + 24, 5);   // cornice
    chimney(r.x + 30, r.y + 4, 22, 1);
    chimney(r.x + r.w - 46, r.y + 4, 22, 2);
    // weathervane
    ctx.save();
    ctx.translate(cx, r.y - 10);
    ctx.fillStyle = "#374151"; ctx.fillRect(-1, -14, 2, 14);
    ctx.rotate(Math.sin(t / 1400 + h) * 0.6);
    ctx.fillRect(-9, -14, 18, 1.5);
    ctx.beginPath(); ctx.moveTo(9, -13.5); ctx.lineTo(4, -17); ctx.lineTo(4, -10); ctx.closePath(); ctx.fill();
    ctx.restore();
    // floor band
    ctx.fillStyle = "rgba(0,0,0,.10)"; ctx.fillRect(r.x, eave + 62, r.w, 3);
    // upper windows
    for (const wxp of [r.x + 22, cx - 15, r.x + r.w - 52]) { shutters(wxp, eave + 14, 30, 26); win(wxp, eave + 14, 30, 26, wxp); }
    // lower windows
    for (const wxp of [r.x + 22, r.x + r.w - 52]) { shutters(wxp, eave + 78, 30, 32); win(wxp, eave + 78, 30, 32, wxp + 7); flowerBox(wxp - 4, eave + 116, 38, wxp); }
    // portico with pediment and columns
    ctx.fillStyle = trim;
    ctx.beginPath(); ctx.moveTo(cx - 44, base - 60); ctx.lineTo(cx, base - 78); ctx.lineTo(cx + 44, base - 60); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.beginPath(); ctx.moveTo(cx - 36, base - 61); ctx.lineTo(cx, base - 74); ctx.lineTo(cx + 36, base - 61); ctx.closePath(); ctx.fill();
    ctx.fillStyle = trim; ctx.fillRect(cx - 44, base - 62, 88, 6);
    ctx.fillRect(cx - 40, base - 56, 7, 56); ctx.fillRect(cx + 33, base - 56, 7, 56);
    ctx.fillStyle = "rgba(0,0,0,.12)";
    ctx.fillRect(cx - 38, base - 54, 1.5, 50); ctx.fillRect(cx + 35, base - 54, 1.5, 50);
  } else if (kind === 2) {
    // MODERN: flat roof with parapet, big glazing, rooftop planter, carport
    ctx.fillStyle = roof; ctx.fillRect(r.x - 8, eave - 10, r.w + 16, 12);
    ctx.fillStyle = roofLt; ctx.fillRect(r.x - 8, eave - 10, r.w + 16, 3);
    ctx.fillStyle = roofDk; ctx.fillRect(r.x - 8, eave - 1, r.w + 16, 3);
    const px = flip > 0 ? r.x + 20 : r.x + r.w - 80;      // rooftop planter box
    ctx.fillStyle = "#57534e"; ctx.fillRect(px, eave - 22, 60, 12);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? "#16a34a" : "#4ade80";
      ctx.beginPath(); ctx.arc(px + 8 + i * 11, eave - 24 + Math.sin(t / 1100 + i) * 1.5, 6, 0, Math.PI * 2); ctx.fill();
    }
    // big ribbon windows on the light block
    const gx = flip > 0 ? r.x + 14 : r.x + 84;
    win(gx, eave + 14, 130, 34, 5);
    win(gx, eave + 74, 56, 42, 6);
    ctx.fillStyle = "#334155"; ctx.fillRect(gx, eave + 14, 130, 2);
    // slot window on the dark block
    const dxb = flip > 0 ? r.x + r.w - 70 : r.x;
    win(dxb + 24, eave + 20, 22, 60, 9);
    // number plate + wall lamp
    ctx.fillStyle = "#e5e7eb"; ctx.fillRect(dxb + 28, base - 44, 14, 18);
    ctx.fillStyle = "#0f172a"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(h % 90 + 10), dxb + 35, base - 35);
    // flat canopy over the door on thin steel posts
    ctx.fillStyle = roofDk; ctx.fillRect(cx - 40, base - 62, 80, 5);
    ctx.fillStyle = "#94a3b8"; ctx.fillRect(cx - 38, base - 57, 3, 57); ctx.fillRect(cx + 35, base - 57, 3, 57);
  } else {
    // CHALET: steep A-frame roof to the ground floor, balcony, timber gable
    const peak = r.y - 12;
    ctx.fillStyle = roof;
    ctx.beginPath(); ctx.moveTo(r.x - 10, base - 54); ctx.lineTo(cx, peak); ctx.lineTo(r.x + r.w + 10, base - 54); ctx.lineTo(r.x + r.w - 6, base - 54); ctx.lineTo(cx, peak + 22); ctx.lineTo(r.x + 6, base - 54); ctx.closePath(); ctx.fill();
    ctx.fillStyle = roofDk;
    ctx.beginPath(); ctx.moveTo(cx, peak); ctx.lineTo(r.x + r.w + 10, base - 54); ctx.lineTo(r.x + r.w - 6, base - 54); ctx.lineTo(cx, peak + 22); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      const f = i / 6, yy = peak + f * (base - 54 - peak);
      const half = f * (r.w / 2 + 10), inner = Math.max(0, f * (r.w / 2 + 10) - 16);
      ctx.beginPath(); ctx.moveTo(cx - half, yy); ctx.lineTo(cx - inner, yy); ctx.moveTo(cx + inner, yy); ctx.lineTo(cx + half, yy); ctx.stroke();
    }
    ctx.strokeStyle = "#1c0a04"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r.x - 10, base - 54); ctx.lineTo(cx, peak); ctx.lineTo(r.x + r.w + 10, base - 54); ctx.stroke();
    // gable timbers + loft window
    ctx.fillStyle = "#5b3a1e";
    ctx.fillRect(cx - 1.5, peak + 18, 3, eave - peak - 18);
    ctx.fillRect(cx - 40, eave - 4, 80, 4);
    win(cx - 12, r.y + 36, 24, 18, 4);
    chimney(flip > 0 ? cx + 34 : cx - 50, r.y + 44, 26, 3);
    // balcony
    ctx.fillStyle = "#5b3a1e"; ctx.fillRect(wx0 - 6, eave + 46, ww + 12, 5);
    ctx.fillStyle = "#7c4a18";
    for (let x = wx0 - 4; x < wx0 + ww + 6; x += 8) ctx.fillRect(x, eave + 30, 3, 16);
    ctx.fillRect(wx0 - 6, eave + 28, ww + 12, 3);
    for (const wxp of [wx0 + 14, wx0 + ww - 50]) { win(wxp, eave + 4, 36, 22, wxp); flowerBox(wxp - 2, eave + 52, 40, wxp); }
    for (const wxp of [wx0 + 14, wx0 + ww - 50]) { shutters(wxp, eave + 68, 36, 30); win(wxp, eave + 68, 36, 30, wxp + 3); }
    // porch posts
    ctx.fillStyle = "#5b3a1e"; ctx.fillRect(cx - 44, base - 60, 88, 5);
    ctx.fillRect(cx - 40, base - 56, 6, 56); ctx.fillRect(cx + 34, base - 56, 6, 56);
  }

  // ---- door (shared, geometry fixed to the collision gap) ----
  const doorCol = isYou ? "#b45309" : kind === 2 ? "#1f2937" : kind === 3 ? "#5b3a1e" : "#3f2210";
  ctx.fillStyle = "#1c0a04"; ctx.fillRect(cx - 21, base - 50, 42, 50);
  ctx.fillStyle = doorCol; ctx.fillRect(cx - 19, base - 48, 38, 48);
  if (kind === 2) {
    ctx.fillStyle = "rgba(191,219,254,.75)"; ctx.fillRect(cx - 15, base - 44, 12, 40);
  } else {
    ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fillRect(cx - 14, base - 43, 28, 15);
    ctx.fillRect(cx - 14, base - 24, 12, 16); ctx.fillRect(cx + 2, base - 24, 12, 16);
    if (kind !== 3) { ctx.fillStyle = `rgba(253,224,71,${0.4 + 0.5 * night})`; ctx.fillRect(cx - 13, base - 46, 26, 5); }  // fanlight
  }
  ctx.fillStyle = "#fcd34d";
  ctx.beginPath(); ctx.arc(cx + 12, base - 24, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#a8a29e"; ctx.fillRect(cx - 26, base, 52, 5);
  ctx.fillStyle = isYou ? "#b45309" : "#7f1d1d"; ctx.fillRect(cx - 16, base + 6, 32, 9);   // welcome mat
  // porch light: always on a little, bright at night
  const lit = 0.35 + 0.65 * night * (0.8 + 0.2 * Math.abs(Math.sin(t / 700 + h)));
  ctx.fillStyle = "#374151"; ctx.fillRect(cx - 29, base - 50, 6, 4);
  ctx.fillStyle = `rgba(253,224,71,${lit})`;
  ctx.beginPath(); ctx.arc(cx - 26, base - 43, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(253,224,71,${lit * 0.16})`;
  ctx.beginPath(); ctx.arc(cx - 26, base - 43, 16, 0, Math.PI * 2); ctx.fill();
  if (night > 0.05) { ctx.fillStyle = `rgba(253,224,71,${0.12 * night})`; ctx.fillRect(cx - 24, base, 48, 14); }

  // ---- mailbox with the owner's initial, and a tree / bush by the house ----
  const mx = cx + 34;
  ctx.fillStyle = "#78716c"; ctx.fillRect(mx - 1.5, base + 18, 3, 18);
  ctx.fillStyle = isYou ? "#fbbf24" : ["#3b82f6", "#ef4444", "#10b981", "#f97316"][(h >> 4) % 4];
  roundRect(ctx, mx - 10, base + 8, 20, 12, 4, true, false);
  ctx.fillStyle = "#e11d48"; ctx.fillRect(mx + 8, base + 6, 2, 8);
  ctx.fillStyle = "#fff"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText((name || "?").charAt(0).toUpperCase(), mx, base + 14.5);
  const tx = flip > 0 ? r.x - 22 : r.x + r.w + 22, ty = base - 10;
  const sway = Math.sin(t / 1300 + h) * 1.5;
  if ((h >> 11) & 1) {                                    // tree
    ctx.fillStyle = "#5b3a1e"; ctx.fillRect(tx - 3, ty - 34, 6, 40);
    ctx.fillStyle = "#166534";
    ctx.beginPath(); ctx.arc(tx + sway, ty - 46, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#15803d";
    ctx.beginPath(); ctx.arc(tx - 8 + sway, ty - 38, 12, 0, Math.PI * 2); ctx.arc(tx + 9 + sway, ty - 40, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4ade80";
    ctx.beginPath(); ctx.arc(tx - 4 + sway, ty - 54, 6, 0, Math.PI * 2); ctx.fill();
  } else {                                                // flowering bush
    ctx.fillStyle = "#15803d";
    ctx.beginPath(); ctx.arc(tx + sway * 0.5, ty - 6, 14, 0, Math.PI * 2); ctx.arc(tx - 10, ty, 9, 0, Math.PI * 2); ctx.arc(tx + 10, ty, 9, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = ["#f472b6", "#fbbf24", "#fb7185"][(h + i) % 3];
      ctx.beginPath(); ctx.arc(tx - 10 + i * 5 + sway * 0.5, ty - 8 + ((i * 7) % 9), 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---- owner name plate (below the address plate world.js draws at r.y-42..-26) ----
  ctx.fillStyle = "rgba(0,0,0,.72)";
  roundRect(ctx, cx - 52, r.y - 24, 104, 18, 5, true, false);
  ctx.strokeStyle = isYou ? "#fbbf24" : "rgba(255,255,255,.25)"; ctx.lineWidth = 1.5;
  roundRect(ctx, cx - 52, r.y - 24, 104, 18, 5, false, true);
  ctx.fillStyle = isYou ? "#fbbf24" : "#fff";
  ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(name, cx, r.y - 15);
  ctx.textBaseline = "alphabetic";
}


// ---------- FURNITURE DRAWING ----------
function drawFurniture(ctx, f, def, opts = {}) {
  const x = f.x, y = f.y;
  const w = def.w, h = def.h;
  const c = def.color, a = def.accent || shadeColor(c, -25);
  ctx.save();
  // Build-mode rotation: spin the whole piece about its centre. Stored on the
  // placed piece as f.rot (radians) and persisted by the server.
  if (f.rot) { ctx.translate(x, y); ctx.rotate(f.rot); ctx.translate(-x, -y); }
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

// ---------- PIXEL SYMBOLS ----------
// Chunky hand-drawn glyphs that match the game's blocky look instead of the
// OS emoji font. Used by the Mega Jackpot reels/paytable, the Penthouse slot
// prop, and the iMessage pop-in. rows: equal-length strings; each char keys
// into PIXEL_PALETTE. Drawn centred and pixel-snapped.
const PIXEL_PALETTE = {
  " ": null,
  K: "#0b1020", o: "#1e293b", // outline / dark shade
  g: "#fde68a", G: "#f59e0b", H: "#b45309", // gold hi / mid / low
  b: "#60a5fa", B: "#1d4ed8", N: "#172554", // lapis
  w: "#f8fafc", i: "#0a0a0a", // white / pupil
  t: "#5eead4", T: "#0d9488", D: "#134e4a", // teal
  e: "#4ade80", // emerald
  p: "#f9a8d4", P: "#ec4899", Q: "#9d174d", // pink hi / mid / low
  y: "#fde047", // lotus centre
  s: "#15803d", S: "#166534", // leaf / stem
};
const PIXEL_SYMBOLS = {
  // Eye of Horus — white eye, blue liner, gold brow + the falcon markings.
  eye: { rows: [
    "                ",
    "       GGGG      ",
    "     GGH  HGG    ",
    "   GG          G ",
    " KKK            K",
    "K   BBBBBBBB     ",
    "K BB wwwwww BB   ",
    " BB w iiii w BBBB",
    "  B w iiii w B   ",
    "   BBwwwwwwBB     ",
    "    KBBBBBBK  G   ",
    "     KKKK    GG   ",
    "       K   GG     ",
    "       KGGG       ",
    "       H  G       ",
    "      HH  GG      ",
  ] },
  // Ankh — looped cross, bevelled gold.
  ankh: { rows: [
    "      GGGG       ",
    "     GHGGHG      ",
    "    GG G  GG     ",
    "    Gg G   G     ",
    "    Gg G   G     ",
    "    GG G  GG     ",
    "  GGGGGGGGGGGG   ",
    "  GHG GGGG GHG   ",
    "     Gg  G       ",
    "     Gg  G       ",
    "     Gg  G       ",
    "     Gg  G       ",
    "     Gg  G       ",
    "     GGGGG       ",
    "     GHHHG       ",
    "                 ",
  ] },
  // Scarab — beetle seen from above, gold rim over teal wing-cases.
  scarab: { rows: [
    "       GG        ",
    "   G  Gtt G   G  ",
    "    G GttG G  G  ",
    "  G  GGTTGG   G  ",
    "  GG TDttDT GG   ",
    " G TDteeetDT  G  ",
    "G  Dt eee tD   G ",
    "G  Dt eee tD   G ",
    " G TDt eee tDT G ",
    "  G TDtttttDT G  ",
    "   G TDTTTDT G   ",
    "   GG T   T GG   ",
    "  G   K   K   G  ",
    " G    K   K    G ",
    "      KK KK      ",
    "                 ",
  ] },
  // Lotus — layered petals, gold-yellow heart, green pad.
  lotus: { rows: [
    "        p        ",
    "   p    p    p   ",
    "   pp   p   pp   ",
    "  ppP  ppp  Ppp  ",
    "  pPP p pPp p PP ",
    " pPPQ pPyPp QPPp ",
    " pPQ QPyyyPQ QPp ",
    "  PPQ PyyyP QPP  ",
    "   QPPPyyyPPPQ   ",
    "    QPPP PPPQ    ",
    "     QQPPPQQ     ",
    "   s  QQQQQ   s  ",
    "  ss   sss   ss  ",
    " sSs  s S s  sSs ",
    "   Ss   S   sS   ",
    "     SSSSSSS     ",
  ] },
  // Speech bubble — for the iMessage-style DM pop-in.
  speech: { rows: [
    "                ",
    "  BBBBBBBBBBBB  ",
    " BbbbbbbbbbbbbB ",
    " BbwwwwwwwwwwbB ",
    " Bbwwwwwwwwwwbb ",
    " BbwwKKKKKKwwbB ",
    " BbwwwwwwwwwwbB ",
    " BbwwKKKKKKwwbB ",
    " BbwwwwwwwwwwbB ",
    " BbwwKKKKwwwwbB ",
    " BBbbbbbbbbbbBB ",
    "  BB bbbbbbbb   ",
    "  Bb b         ",
    "  b            ",
    "                ",
    "                ",
  ] },
};
function drawPixelSymbol(c, name, cx, cy, size) {
  const spec = PIXEL_SYMBOLS[name];
  if (!spec) return;
  const rows = spec.rows, R = rows.length, COLS = rows[0].length;
  const u = Math.max(1, Math.floor(size / Math.max(R, COLS)));
  const ox = Math.round(cx - (COLS * u) / 2), oy = Math.round(cy - (R * u) / 2);
  for (let r = 0; r < R; r++) {
    const line = rows[r];
    for (let col = 0; col < COLS; col++) {
      const fill = PIXEL_PALETTE[line[col]];
      if (!fill) continue;
      c.fillStyle = fill;
      c.fillRect(ox + col * u, oy + r * u, u, u);
    }
  }
}

window.GFX = {
  drawCharacter, drawNameAndBubble, drawChatStack, drawBuildingBox, drawTower, drawHouse,
  CHAT_STACK_MAX, CHAT_TTL,
  drawFurniture, roundRect, roundFill, roundStroke, shadeColor,
  DEFAULT_APPEARANCE, EMOTES, EMOTE_TTL, drawAura, drawPet,
  HOUSE_WALLS, HOUSE_ROOFS,
  PIXEL_SYMBOLS, drawPixelSymbol,
  flame: TB.flame,
};
