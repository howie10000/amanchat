/* INTERIORS — building interiors, home interior, hotspots, build mode */

// Each interior is defined by: dimensions, floor color, wall color, hotspots.
// Hotspots = { x, y, label, action }
const INTERIORS = {
  interior_home: { w: 1024, h: 640, floor: "#a16207", wall: "#fef3c7", trim: "#7c2d12" },
  interior_casino: {
    w: 1024, h: 640, floor: "#7f1d1d", wall: "#1f2937", trim: "#fcd34d",
    hotspots: [
      { x: 200, y: 240, label: "SLOT MACHINES", action: "casino_slots", icon: "slot" },
      { x: 512, y: 240, label: "ROULETTE", action: "casino_roulette", icon: "roulette" },
      { x: 824, y: 240, label: "BLACKJACK", action: "casino_blackjack", icon: "card" },
    ],
  },
  interior_bank: {
    w: 1024, h: 640, floor: "#d1d5db", wall: "#f3f4f6", trim: "#1e40af",
    hotspots: [
      { x: 300, y: 240, label: "DEPOSIT/WITHDRAW", action: "bank_main", icon: "vault" },
      { x: 720, y: 240, label: "CLAIM INTEREST", action: "bank_interest", icon: "coin" },
    ],
  },
  interior_furniture: {
    w: 1024, h: 640, floor: "#e7e5e4", wall: "#f5f5f4", trim: "#5b21b6",
    hotspots: [
      { x: 512, y: 240, label: "BROWSE CATALOG", action: "furniture_catalog", icon: "shop" },
    ],
    // Will draw a few sample furniture items
  },
  interior_lootbox: {
    w: 1024, h: 640, floor: "#831843", wall: "#fdf2f8", trim: "#9d174d",
    hotspots: [
      { x: 240, y: 280, label: "COMMON BOX $100", action: "lootbox_common", icon: "box1" },
      { x: 512, y: 260, label: "RARE BOX $400", action: "lootbox_rare", icon: "box2" },
      { x: 784, y: 240, label: "LEGENDARY $1500", action: "lootbox_legendary", icon: "box3" },
    ],
  },
  interior_quest: {
    w: 1024, h: 640, floor: "#78350f", wall: "#fef3c7", trim: "#7c2d12",
    hotspots: [
      { x: 512, y: 240, label: "QUEST BOARD", action: "quest_board", icon: "scroll" },
      { x: 200, y: 360, label: "INVITE FRIEND", action: "quest_invite", icon: "people" },
      { x: 824, y: 360, label: "DUEL ARENA", action: "duel_open", icon: "swords" },
    ],
  },
  interior_job: {
    w: 1024, h: 640, floor: "#1e3a8a", wall: "#dbeafe", trim: "#1e40af",
    hotspots: [
      { x: 220, y: 240, label: "PIZZA DELIVERY", action: "job_pizza", icon: "pizza" },
      { x: 512, y: 240, label: "TYPING TEST", action: "job_typing", icon: "kbd" },
      { x: 800, y: 240, label: "WHACK-A-MOLE", action: "job_whack", icon: "hammer" },
    ],
  },
  interior_barber: {
    w: 1024, h: 640, floor: "#0c4a6e", wall: "#f0f9ff", trim: "#0ea5e9",
    hotspots: [
      { x: 512, y: 240, label: "STYLE YOURSELF", action: "barber_open", icon: "scissors" },
    ],
  },
  interior_plaza: {
    w: 1024, h: 640, floor: "#9a3412", wall: "#fed7aa", trim: "#7c2d12",
    hotspots: [
      { x: 512, y: 240, label: "ANNOUNCEMENTS", action: "plaza_board", icon: "board" },
    ],
  },
  interior_mayor: {
    w: 1024, h: 640, floor: "#fef3c7", wall: "#fafaf9", trim: "#fbbf24",
    hotspots: [
      { x: 512, y: 240, label: "MAYOR'S DESK", action: "mayor_desk", icon: "desk" },
    ],
  },
};

async function enterOwnHome(initial) {
  state.area = "interior_home";
  state.interiorOf = state.user;
  const fr = await fbGet(`users/${state.user}/furniture`);
  state.interiorFurniture = arrayify(fr);
  state.pos.x = 512; state.pos.y = 540;
  state.facing = "up";
  if (initial) toast("Welcome home. Press <b>I</b> for inventory or <b>Build Mode</b> to redecorate.");
  updateHUD();
}

