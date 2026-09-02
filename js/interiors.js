/* INTERIORS — building interiors, home interior, hotspots, build mode */

// Each interior is defined by: dimensions, floor color, wall color, hotspots.
// Hotspots = { x, y, label, action }
const INTERIORS = {
  interior_home: { w: 1024, h: 640, floor: "#a16207", wall: "#fef3c7", trim: "#7c2d12" },
  // VEGAS — the tower. One area, five floors; the stations you can use come
  // from the floor you're standing on (see currentHotspots). The elevator is
  // against the east wall of every floor.
  // Five named rooms, unlocked in order: you start with the lobby and buy
  // your way up. `price` is the one-off unlock cost (see gameCasino
  // floorUnlocked / unlockFloor), `short` is the elevator indicator.
  interior_casino: {
    w: 1024, h: 640, floor: "#7f1d1d", wall: "#1f2937", trim: "#fcd34d",
    floors: [
      { name: "THE STRIP", short: "LOBBY", tagline: "Slots & quick bets — where every night starts",
        price: 0, level: "Lobby",
        floor: "#3a0c0c", wall: "#120607", trim: "#fcd34d", neon: "#fcd34d", accent: "#b91c1c",
        hotspots: [
          { x: 210, y: 210, label: "LUCKY 7s SLOTS", action: "casino_slots" },
          { x: 470, y: 210, label: "COIN FLIP", action: "casino_coinflip" },
          { x: 730, y: 210, label: "SCRATCH CARDS", action: "casino_scratch" },
        ] },
      { name: "THE EMERALD ROOM", short: "EMERALD", tagline: "Table games under crystal chandeliers",
        price: 2500, level: "Floor 2",
        floor: "#0a2a18", wall: "#031009", trim: "#fcd34d", neon: "#4ade80", accent: "#166534",
        hotspots: [
          { x: 210, y: 210, label: "BLACKJACK", action: "casino_blackjack" },
          { x: 470, y: 210, label: "ROULETTE", action: "casino_roulette" },
          { x: 730, y: 210, label: "DICE TABLE", action: "casino_dice" },
        ] },
      { name: "THE VELVET LOUNGE", short: "VELVET", tagline: "High-roller games, low lights, deep sofas",
        price: 10000, level: "Floor 3",
        floor: "#1f0538", wall: "#0d0415", trim: "#e9d5ff", neon: "#c084fc", accent: "#6d28d9",
        hotspots: [
          { x: 180, y: 200, label: "CRASH", action: "casino_crash" },
          { x: 390, y: 200, label: "PLINKO", action: "casino_plinko" },
          { x: 600, y: 200, label: "HIGHER OR LOWER", action: "casino_highlow" },
          { x: 810, y: 200, label: "VIDEO POKER", action: "casino_videopoker" },
        ] },
      { name: "THE DIAMOND MEZZANINE", short: "DIAMOND", tagline: "Members only — keno, baccarat and mines",
        price: 30000, level: "Floor 4",
        floor: "#4a0c2c", wall: "#15040c", trim: "#fbcfe8", neon: "#f472b6", accent: "#be185d",
        hotspots: [
          { x: 260, y: 210, label: "KENO", action: "casino_keno" },
          { x: 510, y: 210, label: "BACCARAT", action: "casino_baccarat" },
          { x: 760, y: 210, label: "MINES", action: "casino_mines" },
        ] },
      { name: "THE PENTHOUSE", short: "PENTHOUSE", tagline: "Sky deck. The big money. The whole town at your feet",
        price: 75000, level: "Floor 40",
        floor: "#072a40", wall: "#03111d", trim: "#bae6fd", neon: "#38bdf8", accent: "#0369a1",
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
      { x: 300, y: 240, label: "DEPOSIT / WITHDRAW / DAILY", action: "bank_main", icon: "vault" },
      { x: 720, y: 240, label: "LOAN OFFICE", action: "bank_loans", icon: "coin" },
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
  // The SERVER decides whether the door opens (owner / staff / friend-with-key)
  // and hands back the room contents. The client can't read another player's
  // furniture, keys or friends list at all, so a locked house can't be walked
  // into by tampering with the client.
  let res;
  try { res = await netHome({ action: "enter", owner: user }); }
  catch (e) { toast(e.message || `Can't enter ${user}'s house.`); return; }
  state.area = "interior_home";
  state.interiorOf = user;
  state.interiorFurniture = arrayify(res.furniture);
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
// The elevator is a door set INTO the east wall, seen side-on, on every
// floor; the pad sits on the floor in front of it. x is pulled in from the
// wall so the pad doesn't spill outside the room.
const ELEVATOR = { x: 852, y: 372, label: "ELEVATOR", action: "casino_elevator" };
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
  const casino = state.area === "interior_casino";
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(VIEW_OX, VIEW_OY);
  const room = interiorRoom();
  if (casino) {
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
  } else {
    // Themed shell: floor, back wall, windows, lighting. Furniture and props
    // come later so they sit on top of the floor art.
    const r = ROOM_RENDERERS[state.area];
    if (r) r.base(room, Date.now());
    else drawSurround(room, def.wall);
  }
  // door at bottom
  ctx.fillStyle = "#3f2210";
  ctx.fillRect(room.x + room.w/2 - 30, room.y + room.h - 4, 60, 12);
  if (!casino) {
    // door mat + brass threshold so the exit reads as a doorway
    ctx.fillStyle = "#b8860b"; ctx.fillRect(room.x + room.w/2 - 30, room.y + room.h - 4, 60, 2);
  }
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
  const title = buildingTitle(state.area);
  ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center";
  if (!casino) {
    // plate behind the title so it stays readable over any surround colour
    const tw = ctx.measureText(title).width + 36;
    GFX.roundFill(ctx, room.x + room.w/2 - tw/2, room.y - 28, tw, 24, 6, "rgba(0,0,0,0.6)");
    ctx.strokeStyle = def.trim; ctx.lineWidth = 1.2;
    GFX.roundStroke(ctx, room.x + room.w/2 - tw/2, room.y - 28, tw, 24, 6);
    ctx.fillStyle = "#fef3c7";
  } else {
    ctx.fillStyle = def.trim;
  }
  ctx.fillText(title, room.x + room.w/2, room.y - 11);

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
    if (p.area !== myArea) continue;
    // VEGAS is one area with several floors: only show people on your floor.
    if (state.area === "interior_casino" && (p.floor || 0) !== (state.casinoFloor || 0)) continue;
    const px = typeof p.dispX === "number" ? p.dispX : p.x;
    const py = typeof p.dispY === "number" ? p.dispY : p.y;
    GFX.drawCharacter(ctx, px, py, p.appearance, { facing: p.facing, emote: p.emote });
    GFX.drawNameAndBubble(ctx, px, py, u, p.msgs || p.msg, false, p.appearance, p.role);
  }
  // You
  if (state.invisible) ctx.globalAlpha = 0.35;   // staff invisibility — ghosted on your own screen
  GFX.drawCharacter(ctx, state.pos.x, state.pos.y, state.appearance,
                    { facing: state.facing, walking: state.walking, emote: state.emote });
  GFX.drawNameAndBubble(ctx, state.pos.x, state.pos.y, state.user, state.msgs, true, state.appearance, state.role);
  ctx.globalAlpha = 1;

  // Build mode preview
  if (state.area === "interior_home" && state.placeMode) {
    const d = FURNITURE_CATALOG[state.placeMode];
    if (d) {
      const sn = (v) => (state.snapOn ? Math.round(v / 16) * 16 : v);
      const gx = sn(state.mouse.x), gy = sn(state.mouse.y);
      if (state.snapOn) drawSnapGrid();
      ctx.globalAlpha = 0.5;
      GFX.drawFurniture(ctx, { x: gx, y: gy, rot: state.placeRot || 0 }, d);
      ctx.globalAlpha = 1;
    }
  }
  // Snap grid overlay while dragging an existing piece, too.
  else if (state.area === "interior_home" && state.buildMode && state.snapOn && state.selectedFurn >= 0) {
    drawSnapGrid();
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

// Faint 16px lattice over the room floor — shown only while building with snap
// on, so it's clear pieces are locking to a grid.
function drawSnapGrid() {
  const room = interiorRoom();
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  const x0 = Math.ceil((room.x + 8) / 16) * 16, x1 = room.x + room.w - 8;
  const y0 = Math.ceil((room.y + 8) / 16) * 16, y1 = room.y + room.h - 8;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 16) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = y0; y <= y1; y += 16) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();
  ctx.restore();
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
    return;
  }
  const r = ROOM_RENDERERS[area];
  if (r && r.decor) r.decor(room, Date.now());
}

function drawHotspot(h) {
  // Glowing pad. Its radius is drawn to match HOTSPOT_RADIUS so what you see
  // is what E actually reaches.
  const t = Date.now() / 400;
  const active = hotspotAtPlayer() === h;
  const casino = state.area === "interior_casino";
  const py = h.y + HOTSPOT_PAD_DY;
  if (casino) {
    // Vegas: a soft gold pool of light with a hairline ring, matching the
    // black & gold of the elevator menu rather than a flat yellow disc.
    const g = ctx.createRadialGradient(h.x, py, 6, h.x, py, HOTSPOT_RADIUS);
    g.addColorStop(0, `rgba(212,160,23,${active ? 0.34 : 0.18})`);
    g.addColorStop(1, "rgba(212,160,23,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(h.x, py, HOTSPOT_RADIUS, HOTSPOT_RADIUS * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = active ? "#f5d270" : "rgba(212,160,23,0.75)"; ctx.lineWidth = active ? 2 : 1;
    ctx.beginPath(); ctx.ellipse(h.x, py, HOTSPOT_RADIUS - 6, (HOTSPOT_RADIUS - 6) * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(245,222,179,0.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(h.x, py, HOTSPOT_RADIUS - 12, (HOTSPOT_RADIUS - 12) * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
    // serif brass nameplate
    ctx.font = "bold 10px Georgia, 'Times New Roman', serif";
    const w = ctx.measureText(h.label).width + 34;
    GFX.roundFill(ctx, h.x - w / 2, h.y + 80, w, 20, 3, "#0a0806");
    ctx.strokeStyle = active ? "#f5d270" : "#d4a017"; ctx.lineWidth = 1;
    GFX.roundStroke(ctx, h.x - w / 2, h.y + 80, w, 20, 3);
    ctx.fillStyle = active ? "#f5d270" : "#f5deb3"; ctx.textAlign = "center";
    ctx.fillText("◆ " + h.label + " ◆", h.x, h.y + 94);
    return;
  }
  // Everywhere else: a pool of light that breathes, a rotating dashed ring,
  // and a clean label plate in the room's accent colour.
  const r = ROOM_RENDERERS[state.area];
  const accent = (r && r.accent) || "#fbbf24";
  const rgb = hexToRgb(accent);
  const pulse = 0.5 + 0.5 * Math.sin(t);
  const g = ctx.createRadialGradient(h.x, py, 4, h.x, py, HOTSPOT_RADIUS);
  g.addColorStop(0, `rgba(${rgb},${(active ? 0.42 : 0.22) + pulse * 0.08})`);
  g.addColorStop(0.7, `rgba(${rgb},${active ? 0.14 : 0.06})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(h.x, py, HOTSPOT_RADIUS, HOTSPOT_RADIUS * 0.62, 0, 0, Math.PI * 2); ctx.fill();
  // outer ring (the actual reach)
  ctx.strokeStyle = active ? "#ffffff" : `rgba(${rgb},0.8)`; ctx.lineWidth = active ? 2.5 : 1.5;
  ctx.beginPath(); ctx.ellipse(h.x, py, HOTSPOT_RADIUS - 2, (HOTSPOT_RADIUS - 2) * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
  // slowly turning dashed ring inside
  ctx.save();
  ctx.setLineDash([10, 8]); ctx.lineDashOffset = -(Date.now() / 60) % 18;
  ctx.strokeStyle = `rgba(255,255,255,${active ? 0.7 : 0.35})`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(h.x, py, HOTSPOT_RADIUS - 14, (HOTSPOT_RADIUS - 14) * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // centre glint
  ctx.fillStyle = `rgba(255,255,255,${0.25 + pulse * 0.35})`;
  ctx.beginPath(); ctx.ellipse(h.x, py, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
  // label plate
  ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
  const w = ctx.measureText(h.label).width + 30;
  GFX.roundFill(ctx, h.x - w / 2, h.y + 80, w, 22, 11, "rgba(10,10,12,0.82)");
  ctx.strokeStyle = active ? "#ffffff" : accent; ctx.lineWidth = active ? 1.6 : 1;
  GFX.roundStroke(ctx, h.x - w / 2, h.y + 80, w, 22, 11);
  ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(h.x - w / 2 + 11, h.y + 91, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = active ? "#ffffff" : "#fef3c7";
  ctx.fillText(h.label, h.x + 5, h.y + 95);
}

// ---- VEGAS tower decor, one branch per floor ----
// Each floor gets its own carpet, ceiling lighting and furniture so the room
// reads as the games it holds rather than a coloured box with pads on it.
function hexToRgb(hex) {
  const n = parseInt((hex || "#fcd34d").slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function drawVegasFloor(floor, room) {
  const f = currentFloorStyle();
  const neon = (f && f.neon) || "#fcd34d";
  const accent = (f && f.accent) || "#b91c1c";
  const t = Date.now();

  // Carpet: a damask lattice over the whole floor with a gold border and
  // a runner from the door — reads as one room instead of a tile grid.
  drawCasinoCarpet(room, f, neon, accent);

  if (f && f.glass) drawSkyDeckGlass(room);
  else drawVegasWall(room, f, neon, t);

  // Gilded pilasters framing the room
  for (const px of [room.x + 4, room.x + room.w - 18]) drawPilaster(px, room.y + 20, room.h - 40, neon);

  if (floor === 0) {
    drawSlotBank(210, 200);
    drawCoinFlipStand(470, 200);
    drawScratchKiosk(730, 200);
    drawVelvetRope(room.x + 60, room.y + 330, room.w - 250);
    drawPottedPalm(room.x + 60, room.y + 420);
    drawPottedPalm(room.x + room.w - 200, room.y + 420);
  } else if (floor === 1) {
    // Props stay off the centre runner: that's the walk-in path from the door.
    drawChandelier(room.x + 200, room.y + 40, neon, 30);
    drawChandelier(room.x + room.w - 200, room.y + 40, neon, 30);
    drawBlackjackTable(210, 210);
    drawRouletteTable(470, 205);
    drawCrapsTable(730, 210);
    drawVelvetRope(room.x + 60, room.y + 330, room.w - 250);
    drawDealerStand(room.x + 190, room.y + 425, neon);
  } else if (floor === 2) {
    drawDrapes(room, "#3b0764", "#c084fc");
    drawCrashScreen(180, 195);
    drawPlinkoBoard(390, 190);
    drawHighLowStand(600, 195);
    drawPokerCab(810, 195);
    drawLoungeSeats(room, "#c084fc");
    drawCocktailTable(room.x + room.w - 200, room.y + 425, neon);
  } else if (floor === 3) {
    drawChandelier(room.x + 200, room.y + 40, neon, 24);
    drawChandelier(room.x + room.w - 200, room.y + 40, neon, 24);
    drawKenoBoard(260, 195, neon);
    drawBaccaratTable(510, 210);
    drawMinesCabinet(760, 195, neon);
    drawVelvetRope(room.x + 60, room.y + 330, room.w - 250);
    drawDiamondDisplay(room.x + 190, room.y + 430, neon);
  } else {
    drawHorseTrack(220, 300);
    drawJackpotSlots(500, 296);
    drawFortuneStand(780, 300);
    drawLoungeSeats(room, "#38bdf8");
  }

  drawFloorSign(room, f, neon, t);
  drawAmbientSparkle(room, neon, t);
  drawElevator(ELEVATOR.x, ELEVATOR.y + 20, neon, floor, f);
}

// Casino carpet: dark base, repeating quatrefoil lattice in the floor's neon,
// a gold border with an inner pinstripe, and a runner leading in from the door.
function drawCasinoCarpet(room, f, neon, accent) {
  const rgb = hexToRgb(neon);
  ctx.fillStyle = (f && f.floor) || "#5c1414";
  ctx.fillRect(room.x, room.y, room.w, room.h);
  ctx.save();
  ctx.beginPath(); ctx.rect(room.x, room.y, room.w, room.h); ctx.clip();
  // lattice
  ctx.strokeStyle = `rgba(${rgb},0.10)`; ctx.lineWidth = 1.2;
  const S = 44;
  for (let gy = room.y; gy < room.y + room.h + S; gy += S) {
    for (let gx = room.x; gx < room.x + room.w + S; gx += S) {
      ctx.beginPath();
      ctx.moveTo(gx, gy + S / 2); ctx.quadraticCurveTo(gx + S / 2, gy + S / 2 - 12, gx + S, gy + S / 2);
      ctx.moveTo(gx + S / 2, gy); ctx.quadraticCurveTo(gx + S / 2 - 12, gy + S / 2, gx + S / 2, gy + S);
      ctx.stroke();
      ctx.fillStyle = `rgba(${rgb},0.09)`;
      ctx.beginPath(); ctx.arc(gx + S / 2, gy + S / 2, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  // soft vignette so the middle of the room is where the light is
  const vg = ctx.createRadialGradient(room.x + room.w / 2, room.y + room.h * 0.45, 120, room.x + room.w / 2, room.y + room.h * 0.45, room.w * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vg; ctx.fillRect(room.x, room.y, room.w, room.h);
  // runner from the door
  const rw = 120;
  const rg = ctx.createLinearGradient(0, room.y + room.h - 200, 0, room.y + room.h);
  rg.addColorStop(0, `rgba(${hexToRgb(accent)},0)`); rg.addColorStop(1, `rgba(${hexToRgb(accent)},0.85)`);
  ctx.fillStyle = rg; ctx.fillRect(room.x + room.w / 2 - rw / 2, room.y + room.h - 200, rw, 200);
  ctx.fillStyle = "rgba(252,211,77,0.55)";
  ctx.fillRect(room.x + room.w / 2 - rw / 2, room.y + room.h - 200, 2, 200);
  ctx.fillRect(room.x + room.w / 2 + rw / 2 - 2, room.y + room.h - 200, 2, 200);
  ctx.restore();
  // gold vignette from the top, like the menu's header glow
  const tg = ctx.createRadialGradient(room.x + room.w / 2, room.y, 40, room.x + room.w / 2, room.y, room.w * 0.55);
  tg.addColorStop(0, "rgba(212,160,23,0.16)"); tg.addColorStop(1, "rgba(212,160,23,0)");
  ctx.fillStyle = tg; ctx.fillRect(room.x, room.y, room.w, room.h * 0.5);
  // double gold frame with a dark inset, the same treatment as the menu box
  ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 2;
  ctx.strokeRect(room.x + 8, room.y + 8, room.w - 16, room.h - 16);
  ctx.strokeStyle = "#0a0806"; ctx.lineWidth = 3;
  ctx.strokeRect(room.x + 12, room.y + 12, room.w - 24, room.h - 24);
  ctx.strokeStyle = "rgba(212,160,23,0.5)"; ctx.lineWidth = 1;
  ctx.strokeRect(room.x + 15, room.y + 15, room.w - 30, room.h - 30);
  // corner medallions
  for (const [cx, cy] of [[room.x + 8, room.y + 8], [room.x + room.w - 8, room.y + 8], [room.x + 8, room.y + room.h - 8], [room.x + room.w - 8, room.y + room.h - 8]]) {
    ctx.fillStyle = "#0a0806"; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#d4a017"; ctx.beginPath(); ctx.moveTo(cx, cy - 3); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx - 3, cy); ctx.closePath(); ctx.fill();
  }
}

// Upper wall: panelled wainscot band, brass rail, and a neon cove light that
// breathes. Ceiling spots pool light on the floor beneath each station.
function drawVegasWall(room, f, neon, t) {
  const rgb = hexToRgb(neon);
  const wall = (f && f.wall) || "#1c0a0c";
  // wall panel band across the top of the room
  ctx.fillStyle = wall;
  ctx.fillRect(room.x + 18, room.y + 18, room.w - 36, 118);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let i = 0; i < 6; i++) ctx.fillRect(room.x + 30 + i * ((room.w - 60) / 6), room.y + 28, (room.w - 60) / 6 - 12, 90);
  ctx.strokeStyle = "rgba(212,160,23,0.5)"; ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) ctx.strokeRect(room.x + 30 + i * ((room.w - 60) / 6), room.y + 28, (room.w - 60) / 6 - 12, 90);
  // brass rail along the bottom of the band
  ctx.fillStyle = "#b8860b"; ctx.fillRect(room.x + 18, room.y + 134, room.w - 36, 4);
  ctx.fillStyle = "#f5deb3"; ctx.fillRect(room.x + 18, room.y + 134, room.w - 36, 1);
  // neon cove
  const breathe = 0.55 + 0.35 * Math.sin(t / 900);
  ctx.save();
  ctx.shadowColor = `rgba(${rgb},${breathe})`; ctx.shadowBlur = 18;
  ctx.fillStyle = neon; ctx.fillRect(room.x + 24, room.y + 22, room.w - 48, 3);
  ctx.restore();
  // ceiling spots
  for (let i = 0; i < 4; i++) {
    const cx = room.x + 130 + i * 200;
    const g = ctx.createRadialGradient(cx, room.y + 150, 8, cx, room.y + 150, 150);
    g.addColorStop(0, `rgba(${rgb},0.14)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, room.y + 150, 150, 0, Math.PI * 2); ctx.fill();
  }
}

function drawPilaster(x, y, h, neon) {
  ctx.fillStyle = "#3b2a10"; ctx.fillRect(x, y, 14, h);
  ctx.fillStyle = "#d4a017"; ctx.fillRect(x + 2, y, 3, h); ctx.fillRect(x + 9, y, 3, h);
  ctx.fillStyle = "#f5deb3"; ctx.fillRect(x, y - 6, 14, 6); ctx.fillRect(x, y + h, 14, 6);
  ctx.fillStyle = neon; ctx.globalAlpha = 0.6; ctx.fillRect(x + 5, y + 8, 4, 4); ctx.globalAlpha = 1;
}

// Backlit marquee naming the room, centred over the wall band.
function drawFloorSign(room, f, neon, t) {
  if (!f || !f.name) return;
  const rgb = hexToRgb(neon);
  // High on the wall band so it clears the tallest station (the coin flip's
  // spinning coin reaches y≈160).
  // On the glass floor it hangs in the sky, clear of the machines below.
  const cx = room.x + room.w / 2, cy = f.glass ? room.y + 44 : room.y + 46;
  ctx.font = "bold 20px Georgia, 'Times New Roman', serif"; ctx.textAlign = "center";
  const w = ctx.measureText(f.name).width + 60;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  GFX.roundFill(ctx, cx - w / 2, cy - 22, w, 34, 6, "rgba(0,0,0,0.55)");
  ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 1.5;
  GFX.roundStroke(ctx, cx - w / 2, cy - 22, w, 34, 6);
  ctx.save();
  ctx.shadowColor = `rgba(${rgb},${0.6 + 0.3 * Math.sin(t / 600)})`; ctx.shadowBlur = 16;
  ctx.fillStyle = neon;
  ctx.fillText(f.name, cx, cy + 3);
  ctx.restore();
  ctx.fillStyle = "#d4a017"; ctx.font = "9px sans-serif";
  ctx.fillText("✦  " + (f.level || "").toUpperCase() + "  ✦", cx, cy + 22);
}

// Slow-drifting glints in the air, like light catching dust under the lamps.
function drawAmbientSparkle(room, neon, t) {
  ctx.save();
  ctx.fillStyle = neon;
  for (let i = 0; i < 14; i++) {
    const ph = ((t / 2600) + i * 0.173) % 1;
    const x = room.x + 40 + ((i * 631) % (room.w - 80));
    const y = room.y + 60 + ph * (room.h - 120);
    ctx.globalAlpha = 0.35 * Math.sin(ph * Math.PI);
    ctx.beginPath(); ctx.arc(x + Math.sin(t / 700 + i) * 6, y, 1.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawChandelier(x, y, neon, r) {
  const t = Date.now();
  ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x, y); ctx.stroke();
  for (const tier of [r, r * 0.6]) {
    ctx.beginPath(); ctx.ellipse(x, y + (r - tier) * 0.6, tier, tier * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      const cx = x + Math.cos(a) * tier, cy = y + (r - tier) * 0.6 + Math.sin(a) * tier * 0.32;
      const tw = 0.6 + 0.4 * Math.sin(t / 250 + i * 1.3 + tier);
      ctx.fillStyle = `rgba(255,255,255,${tw})`;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 2.5, cy + 6); ctx.lineTo(cx, cy + 12); ctx.lineTo(cx + 2.5, cy + 6); ctx.closePath(); ctx.fill();
    }
  }
  // glow beneath
  const g = ctx.createRadialGradient(x, y + 10, 4, x, y + 10, r * 2.2);
  g.addColorStop(0, "rgba(255,240,200,0.28)"); g.addColorStop(1, "rgba(255,240,200,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + 10, r * 2.2, 0, Math.PI * 2); ctx.fill();
}

function drawDrapes(room, dark, light) {
  for (const side of [0, 1]) {
    const x0 = side ? room.x + room.w - 150 : room.x + 20;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? dark : GFX.shadeColor(dark, -14);
      ctx.fillRect(x0 + i * 22, room.y + 18, 22, 118);
    }
    ctx.fillStyle = light; ctx.globalAlpha = 0.5;
    ctx.fillRect(x0, room.y + 18, 132, 3); ctx.globalAlpha = 1;
    // tieback
    ctx.fillStyle = "#d4a017"; ctx.fillRect(x0 + 40, room.y + 90, 52, 6);
  }
}

function drawPottedPalm(x, y) {
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x, y + 26, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#7c2d12"; GFX.roundFill(ctx, x - 16, y, 32, 26, 4, "#7c2d12");
  ctx.fillStyle = "#d4a017"; ctx.fillRect(x - 16, y, 32, 3);
  ctx.strokeStyle = "#16a34a"; ctx.lineWidth = 4; ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.45;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * 26, y + Math.sin(a) * 26 - 10, x + Math.cos(a) * 44, y + Math.sin(a) * 44 + 8);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

function drawDealerStand(x, y, neon) {
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x, y + 24, 70, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3b2a10"; GFX.roundFill(ctx, x - 64, y - 12, 128, 34, 6, "#3b2a10");
  ctx.fillStyle = "#d4a017"; ctx.fillRect(x - 64, y - 12, 128, 3);
  ctx.fillStyle = neon; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("CAGE · CHIPS · CASHIER", x, y + 8);
  for (let i = 0; i < 5; i++) chipStack(x - 44 + i * 22, y - 16, 3 + (i % 3), ["#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#f59e0b"][i]);
}

function drawCocktailTable(x, y, neon) {
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x, y + 18, 30, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#18181b"; ctx.fillRect(x - 3, y - 6, 6, 22);
  ctx.fillStyle = "#27272a"; ctx.beginPath(); ctx.ellipse(x, y - 8, 30, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = neon; ctx.lineWidth = 1; ctx.stroke();
  // martini glass + candle
  ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x - 16, y - 22); ctx.lineTo(x - 8, y - 12); ctx.lineTo(x, y - 22); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 8, y - 12); ctx.lineTo(x - 8, y - 6); ctx.stroke();
  ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(x + 12, y - 16 + Math.sin(Date.now() / 120), 2.2, 0, Math.PI * 2); ctx.fill();
}

function drawDiamondDisplay(x, y, neon) {
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(x, y + 22, 40, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#18181b"; GFX.roundFill(ctx, x - 26, y - 10, 52, 30, 4, "#18181b");
  ctx.fillStyle = "rgba(186,230,253,0.18)"; ctx.fillRect(x - 22, y - 46, 44, 38);
  ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 1.5; ctx.strokeRect(x - 22, y - 46, 44, 38);
  const t = Date.now() / 500;
  ctx.fillStyle = neon;
  ctx.beginPath(); ctx.moveTo(x - 12, y - 34); ctx.lineTo(x + 12, y - 34); ctx.lineTo(x, y - 14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath(); ctx.moveTo(x - 12, y - 34); ctx.lineTo(x + 12, y - 34); ctx.lineTo(x + 6, y - 38); ctx.lineTo(x - 6, y - 38); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t));
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x + 8, y - 30, 2, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
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
}

// Brass art-deco elevator set into the EAST WALL, seen side-on: a recessed
// alcove cut through the wall, tall brass doors facing into the room, the
// sunburst "which floor is the car on" dial above, a landing mat in front.
// (x, y) is the pad centre passed in; the door is drawn at the wall.
function drawElevator(x, y, neon, floor, f) {
  const floors = INTERIORS.interior_casino.floors;
  const room = interiorRoom();
  const wx = room.x + room.w;          // inner face of the east wall
  const top = y - 118, h = 124;        // alcove spans the wall thickness
  const t = Date.now();
  // alcove cut into the wall (dark shaft behind the doors)
  ctx.fillStyle = "#0a0806"; ctx.fillRect(wx - 22, top, 52, h);
  const shaft = ctx.createLinearGradient(wx - 22, 0, wx + 30, 0);
  shaft.addColorStop(0, "rgba(212,160,23,0.10)"); shaft.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shaft; ctx.fillRect(wx - 22, top, 52, h);
  // gold architrave around the opening
  ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 3; ctx.strokeRect(wx - 22, top, 52, h);
  ctx.strokeStyle = "rgba(245,222,179,0.5)"; ctx.lineWidth = 1; ctx.strokeRect(wx - 18, top + 4, 44, h - 8);
  // brass doors, drawn foreshortened (we see them at an angle): two tall
  // leaves with a dark seam, inlaid panels, a slight vertical sheen
  const door = ctx.createLinearGradient(0, top + 10, 0, top + h - 10);
  door.addColorStop(0, "#f5d270"); door.addColorStop(0.5, "#b8860b"); door.addColorStop(1, "#7a5a0c");
  ctx.fillStyle = door;
  ctx.fillRect(wx - 16, top + 10, 18, h - 20);
  ctx.fillRect(wx + 6, top + 10, 18, h - 20);
  ctx.fillStyle = "#0a0806"; ctx.fillRect(wx + 2, top + 10, 4, h - 20);
  ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
  for (const dx of [-16, 6]) { ctx.strokeRect(wx + dx + 3, top + 16, 12, 38); ctx.strokeRect(wx + dx + 3, top + 60, 12, 40); }
  // brass handles
  ctx.fillStyle = "#f5deb3"; ctx.fillRect(wx - 1, top + 58, 1.5, 12); ctx.fillRect(wx + 7.5, top + 58, 1.5, 12);
  // sunburst dial above the door
  const dy = top - 12;
  ctx.fillStyle = "#0a0806"; ctx.beginPath(); ctx.arc(wx + 4, dy, 20, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(wx + 4, dy, 20, Math.PI, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(wx - 16, dy); ctx.lineTo(wx + 24, dy); ctx.stroke();
  for (let i = 0; i < floors.length; i++) {
    const a = Math.PI + (i / (floors.length - 1)) * Math.PI;
    ctx.fillStyle = i === floor ? neon : "rgba(245,222,179,0.45)";
    ctx.beginPath(); ctx.arc(wx + 4 + Math.cos(a) * 15, dy + Math.sin(a) * 15, i === floor ? 2.6 : 1.5, 0, Math.PI * 2); ctx.fill();
  }
  const na = Math.PI + (floor / (floors.length - 1)) * Math.PI;
  ctx.strokeStyle = neon; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(wx + 4, dy); ctx.lineTo(wx + 4 + Math.cos(na) * 12, dy + Math.sin(na) * 12); ctx.stroke();
  // room name plate over the dial
  GFX.roundFill(ctx, wx - 40, dy - 42, 88, 16, 3, "#0a0806");
  ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 1; GFX.roundStroke(ctx, wx - 40, dy - 42, 88, 16, 3);
  ctx.fillStyle = neon; ctx.font = "bold 9px Georgia, serif"; ctx.textAlign = "center";
  ctx.fillText((f && f.short) || "LOBBY", wx + 4, dy - 30);
  // call button on the wall beside the door, lit
  ctx.fillStyle = "#3b2a10"; ctx.fillRect(wx - 34, y - 44, 8, 16);
  ctx.save(); ctx.shadowColor = "#fde047"; ctx.shadowBlur = 8 + 4 * Math.sin(t / 300);
  ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(wx - 30, y - 40, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // landing mat on the floor in front of the doors
  ctx.fillStyle = "rgba(212,160,23,0.16)";
  ctx.beginPath(); ctx.moveTo(wx - 4, y - 6); ctx.lineTo(wx - 4, y + 6); ctx.lineTo(x - 30, y + 30); ctx.lineTo(x - 30, y - 30); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(212,160,23,0.45)"; ctx.lineWidth = 1; ctx.stroke();
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

// ---- diamond mezzanine ----
function drawKenoBoard(x, y, neon) {
  ctx.fillStyle = "#18181b";
  GFX.roundFill(ctx, x - 52, y - 52, 104, 108, 8, "#18181b");
  ctx.strokeStyle = neon; ctx.lineWidth = 2;
  GFX.roundStroke(ctx, x - 52, y - 52, 104, 108, 8);
  ctx.fillStyle = neon; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("KENO", x, y - 38);
  // 8x8 number board; a handful of numbers are "drawn" and glow
  const tick = Math.floor(Date.now() / 900);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const n = r * 8 + c;
    const hit = ((n * 7 + tick) % 11) === 0;
    ctx.fillStyle = hit ? neon : "#27272a";
    ctx.fillRect(x - 44 + c * 11, y - 30 + r * 9, 9, 7);
  }
  ctx.fillStyle = "#a1a1aa"; ctx.font = "8px sans-serif";
  ctx.fillText("PICK 1 – 10 · 20 DRAWN", x, y + 50);
}
function drawBaccaratTable(x, y) {
  feltTable(x, y, 78, 46, "#7f1d1d");
  ctx.fillStyle = "#fcd34d"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("BACCARAT", x, y - 24);
  // player / banker / tie boxes
  for (const [dx, lbl, col] of [[-42, "PLAYER", "#1d4ed8"], [0, "TIE", "#15803d"], [42, "BANKER", "#b91c1c"]]) {
    ctx.fillStyle = col;
    GFX.roundFill(ctx, x + dx - 18, y - 12, 36, 20, 3, col);
    ctx.fillStyle = "#fafafa"; ctx.font = "bold 7px sans-serif";
    ctx.fillText(lbl, x + dx, y + 1);
  }
  // two hands of cards
  for (const [dx, cards] of [[-28, ["8", "♥"]], [28, ["9", "♠"]]]) {
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = "#fafafa";
      GFX.roundFill(ctx, x + dx - 14 + i * 12, y + 12, 13, 18, 2, "#fafafa");
    }
    ctx.fillStyle = cards[1] === "♥" ? "#dc2626" : "#18181b"; ctx.font = "bold 8px sans-serif";
    ctx.fillText(cards[0] + cards[1], x + dx + 4, y + 25);
  }
  chipStack(x - 60, y + 22, 4, "#3b82f6");
  chipStack(x + 60, y + 22, 3, "#ef4444");
}
function drawMinesCabinet(x, y, neon) {
  ctx.fillStyle = "#0f172a";
  GFX.roundFill(ctx, x - 50, y - 52, 100, 108, 8, "#0f172a");
  ctx.strokeStyle = neon; ctx.lineWidth = 2;
  GFX.roundStroke(ctx, x - 50, y - 52, 100, 108, 8);
  ctx.fillStyle = neon; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("MINES", x, y - 38);
  const tick = Math.floor(Date.now() / 700);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const n = r * 5 + c;
    const open = ((n * 5 + tick) % 9) < 3;
    const bomb = open && n === (tick % 25);
    ctx.fillStyle = bomb ? "#450a0a" : open ? "#052e16" : "#1e293b";
    GFX.roundFill(ctx, x - 40 + c * 16, y - 30 + r * 14, 14, 12, 2, ctx.fillStyle);
    if (open) {
      ctx.fillStyle = bomb ? "#ef4444" : "#4ade80"; ctx.font = "8px sans-serif";
      ctx.fillText(bomb ? "✸" : "◆", x - 33 + c * 16, y - 21 + r * 14);
    }
  }
  ctx.fillStyle = "#a1a1aa"; ctx.font = "8px sans-serif";
  ctx.fillText("FIND THE GEMS · CASH OUT", x, y + 50);
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
  // 3x3 window with the real Mega Jackpot pixel symbols shuffling
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(x - 62, y - 30, 124, 76);
  const syms = ["eye", "ankh", "scarab", "lotus"];
  const step = Math.floor(Date.now() / 700);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    GFX.drawPixelSymbol(ctx, syms[(r * 2 + c + step) % 4], x - 40 + c * 40, y - 5 + r * 25, 24);
  }
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

// =====================================================================
// THEMED ROOMS — everything that isn't the Vegas tower.
// Each renderer has a `base` pass (floor, back wall, windows, lighting —
// drawn before the owner's furniture) and a `decor` pass (props, animated
// bits — drawn after furniture, before hotspot pads and players). `accent`
// tints that room's hotspot pads.
// The back wall occupies the top WALL_H px of the room; the floor is the
// rest. Props hug the walls so the walkable middle stays open.
// =====================================================================
const WALL_H = 130;
const _gradCache = {};
function cachedGrad(key, make) { return _gradCache[key] || (_gradCache[key] = make()); }
function rgbaOf(hex, a) { return `rgba(${hexToRgb(hex)},${a})`; }
// deterministic pseudo-random so floor veining / stones never flicker
function srand(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

function drawSurround(room, color) {
  ctx.fillStyle = color;
  ctx.fillRect(room.x - 30, room.y - 30, room.w + 60, room.h + 60);
  ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 4;
  ctx.strokeRect(room.x - 2, room.y - 2, room.w + 4, room.h + 4);
}

// Back wall with crown moulding, optional wainscot panels and a skirting
// board that throws a soft shadow onto the floor.
function drawBackWall(room, o) {
  const g = cachedGrad("wall:" + o.top + o.bottom, () => {
    const gg = ctx.createLinearGradient(0, room.y, 0, room.y + WALL_H);
    gg.addColorStop(0, o.top); gg.addColorStop(1, o.bottom); return gg;
  });
  ctx.fillStyle = g; ctx.fillRect(room.x, room.y, room.w, WALL_H);
  if (o.wainscot) {
    const wy = room.y + WALL_H - 58, wh = 48;
    ctx.fillStyle = o.wainscot; ctx.fillRect(room.x, wy, room.w, wh);
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(room.x, wy, room.w, 3);
    const n = 12, pw = room.w / n;
    for (let i = 0; i < n; i++) {
      ctx.strokeStyle = "rgba(0,0,0,0.28)"; ctx.lineWidth = 1;
      ctx.strokeRect(room.x + i * pw + 8, wy + 10, pw - 16, wh - 20);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.strokeRect(room.x + i * pw + 9, wy + 11, pw - 16, wh - 20);
    }
  }
  if (o.stripe) { ctx.fillStyle = o.stripe; ctx.fillRect(room.x, room.y + 44, room.w, 4); }
  // crown moulding
  ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(room.x, room.y, room.w, 7);
  ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(room.x, room.y + 7, room.w, 3);
  // skirting
  ctx.fillStyle = o.skirting || "#3f2210"; ctx.fillRect(room.x, room.y + WALL_H - 10, room.w, 10);
  ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.fillRect(room.x, room.y + WALL_H - 10, room.w, 2);
  const sh = cachedGrad("wallshadow", () => {
    const gg = ctx.createLinearGradient(0, room.y + WALL_H, 0, room.y + WALL_H + 22);
    gg.addColorStop(0, "rgba(0,0,0,0.35)"); gg.addColorStop(1, "rgba(0,0,0,0)"); return gg;
  });
  ctx.fillStyle = sh; ctx.fillRect(room.x, room.y + WALL_H, room.w, 22);
}

// Side walls seen in perspective: a dark strip down each side of the floor.
function drawSideWalls(room, color) {
  for (const side of [0, 1]) {
    const x = side ? room.x + room.w - 14 : room.x;
    ctx.fillStyle = color; ctx.fillRect(x, room.y + WALL_H, 14, room.h - WALL_H);
    const g = cachedGrad("side" + side + color, () => {
      const gg = ctx.createLinearGradient(side ? x + 14 : x, 0, side ? x : x + 14, 0);
      gg.addColorStop(0, "rgba(0,0,0,0.35)"); gg.addColorStop(1, "rgba(0,0,0,0)"); return gg;
    });
    ctx.fillStyle = g; ctx.fillRect(x, room.y + WALL_H, 14, room.h - WALL_H);
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(side ? x : x + 12, room.y + WALL_H, 2, room.h - WALL_H);
  }
}

// Window on the back wall, with a shaft of daylight falling onto the floor.
function drawWindow(x, y, w, h, o = {}) {
  const t = Date.now();
  const frame = o.frame || "#f5f5f4";
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x - 4, y - 4, w + 8, h + 10);
  const sky = cachedGrad("sky" + (o.night ? "n" : "d") + h, () => {
    const gg = ctx.createLinearGradient(0, y, 0, y + h);
    if (o.night) { gg.addColorStop(0, "#0b1d3a"); gg.addColorStop(1, "#1e3a5f"); }
    else { gg.addColorStop(0, "#60a5fa"); gg.addColorStop(0.7, "#bae6fd"); gg.addColorStop(1, "#e0f2fe"); }
    return gg;
  });
  ctx.fillStyle = sky; ctx.fillRect(x, y, w, h);
  // drifting clouds / stars
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (o.night) {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.5 * Math.abs(Math.sin(t / 900 + i))})`;
      ctx.fillRect(x + (i * 37) % w, y + (i * 23) % (h * 0.6), 1.5, 1.5);
    }
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 2; i++) {
      const cx = x + ((t / 60 + i * 90 + x) % (w + 60)) - 30, cy = y + 14 + i * 16;
      ctx.beginPath(); ctx.ellipse(cx, cy, 16, 6, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 8, cy - 4, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  // mullions
  ctx.strokeStyle = frame; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
  ctx.lineWidth = 5; ctx.strokeRect(x, y, w, h);
  // sill
  ctx.fillStyle = frame; ctx.fillRect(x - 6, y + h, w + 12, 6);
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x - 6, y + h + 6, w + 12, 3);
  if (o.curtain) {
    for (const side of [0, 1]) {
      const cx = side ? x + w - 6 : x - 18;
      ctx.fillStyle = o.curtain; GFX.roundFill(ctx, cx, y - 8, 24, h + 14, 4, o.curtain);
      ctx.fillStyle = "rgba(0,0,0,0.18)"; for (let i = 0; i < 3; i++) ctx.fillRect(cx + 4 + i * 7, y - 6, 2, h + 10);
    }
    ctx.fillStyle = GFX.shadeColor(o.curtain, -30); ctx.fillRect(x - 22, y - 12, w + 44, 5);
  }
  if (o.shaft !== false) drawLightShaft(x, y + h + 9, w, o.shaftLen || 150, o.night ? "#93c5fd" : "#fef9c3");
}

function drawLightShaft(x, y, w, len, col) {
  const g = cachedGrad("shaft" + x + y + len + col, () => {
    const gg = ctx.createLinearGradient(0, y, 0, y + len);
    gg.addColorStop(0, rgbaOf(col, 0.22)); gg.addColorStop(1, rgbaOf(col, 0)); return gg;
  });
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w + 50, y + len); ctx.lineTo(x - 50, y + len); ctx.closePath(); ctx.fill();
}

// Pool of ceiling light on the floor.
function drawLightPool(x, y, r, col, a) {
  const g = cachedGrad("pool" + x + y + r + col + a, () => {
    const gg = ctx.createRadialGradient(x, y, r * 0.05, x, y, r);
    gg.addColorStop(0, rgbaOf(col, a)); gg.addColorStop(1, rgbaOf(col, 0)); return gg;
  });
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
}

// Ceiling lamp hanging into view at the top of the wall, with its glow.
function drawPendantLamp(x, y, col) {
  ctx.strokeStyle = "#374151"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 40); ctx.lineTo(x, y); ctx.stroke();
  ctx.fillStyle = "#1f2937";
  ctx.beginPath(); ctx.moveTo(x - 22, y + 14); ctx.lineTo(x + 22, y + 14); ctx.lineTo(x + 8, y); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y + 14, 22, 5, 0, 0, Math.PI); ctx.fill();
  const g = cachedGrad("pend" + x + y + col, () => {
    const gg = ctx.createRadialGradient(x, y + 16, 4, x, y + 16, 70);
    gg.addColorStop(0, rgbaOf(col, 0.35)); gg.addColorStop(1, rgbaOf(col, 0)); return gg;
  });
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + 16, 70, 0, Math.PI * 2); ctx.fill();
}

function drawRug(x, y, w, h, base, border, o = {}) {
  ctx.fillStyle = "rgba(0,0,0,0.18)"; GFX.roundFill(ctx, x - w / 2 + 3, y - h / 2 + 4, w, h, 6, "rgba(0,0,0,0.18)");
  GFX.roundFill(ctx, x - w / 2, y - h / 2, w, h, 6, border);
  GFX.roundFill(ctx, x - w / 2 + 10, y - h / 2 + 10, w - 20, h - 20, 4, base);
  ctx.strokeStyle = rgbaOf(border, 0.6); ctx.lineWidth = 1.5;
  GFX.roundStroke(ctx, x - w / 2 + 18, y - h / 2 + 18, w - 36, h - 36, 3);
  if (o.medallion) {
    ctx.fillStyle = rgbaOf(border, 0.55);
    ctx.beginPath(); ctx.moveTo(x, y - h * 0.28); ctx.lineTo(x + w * 0.16, y); ctx.lineTo(x, y + h * 0.28); ctx.lineTo(x - w * 0.16, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = base; ctx.beginPath(); ctx.ellipse(x, y, w * 0.06, h * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (o.stripes) {
    ctx.fillStyle = rgbaOf(border, 0.35);
    for (let i = 1; i < 5; i++) ctx.fillRect(x - w / 2 + 10, y - h / 2 + 10 + i * ((h - 20) / 5) - 2, w - 20, 4);
  }
  // fringe
  ctx.fillStyle = rgbaOf(border, 0.8);
  for (let i = 0; i < w / 8; i++) { ctx.fillRect(x - w / 2 + i * 8 + 2, y - h / 2 - 5, 2, 5); ctx.fillRect(x - w / 2 + i * 8 + 2, y + h / 2, 2, 5); }
}

// Potted plant that sways gently.
function drawPlant(x, y, t, size = 1) {
  const s = size, sway = Math.sin(t / 900 + x) * 3 * s;
  ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(x, y + 4, 18 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#9a3412"; ctx.beginPath(); ctx.moveTo(x - 14 * s, y - 24 * s); ctx.lineTo(x + 14 * s, y - 24 * s); ctx.lineTo(x + 10 * s, y + 2); ctx.lineTo(x - 10 * s, y + 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#c2410c"; ctx.fillRect(x - 15 * s, y - 27 * s, 30 * s, 5 * s);
  ctx.strokeStyle = "#15803d"; ctx.lineWidth = 3.5 * s; ctx.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.42;
    const ex = x + Math.cos(a) * 34 * s + sway, ey = y - 28 * s + Math.sin(a) * 34 * s;
    ctx.beginPath(); ctx.moveTo(x, y - 26 * s);
    ctx.quadraticCurveTo(x + Math.cos(a) * 14 * s, y - 40 * s, ex, ey); ctx.stroke();
    ctx.fillStyle = i % 2 ? "#22c55e" : "#16a34a";
    ctx.beginPath(); ctx.ellipse(ex, ey, 7 * s, 4 * s, a, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineCap = "butt";
}

// Wall clock with a ticking second hand.
function drawClock(x, y, r, t) {
  ctx.fillStyle = "#1f2937"; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fafaf9"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1f2937";
  for (let i = 0; i < 12; i++) { const a = i / 6 * Math.PI; ctx.fillRect(x + Math.cos(a) * (r - 4) - 1, y + Math.sin(a) * (r - 4) - 1, 2, 2); }
  const d = new Date(t);
  const sec = Math.floor(d.getSeconds()), min = d.getMinutes(), hr = d.getHours() % 12;
  ctx.strokeStyle = "#1f2937"; ctx.lineWidth = 2;
  const hand = (a, len) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke(); };
  hand(-Math.PI / 2 + (hr + min / 60) / 6 * Math.PI, r * 0.5);
  hand(-Math.PI / 2 + min / 30 * Math.PI, r * 0.75);
  ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 1;
  hand(-Math.PI / 2 + sec / 30 * Math.PI, r * 0.8);
  ctx.fillStyle = "#dc2626"; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
}

// Picture frame with a little painted scene inside.
function drawPainting(x, y, w, h, kind, frame = "#b45309") {
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x - w / 2 + 3, y - h / 2 + 4, w, h);
  ctx.fillStyle = frame; ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = GFX.shadeColor(frame, 40); ctx.fillRect(x - w / 2, y - h / 2, w, 2); ctx.fillRect(x - w / 2, y - h / 2, 2, h);
  const ix = x - w / 2 + 6, iy = y - h / 2 + 6, iw = w - 12, ih = h - 12;
  if (kind === "landscape") {
    ctx.fillStyle = "#93c5fd"; ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.arc(ix + iw * 0.75, iy + ih * 0.3, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4d7c0f"; ctx.beginPath(); ctx.moveTo(ix, iy + ih); ctx.lineTo(ix + iw * 0.3, iy + ih * 0.4); ctx.lineTo(ix + iw * 0.6, iy + ih); ctx.fill();
    ctx.fillStyle = "#365314"; ctx.beginPath(); ctx.moveTo(ix + iw * 0.4, iy + ih); ctx.lineTo(ix + iw * 0.75, iy + ih * 0.5); ctx.lineTo(ix + iw, iy + ih); ctx.fill();
  } else if (kind === "portrait") {
    ctx.fillStyle = "#7f1d1d"; ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = "#1f2937"; ctx.beginPath(); ctx.ellipse(x, iy + ih * 0.85, iw * 0.34, ih * 0.3, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#fcd9b6"; ctx.beginPath(); ctx.arc(x, iy + ih * 0.42, iw * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#57534e"; ctx.beginPath(); ctx.arc(x, iy + ih * 0.36, iw * 0.19, Math.PI, 0); ctx.fill();
  } else if (kind === "abstract") {
    ctx.fillStyle = "#fef3c7"; ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(ix + iw * 0.35, iy + ih * 0.45, iw * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3b82f6"; ctx.fillRect(ix + iw * 0.55, iy + ih * 0.3, iw * 0.3, ih * 0.5);
    ctx.fillStyle = "#facc15"; ctx.fillRect(ix + iw * 0.1, iy + ih * 0.7, iw * 0.5, ih * 0.12);
  } else if (kind === "map") {
    ctx.fillStyle = "#e7d7b1"; ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = "#a3b18a"; ctx.beginPath(); ctx.ellipse(ix + iw * 0.4, iy + ih * 0.5, iw * 0.25, ih * 0.3, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8fbcd4"; ctx.beginPath(); ctx.ellipse(ix + iw * 0.72, iy + ih * 0.65, iw * 0.15, ih * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#7c2d12"; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(ix + 4, iy + ih - 4); ctx.lineTo(ix + iw * 0.4, iy + ih * 0.5); ctx.lineTo(ix + iw - 4, iy + 4); ctx.stroke(); ctx.setLineDash([]);
  }
}

// Flag on a pole that ripples.
function drawFlag(x, y, colors, t, h = 70) {
  ctx.fillStyle = "#57534e"; ctx.fillRect(x - 2, y, 4, h);
  ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(x, y - 3, 4, 0, Math.PI * 2); ctx.fill();
  const bands = colors.length, bh = 34 / bands;
  for (let b = 0; b < bands; b++) {
    ctx.fillStyle = colors[b];
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const px = x + 2 + i * 3.5, w = Math.sin(t / 220 + i * 0.6) * 2.5 * (i / 12);
      if (i === 0) ctx.moveTo(px, y + 4 + b * bh + w); else ctx.lineTo(px, y + 4 + b * bh + w);
    }
    for (let i = 12; i >= 0; i--) {
      const px = x + 2 + i * 3.5, w = Math.sin(t / 220 + i * 0.6) * 2.5 * (i / 12);
      ctx.lineTo(px, y + 4 + (b + 1) * bh + w);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(x, y + h + 2, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#44403c"; ctx.beginPath(); ctx.ellipse(x, y + h, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill();
}

function drawBrassRail(x, y, w) {
  for (let px = x; px <= x + w; px += w / 3) {
    ctx.fillStyle = "#b8860b"; ctx.fillRect(px - 2, y - 30, 4, 30);
    ctx.fillStyle = "#f5deb3"; ctx.beginPath(); ctx.arc(px, y - 33, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#78350f"; ctx.beginPath(); ctx.ellipse(px, y, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x + w, y - 30); ctx.stroke();
  ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y - 31); ctx.lineTo(x + w, y - 31); ctx.stroke();
}

function drawCandle(x, y, t, h = 14) {
  ctx.fillStyle = "#fef3c7"; ctx.fillRect(x - 3, y - h, 6, h);
  ctx.fillStyle = "#fde68a"; ctx.fillRect(x - 3, y - h, 2, h);
  const fl = 0.7 + 0.3 * Math.sin(t / 90 + x * 3), wob = Math.sin(t / 130 + x) * 1.2;
  ctx.fillStyle = "#f97316"; ctx.beginPath(); ctx.ellipse(x + wob, y - h - 5, 2.6, 5 * fl, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.ellipse(x + wob, y - h - 4, 1.3, 2.8 * fl, 0, 0, Math.PI * 2); ctx.fill();
}

function drawShadowEllipse(x, y, rx, ry) {
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

function wallSign(x, y, text, o = {}) {
  ctx.font = `bold ${o.size || 11}px ${o.serif ? "Georgia, serif" : "sans-serif"}`; ctx.textAlign = "center";
  const w = ctx.measureText(text).width + 24, h = (o.size || 11) + 12;
  GFX.roundFill(ctx, x - w / 2, y - h / 2, w, h, 4, o.bg || "#1f2937");
  ctx.strokeStyle = o.border || "#fbbf24"; ctx.lineWidth = 1.5; GFX.roundStroke(ctx, x - w / 2, y - h / 2, w, h, 4);
  ctx.fillStyle = o.color || "#fbbf24"; ctx.fillText(text, x, y + (o.size || 11) * 0.36);
}

// ---------------- HOME ----------------
function drawWoodFloor(room, y0, base, dark) {
  ctx.fillStyle = base; ctx.fillRect(room.x, y0, room.w, room.y + room.h - y0);
  const ph = 22, pw = 120;
  for (let r = 0, gy = y0; gy < room.y + room.h; gy += ph, r++) {
    const off = (r % 2) * 60;
    for (let gx = room.x - off; gx < room.x + room.w; gx += pw) {
      const i = r * 31 + ((gx + off) / pw);
      ctx.fillStyle = rgbaOf(dark, 0.10 + srand(i) * 0.18);
      ctx.fillRect(Math.max(gx, room.x), gy, Math.min(gx + pw, room.x + room.w) - Math.max(gx, room.x), ph);
      // grain
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(Math.max(gx + 10, room.x), gy + 6 + srand(i + 7) * 10, 40 + srand(i + 3) * 50, 1);
    }
    ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(room.x, gy, room.w, 1);
    for (let gx = room.x - off + pw; gx < room.x + room.w; gx += pw) ctx.fillRect(gx, gy, 1, ph);
  }
}

const homeRoom = {
  accent: "#fbbf24",
  base(room, t) {
    drawSurround(room, "#3b2a1a");
    drawWoodFloor(room, room.y + WALL_H, "#b45309", "#78350f");
    drawBackWall(room, { top: "#fff7e6", bottom: "#fde9c4", skirting: "#7c2d12", stripe: "#fbcfa5" });
    drawSideWalls(room, "#fde9c4");
    // window with curtains, letting daylight fall across the floor
    drawWindow(room.x + 150, room.y + 26, 130, 76, { curtain: "#c2410c", shaftLen: 170 });
    drawWindow(room.x + room.w - 280, room.y + 26, 130, 76, { curtain: "#c2410c", shaftLen: 170 });
    drawRug(room.x + room.w / 2, room.y + 340, 260, 150, "#b91c1c", "#7f1d1d", { medallion: true });
    // door mat
    GFX.roundFill(ctx, room.x + room.w / 2 - 40, room.y + room.h - 34, 80, 26, 3, "#57534e");
    ctx.strokeStyle = "#a8a29e"; ctx.lineWidth = 1; GFX.roundStroke(ctx, room.x + room.w / 2 - 36, room.y + room.h - 30, 72, 18, 2);
    ctx.fillStyle = "#d6d3d1"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("WELCOME", room.x + room.w / 2, room.y + room.h - 18);
    drawLightPool(room.x + room.w / 2, room.y + 300, 260, "#fde68a", 0.14);
    // wall bits
    drawPendantLamp(room.x + room.w / 2, room.y + 20, "#fde68a");
    drawClock(room.x + room.w / 2 + 190, room.y + 60, 15, t);
    drawPainting(room.x + room.w / 2 - 190, room.y + 62, 54, 42, "landscape", "#78350f");
    // light switch
    ctx.fillStyle = "#e7e5e4"; ctx.fillRect(room.x + room.w - 70, room.y + 78, 8, 12);
  },
  decor() {},
};

// ---------------- TOWN HALL ----------------
function drawMarbleFloor(room, y0, base, vein) {
  ctx.fillStyle = base; ctx.fillRect(room.x, y0, room.w, room.y + room.h - y0);
  const S = 96;
  for (let gy = y0, r = 0; gy < room.y + room.h; gy += S, r++) {
    for (let gx = room.x, c = 0; gx < room.x + room.w; gx += S, c++) {
      const w = Math.min(S, room.x + room.w - gx), h = Math.min(S, room.y + room.h - gy);
      ctx.fillStyle = (r + c) % 2 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.18)";
      ctx.fillRect(gx, gy, w, h);
      // veining
      const i = r * 17 + c;
      ctx.strokeStyle = rgbaOf(vein, 0.25); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(gx + srand(i) * w, gy);
      ctx.quadraticCurveTo(gx + srand(i + 1) * w, gy + h * 0.5, gx + srand(i + 2) * w, gy + h); ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.strokeRect(gx + 0.5, gy + 0.5, w - 1, h - 1);
    }
  }
  // sheen
  const g = cachedGrad("marblesheen" + y0, () => {
    const gg = ctx.createLinearGradient(room.x, y0, room.x + room.w, room.y + room.h);
    gg.addColorStop(0, "rgba(255,255,255,0.18)"); gg.addColorStop(0.5, "rgba(255,255,255,0)"); gg.addColorStop(1, "rgba(255,255,255,0.12)"); return gg;
  });
  ctx.fillStyle = g; ctx.fillRect(room.x, y0, room.w, room.y + room.h - y0);
}

function drawTownSeal(x, y, r) {
  ctx.fillStyle = "#1e3a8a"; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, y, r - 4, (r - 4) * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, y, r - 22, (r - 22) * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
  // star
  ctx.fillStyle = "#fde68a"; ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.16 : r * 0.36;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.62);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fde68a"; ctx.font = "bold 9px Georgia, serif"; ctx.textAlign = "center";
  ctx.fillText("★ TOWN OF NEIGHBORHOOD ★", x, y - r * 0.62 + 16);
  ctx.fillText("EST. 2024", x, y + r * 0.62 - 9);
}

function drawMayorDesk(x, y, t) {
  drawShadowEllipse(x, y + 26, 110, 12);
  // desk body with turned legs and a leather top
  ctx.fillStyle = "#3f2210"; GFX.roundFill(ctx, x - 100, y - 20, 200, 44, 6, "#3f2210");
  ctx.fillStyle = "#5c3317"; ctx.fillRect(x - 104, y - 26, 208, 8);
  ctx.fillStyle = "#166534"; GFX.roundFill(ctx, x - 90, y - 22, 180, 3, 1, "#166534");
  ctx.fillStyle = "#d4a017"; ctx.fillRect(x - 104, y - 26, 208, 1.5);
  // drawers
  ctx.strokeStyle = "rgba(212,160,23,0.6)"; ctx.lineWidth = 1;
  for (const dx of [-88, -48, 20, 60]) { ctx.strokeRect(x + dx, y - 12, 28, 12); ctx.fillStyle = "#d4a017"; ctx.fillRect(x + dx + 12, y - 7, 4, 2); }
  // desk lamp with green shade
  ctx.fillStyle = "#b8860b"; ctx.fillRect(x + 62, y - 50, 3, 26);
  ctx.fillStyle = "#15803d"; ctx.beginPath(); ctx.moveTo(x + 46, y - 46); ctx.lineTo(x + 82, y - 46); ctx.lineTo(x + 74, y - 58); ctx.lineTo(x + 54, y - 58); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(253,224,71,0.5)"; ctx.beginPath(); ctx.moveTo(x + 46, y - 46); ctx.lineTo(x + 82, y - 46); ctx.lineTo(x + 92, y - 30); ctx.lineTo(x + 36, y - 30); ctx.closePath(); ctx.fill();
  // papers, gavel, nameplate
  ctx.fillStyle = "#fafaf9"; ctx.fillRect(x - 70, y - 40, 26, 16); ctx.fillRect(x - 64, y - 44, 26, 16);
  ctx.fillStyle = "#a8a29e"; for (let i = 0; i < 3; i++) ctx.fillRect(x - 60, y - 40 + i * 4, 18, 1);
  ctx.fillStyle = "#3f2210"; ctx.fillRect(x - 20, y - 36, 22, 8); ctx.fillRect(x - 4, y - 34, 14, 3);
  GFX.roundFill(ctx, x - 30, y - 40, 60, 12, 2, "#0a0806");
  ctx.fillStyle = "#fde68a"; ctx.font = "bold 7px Georgia, serif"; ctx.textAlign = "center"; ctx.fillText("THE MAYOR", x, y - 31);
  // high-backed chair behind the desk
  ctx.fillStyle = "#7f1d1d"; GFX.roundFill(ctx, x - 22, y - 78, 44, 50, 8, "#7f1d1d");
  ctx.fillStyle = "#d4a017"; GFX.roundStroke(ctx, x - 22, y - 78, 44, 50, 8);
  ctx.fillStyle = "#991b1b"; GFX.roundFill(ctx, x - 18, y - 72, 36, 20, 4, "#991b1b");
}

function drawPodium(x, y) {
  drawShadowEllipse(x, y + 20, 26, 7);
  ctx.fillStyle = "#3f2210"; ctx.beginPath(); ctx.moveTo(x - 18, y + 18); ctx.lineTo(x + 18, y + 18); ctx.lineTo(x + 24, y - 30); ctx.lineTo(x - 24, y - 30); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#5c3317"; ctx.fillRect(x - 28, y - 36, 56, 8);
  ctx.fillStyle = "#d4a017"; ctx.beginPath(); ctx.arc(x, y - 8, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1e3a8a"; ctx.beginPath(); ctx.arc(x, y - 8, 6, 0, Math.PI * 2); ctx.fill();
  // microphone
  ctx.strokeStyle = "#111827"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 10, y - 36); ctx.lineTo(x + 16, y - 56); ctx.stroke();
  ctx.fillStyle = "#111827"; ctx.beginPath(); ctx.arc(x + 17, y - 58, 4, 0, Math.PI * 2); ctx.fill();
}

const townHallRoom = {
  accent: "#fbbf24",
  base(room, t) {
    drawSurround(room, "#2a1a0e");
    drawMarbleFloor(room, room.y + WALL_H, "#f5efe0", "#b8a58a");
    drawBackWall(room, { top: "#6b4423", bottom: "#4a2c14", wainscot: "#3f2210", skirting: "#2a1a0e" });
    // wood panelling above the wainscot
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) ctx.strokeRect(room.x + 12 + i * (room.w / 8), room.y + 14, room.w / 8 - 24, 48);
    drawSideWalls(room, "#4a2c14");
    // tall windows either side of the desk, night-blue drapes
    drawWindow(room.x + 190, room.y + 16, 90, 92, { frame: "#e7e5e4", curtain: "#1e3a8a", shaftLen: 190 });
    drawWindow(room.x + room.w - 280, room.y + 16, 90, 92, { frame: "#e7e5e4", curtain: "#1e3a8a", shaftLen: 190 });
    drawTownSeal(room.x + room.w / 2, room.y + 400, 110);
    drawLightPool(room.x + room.w / 2, room.y + 290, 220, "#fde68a", 0.16);
    // red carpet runner from the door to the desk
    const rg = cachedGrad("hallrunner", () => {
      const gg = ctx.createLinearGradient(0, room.y + 220, 0, room.y + room.h);
      gg.addColorStop(0, "rgba(153,27,27,0.0)"); gg.addColorStop(0.2, "rgba(153,27,27,0.85)"); gg.addColorStop(1, "rgba(153,27,27,0.9)"); return gg;
    });
    ctx.fillStyle = rg; ctx.fillRect(room.x + room.w / 2 - 48, room.y + 220, 96, room.h - 220);
    ctx.fillStyle = "rgba(212,160,23,0.7)"; ctx.fillRect(room.x + room.w / 2 - 48, room.y + 250, 2, room.h - 250); ctx.fillRect(room.x + room.w / 2 + 46, room.y + 250, 2, room.h - 250);
  },
  decor(room, t) {
    // portraits of past mayors
    drawPainting(room.x + 90, room.y + 60, 50, 64, "portrait", "#d4a017");
    drawPainting(room.x + room.w - 90, room.y + 60, 50, 64, "portrait", "#d4a017");
    drawPainting(room.x + room.w / 2, room.y + 52, 96, 54, "map", "#d4a017");
    drawChandelier(room.x + room.w / 2, room.y + 4, "#fde68a", 34);
    drawFlag(room.x + room.w / 2 - 150, room.y + 150, ["#dc2626", "#fafaf9", "#1e3a8a"], t, 76);
    drawFlag(room.x + room.w / 2 + 150, room.y + 150, ["#1e3a8a", "#fde68a"], t + 400, 76);
    drawMayorDesk(room.x + room.w / 2, room.y + 190, t);
    drawPodium(room.x + 110, room.y + 260);
    drawBrassRail(room.x + 40, room.y + 340, 200);
    drawBrassRail(room.x + room.w - 240, room.y + 340, 200);
    drawPlant(room.x + 40, room.y + room.h - 40, t, 1.1);
    drawPlant(room.x + room.w - 40, room.y + room.h - 40, t + 300, 1.1);
    drawClock(room.x + room.w - 190, room.y + 40, 14, t);
    // bench for visitors along the right wall
    ctx.fillStyle = "#3f2210"; GFX.roundFill(ctx, room.x + room.w - 60, room.y + 380, 36, 110, 4, "#3f2210");
    ctx.fillStyle = "#5c3317"; ctx.fillRect(room.x + room.w - 56, room.y + 384, 28, 102);
  },
};

// ---------------- FIRST BANK ----------------
function drawVaultDoor(x, y, t) {
  const r = 58;
  // recess in the wall
  ctx.fillStyle = "#0f172a"; ctx.fillRect(x - r - 18, y - r - 18, r * 2 + 36, r * 2 + 30);
  ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 3; ctx.strokeRect(x - r - 18, y - r - 18, r * 2 + 36, r * 2 + 30);
  for (const [bx, by] of [[x - r - 10, y - r - 10], [x + r + 10, y - r - 10], [x - r - 10, y + r + 4], [x + r + 10, y + r + 4]]) {
    ctx.fillStyle = "#cbd5e1"; ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
  }
  // door
  const g = cachedGrad("vault" + x + y, () => {
    const gg = ctx.createRadialGradient(x - 20, y - 20, 6, x, y, r);
    gg.addColorStop(0, "#e2e8f0"); gg.addColorStop(0.6, "#94a3b8"); gg.addColorStop(1, "#475569"); return gg;
  });
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 4; ctx.stroke();
  ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r - 8, 0, Math.PI * 2); ctx.stroke();
  // bolts around the rim
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    ctx.fillStyle = "#1e293b"; ctx.beginPath(); ctx.arc(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4), 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // spoked handle, turning very slowly
  const a0 = t / 4000;
  ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 5; ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) { const a = a0 + i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 28, y - Math.sin(a) * 28); ctx.lineTo(x + Math.cos(a) * 28, y + Math.sin(a) * 28); ctx.stroke(); }
  ctx.lineCap = "butt";
  ctx.fillStyle = "#d4a017"; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.arc(x - 2, y - 2, 3, 0, Math.PI * 2); ctx.fill();
  // combination dial
  ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.arc(x + 34, y + 30, 8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + 34, y + 30, 6, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#fbbf24"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("VAULT", x, y - r - 24);
}

function drawTellerCounter(x, y, t) {
  drawShadowEllipse(x, y + 30, 110, 12);
  // counter body
  ctx.fillStyle = "#4a2c14"; GFX.roundFill(ctx, x - 100, y - 10, 200, 46, 4, "#4a2c14");
  ctx.fillStyle = "#e7e5e4"; ctx.fillRect(x - 104, y - 16, 208, 8);
  ctx.fillStyle = "#d4a017"; ctx.fillRect(x - 104, y - 16, 208, 1.5);
  ctx.fillStyle = "rgba(255,255,255,0.08)"; for (let i = 0; i < 4; i++) ctx.fillRect(x - 92 + i * 50, y - 4, 40, 34);
  // glass with brass bars
  ctx.fillStyle = "rgba(186,230,253,0.35)"; ctx.fillRect(x - 96, y - 78, 192, 62);
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1; ctx.strokeRect(x - 96, y - 78, 192, 62);
  ctx.fillStyle = "#b8860b";
  for (let i = 0; i <= 12; i++) ctx.fillRect(x - 96 + i * 16, y - 78, 3, 62);
  ctx.fillRect(x - 96, y - 78, 192, 3);
  // window openings
  for (const dx of [-50, 50]) {
    ctx.fillStyle = "#0f172a"; ctx.fillRect(x + dx - 14, y - 26, 28, 8);
    ctx.fillStyle = "#fbbf24"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(dx < 0 ? "TELLER 1" : "TELLER 2", x + dx, y - 40);
  }
  // "OPEN" lamp blinking
  const on = Math.floor(t / 700) % 2 === 0;
  ctx.fillStyle = on ? "#22c55e" : "#14532d"; ctx.beginPath(); ctx.arc(x, y - 66, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fde68a"; ctx.font = "bold 8px sans-serif"; ctx.fillText("OPEN", x, y - 54);
  // coin trays + a stack of bills
  chipStack(x - 70, y + 2, 4, "#fbbf24");
  ctx.fillStyle = "#15803d"; ctx.fillRect(x + 56, y - 8, 24, 10); ctx.fillStyle = "#86efac"; ctx.fillRect(x + 60, y - 6, 16, 6);
}

function drawDepositBoxes(x, y, cols, rows) {
  ctx.fillStyle = "#1e293b"; ctx.fillRect(x - 4, y - 4, cols * 22 + 8, rows * 16 + 8);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const bx = x + c * 22, by = y + r * 16;
    ctx.fillStyle = (r + c) % 3 ? "#94a3b8" : "#b8860b"; ctx.fillRect(bx, by, 20, 14);
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(bx, by, 20, 2);
    ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.arc(bx + 14, by + 7, 1.6, 0, Math.PI * 2); ctx.fill();
  }
}

function drawSecurityCam(x, y, t, flip) {
  const s = flip ? -1 : 1;
  ctx.fillStyle = "#374151"; ctx.fillRect(x - 3, y - 6, 6, 10);
  ctx.fillStyle = "#111827"; GFX.roundFill(ctx, flip ? x - 26 : x, y, 26, 12, 3, "#111827");
  ctx.fillStyle = "#1f2937"; ctx.beginPath(); ctx.arc(x + s * 26, y + 6, 5, 0, Math.PI * 2); ctx.fill();
  const on = Math.floor(t / 500) % 3 === 0;
  ctx.fillStyle = on ? "#ef4444" : "#7f1d1d"; ctx.beginPath(); ctx.arc(x + s * 6, y + 3, 1.8, 0, Math.PI * 2); ctx.fill();
}

function drawTickerBoard(x, y, w, t, msg, col) {
  ctx.fillStyle = "#0a0a0a"; GFX.roundFill(ctx, x, y, w, 20, 3, "#0a0a0a");
  ctx.strokeStyle = "#475569"; ctx.lineWidth = 1.5; GFX.roundStroke(ctx, x, y, w, 20, 3);
  ctx.save(); ctx.beginPath(); ctx.rect(x + 4, y, w - 8, 20); ctx.clip();
  ctx.font = "bold 11px monospace"; ctx.textAlign = "left"; ctx.fillStyle = col;
  const tw = ctx.measureText(msg).width + 60;
  const off = (t / 25) % tw;
  ctx.fillText(msg, x + w - off, y + 14); ctx.fillText(msg, x + w - off + tw, y + 14);
  ctx.restore();
}

const bankRoom = {
  accent: "#60a5fa",
  base(room, t) {
    drawSurround(room, "#0f172a");
    drawMarbleFloor(room, room.y + WALL_H, "#cbd5e1", "#64748b");
    drawBackWall(room, { top: "#e2e8f0", bottom: "#cbd5e1", wainscot: "#334155", skirting: "#1e293b" });
    drawSideWalls(room, "#94a3b8");
    // pillars
    for (const px of [room.x + 60, room.x + room.w - 60]) {
      ctx.fillStyle = "#e2e8f0"; ctx.fillRect(px - 12, room.y + 8, 24, WALL_H - 18);
      ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.fillRect(px + 4, room.y + 8, 8, WALL_H - 18);
      ctx.fillStyle = "#f8fafc"; ctx.fillRect(px - 16, room.y + 8, 32, 6); ctx.fillRect(px - 16, room.y + WALL_H - 16, 32, 6);
    }
    drawLightPool(room.x + 300 - 80, room.y + 300, 170, "#bfdbfe", 0.2);
    drawLightPool(room.x + 720 - 80, room.y + 300, 170, "#bfdbfe", 0.2);
    drawLightPool(room.x + room.w / 2, room.y + 420, 200, "#fef9c3", 0.12);
    // floor inlay: navy border strip
    ctx.strokeStyle = "rgba(30,58,138,0.45)"; ctx.lineWidth = 6; ctx.strokeRect(room.x + 40, room.y + WALL_H + 30, room.w - 80, room.h - WALL_H - 60);
  },
  decor(room, t) {
    drawTickerBoard(room.x + 250, room.y + 14, room.w - 500, t, "FIRST BANK  ▸  VAULT SAVINGS EARN 0.1% EVERY 5 MIN, AUTOMATICALLY  ▸  DEPOSITS INSURED  ▸  LOANS &  CREDIT AT TELLER 2  ▸  ", "#4ade80");
    drawVaultDoor(300, 218, t);
    drawTellerCounter(700, 236, t);
    drawDepositBoxes(room.x + 400, room.y + 40, 6, 5);
    drawSecurityCam(room.x + 30, room.y + 16, t, false);
    drawSecurityCam(room.x + room.w - 30, room.y + 16, t, true);
    // queue rope runs along the right wall, out of the walk-up to the tellers
    drawVelvetRope(room.x + room.w - 150, room.y + 400, 120);
    drawPlant(room.x + 36, room.y + room.h - 50, t, 1);
    drawPlant(room.x + room.w - 36, room.y + room.h - 50, t + 500, 1);
    // ATM on the left wall
    ctx.fillStyle = "#1e3a8a"; GFX.roundFill(ctx, room.x + 20, room.y + 380, 34, 90, 4, "#1e3a8a");
    ctx.fillStyle = Math.floor(t / 900) % 2 ? "#60a5fa" : "#93c5fd"; ctx.fillRect(room.x + 26, room.y + 390, 22, 18);
    ctx.fillStyle = "#0f172a"; ctx.fillRect(room.x + 26, room.y + 418, 22, 4); ctx.fillRect(room.x + 26, room.y + 440, 22, 10);
    ctx.fillStyle = "#fde68a"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center"; ctx.fillText("ATM", room.x + 37, room.y + 465);
    drawClock(room.x + 160, room.y + 44, 14, t);
    wallSign(room.x + 300, room.y + 100, "SAVINGS · DEPOSITS · DAILY BONUS", { size: 9, bg: "#1e3a8a", border: "#93c5fd", color: "#dbeafe" });
    wallSign(room.x + 720, room.y + 100, "LOANS · CREDIT SCORES", { size: 9, bg: "#3f2d16", border: "#fbbf24", color: "#fde68a" });
  },
};

// ---------------- FURNITURELAND ----------------
function drawPriceTag(x, y, price) {
  ctx.fillStyle = "#fafaf9"; ctx.beginPath(); ctx.moveTo(x - 14, y - 7); ctx.lineTo(x + 10, y - 7); ctx.lineTo(x + 16, y); ctx.lineTo(x + 10, y + 7); ctx.lineTo(x - 14, y + 7); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#a8a29e"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = "#dc2626"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center"; ctx.fillText("$" + price, x - 1, y + 3);
}
function drawShowSofa(x, y, col) {
  drawShadowEllipse(x, y + 22, 60, 10);
  GFX.roundFill(ctx, x - 54, y - 6, 108, 32, 8, GFX.shadeColor(col, -30));
  GFX.roundFill(ctx, x - 50, y - 22, 100, 22, 6, col);
  for (let i = 0; i < 3; i++) GFX.roundFill(ctx, x - 46 + i * 32, y - 4, 28, 20, 5, GFX.shadeColor(col, 12));
  GFX.roundFill(ctx, x - 58, y - 14, 12, 38, 5, GFX.shadeColor(col, -10));
  GFX.roundFill(ctx, x + 46, y - 14, 12, 38, 5, GFX.shadeColor(col, -10));
  GFX.roundFill(ctx, x - 40, y - 18, 16, 14, 3, "#fde68a");
}
function drawShowBed(x, y) {
  drawShadowEllipse(x, y + 34, 56, 10);
  ctx.fillStyle = "#3f2210"; GFX.roundFill(ctx, x - 50, y - 40, 100, 12, 3, "#3f2210");
  GFX.roundFill(ctx, x - 48, y - 30, 96, 62, 6, "#f5f5f4");
  GFX.roundFill(ctx, x - 48, y - 4, 96, 36, 6, "#0ea5e9");
  ctx.fillStyle = "#0284c7"; ctx.fillRect(x - 48, y - 4, 96, 4);
  GFX.roundFill(ctx, x - 40, y - 26, 36, 16, 4, "#fafafa"); GFX.roundFill(ctx, x + 4, y - 26, 36, 16, 4, "#fafafa");
}
function drawFloorLamp(x, y, t) {
  drawShadowEllipse(x, y + 4, 12, 4);
  ctx.fillStyle = "#374151"; ctx.beginPath(); ctx.ellipse(x, y, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - 1.5, y - 70, 3, 70);
  ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.moveTo(x - 16, y - 66); ctx.lineTo(x + 16, y - 66); ctx.lineTo(x + 10, y - 90); ctx.lineTo(x - 10, y - 90); ctx.closePath(); ctx.fill();
  const g = cachedGrad("flamp" + x + y, () => { const gg = ctx.createRadialGradient(x, y - 60, 4, x, y - 60, 60); gg.addColorStop(0, "rgba(253,230,138,0.35)"); gg.addColorStop(1, "rgba(253,230,138,0)"); return gg; });
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 60, 60, 0, Math.PI * 2); ctx.fill();
}
function drawBoxStack(x, y) {
  const boxes = [[0, 0, 44, 30], [4, -30, 36, 30], [10, -54, 26, 24]];
  for (const [dx, dy, w, h] of boxes) {
    ctx.fillStyle = "#c08a4b"; ctx.fillRect(x + dx, y + dy - h, w, h);
    ctx.fillStyle = "#a16207"; ctx.fillRect(x + dx, y + dy - h, w, 3); ctx.fillRect(x + dx + w / 2 - 1, y + dy - h, 2, h);
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1; ctx.strokeRect(x + dx, y + dy - h, w, h);
  }
  ctx.fillStyle = "#dc2626"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center"; ctx.fillText("FRAGILE", x + 22, y - 12);
}
function drawSpotlight(x, y, on) {
  ctx.fillStyle = "#1f2937"; ctx.fillRect(x - 2, y - 14, 4, 10);
  ctx.beginPath(); ctx.ellipse(x, y, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = on ? "#fef9c3" : "#9ca3af"; ctx.beginPath(); ctx.ellipse(x, y + 2, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
}

const furnitureRoom = {
  accent: "#a78bfa",
  base(room, t) {
    drawSurround(room, "#2e1065");
    // pale laminate showroom floor
    ctx.fillStyle = "#e7e5e4"; ctx.fillRect(room.x, room.y + WALL_H, room.w, room.h - WALL_H);
    for (let gy = room.y + WALL_H; gy < room.y + room.h; gy += 48) for (let gx = room.x; gx < room.x + room.w; gx += 48) {
      ctx.fillStyle = ((gx + gy) / 48) % 2 ? "rgba(0,0,0,0.035)" : "rgba(255,255,255,0.25)"; ctx.fillRect(gx, gy, 48, 48);
    }
    drawBackWall(room, { top: "#faf5ff", bottom: "#ede9fe", skirting: "#5b21b6", stripe: "#c4b5fd" });
    drawSideWalls(room, "#ddd6fe");
    // spotlight track + pools
    ctx.fillStyle = "#1f2937"; ctx.fillRect(room.x + 40, room.y + 12, room.w - 80, 4);
    for (let i = 0; i < 5; i++) {
      const sx = room.x + 110 + i * 160;
      drawSpotlight(sx, room.y + 26, true);
      drawLightPool(sx, room.y + 300, 150, "#fef9c3", 0.22);
    }
    // display platforms (rugs) for the room sets
    drawRug(room.x + 190, room.y + 280, 200, 120, "#f5f5f4", "#c4b5fd", { stripes: true });
    drawRug(room.x + room.w - 190, room.y + 280, 200, 120, "#f5f5f4", "#c4b5fd", { stripes: true });
  },
  decor(room, t) {
    wallSign(room.x + room.w / 2, room.y + 46, "FURNITURELAND — EVERYTHING FOR YOUR HOME", { size: 12, bg: "#5b21b6", border: "#c4b5fd", color: "#fdf4ff" });
    drawPainting(room.x + 90, room.y + 76, 56, 40, "abstract", "#1f2937");
    drawPainting(room.x + room.w - 90, room.y + 76, 56, 40, "landscape", "#1f2937");
    // living room set, left
    drawShowSofa(room.x + 190, room.y + 250, "#0d9488");
    drawFloorLamp(room.x + 96, room.y + 300, t);
    drawPriceTag(room.x + 250, room.y + 218, 240);
    ctx.fillStyle = "#78350f"; ctx.beginPath(); ctx.ellipse(room.x + 190, room.y + 312, 30, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a16207"; ctx.beginPath(); ctx.ellipse(room.x + 190, room.y + 308, 30, 12, 0, 0, Math.PI * 2); ctx.fill();
    // bedroom set, right
    drawShowBed(room.x + room.w - 190, room.y + 250);
    drawPriceTag(room.x + room.w - 130, room.y + 212, 520);
    ctx.fillStyle = "#3f2210"; GFX.roundFill(ctx, room.x + room.w - 268, room.y + 244, 24, 28, 3, "#3f2210");
    ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.arc(room.x + room.w - 256, room.y + 236, 8, 0, Math.PI * 2); ctx.fill();
    drawFloorLamp(room.x + room.w - 96, room.y + 300, t);
    // catalog kiosk at the hotspot
    const kx = 512, ky = 206;
    drawShadowEllipse(kx, ky + 46, 50, 10);
    ctx.fillStyle = "#5b21b6"; GFX.roundFill(ctx, kx - 40, ky, 80, 44, 6, "#5b21b6");
    ctx.fillStyle = "#7c3aed"; ctx.fillRect(kx - 44, ky - 4, 88, 8);
    ctx.fillStyle = "#0f172a"; GFX.roundFill(ctx, kx - 30, ky - 46, 60, 40, 4, "#0f172a");
    const flick = 0.85 + 0.15 * Math.sin(t / 130);
    ctx.fillStyle = `rgba(196,181,253,${flick})`; ctx.fillRect(kx - 26, ky - 42, 52, 32);
    ctx.fillStyle = "#5b21b6"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center"; ctx.fillText("CATALOG", kx, ky - 30);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = ["#0d9488", "#f59e0b", "#0ea5e9"][i]; ctx.fillRect(kx - 22 + i * 16, ky - 24, 12, 10); }
    ctx.fillStyle = "#fdf4ff"; ctx.font = "bold 9px sans-serif"; ctx.fillText("BROWSE HERE", kx, ky + 26);
    // checkout desk, bottom right; boxes, bottom left; plants
    ctx.fillStyle = "#4c1d95"; GFX.roundFill(ctx, room.x + room.w - 190, room.y + 420, 130, 40, 4, "#4c1d95");
    ctx.fillStyle = "#ede9fe"; ctx.fillRect(room.x + room.w - 194, room.y + 416, 138, 6);
    ctx.fillStyle = "#0f172a"; ctx.fillRect(room.x + room.w - 110, room.y + 392, 28, 22);
    ctx.fillStyle = Math.floor(t / 600) % 2 ? "#4ade80" : "#22c55e"; ctx.fillRect(room.x + room.w - 106, room.y + 396, 20, 14);
    ctx.fillStyle = "#fde68a"; ctx.font = "bold 8px sans-serif"; ctx.fillText("CHECKOUT", room.x + room.w - 125, room.y + 445);
    drawBoxStack(room.x + 40, room.y + 460);
    drawBoxStack(room.x + 92, room.y + 470);
    drawPlant(room.x + room.w - 40, room.y + 380, t, 1);
    drawPlant(room.x + 40, room.y + 360, t + 200, 0.9);
  },
};

// ---------------- MYSTERY BOXES ----------------
function drawMysteryBox(x, y, col, tier, t) {
  const bob = Math.sin(t / 600 + x) * 4;
  const rgb = hexToRgb(col);
  // glow on the floor
  const g = cachedGrad("boxglow" + x + col, () => { const gg = ctx.createRadialGradient(x, y + 36, 4, x, y + 36, 70); gg.addColorStop(0, `rgba(${rgb},0.45)`); gg.addColorStop(1, `rgba(${rgb},0)`); return gg; });
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y + 36, 70, 26, 0, 0, Math.PI * 2); ctx.fill();
  drawShadowEllipse(x, y + 36, 34 - bob, 8);
  const by = y + bob, s = 34;
  // body
  ctx.fillStyle = GFX.shadeColor(col, -40); GFX.roundFill(ctx, x - s, by - s + 12, s * 2, s * 2 - 12, 6, GFX.shadeColor(col, -40));
  ctx.fillStyle = col; GFX.roundFill(ctx, x - s + 4, by - s + 16, s * 2 - 8, s * 2 - 20, 4, col);
  // lid, slightly ajar with light spilling
  ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.abs(Math.sin(t / 400 + x))})`;
  ctx.fillRect(x - s + 6, by - s + 8, s * 2 - 12, 6);
  ctx.fillStyle = GFX.shadeColor(col, 30); GFX.roundFill(ctx, x - s - 4, by - s - 4, s * 2 + 8, 18, 4, GFX.shadeColor(col, 30));
  ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(x - s - 4, by - s - 4, s * 2 + 8, 4);
  // ribbon
  ctx.fillStyle = "#fcd34d"; ctx.fillRect(x - 5, by - s - 4, 10, s * 2 + 4); ctx.fillRect(x - s - 4, by - 2, s * 2 + 8, 8);
  ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.ellipse(x - 9, by - s - 8, 8, 5, -0.5, 0, Math.PI * 2); ctx.ellipse(x + 9, by - s - 8, 8, 5, 0.5, 0, Math.PI * 2); ctx.fill();
  // question mark
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = "bold 22px Georgia, serif"; ctx.textAlign = "center"; ctx.fillText("?", x - 16, by + 12);
  // orbiting sparkles
  for (let i = 0; i < 4; i++) {
    const a = t / 700 + i * Math.PI / 2, sx = x + Math.cos(a) * (s + 14), sy = by + Math.sin(a) * 14 - 4;
    ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(a))})`;
    ctx.beginPath(); ctx.moveTo(sx, sy - 4); ctx.lineTo(sx + 1.5, sy); ctx.lineTo(sx, sy + 4); ctx.lineTo(sx - 1.5, sy); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = col; ctx.font = "bold 11px Georgia, serif"; ctx.textAlign = "center";
  ctx.fillText(tier.toUpperCase(), x, y + 62);
}
function drawCrystalBall(x, y, t) {
  drawShadowEllipse(x, y + 20, 26, 7);
  ctx.fillStyle = "#3b0764"; ctx.beginPath(); ctx.moveTo(x - 20, y + 18); ctx.lineTo(x + 20, y + 18); ctx.lineTo(x + 12, y - 4); ctx.lineTo(x - 12, y - 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#d4a017"; ctx.fillRect(x - 22, y + 14, 44, 4);
  const p = 0.6 + 0.4 * Math.sin(t / 500);
  const g = cachedGrad("crystal" + x + y, () => { const gg = ctx.createRadialGradient(x - 6, y - 26, 2, x, y - 20, 22); gg.addColorStop(0, "#f5f3ff"); gg.addColorStop(0.4, "#c084fc"); gg.addColorStop(1, "#4c1d95"); return gg; });
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 20, 20, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(233,213,255,${p * 0.5})`; ctx.beginPath(); ctx.arc(x, y - 20, 24 + p * 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.ellipse(x - 7, y - 28, 5, 3, -0.6, 0, Math.PI * 2); ctx.fill();
}
function drawShelfOfBoxes(x, y, w, t) {
  ctx.fillStyle = "#2e1065"; ctx.fillRect(x, y, w, 5);
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x, y + 5, w, 4);
  const cols = ["#8b5cf6", "#f472b6", "#fbbf24", "#22d3ee", "#a3e635"];
  for (let i = 0; i < Math.floor(w / 26); i++) {
    const bx = x + 6 + i * 26, col = cols[i % cols.length];
    const gl = 0.3 + 0.3 * Math.sin(t / 450 + i * 1.7);
    ctx.fillStyle = rgbaOf(col, gl); ctx.fillRect(bx - 3, y - 22, 24, 22);
    ctx.fillStyle = GFX.shadeColor(col, -30); ctx.fillRect(bx, y - 18, 18, 18);
    ctx.fillStyle = col; ctx.fillRect(bx, y - 18, 18, 5);
    ctx.fillStyle = "#fcd34d"; ctx.fillRect(bx + 8, y - 18, 2, 18);
  }
}

const lootboxRoom = {
  accent: "#c084fc",
  base(room, t) {
    drawSurround(room, "#0b0214");
    // dark boards floor with a purple glow in the middle
    ctx.fillStyle = "#1a0b2e"; ctx.fillRect(room.x, room.y + WALL_H, room.w, room.h - WALL_H);
    for (let gy = room.y + WALL_H; gy < room.y + room.h; gy += 24) { ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(room.x, gy, room.w, 1); }
    // starry pattern
    for (let i = 0; i < 60; i++) {
      const sx = room.x + 20 + srand(i) * (room.w - 40), sy = room.y + WALL_H + 10 + srand(i + 99) * (room.h - WALL_H - 20);
      ctx.fillStyle = `rgba(216,180,254,${0.15 + 0.25 * Math.abs(Math.sin(t / 700 + i))})`;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
    drawLightPool(room.x + room.w / 2, room.y + 320, 300, "#a855f7", 0.22);
    drawBackWall(room, { top: "#2e1065", bottom: "#1e0a3c", skirting: "#3b0764" });
    drawSideWalls(room, "#1e0a3c");
    drawDrapes(room, "#3b0764", "#c084fc");
    // stage: a raised platform under the three boxes
    ctx.fillStyle = "rgba(0,0,0,0.35)"; GFX.roundFill(ctx, room.x + 96, room.y + 150, room.w - 192, 210, 10, "rgba(0,0,0,0.35)");
    const sg = cachedGrad("stage", () => { const gg = ctx.createLinearGradient(0, room.y + 146, 0, room.y + 356); gg.addColorStop(0, "#4c1d95"); gg.addColorStop(1, "#2e1065"); return gg; });
    ctx.fillStyle = sg; GFX.roundFill(ctx, room.x + 100, room.y + 146, room.w - 200, 206, 10, sg);
    ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 2; GFX.roundStroke(ctx, room.x + 100, room.y + 146, room.w - 200, 206, 10);
    ctx.strokeStyle = "rgba(212,160,23,0.4)"; ctx.lineWidth = 1; GFX.roundStroke(ctx, room.x + 108, room.y + 154, room.w - 216, 190, 8);
    // stage edge lights
    for (let i = 0; i < 18; i++) {
      const lx = room.x + 116 + i * ((room.w - 232) / 17);
      ctx.fillStyle = Math.floor(t / 250 + i) % 3 === 0 ? "#fde68a" : "#7c3aed";
      ctx.beginPath(); ctx.arc(lx, room.y + 350, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  },
  decor(room, t) {
    drawShelfOfBoxes(room.x + 170, room.y + 50, 200, t);
    drawShelfOfBoxes(room.x + room.w - 370, room.y + 50, 200, t);
    drawShelfOfBoxes(room.x + 170, room.y + 100, 120, t + 300);
    drawShelfOfBoxes(room.x + room.w - 290, room.y + 100, 120, t + 600);
    drawCrystalBall(room.x + room.w / 2, room.y + 100, t);
    for (const cx of [room.x + room.w / 2 - 60, room.x + room.w / 2 + 60]) drawCandle(cx, room.y + 118, t, 18);
    wallSign(room.x + room.w / 2, room.y + 34, "✦ MYSTERY BOXES ✦", { size: 13, serif: true, bg: "#0b0214", border: "#c084fc", color: "#e9d5ff" });
    drawMysteryBox(240, 250, "#64748b", "common", t);
    drawMysteryBox(512, 228, "#3b82f6", "rare", t + 800);
    drawMysteryBox(784, 206, "#f59e0b", "legendary", t + 1600);
    // candelabras on the floor by the side walls
    for (const cx of [room.x + 40, room.x + room.w - 40]) {
      ctx.fillStyle = "#d4a017"; ctx.fillRect(cx - 2, room.y + 380, 4, 70); ctx.fillRect(cx - 18, room.y + 384, 36, 3);
      ctx.beginPath(); ctx.ellipse(cx, room.y + 452, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      for (const dx of [-16, 0, 16]) drawCandle(cx + dx, room.y + 384, t + dx * 10, 12);
    }
    // drifting sparkles in the air
    ctx.save();
    for (let i = 0; i < 18; i++) {
      const ph = ((t / 3000) + i * 0.137) % 1;
      const x = room.x + 40 + ((i * 431) % (room.w - 80)) + Math.sin(t / 600 + i) * 8;
      const y = room.y + room.h - 40 - ph * (room.h - 100);
      ctx.globalAlpha = 0.6 * Math.sin(ph * Math.PI);
      ctx.fillStyle = i % 3 ? "#e9d5ff" : "#fde68a";
      ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 1.2, y); ctx.lineTo(x, y + 3); ctx.lineTo(x - 1.2, y); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },
};

// ---------------- ADVENTURERS GUILD ----------------
function drawFlagstones(room, y0) {
  ctx.fillStyle = "#57534e"; ctx.fillRect(room.x, y0, room.w, room.y + room.h - y0);
  const S = 54;
  let r = 0;
  for (let gy = y0; gy < room.y + room.h; gy += S, r++) {
    const off = (r % 2) * S / 2;
    for (let gx = room.x - off, c = 0; gx < room.x + room.w; gx += S, c++) {
      const i = r * 41 + c, jx = (srand(i) - 0.5) * 6, jy = (srand(i + 5) - 0.5) * 6;
      const x0 = Math.max(room.x, gx + 3 + jx), y0b = Math.max(y0, gy + 3 + jy);
      const x1 = Math.min(room.x + room.w, gx + S - 3 + jx), y1 = Math.min(room.y + room.h, gy + S - 3 + jy);
      if (x1 <= x0 || y1 <= y0b) continue;
      const sh = 0.6 + srand(i + 9) * 0.4;
      ctx.fillStyle = `rgb(${Math.round(120 * sh)},${Math.round(113 * sh)},${Math.round(108 * sh)})`;
      GFX.roundFill(ctx, x0, y0b, x1 - x0, y1 - y0b, 5, ctx.fillStyle);
      ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(x0 + 3, y0b + 3, x1 - x0 - 6, 2);
    }
  }
}
function drawHearth(x, y, t) {
  // stone surround
  ctx.fillStyle = "#44403c"; ctx.fillRect(x - 60, y - 96, 120, 100);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
    ctx.fillStyle = (r + c) % 2 ? "#57534e" : "#4b4744"; ctx.fillRect(x - 58 + c * 30 + (r % 2) * 15, y - 94 + r * 16, 28, 14);
  }
  ctx.fillStyle = "#78716c"; ctx.fillRect(x - 66, y - 100, 132, 8);
  // firebox
  ctx.fillStyle = "#0a0806"; GFX.roundFill(ctx, x - 36, y - 70, 72, 70, 8, "#0a0806");
  // logs
  ctx.fillStyle = "#3f2210"; ctx.fillRect(x - 26, y - 14, 52, 7); ctx.fillRect(x - 20, y - 20, 40, 6);
  // flames: layered tongues, jittered by sin waves
  for (let i = 0; i < 6; i++) {
    const fx = x - 20 + i * 8, h = 22 + 14 * Math.abs(Math.sin(t / 110 + i * 1.9)) + 6 * Math.sin(t / 70 + i);
    const wob = Math.sin(t / 90 + i * 2.2) * 3;
    ctx.fillStyle = i % 2 ? "#f97316" : "#ef4444";
    ctx.beginPath(); ctx.moveTo(fx - 6, y - 18); ctx.quadraticCurveTo(fx + wob - 8, y - 18 - h * 0.5, fx + wob, y - 18 - h); ctx.quadraticCurveTo(fx + wob + 8, y - 18 - h * 0.5, fx + 6, y - 18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fde047";
    ctx.beginPath(); ctx.moveTo(fx - 3, y - 18); ctx.quadraticCurveTo(fx + wob - 3, y - 18 - h * 0.3, fx + wob * 0.6, y - 18 - h * 0.55); ctx.quadraticCurveTo(fx + wob + 3, y - 18 - h * 0.3, fx + 3, y - 18); ctx.closePath(); ctx.fill();
  }
  // embers
  for (let i = 0; i < 5; i++) {
    const ph = ((t / 1400) + i * 0.2) % 1;
    ctx.fillStyle = `rgba(253,224,71,${1 - ph})`; ctx.fillRect(x - 16 + i * 8 + Math.sin(t / 200 + i) * 3, y - 24 - ph * 50, 2, 2);
  }
  // warm light on the floor, flickering
  const fl = 0.18 + 0.06 * Math.sin(t / 140);
  const g = cachedGrad("hearthglow" + x, () => { const gg = ctx.createRadialGradient(x, y + 10, 10, x, y + 10, 140); gg.addColorStop(0, "rgba(251,146,60,1)"); gg.addColorStop(1, "rgba(251,146,60,0)"); return gg; });
  ctx.save(); ctx.globalAlpha = fl; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y + 10, 140, 70, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  // mantel trophies
  ctx.fillStyle = "#d4a017"; ctx.fillRect(x - 40, y - 112, 10, 12); ctx.fillRect(x - 44, y - 116, 18, 4);
  ctx.fillStyle = "#fef3c7"; ctx.beginPath(); ctx.arc(x + 30, y - 106, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#0a0806"; ctx.fillRect(x + 27, y - 108, 2, 2); ctx.fillRect(x + 31, y - 108, 2, 2);
}
function drawQuestBoard(x, y, t) {
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x - 86, y - 56, 176, 120);
  ctx.fillStyle = "#5c3317"; ctx.fillRect(x - 90, y - 60, 180, 120);
  ctx.fillStyle = "#7c4a18"; ctx.fillRect(x - 84, y - 54, 168, 108);
  ctx.strokeStyle = "#3f2210"; ctx.lineWidth = 2; for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - 84, y - 54 + i * 18); ctx.lineTo(x + 84, y - 54 + i * 18); ctx.stroke(); }
  ctx.fillStyle = "#fef3c7"; ctx.font = "bold 13px Georgia, serif"; ctx.textAlign = "center"; ctx.fillText("QUEST BOARD", x, y - 40);
  // pinned parchments
  const notes = [[-60, -20, -0.08], [-14, -26, 0.05], [34, -18, -0.04], [-52, 14, 0.06], [4, 12, -0.05], [46, 16, 0.08]];
  for (let i = 0; i < notes.length; i++) {
    const [dx, dy, rot] = notes[i];
    ctx.save(); ctx.translate(x + dx, y + dy); ctx.rotate(rot + Math.sin(t / 900 + i) * 0.015);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(-13, -9, 30, 26);
    ctx.fillStyle = i === 2 ? "#fde68a" : "#f5e6c8"; ctx.fillRect(-15, -11, 30, 26);
    ctx.fillStyle = "#a8a29e"; for (let l = 0; l < 4; l++) ctx.fillRect(-11, -5 + l * 5, 18 - (l % 2) * 6, 1.5);
    ctx.fillStyle = "#dc2626"; ctx.beginPath(); ctx.arc(0, -9, 2.2, 0, Math.PI * 2); ctx.fill();
    if (i === 2) { ctx.fillStyle = "#b91c1c"; ctx.font = "bold 6px sans-serif"; ctx.fillText("NEW!", 0, 11); }
    ctx.restore();
  }
}
function drawWeaponRack(x, y) {
  ctx.fillStyle = "#3f2210"; ctx.fillRect(x - 40, y - 50, 80, 8); ctx.fillRect(x - 40, y + 10, 80, 8);
  const items = ["sword", "axe", "sword", "spear"];
  for (let i = 0; i < 4; i++) {
    const ix = x - 30 + i * 20;
    ctx.fillStyle = "#94a3b8";
    if (items[i] === "sword") { ctx.fillRect(ix - 2, y - 44, 4, 46); ctx.fillStyle = "#d4a017"; ctx.fillRect(ix - 7, y - 4, 14, 3); ctx.fillStyle = "#7c2d12"; ctx.fillRect(ix - 2, y - 1, 4, 12); }
    else if (items[i] === "axe") { ctx.fillStyle = "#7c2d12"; ctx.fillRect(ix - 1.5, y - 44, 3, 56); ctx.fillStyle = "#94a3b8"; ctx.beginPath(); ctx.moveTo(ix, y - 40); ctx.lineTo(ix + 10, y - 44); ctx.lineTo(ix + 10, y - 26); ctx.lineTo(ix, y - 30); ctx.closePath(); ctx.fill(); }
    else { ctx.fillStyle = "#7c2d12"; ctx.fillRect(ix - 1.5, y - 40, 3, 52); ctx.fillStyle = "#94a3b8"; ctx.beginPath(); ctx.moveTo(ix, y - 50); ctx.lineTo(ix + 4, y - 40); ctx.lineTo(ix - 4, y - 40); ctx.closePath(); ctx.fill(); }
  }
  // shield
  ctx.fillStyle = "#1e3a8a"; ctx.beginPath(); ctx.moveTo(x + 58, y - 46); ctx.lineTo(x + 78, y - 46); ctx.lineTo(x + 78, y - 22); ctx.quadraticCurveTo(x + 68, y - 6, x + 68, y - 4); ctx.quadraticCurveTo(x + 68, y - 6, x + 58, y - 22); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.arc(x + 68, y - 30, 4, 0, Math.PI * 2); ctx.fill();
}
function drawLongTable(x, y) {
  drawShadowEllipse(x, y + 24, 84, 12);
  // benches
  ctx.fillStyle = "#5c3317"; ctx.fillRect(x - 70, y - 30, 140, 8); ctx.fillRect(x - 70, y + 22, 140, 8);
  ctx.fillStyle = "#3f2210"; ctx.fillRect(x - 64, y - 22, 4, 6); ctx.fillRect(x + 60, y - 22, 4, 6); ctx.fillRect(x - 64, y + 30, 4, 6); ctx.fillRect(x + 60, y + 30, 4, 6);
  // table
  ctx.fillStyle = "#7c4a18"; GFX.roundFill(ctx, x - 80, y - 16, 160, 34, 4, "#7c4a18");
  ctx.fillStyle = "#a16207"; ctx.fillRect(x - 80, y - 16, 160, 3);
  ctx.fillStyle = "rgba(0,0,0,0.15)"; for (let i = 0; i < 3; i++) ctx.fillRect(x - 76, y - 6 + i * 8, 152, 1);
  // tankards, candle, bread
  for (const dx of [-50, 40]) { ctx.fillStyle = "#b45309"; ctx.fillRect(x + dx - 5, y - 10, 10, 12); ctx.fillStyle = "#fef3c7"; ctx.fillRect(x + dx - 5, y - 12, 10, 3); }
  drawCandle(x, y + 2, Date.now(), 10);
  ctx.fillStyle = "#d97706"; ctx.beginPath(); ctx.ellipse(x + 14, y + 6, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
}
function drawBarrel(x, y) {
  drawShadowEllipse(x, y + 4, 14, 5);
  ctx.fillStyle = "#7c4a18"; GFX.roundFill(ctx, x - 13, y - 30, 26, 34, 6, "#7c4a18");
  ctx.fillStyle = "#57534e"; ctx.fillRect(x - 13, y - 24, 26, 3); ctx.fillRect(x - 13, y - 6, 26, 3);
  ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(x - 4, y - 30, 2, 34); ctx.fillRect(x + 5, y - 30, 2, 34);
}
function drawBanner(x, y, col, emblem, t) {
  ctx.fillStyle = "#3f2210"; ctx.fillRect(x - 20, y, 40, 4);
  const sway = Math.sin(t / 800 + x) * 2;
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - 18, y + 4); ctx.lineTo(x + 18, y + 4); ctx.lineTo(x + 18 + sway, y + 50); ctx.lineTo(x + sway, y + 62); ctx.lineTo(x - 18 + sway, y + 50); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fde68a"; ctx.font = "bold 14px Georgia, serif"; ctx.textAlign = "center"; ctx.fillText(emblem, x + sway * 0.5, y + 36);
}
function drawCandleChandelier(x, y, t) {
  ctx.strokeStyle = "#3f2210"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x, y); ctx.stroke();
  ctx.fillStyle = "#3f2210"; ctx.beginPath(); ctx.ellipse(x, y + 4, 44, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#57534e"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, y + 4, 44, 10, 0, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; drawCandle(x + Math.cos(a) * 40, y + 4 + Math.sin(a) * 8, t + i * 130, 8); }
  const g = cachedGrad("cchand" + x, () => { const gg = ctx.createRadialGradient(x, y + 10, 6, x, y + 10, 90); gg.addColorStop(0, "rgba(251,191,36,0.3)"); gg.addColorStop(1, "rgba(251,191,36,0)"); return gg; });
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + 10, 90, 0, Math.PI * 2); ctx.fill();
}
function drawTrainingDummy(x, y, t) {
  drawShadowEllipse(x, y + 4, 14, 5);
  const wob = Math.sin(t / 500) * 0.06;
  ctx.save(); ctx.translate(x, y); ctx.rotate(wob);
  ctx.fillStyle = "#57534e"; ctx.fillRect(-2, -60, 4, 60);
  ctx.fillStyle = "#a16207"; ctx.fillRect(-12, -52, 24, 30);
  ctx.fillStyle = "#c2a06b"; ctx.beginPath(); ctx.arc(0, -62, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#7c4a18"; ctx.fillRect(-24, -46, 48, 4);
  ctx.fillStyle = "#dc2626"; ctx.beginPath(); ctx.arc(0, -38, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#fef3c7"; ctx.beginPath(); ctx.arc(0, -38, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawLedgerStand(x, y, t) {
  drawShadowEllipse(x, y + 8, 22, 6);
  ctx.fillStyle = "#3f2210"; ctx.fillRect(x - 3, y - 40, 6, 46); ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#5c3317"; ctx.beginPath(); ctx.moveTo(x - 22, y - 36); ctx.lineTo(x + 22, y - 36); ctx.lineTo(x + 18, y - 52); ctx.lineTo(x - 26, y - 52); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#f5e6c8"; ctx.beginPath(); ctx.moveTo(x - 18, y - 38); ctx.lineTo(x + 18, y - 38); ctx.lineTo(x + 15, y - 50); ctx.lineTo(x - 21, y - 50); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#a8a29e"; for (let i = 0; i < 3; i++) ctx.fillRect(x - 14, y - 47 + i * 3, 22 - i * 4, 1);
  // quill
  ctx.strokeStyle = "#fafaf9"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 10, y - 40); ctx.lineTo(x + 18 + Math.sin(t / 400) * 2, y - 62); ctx.stroke();
}

const guildRoom = {
  accent: "#f59e0b",
  base(room, t) {
    drawSurround(room, "#1c1410");
    drawFlagstones(room, room.y + WALL_H);
    drawBackWall(room, { top: "#5c3d24", bottom: "#3f2a18", skirting: "#2a1a0e" });
    // timber beams on the wall
    ctx.fillStyle = "#2a1a0e";
    for (let i = 0; i <= 6; i++) ctx.fillRect(room.x + i * (room.w / 6) - 5, room.y + 8, 10, WALL_H - 18);
    ctx.fillRect(room.x, room.y + 64, room.w, 8);
    drawSideWalls(room, "#3f2a18");
    drawWindow(room.x + 330, room.y + 22, 60, 60, { frame: "#2a1a0e", night: true, shaftLen: 120 });
    drawWindow(room.x + room.w - 390, room.y + 22, 60, 60, { frame: "#2a1a0e", night: true, shaftLen: 120 });
    drawLightPool(room.x + room.w / 2, room.y + 320, 260, "#fbbf24", 0.14);
    drawRug(room.x + room.w / 2, room.y + 300, 200, 90, "#7f1d1d", "#d4a017", { medallion: true });
  },
  decor(room, t) {
    drawHearth(room.x + 130, room.y + 128, t);
    drawQuestBoard(512, 190, t);
    drawWeaponRack(room.x + room.w - 150, room.y + 100);
    drawBanner(room.x + 300, room.y + 8, "#7f1d1d", "⚔", t);
    drawBanner(room.x + room.w - 300, room.y + 8, "#1e3a8a", "✦", t + 300);
    drawCandleChandelier(room.x + room.w / 2, room.y + 14, t);
    // long tables hug the side walls, below the invite/duel pads, so the lane
    // from the door to the rug and quest board stays open
    drawLongTable(room.x + 120, room.y + 420);
    drawLongTable(room.x + room.w - 120, room.y + 420);
    drawBarrel(room.x + 36, room.y + 300); drawBarrel(room.x + 62, room.y + 330); drawBarrel(room.x + 40, room.y + 360);
    drawBarrel(room.x + room.w - 36, room.y + 460);
    drawLedgerStand(200, 330, t);
    drawTrainingDummy(824, 340, t);
    wallSign(room.x + 130, room.y + 24, "HEARTH & HOME", { size: 8, serif: true, bg: "#2a1a0e", border: "#d4a017", color: "#fde68a" });
    wallSign(room.x + room.w - 150, room.y + 30, "ARMOURY", { size: 8, serif: true, bg: "#2a1a0e", border: "#d4a017", color: "#fde68a" });
  },
};

// ---------------- JOBS CENTER ----------------
function drawOfficeDesk(x, y, t, seed) {
  drawShadowEllipse(x, y + 24, 60, 9);
  ctx.fillStyle = "#e7e5e4"; GFX.roundFill(ctx, x - 54, y - 8, 108, 30, 4, "#e7e5e4");
  ctx.fillStyle = "#a8a29e"; ctx.fillRect(x - 50, y + 22, 4, 12); ctx.fillRect(x + 46, y + 22, 4, 12);
  ctx.fillStyle = "#d6d3d1"; ctx.fillRect(x - 56, y - 12, 112, 5);
  // monitor with a flickering screen
  ctx.fillStyle = "#1f2937"; ctx.fillRect(x - 3, y - 20, 6, 10); ctx.fillRect(x - 12, y - 12, 24, 3);
  ctx.fillStyle = "#111827"; GFX.roundFill(ctx, x - 28, y - 56, 56, 38, 3, "#111827");
  const fl = 0.8 + 0.2 * Math.sin(t / 90 + seed) * Math.sin(t / 370 + seed);
  ctx.fillStyle = `rgba(56,189,248,${0.5 * fl})`; ctx.fillRect(x - 25, y - 53, 50, 32);
  ctx.fillStyle = `rgba(255,255,255,${0.55 * fl})`;
  for (let i = 0; i < 4; i++) ctx.fillRect(x - 21, y - 48 + i * 7, 20 + ((seed * 7 + i * 13) % 20), 2);
  if (Math.floor(t / 500 + seed) % 2) ctx.fillRect(x - 21 + 22, y - 27, 4, 5); // cursor
  // keyboard, mug, papers
  ctx.fillStyle = "#374151"; GFX.roundFill(ctx, x - 20, y - 4, 40, 10, 2, "#374151");
  ctx.fillStyle = "#9ca3af"; for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) ctx.fillRect(x - 18 + c * 4.6, y - 2 + r * 4, 3, 2.5);
  ctx.fillStyle = seed % 2 ? "#ef4444" : "#3b82f6"; ctx.fillRect(x + 32, y - 8, 10, 10);
  ctx.fillStyle = "#fafaf9"; ctx.fillRect(x - 50, y - 6, 22, 14);
  // office chair in front
  ctx.fillStyle = "#1f2937"; GFX.roundFill(ctx, x - 14, y + 30, 28, 18, 5, "#1f2937");
  ctx.fillStyle = "#374151"; GFX.roundFill(ctx, x - 12, y + 26, 24, 8, 3, "#374151");
}
function drawGlassPartition(x, y, w, h) {
  ctx.fillStyle = "rgba(186,230,253,0.28)"; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(x + 6, y + 4, w * 0.25, h - 8);
  ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#94a3b8"; ctx.fillRect(x, y + h / 2 - 1.5, w, 3);
}
function drawWaterCooler(x, y, t) {
  drawShadowEllipse(x, y + 4, 12, 4);
  ctx.fillStyle = "#e5e7eb"; GFX.roundFill(ctx, x - 10, y - 40, 20, 42, 3, "#e5e7eb");
  ctx.fillStyle = "#93c5fd"; GFX.roundFill(ctx, x - 9, y - 66, 18, 28, 6, "#93c5fd");
  ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(x - 6, y - 62, 4, 20);
  const bub = ((t / 1200) % 1);
  ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.beginPath(); ctx.arc(x + 3, y - 42 - bub * 20, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3b82f6"; ctx.fillRect(x - 6, y - 30, 4, 5); ctx.fillStyle = "#ef4444"; ctx.fillRect(x + 2, y - 30, 4, 5);
  ctx.fillStyle = "#fafaf9"; ctx.fillRect(x + 12, y - 36, 6, 8);
}
function drawWaitingChairs(x, y, n) {
  for (let i = 0; i < n; i++) {
    const cx = x + i * 34;
    drawShadowEllipse(cx, y + 12, 14, 4);
    ctx.fillStyle = "#374151"; ctx.fillRect(cx - 12, y - 4, 24, 12);
    ctx.fillStyle = "#1e40af"; GFX.roundFill(ctx, cx - 12, y - 18, 24, 16, 3, "#1e40af");
    ctx.fillStyle = "#6b7280"; ctx.fillRect(cx - 10, y + 8, 3, 8); ctx.fillRect(cx + 7, y + 8, 3, 8);
  }
}
function drawJobBoard(x, y, t) {
  ctx.fillStyle = "#1e3a8a"; ctx.fillRect(x - 60, y - 34, 120, 68);
  ctx.strokeStyle = "#93c5fd"; ctx.lineWidth = 2; ctx.strokeRect(x - 60, y - 34, 120, 68);
  ctx.fillStyle = "#dbeafe"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center"; ctx.fillText("OPEN POSITIONS", x, y - 22);
  const jobs = ["Courier", "Typist", "Pest control"];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = "#fafaf9"; ctx.fillRect(x - 52, y - 14 + i * 15, 104, 12);
    ctx.fillStyle = "#1f2937"; ctx.font = "7px sans-serif"; ctx.textAlign = "left"; ctx.fillText(jobs[i], x - 48, y - 5 + i * 15);
    ctx.fillStyle = Math.floor(t / 800 + i) % 3 === 0 ? "#22c55e" : "#16a34a"; ctx.fillRect(x + 32, y - 12 + i * 15, 16, 8);
  }
  ctx.textAlign = "center";
}

const jobsRoom = {
  accent: "#38bdf8",
  base(room, t) {
    drawSurround(room, "#0f172a");
    // carpet tiles
    for (let gy = room.y + WALL_H, r = 0; gy < room.y + room.h; gy += 48, r++) for (let gx = room.x, c = 0; gx < room.x + room.w; gx += 48, c++) {
      ctx.fillStyle = (r + c) % 2 ? "#3b4a6b" : "#34435f";
      ctx.fillRect(gx, gy, Math.min(48, room.x + room.w - gx), Math.min(48, room.y + room.h - gy));
      ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(gx, gy, Math.min(48, room.x + room.w - gx), 1);
    }
    drawBackWall(room, { top: "#f8fafc", bottom: "#e2e8f0", skirting: "#1e293b" });
    drawSideWalls(room, "#cbd5e1");
    // ceiling panels + strip lights
    for (let i = 0; i < 4; i++) {
      const lx = room.x + 120 + i * 210;
      ctx.fillStyle = "#f8fafc"; ctx.fillRect(lx - 40, room.y + 10, 80, 6);
      ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillRect(lx - 40, room.y + 10, 80, 2);
      drawLightPool(lx, room.y + 320, 170, "#e0f2fe", 0.16);
    }
    // glass partitions between the workstations
    drawGlassPartition(room.x + 40, room.y + 30, 160, 90);
    drawGlassPartition(room.x + room.w - 200, room.y + 30, 160, 90);
    // reception carpet by the door
    drawRug(room.x + room.w / 2, room.y + 440, 220, 80, "#1e40af", "#0f172a", { stripes: true });
  },
  decor(room, t) {
    // stations: desk + the job's wall sign above it
    drawOfficeDesk(220, 222, t, 1); drawPizzaSign(220, 118);
    drawOfficeDesk(512, 222, t, 2); drawKbdSign(512, 118);
    drawOfficeDesk(800, 222, t, 3); drawWhackSign(800, 128);
    drawJobBoard(room.x + 120, room.y + 76, t);
    drawClock(room.x + room.w - 120, room.y + 54, 14, t);
    // NOW HIRING sign, blinking
    const on = Math.floor(t / 600) % 2 === 0;
    wallSign(room.x + room.w / 2, room.y + 40, "NOW HIRING", { size: 13, bg: on ? "#dc2626" : "#7f1d1d", border: on ? "#fecaca" : "#991b1b", color: on ? "#fff" : "#fca5a5" });
    ctx.fillStyle = "#1f2937"; ctx.fillRect(room.x + room.w / 2 - 60, room.y + 82, 120, 1.5);
    ctx.fillStyle = "#64748b"; ctx.font = "8px sans-serif"; ctx.textAlign = "center"; ctx.fillText("apply at any desk · paid per shift", room.x + room.w / 2, room.y + 94);
    drawWaterCooler(room.x + room.w - 34, room.y + 300, t);
    drawWaitingChairs(room.x + 46, room.y + 400, 3);
    drawPlant(room.x + 36, room.y + 300, t, 1);
    drawPlant(room.x + room.w - 36, room.y + 460, t + 400, 1);
    // filing cabinet on the right wall
    ctx.fillStyle = "#6b7280"; GFX.roundFill(ctx, room.x + room.w - 62, room.y + 360, 40, 60, 3, "#6b7280");
    ctx.fillStyle = "#4b5563"; for (let i = 0; i < 3; i++) { ctx.fillRect(room.x + room.w - 58, room.y + 366 + i * 18, 32, 14); ctx.fillStyle = "#d1d5db"; ctx.fillRect(room.x + room.w - 48, room.y + 372 + i * 18, 12, 2); ctx.fillStyle = "#4b5563"; }
  },
};

// ---------------- BARBER ----------------
function drawMirrorStation(x, y, t, seed, main) {
  // mirror with bulbs around it
  ctx.fillStyle = "#1f2937"; GFX.roundFill(ctx, x - 40, y - 74, 80, 88, 6, "#1f2937");
  const g = cachedGrad("mirror" + x, () => { const gg = ctx.createLinearGradient(x - 34, y - 68, x + 34, y + 8); gg.addColorStop(0, "#e0f2fe"); gg.addColorStop(0.5, "#bae6fd"); gg.addColorStop(1, "#7dd3fc"); return gg; });
  ctx.fillStyle = g; GFX.roundFill(ctx, x - 34, y - 68, 68, 76, 4, g);
  ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.moveTo(x - 30, y - 64); ctx.lineTo(x - 10, y - 64); ctx.lineTo(x - 30, y - 30); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, bx = x + Math.cos(a) * 40, by = y - 30 + Math.sin(a) * 44;
    const on = (Math.floor(t / 150) + i) % 12 < 8;
    ctx.fillStyle = on ? "#fef08a" : "#a16207"; ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
  }
  // counter with products
  ctx.fillStyle = "#f5f5f4"; GFX.roundFill(ctx, x - 44, y + 12, 88, 14, 3, "#f5f5f4");
  ctx.fillStyle = "#d6d3d1"; ctx.fillRect(x - 44, y + 24, 88, 3);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = ["#0ea5e9", "#ec4899", "#22c55e", "#f59e0b"][(i + seed) % 4]; ctx.fillRect(x - 30 + i * 14, y + 2, 7, 11); }
  ctx.fillStyle = "#9ca3af"; ctx.fillRect(x + 28, y + 4, 10, 3); ctx.fillRect(x + 30, y + 7, 2, 6); ctx.fillRect(x + 34, y + 7, 2, 6); // scissors
  // barber chair
  const cy = y + 70;
  drawShadowEllipse(x, cy + 18, 26, 7);
  ctx.fillStyle = "#6b7280"; ctx.fillRect(x - 3, cy + 2, 6, 14); ctx.beginPath(); ctx.ellipse(x, cy + 16, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = main ? "#b91c1c" : "#1f2937"; GFX.roundFill(ctx, x - 20, cy - 28, 40, 36, 8, main ? "#b91c1c" : "#1f2937");
  ctx.fillStyle = main ? "#dc2626" : "#374151"; GFX.roundFill(ctx, x - 22, cy - 8, 44, 14, 6, main ? "#dc2626" : "#374151");
  ctx.fillStyle = "#e5e7eb"; ctx.fillRect(x - 26, cy - 12, 5, 14); ctx.fillRect(x + 21, cy - 12, 5, 14);
  ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillRect(x - 14, cy - 22, 28, 3);
}
function drawBarberPole(x, y, t) {
  ctx.fillStyle = "#e5e7eb"; ctx.fillRect(x - 8, y - 4, 16, 6); ctx.fillRect(x - 8, y + 58, 16, 6);
  ctx.save(); ctx.beginPath(); ctx.rect(x - 6, y, 12, 58); ctx.clip();
  ctx.fillStyle = "#fafafa"; ctx.fillRect(x - 6, y, 12, 58);
  const off = (t / 25) % 24;
  for (let i = -2; i < 6; i++) {
    const yy = y + i * 24 + off;
    ctx.fillStyle = "#dc2626"; ctx.beginPath(); ctx.moveTo(x - 6, yy); ctx.lineTo(x + 6, yy - 8); ctx.lineTo(x + 6, yy); ctx.lineTo(x - 6, yy + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#2563eb"; ctx.beginPath(); ctx.moveTo(x - 6, yy + 12); ctx.lineTo(x + 6, yy + 4); ctx.lineTo(x + 6, yy + 12); ctx.lineTo(x - 6, yy + 20); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillRect(x - 5, y, 3, 58);
  ctx.restore();
  ctx.fillStyle = "#9ca3af"; ctx.beginPath(); ctx.arc(x, y - 8, 6, 0, Math.PI * 2); ctx.fill();
}
function drawNeonText(x, y, text, col, t, size) {
  const flick = Math.sin(t / 80) > -0.92 ? 1 : 0.35;
  ctx.font = `bold ${size}px sans-serif`; ctx.textAlign = "center";
  ctx.fillStyle = rgbaOf(col, 0.25 * flick); ctx.fillText(text, x, y + 1); ctx.fillText(text, x + 1, y); ctx.fillText(text, x - 1, y);
  ctx.fillStyle = rgbaOf(col, flick); ctx.fillText(text, x, y);
  ctx.fillStyle = `rgba(255,255,255,${0.6 * flick})`; ctx.font = `bold ${size - 1}px sans-serif`; ctx.fillText(text, x, y);
}
function drawProductShelves(x, y) {
  for (let s = 0; s < 3; s++) {
    const sy = y + s * 26;
    ctx.fillStyle = "#e5e7eb"; ctx.fillRect(x, sy, 90, 4); ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(x, sy + 4, 90, 3);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = ["#0ea5e9", "#f472b6", "#a3e635", "#fbbf24", "#a78bfa", "#fb7185"][(i + s) % 6];
      const h = 10 + ((i * 7 + s * 3) % 8);
      GFX.roundFill(ctx, x + 4 + i * 14, sy - h, 10, h, 2, ctx.fillStyle);
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(x + 6 + i * 14, sy - h + 2, 2, h - 4);
    }
  }
}

const barberRoom = {
  accent: "#22d3ee",
  base(room, t) {
    drawSurround(room, "#0c4a6e");
    for (let gy = room.y + WALL_H, r = 0; gy < room.y + room.h; gy += 32, r++) for (let gx = room.x, c = 0; gx < room.x + room.w; gx += 32, c++) {
      ctx.fillStyle = (r + c) % 2 ? "#f5f5f4" : "#1f2937";
      ctx.fillRect(gx, gy, Math.min(32, room.x + room.w - gx), Math.min(32, room.y + room.h - gy));
    }
    // glossy sheen
    const g = cachedGrad("barbersheen", () => { const gg = ctx.createLinearGradient(room.x, room.y + WALL_H, room.x + room.w, room.y + room.h); gg.addColorStop(0, "rgba(255,255,255,0.12)"); gg.addColorStop(0.5, "rgba(255,255,255,0)"); gg.addColorStop(1, "rgba(255,255,255,0.1)"); return gg; });
    ctx.fillStyle = g; ctx.fillRect(room.x, room.y + WALL_H, room.w, room.h - WALL_H);
    drawBackWall(room, { top: "#e0f2fe", bottom: "#bae6fd", skirting: "#0c4a6e", stripe: "#0ea5e9" });
    drawSideWalls(room, "#7dd3fc");
    for (let i = 0; i < 3; i++) drawLightPool(300 + i * 212, room.y + 330, 150, "#fef9c3", 0.18);
    drawRug(room.x + room.w / 2, room.y + 440, 160, 60, "#0ea5e9", "#0c4a6e", { stripes: true });
  },
  decor(room, t) {
    drawNeonText(room.x + room.w / 2, room.y + 40, "TRIM & STYLE", "#f472b6", t, 22);
    drawNeonText(room.x + room.w / 2, room.y + 58, "· walk-ins welcome ·", "#22d3ee", t + 900, 10);
    drawMirrorStation(300, 150, t, 0, false);
    drawMirrorStation(512, 150, t + 200, 1, true);
    drawMirrorStation(724, 150, t + 400, 2, false);
    drawProductShelves(room.x + 30, room.y + 40);
    drawBarberPole(room.x + room.w - 40, room.y + 30, t);
    // magazine table + waiting chairs on the left
    drawShadowEllipse(room.x + 110, room.y + 420, 30, 9);
    ctx.fillStyle = "#374151"; ctx.beginPath(); ctx.ellipse(room.x + 110, room.y + 414, 28, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4b5563"; ctx.beginPath(); ctx.ellipse(room.x + 110, room.y + 410, 28, 12, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) { ctx.fillStyle = ["#f472b6", "#fbbf24", "#22d3ee"][i]; ctx.fillRect(room.x + 96 + i * 8, room.y + 402 + i * 2, 14, 10); }
    drawWaitingChairs(room.x + 50, room.y + 470, 3);
    // coat rack + broom on the right
    ctx.fillStyle = "#374151"; ctx.fillRect(room.x + room.w - 40, room.y + 380, 3, 70); ctx.beginPath(); ctx.ellipse(room.x + room.w - 38, room.y + 452, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#dc2626"; GFX.roundFill(ctx, room.x + room.w - 52, room.y + 386, 18, 26, 5, "#dc2626");
    ctx.fillStyle = "#a16207"; ctx.fillRect(room.x + room.w - 24, room.y + 400, 3, 60); ctx.fillStyle = "#fde68a"; ctx.fillRect(room.x + room.w - 30, room.y + 456, 14, 10);
    drawPlant(room.x + room.w - 40, room.y + 300, t, 0.9);
  },
};

// ---------------- TOWN PLAZA ----------------
function drawStall(x, y, col, name, t, kind) {
  drawShadowEllipse(x, y + 26, 70, 10);
  // counter
  ctx.fillStyle = "#7c4a18"; GFX.roundFill(ctx, x - 60, y - 10, 120, 36, 4, "#7c4a18");
  ctx.fillStyle = "#a16207"; ctx.fillRect(x - 62, y - 14, 124, 6);
  ctx.fillStyle = "rgba(0,0,0,0.15)"; for (let i = 0; i < 4; i++) ctx.fillRect(x - 54 + i * 30, y - 4, 24, 26);
  // posts
  ctx.fillStyle = "#5c3317"; ctx.fillRect(x - 60, y - 84, 5, 74); ctx.fillRect(x + 55, y - 84, 5, 74);
  // scalloped awning
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? "#fafaf9" : col;
    const sx = x - 66 + i * (132 / stripes);
    ctx.beginPath(); ctx.moveTo(sx, y - 98); ctx.lineTo(sx + 132 / stripes, y - 98); ctx.lineTo(sx + 132 / stripes, y - 80);
    ctx.quadraticCurveTo(sx + 132 / stripes / 2, y - 72 + Math.sin(t / 500 + i) * 1.5, sx, y - 80); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = GFX.shadeColor(col, -30); ctx.fillRect(x - 68, y - 100, 136, 4);
  // goods
  if (kind === "pizza") {
    drawPizzaSign(x - 30, y - 34);
    ctx.fillStyle = "#fbbf24"; ctx.fillRect(x + 8, y - 30, 30, 20); ctx.fillStyle = "#dc2626"; ctx.fillRect(x + 12, y - 26, 22, 12);
  } else if (kind === "coffee") {
    ctx.fillStyle = "#1f2937"; GFX.roundFill(ctx, x - 40, y - 46, 32, 32, 4, "#1f2937"); ctx.fillStyle = "#9ca3af"; ctx.fillRect(x - 36, y - 40, 24, 6);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = "#fafaf9"; ctx.fillRect(x + 4 + i * 14, y - 28, 10, 12); ctx.fillStyle = "#78350f"; ctx.fillRect(x + 4 + i * 14, y - 28, 10, 3); }
    // steam
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { const sx = x + 9 + i * 14; ctx.beginPath(); ctx.moveTo(sx, y - 30); ctx.quadraticCurveTo(sx + Math.sin(t / 300 + i) * 4, y - 40, sx, y - 48 - ((t / 40 + i * 10) % 8)); ctx.stroke(); }
  } else if (kind === "flowers") {
    for (let i = 0; i < 5; i++) {
      const fx = x - 40 + i * 20, sway = Math.sin(t / 700 + i) * 2;
      ctx.strokeStyle = "#15803d"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, y - 16); ctx.lineTo(fx + sway, y - 40); ctx.stroke();
      ctx.fillStyle = ["#f472b6", "#fbbf24", "#f87171", "#a78bfa", "#fb923c"][i];
      for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(fx + sway + Math.cos(a) * 4, y - 42 + Math.sin(a) * 4, 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.arc(fx + sway, y - 42, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#0ea5e9"; ctx.fillRect(x - 50, y - 20, 100, 8);
  }
  ctx.fillStyle = "#fef3c7"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center"; ctx.fillText(name, x, y + 12);
}
function drawStringLights(x0, x1, y, sag, t, n) {
  ctx.strokeStyle = "#1f2937"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo((x0 + x1) / 2, y + sag * 2, x1, y); ctx.stroke();
  for (let i = 1; i < n; i++) {
    const p = i / n, bx = x0 + (x1 - x0) * p, by = y + 2 * sag * p * (1 - p) + 5;
    const on = 0.5 + 0.5 * Math.sin(t / 300 + i * 1.1);
    const col = ["#fde68a", "#f472b6", "#22d3ee", "#a3e635"][i % 4];
    ctx.fillStyle = rgbaOf(col, 0.25 * on); ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgbaOf(col, 0.5 + 0.5 * on); ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1f2937"; ctx.fillRect(bx - 1.5, by - 6, 3, 3);
  }
}
function drawUmbrellaTable(x, y, col, t) {
  drawShadowEllipse(x, y + 10, 40, 10);
  // chairs
  for (const dx of [-30, 30]) { ctx.fillStyle = "#374151"; GFX.roundFill(ctx, x + dx - 8, y - 6, 16, 14, 3, "#374151"); ctx.fillStyle = "#4b5563"; GFX.roundFill(ctx, x + dx - 8, y - 14, 16, 8, 2, "#4b5563"); }
  ctx.fillStyle = "#fafaf9"; ctx.beginPath(); ctx.ellipse(x, y, 22, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#d6d3d1"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = "#6b7280"; ctx.fillRect(x - 2, y - 70, 4, 70);
  // umbrella canopy
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? col : "#fafaf9";
    ctx.beginPath(); ctx.moveTo(x, y - 72); ctx.lineTo(x + Math.cos(i * Math.PI / 3) * 44, y - 56 + Math.sin(i * Math.PI / 3) * 16); ctx.lineTo(x + Math.cos((i + 1) * Math.PI / 3) * 44, y - 56 + Math.sin((i + 1) * Math.PI / 3) * 16); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,0.1)"; ctx.beginPath(); ctx.ellipse(x, y - 56, 44, 16, 0, 0, Math.PI); ctx.fill();
}
function drawPlanter(x, y, t) {
  drawShadowEllipse(x, y + 8, 40, 10);
  ctx.fillStyle = "#78716c"; ctx.beginPath(); ctx.ellipse(x, y, 40, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#a8a29e"; ctx.beginPath(); ctx.ellipse(x, y - 6, 40, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3f2210"; ctx.beginPath(); ctx.ellipse(x, y - 8, 34, 10, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 7; i++) {
    const fx = x - 26 + i * 9, sway = Math.sin(t / 600 + i) * 2;
    ctx.fillStyle = "#16a34a"; ctx.beginPath(); ctx.ellipse(fx + sway, y - 18, 6, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ["#f472b6", "#fbbf24", "#f87171"][i % 3]; ctx.beginPath(); ctx.arc(fx + sway, y - 26, 3.5, 0, Math.PI * 2); ctx.fill();
  }
}
function drawArcadeCabinet(x, y, col, t, kind) {
  drawShadowEllipse(x, y + 46, 30, 8);
  ctx.fillStyle = GFX.shadeColor(col, -40); GFX.roundFill(ctx, x - 26, y - 60, 52, 104, 5, GFX.shadeColor(col, -40));
  ctx.fillStyle = col; GFX.roundFill(ctx, x - 22, y - 56, 44, 20, 3, col);
  ctx.fillStyle = "#0a0a0a"; ctx.fillRect(x - 20, y - 34, 40, 34);
  const fl = 0.7 + 0.3 * Math.sin(t / 110 + x);
  if (kind === "kbd") { ctx.save(); ctx.translate(x, y - 17); ctx.scale(0.36, 0.5); drawKbdSign(0, 0); ctx.restore(); }
  else {
    for (let i = 0; i < 3; i++) { ctx.fillStyle = "#4d7c0f"; ctx.beginPath(); ctx.ellipse(x - 12 + i * 12, y - 8, 5, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    const up = Math.floor(t / 400) % 3; ctx.fillStyle = "#a16207"; ctx.beginPath(); ctx.arc(x - 12 + up * 12, y - 14 - 4 * fl, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = `rgba(255,255,255,${0.08 * fl})`; ctx.fillRect(x - 20, y - 34, 40, 34);
  ctx.fillStyle = "#374151"; ctx.fillRect(x - 22, y + 2, 44, 12);
  ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(x - 10, y + 8, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3b82f6"; ctx.beginPath(); ctx.arc(x, y + 8, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1f2937"; ctx.fillRect(x + 8, y - 2, 3, 10); ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(x + 9.5, y - 4, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fef3c7"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center"; ctx.fillText(kind === "kbd" ? "TYPE RACER" : "WHACK!", x, y - 43);
}
function drawGuildQuestBoard(x, y, t) {
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x - 76, y - 46, 156, 100);
  ctx.fillStyle = "#3f2210"; ctx.fillRect(x - 80, y - 50, 160, 100);
  ctx.fillStyle = "#c2a06b"; ctx.fillRect(x - 74, y - 44, 148, 88);
  ctx.fillStyle = "#fef3c7"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
  GFX.roundFill(ctx, x - 50, y - 42, 100, 14, 3, "#7c2d12"); ctx.fillText("ANNOUNCEMENTS", x, y - 32);
  const notes = [[-52, -12, "#fafaf9"], [-18, -16, "#fef08a"], [18, -10, "#fafaf9"], [50, -14, "#bae6fd"], [-40, 18, "#fecaca"], [0, 20, "#fafaf9"], [40, 16, "#bbf7d0"]];
  for (let i = 0; i < notes.length; i++) {
    const [dx, dy, c] = notes[i];
    ctx.save(); ctx.translate(x + dx, y + dy); ctx.rotate((srand(i) - 0.5) * 0.2);
    ctx.fillStyle = c; ctx.fillRect(-12, -10, 24, 20);
    ctx.fillStyle = "#9ca3af"; for (let l = 0; l < 3; l++) ctx.fillRect(-9, -5 + l * 5, 16 - (l % 2) * 5, 1.5);
    ctx.fillStyle = ["#dc2626", "#2563eb", "#16a34a"][i % 3]; ctx.beginPath(); ctx.arc(0, -8, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

const plazaRoom = {
  accent: "#fb923c",
  base(room, t) {
    drawSurround(room, "#431407");
    // terracotta tiles
    for (let gy = room.y + WALL_H, r = 0; gy < room.y + room.h; gy += 40, r++) for (let gx = room.x, c = 0; gx < room.x + room.w; gx += 40, c++) {
      const sh = 0.9 + srand(r * 53 + c) * 0.12;
      ctx.fillStyle = `rgb(${Math.round(194 * sh)},${Math.round(101 * sh)},${Math.round(52 * sh)})`;
      ctx.fillRect(gx, gy, Math.min(40, room.x + room.w - gx), Math.min(40, room.y + room.h - gy));
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(gx, gy, Math.min(40, room.x + room.w - gx), 2); ctx.fillRect(gx, gy, 2, 40);
    }
    // central mosaic circle (walkable) on the way to the board
    ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.ellipse(room.x + room.w / 2, room.y + 380, 90, 44, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#c2410c"; ctx.beginPath(); ctx.ellipse(room.x + room.w / 2, room.y + 380, 74, 36, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(room.x + room.w / 2, room.y + 380, 50, 24, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.ellipse(room.x + room.w / 2 + Math.cos(a) * 62, room.y + 380 + Math.sin(a) * 30, 4, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    drawBackWall(room, { top: "#fff1e0", bottom: "#fed7aa", skirting: "#7c2d12" });
    // brick arches on the wall
    ctx.fillStyle = "#b45309";
    for (let i = 0; i < 3; i++) { const ax = room.x + 150 + i * 282; ctx.beginPath(); ctx.arc(ax, room.y + 70, 56, Math.PI, 0); ctx.lineTo(ax + 56, room.y + WALL_H - 10); ctx.lineTo(ax - 56, room.y + WALL_H - 10); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = "#fed7aa";
    for (let i = 0; i < 3; i++) { const ax = room.x + 150 + i * 282; ctx.beginPath(); ctx.arc(ax, room.y + 70, 48, Math.PI, 0); ctx.lineTo(ax + 48, room.y + WALL_H - 10); ctx.lineTo(ax - 48, room.y + WALL_H - 10); ctx.closePath(); ctx.fill(); }
    drawSideWalls(room, "#fdba74");
    drawLightPool(room.x + room.w / 2, room.y + 300, 300, "#fde68a", 0.14);
  },
  decor(room, t) {
    drawStall(room.x + 150, room.y + 200, "#dc2626", "PIZZA CORNER", t, "pizza");
    drawStall(room.x + room.w - 150, room.y + 200, "#0ea5e9", "FLOWER CART", t, "flowers");
    drawStall(room.x + 330, room.y + 178, "#a16207", "CAFÉ", t, "coffee");
    drawGuildQuestBoard(512, 196, t);
    drawStringLights(room.x + 20, room.x + room.w - 20, room.y + 14, 22, t, 22);
    drawStringLights(room.x + 20, room.x + room.w / 2, room.y + 4, 14, t + 500, 11);
    drawStringLights(room.x + room.w / 2, room.x + room.w - 20, room.y + 4, 14, t + 900, 11);
    drawPlanter(room.x + 270, room.y + 420, t);
    drawPlanter(room.x + room.w - 270, room.y + 420, t + 300);
    drawUmbrellaTable(room.x + 130, room.y + 420, "#dc2626", t);
    drawUmbrellaTable(room.x + room.w - 130, room.y + 420, "#0ea5e9", t);
    drawArcadeCabinet(room.x + room.w - 60, room.y + 300, "#7c3aed", t, "kbd");
    drawArcadeCabinet(room.x + 60, room.y + 300, "#16a34a", t, "whack");
    // bins + a bench along the bottom corners
    for (const bx of [room.x + 40, room.x + room.w - 40]) { drawShadowEllipse(bx, room.y + 500, 10, 4); ctx.fillStyle = "#166534"; GFX.roundFill(ctx, bx - 8, room.y + 470, 16, 30, 3, "#166534"); ctx.fillStyle = "#14532d"; ctx.fillRect(bx - 10, room.y + 468, 20, 5); }
  },
};

const ROOM_RENDERERS = {
  interior_home: homeRoom,
  interior_mayor: townHallRoom,
  interior_bank: bankRoom,
  interior_furniture: furnitureRoom,
  interior_lootbox: lootboxRoom,
  interior_quest: guildRoom,
  interior_job: jobsRoom,
  interior_barber: barberRoom,
  interior_plaza: plazaRoom,
};

// Small wall signs shared by the Jobs Center desks and the Plaza arcade.
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
