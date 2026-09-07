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
  function draw(ctx, x, y, walls, width, height) {
    const radius = (root.DungeonScenes && root.DungeonScenes.visibilityRadius) || 210, angles = [];
    for (let i = 0; i < 180; i++) angles.push(i * Math.PI * 2 / 180);
    for (const w of walls || []) for (const px of [w.x, w.x + w.w]) for (const py of [w.y, w.y + w.h]) {
      const a = Math.atan2(py - y, px - x); angles.push(a - 0.0001, a, a + 0.0001);
    }
    angles.sort((a, b) => a - b);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width, height);
    angles.forEach((a, i) => { const dx = Math.cos(a), dy = Math.sin(a), r = distance(x, y, dx, dy, radius, walls); const px = x + dx * r, py = y + dy * r; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.closePath(); ctx.fillStyle = '#000'; ctx.fill('evenodd'); ctx.restore();
  }
  const api = { distance, draw };
  if (typeof module !== 'undefined') module.exports = api; else root.DungeonSight = api;
})(typeof window !== 'undefined' ? window : globalThis);
