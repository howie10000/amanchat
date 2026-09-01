/* ============================================================
   GRAPHICS — drawing helpers for character, furniture, buildings.
   No emojis in-game.
   ============================================================ */

// ---------- CHARACTER ----------
// appearance: { skin, hair, hairColor, shirt, pants, hat, hatColor }
const DEFAULT_APPEARANCE = {
  skin: "#f5d0a9", hair: "short",
  hairColor: "#3f2210", shirt: "#3b82f6",
  pants: "#1e293b", hat: "none", hatColor: "#dc2626",
};

function drawCharacter(ctx, x, y, appearance, opts = {}) {
  const a = Object.assign({}, DEFAULT_APPEARANCE, appearance || {});
  const facing = opts.facing || "down";
  const walking = opts.walking || 0;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();

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

function drawNameAndBubble(ctx, x, y, name, msgs, isYou) {
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = isYou ? "#fbbf24" : "#fff";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.strokeText(name, x, y - 26);
  ctx.fillText(name, x, y - 26);
  drawChatStack(ctx, x, y, msgs);
}

// ---------- BUILDING ----------
// VEGAS. A four-storey neon tower rather than the usual shop box: lit window
// grid, a marquee, a rooftop sign and a spotlight sweep. Drawn from the ground
// up so the ground-floor doorway still lines up with the door hitbox.
function drawTower(ctx, b) {
  const t = Date.now();
  const storeys = b.storeys || 4;
  const bodyTop = b.y + 46;
  const bodyH = b.h - 46;

  // Ground shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(b.x + 6, b.y + b.h - 8, b.w, 12);

  // Tower body, tapering slightly toward the top
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + b.h);
  ctx.lineTo(b.x + 16, bodyTop);
  ctx.lineTo(b.x + b.w - 16, bodyTop);
  ctx.lineTo(b.x + b.w, b.y + b.h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 2; ctx.stroke();

  // Lit window grid — each pane flickers on its own slow cycle
  const cols = 7;
  const rowH = (bodyH - 70) / storeys;
  for (let row = 0; row < storeys; row++) {
    const inset = 16 * (1 - row / storeys);
    const rowY = bodyTop + 14 + row * rowH;
    for (let col = 0; col < cols; col++) {
      const cw = (b.w - inset * 2 - 24) / cols;
      const wx = b.x + inset + 12 + col * cw;
      const lit = Math.sin(t / 900 + row * 2.1 + col * 1.7) > -0.35;
      ctx.fillStyle = lit ? ["#fcd34d", "#f472b6", "#38bdf8", "#a78bfa"][(row + col) % 4] : "#1f2937";
      ctx.fillRect(wx, rowY, cw - 6, rowH * 0.52);
      ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 1;
      ctx.strokeRect(wx, rowY, cw - 6, rowH * 0.52);
    }
    // Floor band
    ctx.fillStyle = "rgba(251,191,36,.35)";
    ctx.fillRect(b.x + inset + 8, rowY + rowH * 0.62, b.w - inset * 2 - 16, 2);
  }

  // Marquee over the entrance
  const mw = b.w - 40;
  ctx.fillStyle = "#7f1d1d";
  ctx.fillRect(b.x + 20, b.y + b.h - 74, mw, 30);
  ctx.strokeStyle = "#fcd34d"; ctx.lineWidth = 3;
  ctx.strokeRect(b.x + 20, b.y + b.h - 74, mw, 30);
  for (let i = 0; i < 14; i++) {
    const on = ((t / 180 | 0) + i) % 3 !== 0;
    ctx.fillStyle = on ? "#fde047" : "#78350f";
    ctx.beginPath(); ctx.arc(b.x + 28 + i * (mw - 16) / 13, b.y + b.h - 78, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "#fcd34d"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("SLOTS · TABLES · JACKPOTS", b.x + b.w / 2, b.y + b.h - 54);

  // Grand doorway (matches doorHalf on the building record)
  const half = b.doorHalf || 46;
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(b.x + b.w / 2 - half, b.y + b.h - 44, half * 2, 44);
  ctx.fillStyle = "rgba(252,211,77,.30)";
  ctx.fillRect(b.x + b.w / 2 - half + 6, b.y + b.h - 38, half * 2 - 12, 38);
  ctx.strokeStyle = "#fcd34d"; ctx.lineWidth = 3;
  ctx.strokeRect(b.x + b.w / 2 - half, b.y + b.h - 44, half * 2, 44);
  // Red carpet out the front
  ctx.fillStyle = "#991b1b";
  ctx.fillRect(b.x + b.w / 2 - half + 8, b.y + b.h, half * 2 - 16, 34);
  ctx.fillStyle = "#fcd34d";
  ctx.fillRect(b.x + b.w / 2 - half + 8, b.y + b.h, 3, 34);
  ctx.fillRect(b.x + b.w / 2 + half - 11, b.y + b.h, 3, 34);

  // Rooftop crown + big neon sign
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(b.x + 30, b.y + 30, b.w - 60, 18);
  const glow = 0.55 + 0.45 * Math.abs(Math.sin(t / 420));
  ctx.save();
  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";
  ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.lineWidth = 4;
  ctx.strokeText(b.label, b.x + b.w / 2, b.y + 26);
  ctx.shadowColor = `rgba(251,191,36,${glow})`;
  ctx.shadowBlur = 26;
  ctx.fillStyle = "#fde047";
  ctx.fillText(b.label, b.x + b.w / 2, b.y + 26);
  ctx.restore();

  // Spotlight beams sweeping the sky
  for (let i = 0; i < 2; i++) {
    const a = Math.sin(t / 1600 + i * 2.2) * 0.55 + (i ? 0.5 : -0.5);
    ctx.save();
    ctx.translate(b.x + (i ? b.w - 26 : 26), b.y + 34);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, 0, -180);
    g.addColorStop(0, "rgba(253,224,71,.35)");
    g.addColorStop(1, "rgba(253,224,71,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(34, -180); ctx.lineTo(-34, -180);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
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

function drawHouse(ctx, r, name, isYou, mood) {
  const t = Date.now();
  const h = houseHash(name);
  const wall = isYou ? "#fef9c3" : HOUSE_WALLS[h % HOUSE_WALLS.length];
  const roof = isYou ? "#b45309" : HOUSE_ROOFS[(h >> 3) % HOUSE_ROOFS.length];
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
  DEFAULT_APPEARANCE,
};
