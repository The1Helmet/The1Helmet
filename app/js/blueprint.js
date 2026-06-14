// Blueprint mode: lay the working draft onto a formatted paper sheet (border +
// zone marks + title block), then compose: select parts (click / marquee),
// move and scale them (single or many) or scale the whole drawing globally,
// and export/print. Non-destructive — only per-part offset+scale are stored,
// the draft geometry is never changed.
//
// Coordinate systems:
//   world      — the draft's units
//   drawn      — world after each part's local transform (scale about pivot + offset)
//   paper (mm) — drawn * globalScale, placed at `origin` (Y flipped, down)
//   screen px  — paper * view.scale, minus pan
import { DEFS } from './entities.js';
import { Pen } from './renderer.js';

const PX_PER_MM = 3.7795; // 96 dpi — true-to-size export

export const SHEETS = [
  { key: 'A0L', name: 'A0 (ISO) Landscape', w: 1189, h: 841 },
  { key: 'A1L', name: 'A1 (ISO) Landscape', w: 841, h: 594 },
  { key: 'A2L', name: 'A2 (ISO) Landscape', w: 594, h: 420 },
  { key: 'A3L', name: 'A3 (ISO) Landscape', w: 420, h: 297 },
  { key: 'A4L', name: 'A4 (ISO) Landscape', w: 297, h: 210 },
  { key: 'A4P', name: 'A4 (ISO) Portrait', w: 210, h: 297 },
  { key: 'A3P', name: 'A3 (ISO) Portrait', w: 297, h: 420 },
  { key: 'LTRL', name: 'Letter (ANSI A) Landscape', w: 279.4, h: 215.9 },
  { key: 'LTRP', name: 'Letter (ANSI A) Portrait', w: 215.9, h: 279.4 },
];
export const sheetByKey = (k) => SHEETS.find((s) => s.key === k) || SHEETS[4];

export function defaultSheet() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    sizeKey: 'A4L',
    fields: { title: 'Untitled', name: '', org: '', date: today, dwgNo: '', rev: '', scale: '1:1', sheet: '1 OF 1' },
    layout: { originX: 0, originY: 0, scale: 20, overrides: {}, scales: {}, labelScale: 1 }, // mm, mm, mm/unit, {id:{x,y}}, {id:factor}, text multiplier
  };
}

const pivotOf = (e) => { const b = DEFS[e.type].bounds(e); return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }; };

function unionBounds(entities) {
  let b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of entities) { const eb = DEFS[e.type].bounds(e); b.minX = Math.min(b.minX, eb.minX); b.minY = Math.min(b.minY, eb.minY); b.maxX = Math.max(b.maxX, eb.maxX); b.maxY = Math.max(b.maxY, eb.maxY); }
  if (!isFinite(b.minX)) b = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return b;
}

// Pen camera mapping world -> screen through a part's local transform + placement.
function drawCam(view, scaleMM, origin, off, f, pivot) {
  return {
    scale: scaleMM * f * view.scale,
    toScreen(p) {
      const lx = pivot.x + (p.x - pivot.x) * f + off.x;
      const ly = pivot.y + (p.y - pivot.y) * f + off.y;
      return view.toScreen({ x: origin.x + lx * scaleMM, y: origin.y - ly * scaleMM });
    },
  };
}