async function enterOtherHome(user) {
  state.area = "interior_home";
  state.interiorOf = user;
  const fr = await fbGet(`users/${user}/furniture`);
  state.interiorFurniture = arrayify(fr);
  state.pos.x = 512; state.pos.y = 540;
  state.facing = "up";
  toast(`Visiting ${user}'s house. ESC to leave.`);
  updateHUD();
}

function arrayify(v) { if (!v) return []; if (Array.isArray(v)) return v; return Object.values(v); }

async function enterBuilding(b) {
  const area = "interior_" + b.type;
  if (!INTERIORS[area]) return;
  state.area = area;
  state.pos.x = 512; state.pos.y = 540;
  state.facing = "up";
  updateHUD();
  toast(`Entered ${b.label}. Walk to a station and press E.`);
}

function leaveInterior() {
  const wasArea = state.area;
  // spawn outside whichever building/house we just left
  if (wasArea === "interior_home" && state.interiorOf) {
    const them = state._userCache?.[state.interiorOf];
    const r = them ? gameWorld.houseRect(them.houseIndex) : null;
    if (r) { state.pos.x = r.x + r.w/2; state.pos.y = r.y + r.h + 36; }
    state.interiorOf = null;
    state.buildMode = false; toggleBuildBanner(false);
    state.placeMode = null; state.selectedFurn = -1;
  } else {
    // building interior — find which type and place outside it
    const type = wasArea.replace("interior_", "");
    const b = gameWorld.BUILDINGS.find(x => x.type === type);
    if (b) { state.pos.x = b.x + b.w/2; state.pos.y = b.y + b.h + 36; }
  }
  state.area = "neighborhood";
  state.facing = "down";
  if (state.pos.y < 200 || state.pos.y > gameWorld.WORLD_H - 20) state.pos.y = 600;
  updateHUD();
}

// COLLISION inside interiors
function collidesInterior(nx, ny) {
  const room = interiorRoom();
  if (nx < room.x + 16 || nx > room.x + room.w - 16) return true;
  if (ny < room.y + 16 || ny > room.y + room.h - 8) return true;
  // furniture (only at home, build mode off)
  if (state.area === "interior_home" && !state.buildMode) {
    for (const f of state.interiorFurniture) {
      const def = FURNITURE_CATALOG[f.id]; if (!def) continue;
      // walkable categories: rugs, curtains, paintings, mirrors
      if (["rug","persianrug","curtain","painting","mirror"].includes(def.kind)) continue;
      if (nx > f.x - def.w/2 && nx < f.x + def.w/2 &&
          ny > f.y - def.h/2 && ny < f.y + def.h/2) return true;
    }
  }
  return false;
}

function interiorRoom() {
  return { x: 80, y: 80, w: 864, h: 480 };
}

// HOTSPOT detection
function hotspotAtPlayer() {
  const def = INTERIORS[state.area];
  if (!def || !def.hotspots) return null;
  for (const h of def.hotspots) {
    if (Math.hypot(state.pos.x - h.x, state.pos.y - h.y) < 50) return h;
  }
  return null;
}

