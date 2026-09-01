/* INTERIORS — building interiors, home interior, hotspots, build mode */

// Each interior is defined by: dimensions, floor color, wall color, hotspots.
// Hotspots = { x, y, label, action }
const INTERIORS = {
  interior_home: { w: 1024, h: 640, floor: "#a16207", wall: "#fef3c7", trim: "#7c2d12" },
  // VEGAS — the tower. One area, four floors; the stations you can use come
  // from the floor you're standing on (see currentHotspots). The elevator is
  // against the east wall of every floor.
  interior_casino: {
    w: 1024, h: 640, floor: "#7f1d1d", wall: "#1f2937", trim: "#fcd34d",
    floors: [
      { name: "GROUND FLOOR — SLOTS & QUICK BETS", floor: "#6d1a1a", wall: "#241018", trim: "#fcd34d", neon: "#fcd34d",
        hotspots: [
          { x: 210, y: 210, label: "LUCKY 7s SLOTS", action: "casino_slots" },
          { x: 470, y: 210, label: "COIN FLIP", action: "casino_coinflip" },
          { x: 730, y: 210, label: "SCRATCH CARDS", action: "casino_scratch" },
        ] },
      { name: "2F — TABLE GAMES", floor: "#14532d", wall: "#052e16", trim: "#fcd34d", neon: "#4ade80",
        hotspots: [
          { x: 210, y: 210, label: "BLACKJACK", action: "casino_blackjack" },
          { x: 470, y: 210, label: "ROULETTE", action: "casino_roulette" },
          { x: 730, y: 210, label: "DICE TABLE", action: "casino_dice" },
        ] },
      { name: "3F — HIGH ROLLER LOUNGE", floor: "#3b0764", wall: "#1e1b4b", trim: "#c084fc", neon: "#c084fc",
        hotspots: [
          { x: 180, y: 200, label: "CRASH", action: "casino_crash" },
          { x: 390, y: 200, label: "PLINKO", action: "casino_plinko" },
          { x: 600, y: 200, label: "HIGHER OR LOWER", action: "casino_highlow" },
          { x: 810, y: 200, label: "VIDEO POKER", action: "casino_videopoker" },
        ] },
      { name: "SKY DECK — THE BIG ONES", floor: "#0c4a6e", wall: "#082f49", trim: "#38bdf8", neon: "#38bdf8",
        glass: true,
        hotspots: [
          { x: 220, y: 300, label: "HORSE RACING", action: "casino_horses" },
          { x: 500, y: 300, label: "MEGA JACKPOT SLOTS", action: "casino_jackpot" },
          { x: 780, y: 300, label: "WHEEL OF FORTUNE", action: "casino_wheel" },
        ] },
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
  // Respect the owner's lock: only the owner, key-holders, or the mayor may
  // enter a locked house. (Owner grants keys from the Friends panel; the flag
  // and keyholder list live on the owner's own user record.)
  const owner = (await fbGet(`users/${user}`)) || {};
  const hasKey = owner.keys && owner.keys[state.user];
  if (owner.locked && !hasKey && !state.isMayor) {
    toast(`🔒 ${user}'s door is locked. Ask them for a key.`);
    return;
  }
  state.area = "interior_home";
  state.interiorOf = user;
  state.interiorFurniture = arrayify(owner.furniture);
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
  state.casinoFloor = 0;
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

// The set of stations active right now. Multi-floor interiors (the Vegas
// tower) swap their hotspots per floor and always keep an elevator.
// Sits well clear of the door-side spawn point (512, 540) so arriving on a
// floor doesn't immediately park you on the elevator pad.
// Against the east wall, well clear of the door-side spawn point (512, 540)
// so arriving on a floor never parks you on the elevator pad.
const ELEVATOR = { x: 906, y: 400, label: "ELEVATOR", action: "casino_elevator" };
function currentHotspots() {
  const def = INTERIORS[state.area];
  if (!def) return [];
  if (def.floors) {
    const f = def.floors[state.casinoFloor || 0] || def.floors[0];
    return f.hotspots.concat([ELEVATOR]);
  }
  return def.hotspots || [];
}
function currentFloorStyle() {
  const def = INTERIORS[state.area];
  if (def && def.floors) return def.floors[state.casinoFloor || 0] || def.floors[0];
  return def;
}

// HOTSPOT detection.
// The glowing pad is drawn centred at (h.x, h.y + HOTSPOT_PAD_DY) — detection
// used to measure from (h.x, h.y) with a radius of 50, so standing dead-centre
// in the visible circle put you exactly 50px away and E did nothing. Measure
// from the pad the player can actually see, with room to spare, and pick the
// nearest station when two pads overlap.
const HOTSPOT_PAD_DY = 50;
const HOTSPOT_RADIUS = 78;
function hotspotAtPlayer() {
  let best = null, bestD = Infinity;
  for (const h of currentHotspots()) {
    const d = Math.hypot(state.pos.x - h.x, state.pos.y - (h.y + HOTSPOT_PAD_DY));
    if (d < HOTSPOT_RADIUS && d < bestD) { best = h; bestD = d; }
  }
  return best;
}

// DRAW INTERIOR (generic)
function drawInterior() {
  const base = INTERIORS[state.area];
  if (!base) return;
  const def = Object.assign({}, base, currentFloorStyle());
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
  // Lock status (own home only) — press L to toggle
  if (state.area === "interior_home" && state.interiorOf === state.user) {
    const locked = !!(state.data && state.data.locked);
    ctx.fillStyle = locked ? "#ef4444" : "#22c55e";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(locked ? "🔒 LOCKED — press L to unlock" : "🔓 UNLOCKED — press L to lock",
                 room.x + room.w/2, room.y + room.h + 40);
  }

  // Title
  ctx.fillStyle = def.trim;
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(buildingTitle(state.area), room.x + room.w/2, room.y - 12);

  // Special: home — draw furniture
  if (state.area === "interior_home") drawHomeContents();

  // Building-specific decor
  drawInteriorDecor(state.area);

  // Hotspots
  for (const h of currentHotspots()) drawHotspot(h);

  // Other players in this interior (dispX/dispY = eased position; see interpolateOthers)
  for (const [u, p] of Object.entries(state.others)) {
    let myArea = state.area;
    if (state.area === "interior_home") myArea = `inside:${state.interiorOf}`;
    if (p.area === myArea) {
      const px = typeof p.dispX === "number" ? p.dispX : p.x;
      const py = typeof p.dispY === "number" ? p.dispY : p.y;
      GFX.drawCharacter(ctx, px, py, p.appearance, { facing: p.facing });
      GFX.drawNameAndBubble(ctx, px, py, u, p.msgs || p.msg, false);
    }
  }
  // You
  GFX.drawCharacter(ctx, state.pos.x, state.pos.y, state.appearance,
                    { facing: state.facing, walking: state.walking });
  GFX.drawNameAndBubble(ctx, state.pos.x, state.pos.y, state.user, state.msgs, true);

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
    interior_casino: "🎰 VEGAS — " + ((INTERIORS.interior_casino.floors[state.casinoFloor || 0] || {}).name || ""),
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
    drawVegasFloor(state.casinoFloor || 0, room);
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
  // Glowing pad. Its radius is drawn to match HOTSPOT_RADIUS so what you see
  // is what E actually reaches.
  const t = Date.now() / 400;
  const active = hotspotAtPlayer() === h;
  ctx.fillStyle = `rgba(251,191,36,${(active ? 0.3 : 0.14) + Math.sin(t) * 0.06})`;
  ctx.beginPath(); ctx.ellipse(h.x, h.y + HOTSPOT_PAD_DY, HOTSPOT_RADIUS, HOTSPOT_RADIUS * 0.62, 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = active ? "#fde047" : "#fbbf24"; ctx.lineWidth = active ? 3 : 2;
  ctx.beginPath(); ctx.ellipse(h.x, h.y + HOTSPOT_PAD_DY, HOTSPOT_RADIUS, HOTSPOT_RADIUS * 0.62, 0, 0, Math.PI*2); ctx.stroke();
  // Label below
  ctx.fillStyle = "rgba(0,0,0,.75)";
  GFX.roundFill(ctx, h.x - 80, h.y + 80, 160, 22, 6, "rgba(0,0,0,.75)");
  ctx.fillStyle = "#fbbf24"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(h.label, h.x, h.y + 95);
}

// ---- VEGAS tower decor, one branch per floor ----
// Each floor gets its own carpet, ceiling lighting and furniture so the room
// reads as the games it holds rather than a coloured box with pads on it.
function drawVegasFloor(floor, room) {
  const f = currentFloorStyle();
  const neon = (f && f.neon) || "#fcd34d";
  const t = Date.now();

  if (f && f.glass) drawSkyDeckGlass(room);
  else drawVegasWallLights(room, neon, t);

  // Patterned carpet
  ctx.save();
  ctx.globalAlpha = 0.16;
  for (let gy = room.y + 300; gy < room.y + room.h - 10; gy += 26) {
    for (let gx = room.x + 10; gx < room.x + room.w - 10; gx += 26) {
      ctx.fillStyle = ((gx + gy) / 26) % 2 === 0 ? neon : "#000";
      ctx.beginPath();
      ctx.moveTo(gx + 13, gy); ctx.lineTo(gx + 26, gy + 13);
      ctx.lineTo(gx + 13, gy + 26); ctx.lineTo(gx, gy + 13);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();

  if (floor === 0) {
    drawSlotBank(210, 200);
    drawCoinFlipStand(470, 200);
    drawScratchKiosk(730, 200);
    drawVelvetRope(room.x + 40, room.y + 330, room.w - 80);
  } else if (floor === 1) {
    drawBlackjackTable(210, 210);
    drawRouletteTable(470, 205);
    drawCrapsTable(730, 210);
    drawVelvetRope(room.x + 40, room.y + 330, room.w - 80);
  } else if (floor === 2) {
    drawCrashScreen(180, 195);
    drawPlinkoBoard(390, 190);
    drawHighLowStand(600, 195);
    drawPokerCab(810, 195);
    drawLoungeSeats(room, "#c084fc");
  } else {
    drawHorseTrack(220, 300);
    drawJackpotSlots(500, 296);
    drawFortuneStand(780, 300);
  }

  drawElevator(ELEVATOR.x, ELEVATOR.y + 20, neon, floor);
}

// Animated neon strip that runs around the top of the wall.
function drawVegasWallLights(room, neon, t) {
  const rgb = neon === "#4ade80" ? "74,222,128" : neon === "#c084fc" ? "192,132,252"
            : neon === "#38bdf8" ? "56,189,248" : "252,211,77";
  for (let i = 0; i < 24; i++) {
    const a = 0.28 + 0.4 * Math.sin(t / 320 + i * 0.55);
    ctx.fillStyle = `rgba(${rgb},${a})`;
    ctx.fillRect(room.x + 12 + i * 36, room.y + 8, 26, 7);
  }
  // ceiling spots throwing pools of light on the floor
  for (let i = 0; i < 4; i++) {
    const cx = room.x + 130 + i * 200;
    const g = ctx.createRadialGradient(cx, room.y + 120, 8, cx, room.y + 120, 130);
    g.addColorStop(0, `rgba(${rgb},0.16)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, room.y + 120, 130, 0, Math.PI * 2); ctx.fill();
  }
}

// SKY DECK: floor-to-ceiling glass. You are looking down on the real town from
// the top of the tower, so the map is drawn tiny and everyone still outdoors
// shows up as a speck moving around far below.
function drawSkyDeckGlass(room) {
  const gx = room.x + 8, gy = room.y + 6, gw = room.w - 16, gh = 186;
  ctx.save();
  ctx.beginPath(); ctx.rect(gx, gy, gw, gh); ctx.clip();

  // sky, hazier toward the horizon
  const sky = ctx.createLinearGradient(0, gy, 0, gy + gh);
  sky.addColorStop(0, "#0b1d3a");
  sky.addColorStop(0.45, "#1e4a7a");
  sky.addColorStop(0.62, "#7dabcf");
  sky.addColorStop(1, "#2f5d33");
  ctx.fillStyle = sky;
  ctx.fillRect(gx, gy, gw, gh);
  // a few stars up high
  for (let i = 0; i < 30; i++) {
    const sx = gx + ((i * 137) % gw), sy = gy + ((i * 53) % 90);
    ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.4 * Math.abs(Math.sin(Date.now() / 800 + i))})`;
    ctx.fillRect(sx, sy, 1.6, 1.6);
  }

  // The streets below, in miniature. You are looking down the face of the
  // tower, so the view is centred on Vegas itself and scaled to about a sixth:
  // buildings become thumbnails and people become specks, which is the whole
  // "you are forty floors up" effect.
  const HORIZON = gy + gh * 0.30;
  const SCALE = 0.16;
  const vegas = gameWorld.BUILDINGS.find(b => b.tower) || { x: 0, w: 0, y: 0, h: 0 };
  const originX = gx + gw / 2 - (vegas.x + vegas.w / 2) * SCALE;
  // world y = 400 (the foot of the tower) sits on the horizon line
  const originY = HORIZON - 400 * SCALE;
  const M = (wx, wy) => ({ x: originX + wx * SCALE, y: originY + wy * SCALE });

  // ground
  ctx.fillStyle = "#3f6212";
  ctx.fillRect(gx, HORIZON, gw, gh);
  // roads
  ctx.fillStyle = "#3f3f46";
  for (const [ry, rh] of [[520, 80], [1900, 40], [2240, 40], [2520, 40], [2800, 40], [3080, 40]]) {
    const a = M(0, ry);
    ctx.fillRect(gx, a.y, gw, Math.max(1, rh * SCALE));
  }
  // park, pond, court
  let q = M(gameWorld.PARK.x, gameWorld.PARK.y);
  ctx.fillStyle = "#4d7c0f";
  ctx.fillRect(q.x, q.y, gameWorld.PARK.w * SCALE, gameWorld.PARK.h * SCALE);
  q = M(gameWorld.POND.x, gameWorld.POND.y);
  ctx.fillStyle = "#0e7490";
  ctx.beginPath(); ctx.ellipse(q.x, q.y, gameWorld.POND.rx * SCALE, gameWorld.POND.ry * SCALE, 0, 0, Math.PI * 2); ctx.fill();
  q = M(gameWorld.COURT.x, gameWorld.COURT.y);
  ctx.fillStyle = "#b45309";
  ctx.fillRect(q.x, q.y, gameWorld.COURT.w * SCALE, gameWorld.COURT.h * SCALE);
  // other buildings as little blocks with a lit roof
  for (const b of gameWorld.BUILDINGS) {
    if (b.tower) continue;
    const a = M(b.x, b.y);
    ctx.fillStyle = "#475569";
    ctx.fillRect(a.x, a.y, b.w * SCALE, b.h * SCALE);
    ctx.fillStyle = b.signColor || "#fbbf24";
    ctx.fillRect(a.x, a.y, b.w * SCALE, 1.5);
  }
  // houses
  const users = gameWorld.visibleHouseUsers();
  for (const [u, info] of Object.entries(users)) {
    const r = gameWorld.houseRect(info.houseIndex); if (!r) continue;
    const a = M(r.x, r.y);
    ctx.fillStyle = u === state.user ? "#fbbf24" : "#a8a29e";
    ctx.fillRect(a.x, a.y, Math.max(2, r.w * SCALE), Math.max(2, r.h * SCALE));
  }
  // Everyone still outside, far below. Two pixels tall is the point.
  for (const [u, pl] of Object.entries(state.others)) {
    if (pl.area !== "neighborhood") continue;
    const a = M(typeof pl.dispX === "number" ? pl.dispX : pl.x, typeof pl.dispY === "number" ? pl.dispY : pl.y);
    if (a.x < gx || a.x > gx + gw) continue;
    if (a.y < HORIZON - 4 || a.y > gy + gh) continue;
    ctx.fillStyle = "#0ea5e9";
    ctx.fillRect(a.x - 1.5, a.y - 4, 3, 4);
    ctx.fillStyle = "#fde68a";
    ctx.fillRect(a.x - 1.5, a.y - 7, 3, 3);
  }
  // your own house gets a marker so you can find it from up here
  const me = (state._userCache || {})[state.user];
  if (me && me.houseIndex != null) {
    const r = gameWorld.houseRect(me.houseIndex);
    if (r) {
      const a = M(r.x + r.w / 2, r.y);
      ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(a.x, a.y, 4 + Math.sin(Date.now() / 300), 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Glass: reflections, then mullions on top
  const sheen = ctx.createLinearGradient(gx, gy, gx + gw * 0.6, gy + gh);
  sheen.addColorStop(0, "rgba(255,255,255,0.14)");
  sheen.addColorStop(0.35, "rgba(255,255,255,0.03)");
  sheen.addColorStop(1, "rgba(255,255,255,0.10)");
  ctx.fillStyle = sheen;
  ctx.fillRect(gx, gy, gw, gh);
  ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 8;
  for (let i = -2; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(gx + i * 150, gy + gh);
    ctx.lineTo(gx + i * 150 + 120, gy);
    ctx.stroke();
  }
  ctx.restore();

  // Window frame: heavy mullions and a handrail along the bottom
  ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 7;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(gx + i * (gw / 6), gy); ctx.lineTo(gx + i * (gw / 6), gy + gh);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(gx, gy + gh * 0.5); ctx.lineTo(gx + gw, gy + gh * 0.5); ctx.stroke();
  ctx.lineWidth = 9; ctx.strokeStyle = "#082f49";
  ctx.strokeRect(gx, gy, gw, gh);
  // brass handrail
  ctx.fillStyle = "#94a3b8";
  ctx.fillRect(gx, gy + gh - 6, gw, 6);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillRect(gx, gy + gh - 6, gw, 2);
  ctx.fillStyle = "#38bdf8"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("\u2601 SKY DECK — FLOOR 40 — MIND THE VIEW", gx + gw / 2, gy + gh + 15);
}

function drawElevator(x, y, neon, floor) {
  ctx.fillStyle = "#18181b"; ctx.fillRect(x - 48, y - 84, 96, 100);
  ctx.strokeStyle = neon; ctx.lineWidth = 3; ctx.strokeRect(x - 48, y - 84, 96, 100);
  // doors, parted slightly
  ctx.fillStyle = "#3f3f46"; ctx.fillRect(x - 38, y - 74, 76, 88);
  ctx.fillStyle = "#52525b";
  ctx.fillRect(x - 38, y - 74, 34, 88);
  ctx.fillRect(x + 4, y - 74, 34, 88);
  ctx.strokeStyle = "#18181b"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 74); ctx.lineTo(x, y + 14); ctx.stroke();
  // floor indicator
  ctx.fillStyle = "#0a0a0a"; ctx.fillRect(x - 26, y - 100, 52, 16);
  ctx.fillStyle = neon; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(["G", "2F", "3F", "SKY"][floor] || "G", x, y - 88);
  ctx.font = "bold 10px sans-serif";
  ctx.fillText("ELEVATOR", x, y - 106);
  // call button
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath(); ctx.arc(x + 58, y - 40, 5, 0, Math.PI * 2); ctx.fill();
}

// ---- ground floor ----
function drawSlotBank(x, y) {
  for (let i = -1; i <= 1; i++) drawOneSlotCab(x + i * 56, y + (i === 0 ? 0 : 6), i === 0);
}
function drawOneSlotCab(x, y, big) {
  const w = big ? 52 : 46, h = big ? 104 : 92;
  ctx.fillStyle = "#7f1d1d";
  GFX.roundFill(ctx, x - w / 2, y - h / 2, w, h, 8, "#7f1d1d");
  ctx.strokeStyle = "#fcd34d"; ctx.lineWidth = 2;
  GFX.roundStroke(ctx, x - w / 2, y - h / 2, w, h, 8);
  // marquee
  const glow = 0.45 + 0.45 * Math.abs(Math.sin(Date.now() / 300 + x));
  ctx.fillStyle = `rgba(253,224,71,${glow})`;
  ctx.fillRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, 12);
  // screen with three reels
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(x - w / 2 + 5, y - h / 2 + 22, w - 10, 34);
  ctx.fillStyle = "#fcd34d"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("7 7 7", x, y - h / 2 + 44);
  // button deck + lever
  ctx.fillStyle = "#450a0a";
  ctx.fillRect(x - w / 2 + 4, y - h / 2 + 62, w - 8, 14);
  ctx.fillStyle = "#ef4444";
  ctx.beginPath(); ctx.arc(x, y - h / 2 + 69, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#9ca3af"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + w / 2, y - 6); ctx.lineTo(x + w / 2 + 10, y - 20); ctx.stroke();
  ctx.fillStyle = "#dc2626";
  ctx.beginPath(); ctx.arc(x + w / 2 + 10, y - 22, 4, 0, Math.PI * 2); ctx.fill();
  // stool
  ctx.fillStyle = "#7c2d12";
  ctx.beginPath(); ctx.ellipse(x, y + h / 2 + 26, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#57534e"; ctx.fillRect(x - 2, y + h / 2 + 26, 4, 12);
}
function drawCoinFlipStand(x, y) {
  ctx.fillStyle = "#7c2d12";
  GFX.roundFill(ctx, x - 52, y - 6, 104, 58, 8, "#7c2d12");
  ctx.fillStyle = "#0a0a0a"; ctx.fillRect(x - 52, y - 6, 104, 7);
  ctx.fillStyle = "#fcd34d"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("HEADS or TAILS", x, y + 24);
  const spin = Math.abs(Math.cos(Date.now() / 400));
  ctx.fillStyle = "#fcd34d";
  ctx.beginPath(); ctx.ellipse(x, y - 38, 20 * spin + 3, 20, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#a16207"; ctx.lineWidth = 2; ctx.stroke();
}
function drawScratchKiosk(x, y) {
  ctx.fillStyle = "#0f172a";
  GFX.roundFill(ctx, x - 46, y - 46, 92, 100, 8, "#0f172a");
  ctx.strokeStyle = "#fcd34d"; ctx.lineWidth = 2;
  GFX.roundStroke(ctx, x - 46, y - 46, 92, 100, 8);
  // rack of tickets
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    ctx.fillStyle = ["#f472b6", "#fbbf24", "#4ade80"][(r + c) % 3];
    ctx.fillRect(x - 36 + c * 25, y - 34 + r * 26, 20, 20);
    ctx.fillStyle = "rgba(255,255,255,.4)";
    ctx.fillRect(x - 36 + c * 25, y - 34 + r * 26, 20, 6);
  }
  ctx.fillStyle = "#fcd34d"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("SCRATCH & WIN", x, y + 48);
}
function drawVelvetRope(x, y, w) {
  for (const px of [x, x + w]) {
    ctx.fillStyle = "#a16207";
    ctx.fillRect(px - 3, y - 34, 6, 34);
    ctx.beginPath(); ctx.arc(px, y - 38, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#78350f";
    ctx.beginPath(); ctx.ellipse(px, y, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = "#991b1b"; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, y - 36);
  ctx.quadraticCurveTo(x + w / 2, y - 16, x + w, y - 36);
  ctx.stroke();
}

// ---- 2F table games ----
function feltTable(x, y, rx, ry, felt) {
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath(); ctx.ellipse(x, y + 8, rx + 4, ry + 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#5b3210";
  ctx.beginPath(); ctx.ellipse(x, y, rx + 7, ry + 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = felt;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(x, y, rx - 8, ry - 6, 0, 0, Math.PI * 2); ctx.stroke();
}
function chipStack(x, y, n, col) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? col : "#fafafa";
    ctx.beginPath(); ctx.ellipse(x, y - i * 3, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
  }
}
function drawBlackjackTable(x, y) {
  feltTable(x, y, 74, 46, "#15803d");
  ctx.fillStyle = "#fcd34d"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("BLACKJACK PAYS 3 to 2", x, y - 6);
  ctx.fillText("dealer stands on 17", x, y + 6);
  // card shoe
  ctx.fillStyle = "#7f1d1d"; ctx.fillRect(x + 48, y - 34, 20, 14);
  // three betting circles with chips
  for (let i = -1; i <= 1; i++) {
    ctx.strokeStyle = "rgba(252,211,77,.7)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x + i * 38, y + 26, 11, 5, 0, 0, Math.PI * 2); ctx.stroke();
  }
  chipStack(x - 38, y + 26, 3, "#ef4444");
  chipStack(x + 38, y + 26, 4, "#3b82f6");
  // two face-up cards
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = "#fafafa";
    GFX.roundFill(ctx, x - 16 + i * 18, y - 2, 15, 21, 3, "#fafafa");
    ctx.fillStyle = i ? "#dc2626" : "#18181b";
    ctx.font = "bold 9px sans-serif";
    ctx.fillText(i ? "K" : "A", x - 8 + i * 18, y + 12);
  }
}
function drawRouletteTable(x, y) {
  feltTable(x, y + 12, 88, 50, "#14532d");
  // the wheel itself, turning
  const t = Date.now() / 1200;
  ctx.save(); ctx.translate(x - 44, y - 4); ctx.scale(1, 0.62); ctx.rotate(t);
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = i % 2 ? "#18181b" : "#b91c1c";
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.arc(0, 0, 34, i * Math.PI / 9, (i + 1) * Math.PI / 9);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = "#a8a29e";
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#5b3210"; ctx.lineWidth = 4;
  ctx.save(); ctx.translate(x - 44, y - 4); ctx.scale(1, 0.62);
  ctx.beginPath(); ctx.arc(0, 0, 37, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // ball
  const ba = -t * 2.4;
  ctx.fillStyle = "#fafafa";
  ctx.beginPath(); ctx.arc(x - 44 + Math.cos(ba) * 30, y - 4 + Math.sin(ba) * 19, 3, 0, Math.PI * 2); ctx.fill();
  // betting layout on the felt
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) {
    ctx.fillStyle = (r + c) % 2 ? "#b91c1c" : "#18181b";
    ctx.fillRect(x + 4 + c * 10, y + 2 + r * 11, 9, 10);
  }
  chipStack(x + 44, y + 40, 4, "#22c55e");
}
function drawCrapsTable(x, y) {
  ctx.fillStyle = "rgba(0,0,0,.35)";
  GFX.roundFill(ctx, x - 78, y - 40, 156, 92, 14, "rgba(0,0,0,.35)");
  ctx.fillStyle = "#5b3210";
  GFX.roundFill(ctx, x - 76, y - 44, 152, 92, 14, "#5b3210");
  ctx.fillStyle = "#166534";
  GFX.roundFill(ctx, x - 68, y - 36, 136, 76, 10, "#166534");
  ctx.strokeStyle = "#fcd34d"; ctx.lineWidth = 1.5;
  GFX.roundStroke(ctx, x - 60, y - 28, 120, 60, 8);
  ctx.fillStyle = "#fcd34d"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("OVER 7   \u00b7   UNDER 7", x, y - 14);
  ctx.fillText("PASS LINE", x, y + 30);
  // two dice on the felt
  for (const [dx, n] of [[-20, 5], [16, 3]]) {
    ctx.fillStyle = "#fafafa";
    GFX.roundFill(ctx, x + dx - 13, y - 6, 26, 26, 5, "#fafafa");
    ctx.strokeStyle = "#a1a1aa"; ctx.lineWidth = 1;
    GFX.roundStroke(ctx, x + dx - 13, y - 6, 26, 26, 5);
    ctx.fillStyle = "#18181b";
    const pips = [[0, 0], [-7, -7], [7, 7], [-7, 7], [7, -7]].slice(0, n);
    for (const [px, py] of pips) { ctx.beginPath(); ctx.arc(x + dx + px, y + 7 + py, 2.4, 0, Math.PI * 2); ctx.fill(); }
  }
  chipStack(x - 50, y + 26, 3, "#a855f7");
  chipStack(x + 48, y + 26, 5, "#ef4444");
}

// ---- 3F high roller ----
function drawCrashScreen(x, y) {
  ctx.fillStyle = "#0a0a0a";
  GFX.roundFill(ctx, x - 58, y - 50, 116, 92, 6, "#0a0a0a");
  ctx.strokeStyle = "#c084fc"; ctx.lineWidth = 3;
  GFX.roundStroke(ctx, x - 58, y - 50, 116, 92, 6);
  // rising curve
  ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const p = i / 40;
    const yy = y + 32 - Math.pow(p, 2.2) * 74;
    if (i === 0) ctx.moveTo(x - 50, yy); else ctx.lineTo(x - 50 + p * 100, yy);
  }
  ctx.stroke();
  // little rocket at the tip
  ctx.fillStyle = "#e2e8f0";
  ctx.beginPath(); ctx.moveTo(x + 54, y - 44); ctx.lineTo(x + 44, y - 36); ctx.lineTo(x + 48, y - 32);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#f97316";
  ctx.beginPath(); ctx.arc(x + 44, y - 33, 2.6 + Math.random(), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#c084fc"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("CRASH", x, y - 58);
  ctx.fillStyle = "#22c55e"; ctx.font = "bold 14px sans-serif";
  ctx.fillText((1 + (Date.now() % 4000) / 1000).toFixed(2) + "\u00d7", x, y + 36);
}
function drawPlinkoBoard(x, y) {
  ctx.fillStyle = "#1e1b4b";
  GFX.roundFill(ctx, x - 62, y - 44, 124, 108, 6, "#1e1b4b");
  ctx.strokeStyle = "#c084fc"; ctx.lineWidth = 3;
  GFX.roundStroke(ctx, x - 62, y - 44, 124, 108, 6);
  ctx.fillStyle = "#e5e7eb";
  for (let r = 0; r < 5; r++)
    for (let c = 0; c <= r; c++) {
      ctx.beginPath(); ctx.arc(x - r * 10 + c * 20, y - 30 + r * 16, 2.6, 0, Math.PI * 2); ctx.fill();
    }
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i === 0 || i === 5 ? "#a855f7" : "#475569";
    ctx.fillRect(x - 58 + i * 20, y + 46, 18, 12);
  }
  // falling chip
  const fy = y - 40 + ((Date.now() / 8) % 84);
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath(); ctx.arc(x + Math.sin(fy / 9) * 22, fy, 4, 0, Math.PI * 2); ctx.fill();
}
function drawHighLowStand(x, y) {
  ctx.fillStyle = "#3b0764";
  GFX.roundFill(ctx, x - 56, y - 16, 112, 62, 8, "#3b0764");
  ctx.strokeStyle = "#c084fc"; ctx.lineWidth = 2;
  GFX.roundStroke(ctx, x - 56, y - 16, 112, 62, 8);
  for (const [dx, r, col] of [[-24, "9", "#dc2626"], [24, "?", "#18181b"]]) {
    ctx.fillStyle = "#fafafa";
    GFX.roundFill(ctx, x + dx - 18, y - 34, 36, 50, 5, "#fafafa");
    ctx.strokeStyle = "#a1a1aa"; ctx.lineWidth = 1;
    GFX.roundStroke(ctx, x + dx - 18, y - 34, 36, 50, 5);
    ctx.fillStyle = col;
    ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(r, x + dx, y - 2);
  }
  ctx.fillStyle = "#22c55e"; ctx.font = "bold 14px sans-serif";
  ctx.fillText("\u25b2", x - 2, y + 34);
  ctx.fillStyle = "#ef4444";
  ctx.fillText("\u25bc", x + 18, y + 34);
}
function drawPokerCab(x, y) {
  ctx.fillStyle = "#1e1b4b";
  GFX.roundFill(ctx, x - 44, y - 48, 88, 106, 8, "#1e1b4b");
  ctx.strokeStyle = "#c084fc"; ctx.lineWidth = 2;
  GFX.roundStroke(ctx, x - 44, y - 48, 88, 106, 8);
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(x - 36, y - 40, 72, 46);
  // five tiny cards on the screen
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(x - 33 + i * 14, y - 32, 11, 16);
    ctx.fillStyle = i % 2 ? "#dc2626" : "#18181b";
    ctx.font = "7px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("A", x - 27.5 + i * 14, y - 21);
  }
  ctx.fillStyle = "#fcd34d"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("JACKS OR BETTER", x, y + 2);
  // button row
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = "#dc2626";
    GFX.roundFill(ctx, x - 34 + i * 14, y + 14, 11, 9, 2, "#dc2626");
  }
}
function drawLoungeSeats(room, col) {
  for (const sx of [room.x + 90, room.x + room.w - 130]) {
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath(); ctx.ellipse(sx + 20, room.y + 400, 34, 8, 0, 0, Math.PI * 2); ctx.fill();
    GFX.roundFill(ctx, sx, room.y + 360, 46, 32, 8, "#4c1d95");
    GFX.roundFill(ctx, sx, room.y + 350, 46, 16, 8, "#5b21b6");
    ctx.fillStyle = col;
    ctx.fillRect(sx + 4, room.y + 372, 38, 3);
  }
}

// ---- sky deck ----
function drawHorseTrack(x, y) {
  ctx.fillStyle = "#0f172a";
  GFX.roundFill(ctx, x - 96, y - 46, 192, 96, 8, "#0f172a");
  ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 3;
  GFX.roundStroke(ctx, x - 96, y - 46, 192, 96, 8);
  ctx.fillStyle = "#166534";
  ctx.fillRect(x - 88, y - 34, 176, 76);
  ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(x - 88, y - 34 + i * 19); ctx.lineTo(x + 88, y - 34 + i * 19); ctx.stroke();
  }
  const t = Date.now() / 700;
  for (let i = 0; i < 4; i++) {
    const hx = x - 84 + ((t * (26 + i * 8)) % 160);
    ctx.font = "13px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(["\ud83d\udc0e", "\ud83d\udc34", "\ud83e\udd84", "\ud83d\udc0e"][i], hx, y - 20 + i * 19);
  }
  for (let yy = y - 34; yy < y + 42; yy += 8) {
    ctx.fillStyle = ((yy / 8) | 0) % 2 ? "#fafafa" : "#18181b";
    ctx.fillRect(x + 78, yy, 8, 8);
  }
  ctx.fillStyle = "#38bdf8"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("\ud83c\udfc7 THE RACES", x, y - 54);
}
function drawJackpotSlots(x, y) {
  ctx.fillStyle = "#7f1d1d";
  GFX.roundFill(ctx, x - 78, y - 58, 156, 124, 10, "#7f1d1d");
  ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 4;
  GFX.roundStroke(ctx, x - 78, y - 58, 156, 124, 10);
  // 3x3 window matching the actual game
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(x - 62, y - 30, 124, 76);
  const syms = ["\ud83d\udc8e", "\ud83d\udd14", "\ud83c\udf52"];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    ctx.font = "18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(syms[(r + c + Math.floor(Date.now() / 700)) % 3], x - 40 + c * 40, y - 12 + r * 25);
  }
  ctx.textBaseline = "alphabetic";
  const glow = 0.4 + 0.5 * Math.abs(Math.sin(Date.now() / 350));
  ctx.fillStyle = `rgba(251,191,36,${glow})`;
  ctx.fillRect(x - 78, y - 74, 156, 16);
  ctx.fillStyle = "#7c2d12"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("MEGA JACKPOT", x, y - 62);
}
function drawFortuneStand(x, y) {
  const t = Date.now() / 900;
  ctx.save(); ctx.translate(x, y - 8); ctx.rotate(t);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = ["#dc2626", "#fcd34d", "#16a34a", "#3b82f6"][i % 4];
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 54, i * Math.PI / 6, (i + 1) * Math.PI / 6); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(x, y - 8, 54, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#e5e7eb";
  ctx.beginPath(); ctx.arc(x, y - 8, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fafafa";
  ctx.beginPath(); ctx.moveTo(x - 7, y - 70); ctx.lineTo(x + 7, y - 70); ctx.lineTo(x, y - 54); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#38bdf8"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("WHEEL OF FORTUNE", x, y + 62);
}

// Decor helpers
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
  collidesInterior, interiorRoom, hotspotAtPlayer, currentHotspots, drawInterior,
};
