/* =====================================================================
   cutscene-quality.js — quality tiers for the 3D cutscenes (dungeon3d.js).

   Target: loads fast and holds 60 fps on an Intel Core Ultra 5 laptop with
   integrated graphics (Intel Arc / "Intel(R) Graphics"), no discrete GPU.

   Three tiers, each a budget:

             render scale   shadows              motes  post
     high    1.50 .. 1.15   PCF soft 1024, all   900    DOF + bloom taps + grain
     medium  1.20 .. 0.95   PCF 1024, actors+big 560    DOF + vignette
     low     1.00 .. 0.75   PCF 512, actors only 300    single tap + vignette

   (render scale is relative to the 1024x640 cutscene frame; 1.5 is the old
   fixed 1536x960 supersample.)

   How a tier is chosen:
     1. manual override — localStorage 'cutsceneQuality' = low|medium|high
        (the phone's Graphics app writes it; 'auto' / absent = automatic)
     2. learned — what the governor settled on last time on this device
        (localStorage 'cutsceneQualityLearned'), so the next cutscene starts
        at the right level instead of re-discovering it
     3. detected — the WebGL renderer string (UNMASKED_RENDERER_WEBGL),
        core count and device memory (classify())

   While a cutscene plays, the Governor watches real frame times: over
   budget → the render scale steps down (adaptive pixel ratio, applied
   immediately — a render-target resize, no shader recompile); already at
   the tier's floor and still slow → the tier drops for the NEXT cutscene
   (shadow type / post variant changes recompile shaders, which would hitch
   mid-scene). Sustained headroom steps the scale back up, and a whole
   cutscene with headroom at full scale promotes the learned tier one step.

   Pure logic is exported for node tests (js/cutscene-quality.test.js).
   ===================================================================== */
