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

function drawNameAndBubble(ctx, x, y, name, msg, isYou) {
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = isYou ? "#fbbf24" : "#fff";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.strokeText(name, x, y - 26);
  ctx.fillText(name, x, y - 26);
  if (msg) {
    ctx.font = "12px sans-serif";
    const w = Math.min(220, ctx.measureText(msg).width + 16);
    ctx.fillStyle = "rgba(0,0,0,.85)";
    roundRect(ctx, x - w/2, y - 56, w, 22, 6, true, false);
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1;
    roundRect(ctx, x - w/2, y - 56, w, 22, 6, false, true);
    ctx.fillStyle = "#fff";
    ctx.fillText(msg, x, y - 41);
    // tail
    ctx.fillStyle = "rgba(0,0,0,.85)";
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 35); ctx.lineTo(x + 4, y - 35); ctx.lineTo(x, y - 30); ctx.closePath();
    ctx.fill();
  }
}

// ---------- BUILDING ----------
function drawBuildingBox(ctx, b) {
  // Drop shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(b.x + 4, b.y + b.h - 6, b.w, 8);
  // Walls
  ctx.fillStyle = b.color;
  ctx.fillRect(b.x, b.y + 18, b.w, b.h - 18);
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
    // Columns
    ctx.fillStyle = "#fafaf9";
    for (const cx of [b.x + 18, b.x + b.w - 30]) {
      ctx.fillRect(cx, b.y + 60, 12, b.h - 90);
      ctx.fillRect(cx - 2, b.y + 56, 16, 6);
      ctx.fillRect(cx - 2, b.y + b.h - 36, 16, 6);
    }
    // Stairs
    ctx.fillStyle = "#a8a29e";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(b.x - 8 + i * 4, b.y + b.h + i * 6, b.w + 16 - i * 8, 6);
    }
    // Flag pole + flag
    ctx.fillStyle = "#fafaf9";
    ctx.fillRect(b.x + b.w / 2 - 1, b.y - 30, 2, 24);
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(b.x + b.w / 2 + 1, b.y - 28, 16, 10);
  }
  // Windows
  ctx.fillStyle = "#bae6fd";
  for (let i = 0; i < 2; i++) {
    const wx = b.x + 14 + i * (b.w - 50);
    ctx.fillRect(wx, b.y + 32, 22, 22);
    ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1.5;
    ctx.strokeRect(wx, b.y + 32, 22, 22);
    ctx.beginPath();
    ctx.moveTo(wx + 11, b.y + 32); ctx.lineTo(wx + 11, b.y + 54);
    ctx.moveTo(wx, b.y + 43); ctx.lineTo(wx + 22, b.y + 43);
    ctx.stroke();
  }
  // Door
  ctx.fillStyle = "#3f2210";
  const dw = 28, dh = 38;
  ctx.fillRect(b.x + b.w / 2 - dw / 2, b.y + b.h - dh, dw, dh);
  ctx.fillStyle = "#fcd34d";
  ctx.beginPath();
  ctx.arc(b.x + b.w / 2 + 8, b.y + b.h - dh / 2, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Sign
  ctx.fillStyle = "#000c";
  roundRect(ctx, b.x + 10, b.y + 8, b.w - 20, 18, 4, true, false);
  ctx.strokeStyle = b.signColor || "#fbbf24"; ctx.lineWidth = 1.5;
  roundRect(ctx, b.x + 10, b.y + 8, b.w - 20, 18, 4, false, true);
  ctx.fillStyle = b.signColor || "#fbbf24";
  ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(b.label, b.x + b.w / 2, b.y + 21);
}

function drawHouse(ctx, r, name, isYou, mood) {
  // Walls
  ctx.fillStyle = isYou ? "#cbd5e1" : "#a8a29e";
  ctx.fillRect(r.x, r.y + 30, r.w, r.h - 30);
  // Roof
  ctx.fillStyle = isYou ? "#7c2d12" : "#3f2210";
  ctx.beginPath();
  ctx.moveTo(r.x - 10, r.y + 36);
  ctx.lineTo(r.x + r.w / 2, r.y - 6);
  ctx.lineTo(r.x + r.w + 10, r.y + 36);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#1c0a04"; ctx.lineWidth = 2; ctx.stroke();
  // Chimney
  ctx.fillStyle = "#7f1d1d";
  ctx.fillRect(r.x + r.w - 36, r.y + 4, 14, 24);
  // Windows
  ctx.fillStyle = "#fde68a";
  ctx.fillRect(r.x + 14, r.y + 50, 28, 26);
  ctx.fillRect(r.x + r.w - 42, r.y + 50, 28, 26);
  ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 14, r.y + 50, 28, 26);
  ctx.strokeRect(r.x + r.w - 42, r.y + 50, 28, 26);
  ctx.beginPath();
  ctx.moveTo(r.x + 14 + 14, r.y + 50); ctx.lineTo(r.x + 14 + 14, r.y + 76);
  ctx.moveTo(r.x + 14, r.y + 63); ctx.lineTo(r.x + 14 + 28, r.y + 63);
  ctx.moveTo(r.x + r.w - 42 + 14, r.y + 50); ctx.lineTo(r.x + r.w - 42 + 14, r.y + 76);
  ctx.moveTo(r.x + r.w - 42, r.y + 63); ctx.lineTo(r.x + r.w - 42 + 28, r.y + 63);
  ctx.stroke();
  // Door
  ctx.fillStyle = "#3f2210";
  ctx.fillRect(r.x + r.w / 2 - 16, r.y + r.h - 42, 32, 42);
  ctx.strokeStyle = "#0a0a0a"; ctx.strokeRect(r.x + r.w / 2 - 16, r.y + r.h - 42, 32, 42);
  ctx.fillStyle = "#fcd34d";
  ctx.beginPath();
  ctx.arc(r.x + r.w / 2 + 10, r.y + r.h - 42 / 2 - 8, 1.6, 0, Math.PI * 2);
  ctx.fill();
  // Lawn fence
  ctx.strokeStyle = "#fafaf9"; ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x - 2, r.y + r.h, r.w + 4, 1);
  // Name plate
  ctx.fillStyle = "rgba(0,0,0,.7)";
  roundRect(ctx, r.x + r.w / 2 - 50, r.y - 24, 100, 18, 5, true, false);
  ctx.fillStyle = isYou ? "#fbbf24" : "#fff";
  ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(name, r.x + r.w / 2, r.y - 11);
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
  drawCharacter, drawNameAndBubble, drawBuildingBox, drawHouse,
  drawFurniture, roundRect, roundFill, roundStroke, shadeColor,
  DEFAULT_APPEARANCE,
};