// Build the whole sheet as SVG strings. Pure — used for screen + export.
export function buildSheetMarkup(view, cfg, entities, clipId = 'bpClip') {
  const out = [];
  const size = sheetByKey(cfg.sizeKey);
  const W = size.w, H = size.h, m = 10;
  const S = view.scale;
  const px = (mm) => mm * S;
  const sc = (x, y) => view.toScreen({ x, y });
  const ink = '#14181f';
  const line = (x1, y1, x2, y2, wmm = 0.3, color = ink) => { const a = sc(x1, y1), b = sc(x2, y2); out.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${color}" stroke-width="${px(wmm).toFixed(2)}"/>`); };
  const rect = (x, y, w, h, wmm = 0.3, fill = 'none') => { const a = sc(x, y); out.push(`<rect x="${a.x.toFixed(1)}" y="${a.y.toFixed(1)}" width="${px(w).toFixed(1)}" height="${px(h).toFixed(1)}" fill="${fill}" stroke="${ink}" stroke-width="${px(wmm).toFixed(2)}"/>`); };
  const text = (x, y, str, hmm, o = {}) => { const a = sc(x, y); out.push(`<text x="${a.x.toFixed(1)}" y="${a.y.toFixed(1)}" font-family="${o.font || 'Arial, sans-serif'}" font-size="${px(hmm).toFixed(1)}" fill="${ink}" text-anchor="${o.anchor || 'start'}" dominant-baseline="${o.baseline || 'middle'}" font-weight="${o.weight || 'normal'}">${String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`); };

  const sh = sc(0, 0);
  out.push(`<rect x="${(sh.x + px(1.2)).toFixed(1)}" y="${(sh.y + px(1.2)).toFixed(1)}" width="${px(W).toFixed(1)}" height="${px(H).toFixed(1)}" fill="#00000022"/>`);
  rect(0, 0, W, H, 0.2, '#ffffff');

  const fx = m, fy = m, fw = W - 2 * m, fh = H - 2 * m;
  const ca = sc(fx, fy);
  out.push(`<clipPath id="${clipId}"><rect x="${ca.x.toFixed(1)}" y="${ca.y.toFixed(1)}" width="${px(fw).toFixed(1)}" height="${px(fh).toFixed(1)}"/></clipPath>`);
  out.push(`<g clip-path="url(#${clipId})">`);
  const origin = { x: cfg.layout.originX, y: cfg.layout.originY };
  for (const e of entities) {
    const off = cfg.layout.overrides[e.id] || { x: 0, y: 0 };
    const f = cfg.layout.scales[e.id] || 1;
    const cam = drawCam(view, cfg.layout.scale, origin, off, f, pivotOf(e));
    const pen = new Pen(cam);
    pen.textScale = (cam.scale / 60) * (cfg.layout.labelScale ?? 1); // labels scale with the drawing
    try { DEFS[e.type].draw(e, pen, { selected: false, scale: cam.scale }); } catch (_) {}
    out.push(pen.out());
  }
  out.push('</g>');

  rect(fx, fy, fw, fh, 0.6);
  const cols = Math.max(4, Math.round(W / 50));
  const rows = Math.max(2, Math.round(H / 55));
  const cw = fw / cols, rh = fh / rows;
  for (let k = 0; k < cols; k++) {
    if (k > 0) { line(fx + k * cw, 0, fx + k * cw, m, 0.3); line(fx + k * cw, H - m, fx + k * cw, H, 0.3); }
    text(fx + (k + 0.5) * cw, m / 2, String(cols - k), 3, { anchor: 'middle' });
    text(fx + (k + 0.5) * cw, H - m / 2, String(cols - k), 3, { anchor: 'middle' });
  }
  for (let r = 0; r < rows; r++) {
    if (r > 0) { line(0, fy + r * rh, m, fy + r * rh, 0.3); line(W - m, fy + r * rh, W, fy + r * rh, 0.3); }
    const lbl = String.fromCharCode(65 + (rows - 1 - r));
    text(m / 2, fy + (r + 0.5) * rh, lbl, 3, { anchor: 'middle' });
    text(W - m / 2, fy + (r + 0.5) * rh, lbl, 3, { anchor: 'middle' });
  }

  const Wb = Math.min(170, fw), Hb = 40;
  const bx = fx + fw - Wb, by = fy + fh - Hb;
  const c1 = 70, c2 = 45, r1 = 13.33, r2 = 13.33;
  rect(bx, by, Wb, Hb, 0.6);
  const cell = (x, y, w, h, label, value, o = {}) => {
    line(x, y, x + w, y, 0.3); line(x, y, x, y + h, 0.3);
    if (label) text(x + 1.5, y + 2.8, label, 2.1, {});
    if (value != null && value !== '') text(o.center ? x + w / 2 : x + 2, o.center ? y + h * 0.62 : y + h - 3, value, o.big ? 5 : 3, { anchor: o.center ? 'middle' : 'start', weight: o.big ? 'bold' : 'normal' });
  };
  const f = cfg.fields, c3x = bx + c1 + c2, c3w = Wb - c1 - c2;
  cell(bx, by, c1, r1, 'TITLE', f.title, { big: true });
  cell(bx + c1, by, c2, r1, 'DWG NO.', f.dwgNo);
  cell(c3x, by, c3w / 2, r1, 'SIZE', size.key.replace(/[LP]$/, ''), { center: true });
  cell(c3x + c3w / 2, by, c3w / 2, r1, 'REV', f.rev, { center: true });
  cell(bx, by + r1, c1, r2, 'DRAWN', f.name);
  cell(bx + c1, by + r1, c2, r2, 'DATE', f.date);
  cell(c3x, by + r1, c3w / 2, r2, 'SCALE', f.scale, { center: true });
  cell(c3x + c3w / 2, by + r1, c3w / 2, r2, 'SHEET', f.sheet, { center: true });
  const r3 = Hb - r1 - r2;
  cell(bx, by + r1 + r2, c1 + c2, r3, 'ORGANISATION', f.org);
  cell(c3x, by + r1 + r2, c3w, r3, '', 'DO NOT SCALE DRAWING', { center: true });
  return out.join('');
}

class PaperView {
  constructor() { this.scale = 3; this.panX = 0; this.panY = 0; }
  toScreen(mm) { return { x: (mm.x - this.panX) * this.scale, y: (mm.y - this.panY) * this.scale }; }
  toMm(s) { return { x: s.x / this.scale + this.panX, y: s.y / this.scale + this.panY }; }
  zoomAt(s, f) { const b = this.toMm(s); this.scale = Math.max(0.5, Math.min(40, this.scale * f)); const a = this.toMm(s); this.panX += b.x - a.x; this.panY += b.y - a.y; }
  fit(W, H, vw, vh) { this.scale = Math.max(0.5, Math.min(40, Math.min((vw - 60) / W, (vh - 60) / H))); this.panX = W / 2 - vw / 2 / this.scale; this.panY = H / 2 - vh / 2 / this.scale; }
}

export class Blueprint {
  constructor(app) { this.app = app; this.view = new PaperView(); this.drag = null; this.sel = new Set(); this.marquee = null; }
  get cfg() { return this.app.store.sheet; }
  get L() { return this.cfg.layout; }

  enter() {
    if (!this.app.store.sheet) this.app.store.sheet = defaultSheet();
    if (!this.L.scales) this.L.scales = {};
    if (this.L.labelScale == null) this.L.labelScale = 1;
    this.sel.clear();
    this.app.mode = 'blueprint';
    document.getElementById('palette').style.display = 'none';
    document.getElementById('properties').style.display = 'none';
    document.getElementById('blueprint-panel').style.display = 'block';
    document.getElementById('toolbar').classList.add('bp-on');
    this.openFormatDialog(true);
    this.buildPanel();
    this.fitDrawing();
  }
  exit() {
    this.app.mode = 'draft';
    document.getElementById('palette').style.display = '';
    document.getElementById('properties').style.display = '';
    document.getElementById('blueprint-panel').style.display = 'none';
    document.getElementById('toolbar').classList.remove('bp-on');
    this.app.render();
  }

  fitView() { const r = this.app.svg.getBoundingClientRect(); const s = sheetByKey(this.cfg.sizeKey); this.view.fit(s.w, s.h, r.width, r.height); }

  fitDrawing() {
    const ents = this.app.store.entities;
    const s = sheetByKey(this.cfg.sizeKey);
    const m = 10, fw = s.w - 2 * m, fh = s.h - 2 * m;
    const b = unionBounds(ents);
    const bw = Math.max(0.5, b.maxX - b.minX), bh = Math.max(0.5, b.maxY - b.minY);
    this.L.scale = Math.max(1, Math.min(fw * 0.6 / bw, fh * 0.6 / bh)); // 60% — leave room to arrange
    this.L.overrides = {}; this.L.scales = {};
    const wc = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, pc = { x: m + fw / 2, y: m + fh / 2 };
    this.L.originX = pc.x - wc.x * this.L.scale; this.L.originY = pc.y + wc.y * this.L.scale;
    // auto label size ~ proportional to the drawing (text height ≈ 4.5% of its diagonal)
    const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) || 1;
    this.L.labelScale = Math.max(0.1, Math.min(6, 0.18 * diag));
    const gi = document.getElementById('bp-gscale'); if (gi) gi.value = this.L.scale.toFixed(1);
    const li = document.getElementById('bp-lscale'); if (li) li.value = this.L.labelScale.toFixed(2);
    this.fitView(); this._refreshSel(); this.app.render();
  }

  render() {
    const r = this.app.svg.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.app.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.app.svg.style.cursor = this.drag && this.drag.type === 'scale' ? 'nwse-resize' : (this.drag && this.drag.type === 'move' ? 'grabbing' : 'default');
    const out = [`<rect x="0" y="0" width="${w}" height="${h}" fill="#c9ced6"/>`];
    out.push(buildSheetMarkup(this.view, this.cfg, this.app.store.entities));

    // selection overlay
    for (const id of this.sel) {
      const e = this.app.store.get(id); if (!e) continue;
      const bb = this._effBounds(e);
      const a = this._w2s({ x: bb.minX, y: bb.maxY }), c = this._w2s({ x: bb.maxX, y: bb.minY });
      out.push(`<rect x="${Math.min(a.x, c.x).toFixed(1)}" y="${Math.min(a.y, c.y).toFixed(1)}" width="${Math.abs(c.x - a.x).toFixed(1)}" height="${Math.abs(c.y - a.y).toFixed(1)}" fill="#2d7ef722" stroke="#2d7ef7" stroke-width="1"/>`);
    }
    const gb = this._selBounds();
    if (gb) {
      const corners = [{ x: gb.minX, y: gb.minY }, { x: gb.maxX, y: gb.minY }, { x: gb.maxX, y: gb.maxY }, { x: gb.minX, y: gb.maxY }];
      const sp = corners.map((p) => this._w2s(p));
      const xs = sp.map((p) => p.x), ys = sp.map((p) => p.y);
      out.push(`<rect x="${Math.min(...xs).toFixed(1)}" y="${Math.min(...ys).toFixed(1)}" width="${(Math.max(...xs) - Math.min(...xs)).toFixed(1)}" height="${(Math.max(...ys) - Math.min(...ys)).toFixed(1)}" fill="none" stroke="#2d7ef7" stroke-width="1.2" stroke-dasharray="5 3"/>`);
      for (const p of sp) out.push(`<rect x="${(p.x - 5).toFixed(1)}" y="${(p.y - 5).toFixed(1)}" width="10" height="10" fill="#fff" stroke="#2d7ef7" stroke-width="1.6"/>`);
    }
    if (this.marquee) {
      const a = this._w2s(this.marquee.a), c = this._w2s(this.marquee.b);
      out.push(`<rect x="${Math.min(a.x, c.x)}" y="${Math.min(a.y, c.y)}" width="${Math.abs(c.x - a.x)}" height="${Math.abs(c.y - a.y)}" fill="#2d7ef722" stroke="#2d7ef7" stroke-width="1" stroke-dasharray="3 2"/>`);
    }
    this.app.svg.innerHTML = out.join('');
  }

  // ---- transforms / geometry ----
  _screen(ev) { const r = this.app.svg.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  _w2s(p) { const S = this.L.scale; return this.view.toScreen({ x: this.L.originX + p.x * S, y: this.L.originY - p.y * S }); } // drawn-world -> screen
  _s2w(s) { const mm = this.view.toMm(s); const S = this.L.scale; return { x: (mm.x - this.L.originX) / S, y: -(mm.y - this.L.originY) / S }; } // screen -> drawn-world
  _effBounds(e) {
    const b = DEFS[e.type].bounds(e); const f = this.L.scales[e.id] || 1; const off = this.L.overrides[e.id] || { x: 0, y: 0 }; const pv = pivotOf(e);
    const tf = (x, y) => ({ x: pv.x + (x - pv.x) * f + off.x, y: pv.y + (y - pv.y) * f + off.y });
    const p1 = tf(b.minX, b.minY), p2 = tf(b.maxX, b.maxY);
    return { minX: Math.min(p1.x, p2.x), maxX: Math.max(p1.x, p2.x), minY: Math.min(p1.y, p2.y), maxY: Math.max(p1.y, p2.y) };
  }
  _effCenter(e) { const b = this._effBounds(e); return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }; }
  _selBounds() {
    if (!this.sel.size) return null;
    let b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const id of this.sel) { const e = this.app.store.get(id); if (!e) continue; const eb = this._effBounds(e); b.minX = Math.min(b.minX, eb.minX); b.minY = Math.min(b.minY, eb.minY); b.maxX = Math.max(b.maxX, eb.maxX); b.maxY = Math.max(b.maxY, eb.maxY); }
    return isFinite(b.minX) ? b : null;
  }

  _pick(scr) {
    const world = this._s2w(scr);
    const baseTol = 6 / (this.L.scale * this.view.scale);
    const ents = this.app.store.entities;
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i]; const f = this.L.scales[e.id] || 1; const off = this.L.overrides[e.id] || { x: 0, y: 0 }; const pv = pivotOf(e);
      const q = { x: pv.x + (world.x - pv.x - off.x) / f, y: pv.y + (world.y - pv.y - off.y) / f }; // -> entity-local
      const tol = baseTol / f;
      const hs = DEFS[e.type].handles(e); let d = Infinity;
      for (const hnd of hs) d = Math.min(d, Math.hypot(q.x - hnd.x, q.y - hnd.y));
      for (let j = 0; j + 1 < hs.length; j++) { const a = hs[j], b = hs[j + 1]; const abx = b.x - a.x, aby = b.y - a.y; const t = Math.max(0, Math.min(1, ((q.x - a.x) * abx + (q.y - a.y) * aby) / (abx * abx + aby * aby || 1))); d = Math.min(d, Math.hypot(q.x - (a.x + abx * t), q.y - (a.y + aby * t))); }
      if (d <= tol) return e;
      const bb = DEFS[e.type].bounds(e);
      if (q.x >= bb.minX && q.x <= bb.maxX && q.y >= bb.minY && q.y <= bb.maxY) return e;
    }
    return null;
  }
  _cornerHit(scr) {
    const gb = this._selBounds(); if (!gb) return false;
    const corners = [{ x: gb.minX, y: gb.minY }, { x: gb.maxX, y: gb.minY }, { x: gb.maxX, y: gb.maxY }, { x: gb.minX, y: gb.maxY }];
    for (const p of corners) { const s = this._w2s(p); if (Math.hypot(s.x - scr.x, s.y - scr.y) <= 9) return true; }
    return false;
  }

  // ---- pointer ----
  onPointerDown(ev) {
    const scr = this._screen(ev);
    if (ev.button === 1 || ev.button === 2 || ev.spaceKey) { this.drag = { type: 'pan', last: scr }; this.app.svg.setPointerCapture(ev.pointerId); return; }
    if (this.sel.size && this._cornerHit(scr)) { this._beginScale(scr); this.app.svg.setPointerCapture(ev.pointerId); return; }
    const hit = this._pick(scr);
    if (hit) {
      if (ev.shiftKey) { this.sel.has(hit.id) ? this.sel.delete(hit.id) : this.sel.add(hit.id); }
      else if (!this.sel.has(hit.id)) { this.sel.clear(); this.sel.add(hit.id); }
      this.drag = { type: 'move', last: this._s2w(scr) };
    } else {
      if (!ev.shiftKey) this.sel.clear();
      this.drag = { type: 'marquee', start: this._s2w(scr) };
      this.marquee = { a: this.drag.start, b: this.drag.start };
    }
    this.app.svg.setPointerCapture(ev.pointerId);
    this._refreshSel(); this.app.render();
  }

  onPointerMove(ev) {
    if (!this.drag) return;
    const scr = this._screen(ev);
    if (this.drag.type === 'pan') { this.view.panX -= (scr.x - this.drag.last.x) / this.view.scale; this.view.panY -= (scr.y - this.drag.last.y) / this.view.scale; this.drag.last = scr; }
    else if (this.drag.type === 'move') { const w = this._s2w(scr); const dx = w.x - this.drag.last.x, dy = w.y - this.drag.last.y; for (const id of this.sel) { const o = this.L.overrides[id] || { x: 0, y: 0 }; o.x += dx; o.y += dy; this.L.overrides[id] = o; } this.drag.last = w; }
    else if (this.drag.type === 'marquee') { this.marquee.b = this._s2w(scr); }
    else if (this.drag.type === 'scale') { this._updateScale(scr); }
    this.app.render();
  }

  onPointerUp(ev) {
    if (this.drag && this.drag.type === 'marquee') {
      const a = this.marquee.a, b = this.marquee.b;
      const r = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
      if (Math.abs(a.x - b.x) > 0.05 || Math.abs(a.y - b.y) > 0.05) {
        for (const e of this.app.store.entities) { const c = this._effCenter(e); if (c.x >= r.minX && c.x <= r.maxX && c.y >= r.minY && c.y <= r.maxY) this.sel.add(e.id); }
      }
      this.marquee = null;
    }
    this.drag = null; try { this.app.svg.releasePointerCapture(ev.pointerId); } catch (_) {}
    this._refreshSel(); this.app.render();
  }
  onWheel(ev) { ev.preventDefault(); if (ev.shiftKey) { this.scaleGlobal(ev.deltaY < 0 ? 1.1 : 1 / 1.1); } else { this.view.zoomAt(this._screen(ev), ev.deltaY < 0 ? 1.12 : 1 / 1.12); this.app.render(); } }

  // ---- scaling ----
  _beginScale(scr) {
    const G = (() => { const b = this._selBounds(); return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }; })();
    const start = this._s2w(scr);
    const snap = {};
    for (const id of this.sel) snap[id] = { f: this.L.scales[id] || 1, off: { ...(this.L.overrides[id] || { x: 0, y: 0 }) } };
    this.drag = { type: 'scale', G, startDist: Math.max(1e-3, Math.hypot(start.x - G.x, start.y - G.y)), snap };
  }
  _updateScale(scr) {
    const w = this._s2w(scr); const { G, startDist, snap } = this.drag;
    const factor = Math.max(0.05, Math.min(50, Math.hypot(w.x - G.x, w.y - G.y) / startDist));
    this._applyGroupScale(factor, G, snap);
  }
  // Scale the selection by `factor` about center G, relative to snapshot `snap`.
  _applyGroupScale(factor, G, snap) {
    for (const id of this.sel) {
      const e = this.app.store.get(id); if (!e) continue;
      const pv = pivotOf(e); const s = snap[id];
      const effC0 = { x: pv.x + s.off.x, y: pv.y + s.off.y };
      const effCnew = { x: G.x + (effC0.x - G.x) * factor, y: G.y + (effC0.y - G.y) * factor };
      this.L.scales[id] = s.f * factor;
      this.L.overrides[id] = { x: effCnew.x - pv.x, y: effCnew.y - pv.y };
    }
  }
  // Quick relative scale of the current selection (buttons / keys).
  scaleSelection(factor) {
    const b = this._selBounds(); if (!b) return;
    const G = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const snap = {}; for (const id of this.sel) snap[id] = { f: this.L.scales[id] || 1, off: { ...(this.L.overrides[id] || { x: 0, y: 0 }) } };
    this._applyGroupScale(factor, G, snap); this.app.render();
  }
  // Global drawing scale, keeping the sheet centre fixed.
  scaleGlobal(factor) { this.setGlobalScale(this.L.scale * factor); }
  setGlobalScale(newS) {
    newS = Math.max(0.5, Math.min(2000, newS));
    const s = sheetByKey(this.cfg.sizeKey); const Pc = { x: s.w / 2, y: s.h / 2 };
    const wOld = { x: (Pc.x - this.L.originX) / this.L.scale, y: -(Pc.y - this.L.originY) / this.L.scale };
    this.L.scale = newS;
    this.L.originX = Pc.x - wOld.x * newS; this.L.originY = Pc.y + wOld.y * newS;
    const inp = document.getElementById('bp-gscale'); if (inp) inp.value = newS.toFixed(1);
    this.app.render();
  }
  setLabelScale(v) {
    this.L.labelScale = Math.max(0.05, Math.min(12, v || 1));
    const i = document.getElementById('bp-lscale'); if (i) i.value = this.L.labelScale.toFixed(2);
    this.app.render();
  }

  selectAll() { this.sel = new Set(this.app.store.entities.map((e) => e.id)); this._refreshSel(); this.app.render(); }
  deselect() { this.sel.clear(); this._refreshSel(); this.app.render(); }
  _refreshSel() { const el = document.getElementById('bp-selcount'); if (el) el.textContent = this.sel.size ? `${this.sel.size} selected` : 'none selected'; }

  onKey(ev) {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
    const mod = ev.ctrlKey || ev.metaKey;
    if (ev.key === 'Escape') { if (this.sel.size) this.deselect(); else this.exit(); }
    else if (mod && ev.key.toLowerCase() === 'a') { ev.preventDefault(); this.selectAll(); }
    else if (ev.key === '+' || ev.key === '=') { this.sel.size ? this.scaleSelection(1.1) : this.scaleGlobal(1.1); }
    else if (ev.key === '-' || ev.key === '_') { this.sel.size ? this.scaleSelection(1 / 1.1) : this.scaleGlobal(1 / 1.1); }
  }

  // ---- side panel ----
  buildPanel() {
    const f = this.cfg.fields;
    const opts = SHEETS.map((s) => `<option value="${s.key}" ${s.key === this.cfg.sizeKey ? 'selected' : ''}>${s.name}</option>`).join('');
    const field = (k, label, val) => `<label class="prop-row"><span>${label}</span><input data-f="${k}" value="${(val || '').replace(/"/g, '&quot;')}"></label>`;
    document.getElementById('blueprint-panel').innerHTML = `
      <div class="prop-head">📐 Blueprint</div>
      <label class="prop-row"><span>Sheet</span><select id="bp-size">${opts}</select></label>
      <div class="bp-row2"><button id="bp-fit">Fit drawing</button><button id="bp-reset">Reset layout</button></div>

      <div class="cat">Global scale (whole drawing)</div>
      <div class="bp-row2"><button id="bp-gminus">−</button><input id="bp-gscale" type="number" step="1" value="${this.L.scale.toFixed(1)}" title="mm per drawing unit"><button id="bp-gplus">+</button></div>

      <div class="cat">Label size (text)</div>
      <div class="bp-row2"><button id="bp-lminus">−</button><input id="bp-lscale" type="number" step="0.05" min="0.05" value="${(this.L.labelScale ?? 1).toFixed(2)}" title="scales all labels & dimension text"><button id="bp-lplus">+</button></div>

      <div class="cat">Selection scale</div>
      <div class="prop-row"><span id="bp-selcount">none selected</span></div>
      <div class="bp-row2"><button id="bp-all">Select all</button><button id="bp-none">Deselect</button></div>
      <div class="bp-row2"><button id="bp-sminus">Scale −</button><button id="bp-splus">Scale +</button></div>

      <div class="cat">Title block</div>
      ${field('title', 'Title', f.title)}${field('name', 'Drawn by', f.name)}${field('org', 'Organisation', f.org)}
      ${field('date', 'Date', f.date)}${field('dwgNo', 'Dwg no.', f.dwgNo)}${field('scale', 'Scale', f.scale)}
      ${field('rev', 'Revision', f.rev)}${field('sheet', 'Sheet', f.sheet)}

      <div class="cat">Export</div>
      <div class="bp-row2"><button id="bp-print">🖨 Print / PDF</button><button id="bp-svg">SVG</button><button id="bp-png">PNG</button></div>
      <button id="bp-exit" class="bp-exit">‹ Back to draft</button>
      <p class="prop-empty"><span>Click a part to select; drag empty paper to box-select several. Drag a selection corner (or Scale ±) to resize; drag a part to move it. Shift+wheel = global scale; wheel/Space-drag = zoom/pan.</span></p>`;
    const panel = document.getElementById('blueprint-panel');
    const $ = (id) => panel.querySelector(id);
    panel.querySelectorAll('input[data-f]').forEach((inp) => inp.addEventListener('input', () => { this.cfg.fields[inp.dataset.f] = inp.value; this.app.render(); }));
    $('#bp-size').addEventListener('change', (e) => { this.cfg.sizeKey = e.target.value; this.fitDrawing(); });
    $('#bp-fit').addEventListener('click', () => this.fitDrawing());
    $('#bp-reset').addEventListener('click', () => { this.L.overrides = {}; this.L.scales = {}; this.fitDrawing(); });
    $('#bp-gscale').addEventListener('change', (e) => this.setGlobalScale(parseFloat(e.target.value) || this.L.scale));
    $('#bp-gminus').addEventListener('click', () => this.scaleGlobal(1 / 1.1));
    $('#bp-gplus').addEventListener('click', () => this.scaleGlobal(1.1));
    $('#bp-lscale').addEventListener('change', (e) => this.setLabelScale(parseFloat(e.target.value)));
    $('#bp-lminus').addEventListener('click', () => this.setLabelScale((this.L.labelScale ?? 1) * 0.85));
    $('#bp-lplus').addEventListener('click', () => this.setLabelScale((this.L.labelScale ?? 1) / 0.85));
    $('#bp-all').addEventListener('click', () => this.selectAll());
    $('#bp-none').addEventListener('click', () => this.deselect());
    $('#bp-sminus').addEventListener('click', () => this.scaleSelection(1 / 1.1));
    $('#bp-splus').addEventListener('click', () => this.scaleSelection(1.1));
    $('#bp-exit').addEventListener('click', () => this.exit());
    $('#bp-print').addEventListener('click', () => this.print());
    $('#bp-svg').addEventListener('click', () => this.exportSVG());
    $('#bp-png').addEventListener('click', () => this.exportPNG());
    this._refreshSel();
  }

  openFormatDialog(firstTime) {
    const existing = document.getElementById('bp-format'); if (existing) existing.remove();
    const m = document.createElement('div'); m.id = 'bp-format'; m.className = 'modal-backdrop';
    const list = SHEETS.map((s) => `<div class="fmt-item${s.key === this.cfg.sizeKey ? ' sel' : ''}" data-key="${s.key}">${s.name}</div>`).join('');
    const s = sheetByKey(this.cfg.sizeKey);
    m.innerHTML = `<div class="modal fmt"><h2>Sheet Format / Size</h2>
      <div class="fmt-body"><div class="fmt-list">${list}</div>
      <div class="fmt-side"><div class="fmt-preview" id="fmt-prev"></div><div id="fmt-dims">Width: ${s.w} mm<br>Height: ${s.h} mm</div></div></div>
      <div class="modal-actions"><button id="fmt-ok">OK</button>${firstTime ? '' : '<button id="fmt-cancel">Cancel</button>'}</div></div>`;
    document.body.appendChild(m);
    let pick = this.cfg.sizeKey; const prev = m.querySelector('#fmt-prev');
    const drawPrev = (k) => { const d = sheetByKey(k); const r = d.w / d.h; const pw = r >= 1 ? 150 : 150 * r, ph = r >= 1 ? 150 / r : 150; prev.innerHTML = `<svg width="160" height="160"><rect x="${(160 - pw) / 2}" y="${(160 - ph) / 2}" width="${pw}" height="${ph}" fill="#fff" stroke="#444"/><rect x="${(160 - pw) / 2 + 6}" y="${(160 - ph) / 2 + 6}" width="${pw - 12}" height="${ph - 12}" fill="none" stroke="#aaa"/></svg>`; m.querySelector('#fmt-dims').innerHTML = `Width: ${d.w} mm<br>Height: ${d.h} mm`; };
    drawPrev(pick);
    m.querySelectorAll('.fmt-item').forEach((it) => it.addEventListener('click', () => { m.querySelectorAll('.fmt-item').forEach((x) => x.classList.remove('sel')); it.classList.add('sel'); pick = it.dataset.key; drawPrev(pick); }));
    m.querySelector('#fmt-ok').addEventListener('click', () => { this.cfg.sizeKey = pick; m.remove(); this.buildPanel(); this.fitDrawing(); });
    const cancel = m.querySelector('#fmt-cancel'); if (cancel) cancel.addEventListener('click', () => m.remove());
  }

  _exportSVGString() {
    const ev = new PaperView(); ev.scale = PX_PER_MM; ev.panX = 0; ev.panY = 0;
    const s = sheetByKey(this.cfg.sizeKey); const wpx = s.w * PX_PER_MM, hpx = s.h * PX_PER_MM;
    const body = buildSheetMarkup(ev, this.cfg, this.app.store.entities, 'expClip');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}mm" height="${s.h}mm" viewBox="0 0 ${wpx.toFixed(1)} ${hpx.toFixed(1)}">${body}</svg>`;
  }
  _download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  exportSVG() { this._download((this.cfg.fields.title || 'blueprint') + '.svg', new Blob([this._exportSVGString()], { type: 'image/svg+xml' })); }
  exportPNG() {
    const s = sheetByKey(this.cfg.sizeKey); const scale = 2; const svg = this._exportSVGString(); const img = new Image();
    img.onload = () => { const cv = document.createElement('canvas'); cv.width = s.w * PX_PER_MM * scale; cv.height = s.h * PX_PER_MM * scale; const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0); cv.toBlob((b) => this._download((this.cfg.fields.title || 'blueprint') + '.png', b)); };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }
  print() {
    const w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print.'); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>${this.cfg.fields.title || 'Blueprint'}</title><style>@page{size:auto;margin:0}body{margin:0}svg{display:block}</style></head><body>${this._exportSVGString()}<script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  }
}