(function (root) {
  "use strict";
  const ORDER = ["low", "medium", "high"];
  const TIERS = {
    low:    { name: "low",    scale: 1.0, minScale: 0.75, shadows: 1, shadowMap: 512,  shadowCasters: "actors", motes: 300, post: 0, dust: 0.5 },
    medium: { name: "medium", scale: 1.2, minScale: 0.95, shadows: 1, shadowMap: 1024, shadowCasters: "large",  motes: 560, post: 1, dust: 0.75 },
    high:   { name: "high",   scale: 1.5, minScale: 1.15, shadows: 2, shadowMap: 1024, shadowCasters: "all",    motes: 900, post: 2, dust: 1 },
  };
  const KEY = "cutsceneQuality", LEARNED = "cutsceneQualityLearned";
  const clampTier = (t) => (TIERS[t] ? t : null);
  const step = (t, d) => ORDER[Math.max(0, Math.min(ORDER.length - 1, ORDER.indexOf(t) + d))];

  // ---- detection: renderer string + hardware hints -> tier
  function classify(info) {
    info = info || {};
    const r = String(info.renderer || "") + " " + String(info.vendor || "");
    let t;
    if (!r.trim()) t = "medium";
    else if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(r)) t = "low";
    else if (/\bintel\b/i.test(r)) {
      // discrete Arc (A370M, A770, B580...) vs the integrated Arc / Iris / UHD / "Intel(R) Graphics"
      if (/arc\S*\s*(\(tm\))?\s*[ab]\d{3}/i.test(r)) t = "high";
      else if (/arc/i.test(r)) t = "medium";
      else t = "low";
    } else if (/mali|adreno|powervr|videocore|apple gpu|sgx/i.test(r)) t = "low";
    else if (/apple m\d/i.test(r)) t = "medium";
    else if (/nvidia|geforce|quadro|rtx|gtx/i.test(r)) t = "high";
    else if (/radeon/i.test(r)) t = /radeon\s*(\(tm\))?\s*(graphics|vega \d\b|\d{3}m\b)/i.test(r) ? "medium" : "high";
    else t = "medium";
    if (info.mobile && t === "high") t = "medium";
    if ((info.cores && info.cores <= 4) || (info.memory && info.memory <= 4)) t = t === "high" ? "medium" : t;
    return t;
  }
  function rendererInfo(gl) {
    const out = { renderer: "", vendor: "" };
    try {
      const e = gl && gl.getExtension && gl.getExtension("WEBGL_debug_renderer_info");
      out.renderer = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : "");
      out.vendor = e ? gl.getParameter(e.UNMASKED_VENDOR_WEBGL) : (gl ? gl.getParameter(gl.VENDOR) : "");
    } catch (e) {}
    try {
      const nav = root.navigator || {};
      out.cores = nav.hardwareConcurrency || 0; out.memory = nav.deviceMemory || 0;
      out.mobile = !!(nav.userAgentData && nav.userAgentData.mobile) || /Android|iPhone|iPad/i.test(nav.userAgent || "");
    } catch (e) {}
    return out;
  }

  // ---- storage (every access guarded: private windows / blocked storage)
  function read(k) { try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function write(k, v) { try { if (!root.localStorage) return; if (v == null) root.localStorage.removeItem(k); else root.localStorage.setItem(k, v); } catch (e) {} }
  function override() { const v = read(KEY); return clampTier(v); }
  function setOverride(v) { write(KEY, clampTier(v) || null); if (!clampTier(v)) write(LEARNED, null); current.changed = true; }
  function learned() { try { const o = JSON.parse(read(LEARNED) || "null"); return o && clampTier(o.tier) ? o : null; } catch (e) { return null; } }

  // the tier to START a cutscene at
  function pick(detectedTier, over, learnedRec) {
    if (clampTier(over)) return { tier: over, source: "manual" };
    if (learnedRec && clampTier(learnedRec.tier)) {
      // never learn more than one step above what the hardware looks like
      const lim = step(detectedTier || "medium", 1);
      const t = ORDER.indexOf(learnedRec.tier) > ORDER.indexOf(lim) ? lim : learnedRec.tier;
      return { tier: t, source: "learned", scale: learnedRec.scale };
    }
    return { tier: clampTier(detectedTier) || "medium", source: "detected" };
  }

  // ---- the governor: frame times in, render scale (and tier advice) out
  // Windows of 24 frames; > 19.5 ms average = over the 60 fps budget, < 13.5 = headroom.
  function Governor(tier, opts) {
    opts = opts || {};
    this.T = TIERS[tier] || TIERS.medium;
    this.tier = this.T.name;
    this.scale = Math.min(this.T.scale, Math.max(this.T.minScale, opts.scale || this.T.scale));
    this.win = []; this.good = 0; this.bad = 0; this.drop = false; this.frames = 0; this.sum = 0; this.locked = !!opts.locked;
    this.budget = opts.budget || 16.7;
  }
  Governor.prototype.sample = function (dt) {
    if (!(dt > 0) || dt > 250) return false;            // tab switches, first frames, hitches from loads
    this.frames++; this.sum += dt;
    this.win.push(dt);
    if (this.win.length < 24) return false;
    let s = 0; for (const v of this.win) s += v; const avg = s / this.win.length; this.win.length = 0;
    let changed = false;
    if (avg > this.budget * 1.17) {
      this.good = 0; this.bad++;
      if (!this.locked && this.scale > this.T.minScale + 1e-6) { this.scale = Math.max(this.T.minScale, +(this.scale - (avg > this.budget * 1.6 ? 0.2 : 0.1)).toFixed(3)); changed = true; }
      else if (this.bad >= 2) this.drop = true;          // at the floor and still over: next cutscene one tier lower
    } else if (avg < this.budget * 0.81) {
      this.bad = 0; this.good++;
      if (this.good >= 3 && !this.locked && this.scale < this.T.scale - 1e-6) { this.scale = Math.min(this.T.scale, +(this.scale + 0.05).toFixed(3)); this.good = 0; changed = true; }
    } else { this.good = 0; this.bad = 0; }
    return changed;
  };
  Governor.prototype.average = function () { return this.frames ? this.sum / this.frames : 0; };
  // what to remember for the next cutscene on this device
  Governor.prototype.verdict = function () {
    if (this.frames < 60) return null;
    if (this.drop) return { tier: step(this.tier, -1), scale: null };
    const avg = this.average();
    if (avg < this.budget * 0.75 && this.scale >= this.T.scale - 1e-6) return { tier: step(this.tier, 1), scale: null };
    return { tier: this.tier, scale: this.scale };
  };

  // ---- runtime state (browser)
  const current = { tier: null, source: null, detected: null, info: null, gov: null, changed: false };
  function begin(gl) {
    if (!current.info) { current.info = rendererInfo(gl); current.detected = classify(current.info); }
    const p = pick(current.detected, override(), learned());
    current.tier = p.tier; current.source = p.source; current.changed = false;
    // a manual pick fixes the tier (never re-learned) but the scale still adapts inside it
    current.gov = new Governor(p.tier, { scale: p.scale });
    return TIERS[p.tier];
  }
  function finish() {
    const g = current.gov; if (!g) return null;
    const v = g.verdict(); current.gov = null;
    if (v && current.source !== "manual") write(LEARNED, JSON.stringify(v));
    return v;
  }

  // ---- the phone's Graphics app (index.html button data-act="graphics", game.js opens it)
  function settingsHtml() {
    const o = override() || "auto", L = learned();
    const opt = (v, label, sub) => `<label style="display:flex;gap:8px;align-items:flex-start;padding:8px 6px;border-radius:8px;cursor:pointer;${o === v ? "background:rgba(167,139,250,.16)" : ""}">` +
      `<input type="radio" name="cq" value="${v}" ${o === v ? "checked" : ""}><span><b>${label}</b><br><small style="opacity:.75">${sub}</small></span></label>`;
    const det = current.detected ? current.detected.toUpperCase() : "—";
    return `<div style="padding:4px 2px;font-size:13px;line-height:1.35">` +
      `<p style="margin:0 0 8px"><b>Boss cutscene quality</b></p>` +
      opt("auto", "Automatic", "Picks a level for this device, then adapts to the frame rate. Recommended.") +
      opt("low", "Low", "Laptops with integrated graphics. Lower resolution, fewer shadows and particles.") +
      opt("medium", "Medium", "Balanced.") +
      opt("high", "High", "Full resolution, soft shadows, depth of field and bloom.") +
      `<p style="margin:10px 0 0;opacity:.7;font-size:12px">This device looks like: ${det}${L ? " · last settled on " + L.tier.toUpperCase() : ""}</p></div>`;
  }
  function bindSettings(el) {
    if (!el || !el.querySelectorAll) return;
    el.querySelectorAll('input[name="cq"]').forEach((r) => { r.onchange = () => { setOverride(r.value === "auto" ? null : r.value); if (root.toast) try { root.toast("Cutscene quality: " + r.value.toUpperCase()); } catch (e) {} }; });
  }

  const API = { TIERS, ORDER, classify, rendererInfo, pick, Governor, override, setOverride, learned, begin, finish,
    current: () => (current.tier ? { tier: current.tier, source: current.source, detected: current.detected, scale: current.gov ? current.gov.scale : null, renderer: current.info && current.info.renderer } : null),
    governor: () => current.gov, settingsHtml, bindSettings, KEY, LEARNED };
  root.CutsceneQuality = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