// DRAW INTERIOR (generic)
function drawInterior() {
  const def = INTERIORS[state.area];
  if (!def) return;
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(VIEW_OX, VIEW_OY);
  const room = interiorRoom();
  // wall
  ctx.fillStyle = def.wall;
  ctx.fillRect(room.x - 30, room.y - 30, room.w + 60, room.h + 60);
  // floor (tile pattern)
  for (let gy = room.y; gy < room.y + room.h; gy += 32) {
    for (let gx = room.x; gx < room.x + room.w; gx += 32) {
      ctx.fillStyle = ((gx + gy) / 32) % 2 === 0 ? def.floor : GFX.shadeColor(def.floor, 12);
      ctx.fillRect(gx, gy, 32, 32);
    }
  }
  // wall trim/baseboard
  ctx.strokeStyle = def.trim; ctx.lineWidth = 5;
  ctx.strokeRect(room.x, room.y, room.w, room.h);
  // door at bottom
  ctx.fillStyle = "#3f2210";
  ctx.fillRect(room.x + room.w/2 - 30, room.y + room.h - 4, 60, 12);
  ctx.fillStyle = "#fcd34d";
  ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("DOOR (ESC)", room.x + room.w/2, room.y + room.h + 22);

  // Title
  ctx.fillStyle = def.trim;
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(buildingTitle(state.area), room.x + room.w/2, room.y - 12);

  // Special: home — draw furniture
  if (state.area === "interior_home") drawHomeContents();

  // Building-specific decor
  drawInteriorDecor(state.area);

  // Hotspots
  if (def.hotspots) {
    for (const h of def.hotspots) drawHotspot(h);
  }

  // Other players in this interior (dispX/dispY = eased position; see interpolateOthers)
  for (const [u, p] of Object.entries(state.others)) {
    let myArea = state.area;
    if (state.area === "interior_home") myArea = `inside:${state.interiorOf}`;
    if (p.area === myArea) {
      const px = typeof p.dispX === "number" ? p.dispX : p.x;
      const py = typeof p.dispY === "number" ? p.dispY : p.y;
      GFX.drawCharacter(ctx, px, py, p.appearance, { facing: p.facing });
      GFX.drawNameAndBubble(ctx, px, py, u, p.msg, false);
    }
  }
  // You
  GFX.drawCharacter(ctx, state.pos.x, state.pos.y, state.appearance,
                    { facing: state.facing, walking: state.walking });
  GFX.drawNameAndBubble(ctx, state.pos.x, state.pos.y, state.user,
                         (Date.now()-state.msgTs<4000)?state.msg:"", true);

  // Build mode preview
  if (state.area === "interior_home" && state.placeMode) {
    const d = FURNITURE_CATALOG[state.placeMode];
    if (d) {
      ctx.globalAlpha = 0.5;
      GFX.drawFurniture(ctx, { x: state.mouse.x, y: state.mouse.y }, d);
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore(); // end VIEW_OX/VIEW_OY translate — room content is done

  // Hotspot prompt (screen-anchored, not part of the room content above)
  const hs = hotspotAtPlayer();
  if (hs) {
    ctx.fillStyle = "rgba(0,0,0,.85)";
    GFX.roundFill(ctx, canvas.width/2 - 180, canvas.height - 50, 360, 32, 8, "rgba(0,0,0,.85)");
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1.5;
    GFX.roundStroke(ctx, canvas.width/2 - 180, canvas.height - 50, 360, 32, 8);
    ctx.fillStyle = "#fbbf24"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Press E — " + hs.label, canvas.width/2, canvas.height - 30);
  }
}

function buildingTitle(area) {
  const map = {
    interior_home: state.interiorOf === state.user ? `${state.user}'s Home` : `${state.interiorOf}'s Home (visiting)`,
    interior_casino: "LUCKY'S CASINO",
    interior_bank: "FIRST BANK",
    interior_furniture: "FURNITURELAND",
    interior_lootbox: "MYSTERY BOXES",
    interior_quest: "ADVENTURERS GUILD",
    interior_job: "JOBS CENTER",
    interior_barber: "TRIM & STYLE",
    interior_plaza: "TOWN PLAZA",
    interior_mayor: "TOWN HALL",
  };
  return map[area] || "Interior";
}

function drawHomeContents() {
  // sort by Y so closer items draw on top
  const arr = state.interiorFurniture.slice().sort((a,b) => a.y - b.y);
  for (let i = 0; i < arr.length; i++) {
    const f = arr[i];
    const def = FURNITURE_CATALOG[f.id]; if (!def) continue;
    const idx = state.interiorFurniture.indexOf(f);
    GFX.drawFurniture(ctx, f, def, {
      selected: state.buildMode && state.selectedFurn === idx,
    });
  }
}

function drawInteriorDecor(area) {
  const room = interiorRoom();
  if (area === "interior_casino") {
    // Slot machines (left), roulette table (center), blackjack table (right)
    drawCasinoSlots(220, 240);
    drawCasinoRoulette(512, 240);
    drawCasinoBlackjack(820, 240);
    // Carpet
    ctx.fillStyle = "#7f1d1d";
    ctx.fillRect(room.x + 40, room.y + 380, room.w - 80, 60);
    ctx.fillStyle = "#fcd34d";
    ctx.fillRect(room.x + 40, room.y + 380, room.w - 80, 6);
  } else if (area === "interior_bank") {
    // Vault on left, teller window center, ATM right
    drawBankVault(300, 240);
    drawBankTeller(700, 240);
  } else if (area === "interior_furniture") {
    // Display some furniture sample around the room
    const samples = ["sofa_3","bed_45","plant_75","table_27","tv_100","painting_115"];
    const positions = [{x:200,y:160},{x:380,y:160},{x:560,y:160},{x:720,y:160},{x:200,y:380},{x:840,y:380}];
    for (let i = 0; i < positions.length && i < FURNITURE_LIST.length; i++) {
      const def = FURNITURE_LIST[i * 30 + 5];
      if (def) GFX.drawFurniture(ctx, positions[i], def);
    }
  } else if (area === "interior_lootbox") {
    drawLootBox(240, 280, "#475569", "common");
    drawLootBox(512, 260, "#3b82f6", "rare");
    drawLootBox(784, 240, "#fbbf24", "legendary");
  } else if (area === "interior_quest") {
    // quest board, banners
    ctx.fillStyle = "#7c4a18";
    ctx.fillRect(room.x + room.w/2 - 80, room.y + 120, 160, 120);
    ctx.strokeStyle = "#3f2210"; ctx.lineWidth = 4;
    ctx.strokeRect(room.x + room.w/2 - 80, room.y + 120, 160, 120);
    ctx.fillStyle = "#fef3c7"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("QUESTS", room.x + room.w/2, room.y + 156);
    // Swords
    drawSwordIcon(200, 360);
    drawPeopleIcon(824, 360);
  } else if (area === "interior_job") {
    // Three job stations (pizza, typing, whack)
    drawPizzaSign(220, 220);
    drawKbdSign(512, 220);
    drawWhackSign(800, 220);
  } else if (area === "interior_barber") {
    // Mirror + chair
    ctx.fillStyle = "#fafaf9";
    ctx.fillRect(room.x + room.w/2 - 60, room.y + 80, 120, 100);
    ctx.strokeStyle = "#fcd34d"; ctx.lineWidth = 4;
    ctx.strokeRect(room.x + room.w/2 - 60, room.y + 80, 120, 100);
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(room.x + room.w/2 - 24, room.y + 200, 48, 60);
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(room.x + room.w/2 - 18, room.y + 220, 36, 32);
  } else if (area === "interior_plaza") {
    ctx.fillStyle = "#fef3c7";
    ctx.fillRect(room.x + 100, room.y + 100, room.w - 200, 200);
    ctx.strokeStyle = "#7c2d12"; ctx.lineWidth = 4;
    ctx.strokeRect(room.x + 100, room.y + 100, room.w - 200, 200);
  } else if (area === "interior_mayor") {
    ctx.fillStyle = "#7c4a18";
    ctx.fillRect(room.x + room.w/2 - 80, room.y + 200, 160, 60);
    // Crown above
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.moveTo(room.x + room.w/2 - 30, room.y + 100);
    ctx.lineTo(room.x + room.w/2 - 30, room.y + 130);
    ctx.lineTo(room.x + room.w/2 - 15, room.y + 110);
    ctx.lineTo(room.x + room.w/2, room.y + 90);
    ctx.lineTo(room.x + room.w/2 + 15, room.y + 110);
    ctx.lineTo(room.x + room.w/2 + 30, room.y + 130);
    ctx.lineTo(room.x + room.w/2 + 30, room.y + 100);
    ctx.closePath(); ctx.fill();
  }
}

function drawHotspot(h) {
  // glowing circle marker
  const t = Date.now() / 400;
  ctx.fillStyle = `rgba(251,191,36,${0.2 + Math.sin(t) * 0.1})`;
  ctx.beginPath(); ctx.arc(h.x, h.y + 50, 28 + Math.sin(t) * 4, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(h.x, h.y + 50, 28, 0, Math.PI*2); ctx.stroke();
  // Label below
  ctx.fillStyle = "rgba(0,0,0,.75)";
  GFX.roundFill(ctx, h.x - 80, h.y + 80, 160, 22, 6, "rgba(0,0,0,.75)");
  ctx.fillStyle = "#fbbf24"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(h.label, h.x, h.y + 95);
}

// Decor helpers
function drawCasinoSlots(x,y) {
  ctx.fillStyle = "#7c2d12";
  ctx.fillRect(x - 50, y - 60, 100, 120);
  ctx.fillStyle = "#fcd34d";
  ctx.fillRect(x - 50, y - 60, 100, 16);
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(x - 40, y - 30, 80, 50);
  ctx.fillStyle = "#fff"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("777", x, y + 5);
}
function drawCasinoRoulette(x, y) {
  const t = Date.now() / 1000;
  ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.2);
  ctx.fillStyle = "#fcd34d";
  ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI*2); ctx.fill();
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = i % 2 ? "#0a0a0a" : "#dc2626";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 56, i * Math.PI/9, (i+1) * Math.PI/9);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = "#fcd34d";
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawCasinoBlackjack(x, y) {
  // semicircular green table
  ctx.fillStyle = "#15803d";
  ctx.beginPath(); ctx.arc(x, y, 70, 0, Math.PI); ctx.fill();
  ctx.strokeStyle = "#7c4a18"; ctx.lineWidth = 4; ctx.stroke();
  // chips
  ctx.fillStyle = "#dc2626";
  ctx.beginPath(); ctx.arc(x - 30, y - 30, 8, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#3b82f6";
  ctx.beginPath(); ctx.arc(x + 30, y - 30, 8, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(x - 14, y - 14, 28, 16);
}
function drawBankVault(x,y) {
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(x - 50, y - 50, 100, 100);
  ctx.strokeStyle = "#fcd34d"; ctx.lineWidth = 4;
  ctx.strokeRect(x - 50, y - 50, 100, 100);
  ctx.fillStyle = "#fcd34d";
  ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI*2); ctx.fill();
}
function drawBankTeller(x,y) {
  ctx.fillStyle = "#7c4a18";
  ctx.fillRect(x - 60, y - 30, 120, 60);
  ctx.fillStyle = "#bae6fd";
  ctx.fillRect(x - 50, y - 60, 100, 40);
  ctx.strokeStyle = "#1f2937"; ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(x - 50 + i*25, y - 60);
    ctx.lineTo(x - 50 + i*25, y - 20);
    ctx.stroke();
  }
}
function drawLootBox(x,y,c,label) {
  ctx.fillStyle = c;
  ctx.fillRect(x - 36, y - 36, 72, 72);
  ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 3;
  ctx.strokeRect(x - 36, y - 36, 72, 72);
  ctx.fillStyle = "#fcd34d";
  ctx.fillRect(x - 36, y - 4, 72, 8);
  ctx.fillRect(x - 4, y - 36, 8, 72);
  ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(label.toUpperCase(), x, y + 60);
}
function drawSwordIcon(x,y) {
  ctx.fillStyle = "#9ca3af";
  ctx.fillRect(x - 4, y - 30, 8, 50);
  ctx.fillStyle = "#7c4a18";
  ctx.fillRect(x - 14, y + 15, 28, 6);
  ctx.fillStyle = "#fcd34d";
  ctx.fillRect(x - 6, y + 21, 12, 14);
}
function drawPeopleIcon(x,y) {
  ctx.fillStyle = "#3b82f6";
  ctx.beginPath(); ctx.arc(x - 10, y, 8, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#10b981";
  ctx.beginPath(); ctx.arc(x + 10, y, 8, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#3b82f6";
  ctx.fillRect(x - 16, y + 6, 12, 16);
  ctx.fillStyle = "#10b981";
  ctx.fillRect(x + 4, y + 6, 12, 16);
}
function drawPizzaSign(x,y) {
  ctx.fillStyle = "#fcd34d";
  ctx.beginPath(); ctx.arc(x, y, 36, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#dc2626";
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI/3;
    ctx.beginPath(); ctx.arc(x + Math.cos(a)*16, y + Math.sin(a)*16, 4, 0, Math.PI*2); ctx.fill();
  }
}
function drawKbdSign(x,y) {
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(x - 50, y - 18, 100, 36);
  ctx.fillStyle = "#9ca3af";
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 8; c++)
      ctx.fillRect(x - 46 + c*12, y - 14 + r*10, 8, 6);
}
function drawWhackSign(x,y) {
  ctx.fillStyle = "#7c4a18";
  ctx.fillRect(x - 4, y - 30, 8, 30);
  ctx.fillStyle = "#9ca3af";
  ctx.fillRect(x - 16, y - 36, 32, 14);
}

window.gameInteriors = {
  INTERIORS, enterOwnHome, enterOtherHome, enterBuilding, leaveInterior,
  collidesInterior, interiorRoom, hotspotAtPlayer, drawInterior,
};
