/* Exact ray/AABB intersections shared by sight tests and the darkness mask. */
(function (root) {
  'use strict';
  function distance(x, y, dx, dy, radius, walls) {
    let nearest = radius;
    for (const w of walls || []) {
      let lo = 0, hi = nearest;
      for (const [p, v, min, max] of [[x, dx, w.x, w.x + w.w], [y, dy, w.y, w.y + w.h]]) {
        if (Math.abs(v) < 1e-9) { if (p < min || p > max) { hi = -1; break; } }
        else { const a = (min - p) / v, b = (max - p) / v; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
      }
      if (hi >= lo) nearest = Math.min(nearest, lo);
    }
    return nearest;
  }
  const TAU = Math.PI * 2;
  function polygon(x, y, walls, radius) {
    const angles = [];
    for (let i = 0; i < 192; i++) angles.push(i * TAU / 192);
    for (const w of walls || []) {
      if (w.x > x + radius || w.y > y + radius || w.x + w.w < x - radius || w.y + w.h < y - radius) continue;
      for (const px of [w.x, w.x + w.w]) for (const py of [w.y, w.y + w.h]) {
        const a = Math.atan2(py - y, px - x);
        for (const offset of [-0.0001, 0, 0.0001]) angles.push(((a + offset) % TAU + TAU) % TAU);
      }
    }
    angles.sort((a, b) => a - b);
    return angles.map(a => {
      const dx = Math.cos(a), dy = Math.sin(a);
      // Include the face/bevel of the first wall, rather than cutting it in half.
      const r = Math.min(radius, distance(x, y, dx, dy, radius, walls) + 14);
      return { x: x + dx * r, y: y + dy * r, angle: a };
    });
  }
  let mask, mc;
  function draw(ctx, x, y, walls, width, height, bounds, fullRoom) {
    const radius = (root.DungeonScenes && root.DungeonScenes.visibilityRadius) || 380;
    const v = bounds || { x: 0, y: 0, w: width, h: height };
    if (!mask) { mask = document.createElement('canvas'); mc = mask.getContext('2d'); }
    if (mask.width !== Math.ceil(v.w) || mask.height !== Math.ceil(v.h)) { mask.width = Math.ceil(v.w); mask.height = Math.ceil(v.h); }
    mc.setTransform(1, 0, 0, 1, 0, 0); mc.globalCompositeOperation = 'source-over';
    mc.fillStyle = '#000'; mc.fillRect(0, 0, mask.width, mask.height);
    mc.save(); mc.translate(-v.x, -v.y); mc.beginPath();
    polygon(x, y, walls, radius).forEach((p, i) => i ? mc.lineTo(p.x, p.y) : mc.moveTo(p.x, p.y));
    mc.closePath(); mc.clip(); mc.globalCompositeOperation = 'destination-out';
    const light = mc.createRadialGradient(x, y, radius * 0.48, x, y, radius);
    light.addColorStop(0, 'rgba(0,0,0,1)'); light.addColorStop(0.45, 'rgba(0,0,0,.85)'); light.addColorStop(1, 'rgba(0,0,0,0)');
    mc.fillStyle = light; mc.fillRect(v.x, v.y, v.w, v.h); mc.restore();
    if (fullRoom) {
      mc.save(); mc.globalCompositeOperation='destination-out'; mc.fillStyle='#000';
      mc.fillRect(fullRoom.x-v.x-14,fullRoom.y-v.y-14,fullRoom.w+28,fullRoom.h+28); mc.restore();
    }
    ctx.drawImage(mask, v.x, v.y);
  }
  const api = { distance, polygon, draw };
  if (typeof module !== 'undefined') module.exports = api; else root.DungeonSight = api;
})(typeof window !== 'undefined' ? window : globalThis);
