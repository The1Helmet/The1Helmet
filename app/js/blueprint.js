// Blueprint mode: lay the working draft onto a formatted paper sheet (border +
// zone marks + title block), fill in the title block, rearrange/"separate" parts
// for presentation (non-destructively, via per-part offsets), then export/print.
//
// Coordinate systems:
//   world  — the draft's units (as drawn on the canvas)
//   paper  — millimetres on the sheet (Y down)
//   screen — pixels (paper * view.scale, minus pan)
// A part's paper position = origin + (worldPt + partOffset) * scale(mm per unit),
// with Y flipped (world up -> paper down).
import { DEFS } from './entities.js';
import { Pen } from './renderer.js';

const PX_PER_MM = 3.7795; // 96 dpi — used for true-to-size export

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
    layout: { originX: 0, originY: 0, scale: 20, overrides: {} }, // mm, mm, mm/unit, {id:{x,y}}
  };
}

// ------------------------------------------------------------------ rendering
function unionBounds(entities) {
  let b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of entities) { const eb = DEFS[e.type].bounds(e); b.minX = Math.min(b.minX, eb.minX); b.minY = Math.min(b.minY, eb.minY); b.maxX = Math.max(b.maxX, eb.maxX); b.maxY = Math.max(b.maxY, eb.maxY); }
  if (!isFinite(b.minX)) b = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return b;
}

// A camera Pen can use that maps world -> screen through the paper placement.
function drawCam(view, scaleMM, origin, off) {
  return {
    scale: scaleMM * view.scale,
    toScreen(p) {
      const paper = { x: origin.x + (p.x + off.x) * scaleMM, y: origin.y - (p.y + off.y) * scaleMM };
      return view.toScreen(paper);
    },
  };
}

// Build the whole sheet (border, zones, title block, placed drawing) as SVG
// strings. Pure — used for both on-screen render and export. `view` maps paper
// mm -> output px (screen view, or an export view at PX_PER_MM with no pan).
export function buildSheetMarkup(view, cfg, entities, clipId = 'bpClip') {
  const out = [];
  const size = sheetByKey(cfg.sizeKey);
  const W = size.w, H = size.h, m = 10;             // outer margin (mm)
  const S = view.scale;                              // px per mm
  const px = (mm) => mm * S;
  const sc = (x, y) => view.toScreen({ x, y });
  const ink = '#14181f';

  const line = (x1, y1, x2, y2, wmm = 0.3, color = ink) => {
    const a = sc(x1, y1), b = sc(x2, y2);
    out.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${color}" stroke-width="${px(wmm).toFixed(2)}"/>`);
  };
  const rect = (x, y, w, h, wmm = 0.3, fill = 'none') => {
    const a = sc(x, y);
    out.push(`<rect x="${a.x.toFixed(1)}" y="${a.y.toFixed(1)}" width="${px(w).toFixed(1)}" height="${px(h).toFixed(1)}" fill="${fill}" stroke="${ink}" stroke-width="${px(wmm).toFixed(2)}"/>`);
  };
  const text = (x, y, str, hmm, o = {}) => {
    const a = sc(x, y);
    out.push(`<text x="${a.x.toFixed(1)}" y="${a.y.toFixed(1)}" font-family="${o.font || 'Arial, sans-serif'}" font-size="${px(hmm).toFixed(1)}" fill="${ink}" text-anchor="${o.anchor || 'start'}" dominant-baseline="${o.baseline || 'middle'}" font-weight="${o.weight || 'normal'}">${String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`);
  };

  // paper sheet + drop shadow
  const sh = sc(0, 0);
  out.push(`<rect x="${(sh.x + px(1.2)).toFixed(1)}" y="${(sh.y + px(1.2)).toFixed(1)}" width="${px(W).toFixed(1)}" height="${px(H).toFixed(1)}" fill="#00000022"/>`);
  rect(0, 0, W, H, 0.2, '#ffffff');

  // ---- placed drawing, clipped to the frame ----
  const fx = m, fy = m, fw = W - 2 * m, fh = H - 2 * m;
  const ca = sc(fx, fy);
  out.push(`<clipPath id="${clipId}"><rect x="${ca.x.toFixed(1)}" y="${ca.y.toFixed(1)}" width="${px(fw).toFixed(1)}" height="${px(fh).toFixed(1)}"/></clipPath>`);
  out.push(`<g clip-path="url(#${clipId})">`);
  const origin = { x: cfg.layout.originX, y: cfg.layout.originY };
  for (const e of entities) {
    const off = cfg.layout.overrides[e.id] || { x: 0, y: 0 };
    const cam = drawCam(view, cfg.layout.scale, origin, off);
    const pen = new Pen(cam);
    try { DEFS[e.type].draw(e, pen, { selected: false, scale: cam.scale }); } catch (_) {}
    out.push(pen.out());
  }
  out.push('</g>');

  // ---- frame + zone marks ----
  rect(fx, fy, fw, fh, 0.6);
  const cols = Math.max(4, Math.round(W / 50));
  const rows = Math.max(2, Math.round(H / 55));
  const cw = fw / cols, rh = fh / rows;
  for (let k = 0; k < cols; k++) {
    if (k > 0) { line(fx + k * cw, 0, fx + k * cw, m, 0.3); line(fx + k * cw, H - m, fx + k * cw, H, 0.3); }
    const lbl = String(cols - k);                 // 6..1 left -> right
    text(fx + (k + 0.5) * cw, m / 2, lbl, 3, { anchor: 'middle' });
    text(fx + (k + 0.5) * cw, H - m / 2, lbl, 3, { anchor: 'middle' });
  }
  for (let r = 0; r < rows; r++) {
    if (r > 0) { line(0, fy + r * rh, m, fy + r * rh, 0.3); line(W - m, fy + r * rh, W, fy + r * rh, 0.3); }
    const lbl = String.fromCharCode(65 + (rows - 1 - r)); // A bottom -> up
    text(m / 2, fy + (r + 0.5) * rh, lbl, 3, { anchor: 'middle' });
    text(W - m / 2, fy + (r + 0.5) * rh, lbl, 3, { anchor: 'middle' });
  }

  // ---- title block (bottom-right, inside frame) ----
  const Wb = Math.min(170, fw), Hb = 40;
  const bx = fx + fw - Wb, by = fy + fh - Hb;
  const c1 = 70, c2 = 45;                          // column widths; c3 = rest
  const r1 = 13.33, r2 = 13.33;                    // row heights; r3 = rest
  rect(bx, by, Wb, Hb, 0.6);
  const cell = (x, y, w, h, label, value, o = {}) => {
    line(x, y, x + w, y, 0.3); line(x, y, x, y + h, 0.3); // top + left grid
    if (label) text(x + 1.5, y + 2.8, label, 2.1, { baseline: 'middle' });
    if (value != null && value !== '') text(o.center ? x + w / 2 : x + 2, o.center ? y + h * 0.62 : y + h - 3, value, o.big ? 5 : 3, { anchor: o.center ? 'middle' : 'start', weight: o.big ? 'bold' : 'normal' });
  };
  const f = cfg.fields;
  const c3x = bx + c1 + c2, c3w = Wb - c1 - c2;
  // row 1
  cell(bx, by, c1, r1, 'TITLE', f.title, { big: true });
  cell(bx + c1, by, c2, r1, 'DWG NO.', f.dwgNo);
  cell(c3x, by, c3w / 2, r1, 'SIZE', size.key.replace(/[LP]$/, ''), { center: true });
  cell(c3x + c3w / 2, by, c3w / 2, r1, 'REV', f.rev, { center: true });
  // row 2
  cell(bx, by + r1, c1, r2, 'DRAWN', f.name);
  cell(bx + c1, by + r1, c2, r2, 'DATE', f.date);
  cell(c3x, by + r1, c3w / 2, r2, 'SCALE', f.scale, { center: true });
  cell(c3x + c3w / 2, by + r1, c3w / 2, r2, 'SHEET', f.sheet, { center: true });
  // row 3
  const r3 = Hb - r1 - r2;
  cell(bx, by + r1 + r2, c1 + c2, r3, 'ORGANISATION', f.org);
  cell(c3x, by + r1 + r2, c3w, r3, '', 'DO NOT SCALE DRAWING', { center: true });

  return out.join('');
}

// --------------------------------------------------------------- paper view
class PaperView {
  constructor() { this.scale = 3; this.panX = 0; this.panY = 0; } // px/mm, pan in mm
  toScreen(mm) { return { x: (mm.x - this.panX) * this.scale, y: (mm.y - this.panY) * this.scale }; }
  toMm(s) { return { x: s.x / this.scale + this.panX, y: s.y / this.scale + this.panY }; }
  zoomAt(s, f) { const b = this.toMm(s); this.scale = Math.max(0.5, Math.min(40, this.scale * f)); const a = this.toMm(s); this.panX += b.x - a.x; this.panY += b.y - a.y; }
  fit(W, H, vw, vh) {
    this.scale = Math.max(0.5, Math.min(40, Math.min((vw - 60) / W, (vh - 60) / H)));
    this.panX = W / 2 - vw / 2 / this.scale;
    this.panY = H / 2 - vh / 2 / this.scale;
  }
}

// --------------------------------------------------------------- controller
export class Blueprint {
  constructor(app) {
    this.app = app;
    this.view = new PaperView();
    this.drag = null;
  }

  get cfg() { return this.app.store.sheet; }

  enter() {
    if (!this.app.store.sheet) this.app.store.sheet = defaultSheet();
    this.app.mode = 'blueprint';
    document.getElementById('palette').style.display = 'none';
    document.getElementById('properties').style.display = 'none';
    const panel = document.getElementById('blueprint-panel');
    panel.style.display = 'block';
    document.getElementById('toolbar').classList.add('bp-on');
    // first time on this document: pick a format
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

  fitView() {
    const r = this.app.svg.getBoundingClientRect();
    const s = sheetByKey(this.cfg.sizeKey);
    this.view.fit(s.w, s.h, r.width, r.height);
  }

  // Center the drawing on the sheet and pick a scale that fits the frame.
  fitDrawing() {
    const ents = this.app.store.entities;
    const s = sheetByKey(this.cfg.sizeKey);
    const m = 10, fw = s.w - 2 * m, fh = s.h - 2 * m;
    const b = unionBounds(ents);
    const bw = Math.max(0.5, b.maxX - b.minX), bh = Math.max(0.5, b.maxY - b.minY);
    const scaleMM = Math.max(1, Math.min(fw * 0.82 / bw, fh * 0.82 / bh));
    this.cfg.layout.scale = scaleMM;
    this.cfg.layout.overrides = {};
    const wc = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const pc = { x: m + fw / 2, y: m + fh / 2 };
    this.cfg.layout.originX = pc.x - wc.x * scaleMM;
    this.cfg.layout.originY = pc.y + wc.y * scaleMM;
    this.fitView();
    this.app.render();
  }

  render() {
    const r = this.app.svg.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.app.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.app.svg.style.cursor = this.drag && this.drag.type === 'part' ? 'grabbing' : 'default';
    const out = [`<rect x="0" y="0" width="${w}" height="${h}" fill="#c9ced6"/>`];
    out.push(buildSheetMarkup(this.view, this.cfg, this.app.store.entities));
    // highlight a moved part's hit area lightly (optional) — keep minimal
    this.app.svg.innerHTML = out.join('');
  }

  // ---- interaction ----
  _screen(ev) { const r = this.app.svg.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  _world(scr) {
    const mm = this.view.toMm(scr);
    const S = this.cfg.layout.scale;
    return { x: (mm.x - this.cfg.layout.originX) / S, y: -(mm.y - this.cfg.layout.originY) / S };
  }

  _pick(scr) {
    const world = this._world(scr);
    const tol = 6 / (this.cfg.layout.scale * this.view.scale);
    const ents = this.app.store.entities;
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i]; const off = this.cfg.layout.overrides[e.id] || { x: 0, y: 0 };
      const q = { x: world.x - off.x, y: world.y - off.y };
      const hs = DEFS[e.type].handles(e); let d = Infinity;
      for (const hnd of hs) d = Math.min(d, Math.hypot(q.x - hnd.x, q.y - hnd.y));
      for (let j = 0; j + 1 < hs.length; j++) {
        const a = hs[j], b = hs[j + 1]; const abx = b.x - a.x, aby = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((q.x - a.x) * abx + (q.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
        d = Math.min(d, Math.hypot(q.x - (a.x + abx * t), q.y - (a.y + aby * t)));
      }
      if (d <= tol) return e;
      const bb = DEFS[e.type].bounds(e);
      if (q.x >= bb.minX && q.x <= bb.maxX && q.y >= bb.minY && q.y <= bb.maxY) return e;
    }
    return null;
  }

  onPointerDown(ev) {
    const scr = this._screen(ev);
    if (ev.button === 1 || ev.button === 2 || ev.spaceKey) { this.drag = { type: 'pan', last: scr }; this.app.svg.setPointerCapture(ev.pointerId); return; }
    const hit = this._pick(scr);
    if (hit) this.drag = { type: 'part', id: hit.id, last: scr };
    else this.drag = { type: 'origin', last: scr };       // empty drag moves the whole drawing
    this.app.svg.setPointerCapture(ev.pointerId);
  }

  onPointerMove(ev) {
    if (!this.drag) return;
    const scr = this._screen(ev);
    const dxPx = scr.x - this.drag.last.x, dyPx = scr.y - this.drag.last.y;
    if (this.drag.type === 'pan') { this.view.panX -= dxPx / this.view.scale; this.view.panY -= dyPx / this.view.scale; }
    else if (this.drag.type === 'origin') { this.cfg.layout.originX += dxPx / this.view.scale; this.cfg.layout.originY += dyPx / this.view.scale; }
    else if (this.drag.type === 'part') {
      const S = this.cfg.layout.scale * this.view.scale;
      const o = this.cfg.layout.overrides[this.drag.id] || { x: 0, y: 0 };
      o.x += dxPx / S; o.y -= dyPx / S;                    // world units (Y flip)
      this.cfg.layout.overrides[this.drag.id] = o;
    }
    this.drag.last = scr; this.app.render();
  }

  onPointerUp(ev) { this.drag = null; try { this.app.svg.releasePointerCapture(ev.pointerId); } catch (_) {} }
  onWheel(ev) { ev.preventDefault(); this.view.zoomAt(this._screen(ev), ev.deltaY < 0 ? 1.12 : 1 / 1.12); this.app.render(); }

  // ---- side panel ----
  buildPanel() {
    const f = this.cfg.fields;
    const opts = SHEETS.map((s) => `<option value="${s.key}" ${s.key === this.cfg.sizeKey ? 'selected' : ''}>${s.name}</option>`).join('');
    const field = (k, label, val) => `<label class="prop-row"><span>${label}</span><input data-f="${k}" value="${(val || '').replace(/"/g, '&quot;')}"></label>`;
    document.getElementById('blueprint-panel').innerHTML = `
      <div class="prop-head">📐 Blueprint</div>
      <label class="prop-row"><span>Sheet</span><select id="bp-size">${opts}</select></label>
      <div class="bp-row2">
        <button id="bp-fit">Fit drawing</button>
        <button id="bp-reset">Reset layout</button>
      </div>
      <div class="cat">Title block</div>
      ${field('title', 'Title', f.title)}
      ${field('name', 'Drawn by', f.name)}
      ${field('org', 'Organisation', f.org)}
      ${field('date', 'Date', f.date)}
      ${field('dwgNo', 'Dwg no.', f.dwgNo)}
      ${field('scale', 'Scale', f.scale)}
      ${field('rev', 'Revision', f.rev)}
      ${field('sheet', 'Sheet', f.sheet)}
      <div class="cat">Export</div>
      <div class="bp-row2"><button id="bp-print">🖨 Print / PDF</button><button id="bp-svg">SVG</button><button id="bp-png">PNG</button></div>
      <button id="bp-exit" class="bp-exit">‹ Back to draft</button>
      <p class="prop-empty"><span>Drag a part to separate it; drag empty paper to move the whole drawing. Middle-drag or Space-drag to pan, wheel to zoom.</span></p>`;
    const panel = document.getElementById('blueprint-panel');
    panel.querySelectorAll('input[data-f]').forEach((inp) => inp.addEventListener('input', () => { this.cfg.fields[inp.dataset.f] = inp.value; this.app.render(); }));
    panel.querySelector('#bp-size').addEventListener('change', (e) => { this.cfg.sizeKey = e.target.value; this.fitDrawing(); });
    panel.querySelector('#bp-fit').addEventListener('click', () => this.fitDrawing());
    panel.querySelector('#bp-reset').addEventListener('click', () => { this.cfg.layout.overrides = {}; this.fitDrawing(); });
    panel.querySelector('#bp-exit').addEventListener('click', () => this.exit());
    panel.querySelector('#bp-print').addEventListener('click', () => this.print());
    panel.querySelector('#bp-svg').addEventListener('click', () => this.exportSVG());
    panel.querySelector('#bp-png').addEventListener('click', () => this.exportPNG());
  }

  // ---- format dialog ----
  openFormatDialog(firstTime) {
    const existing = document.getElementById('bp-format'); if (existing) existing.remove();
    const m = document.createElement('div'); m.id = 'bp-format'; m.className = 'modal-backdrop';
    const list = SHEETS.map((s) => `<div class="fmt-item${s.key === this.cfg.sizeKey ? ' sel' : ''}" data-key="${s.key}">${s.name}</div>`).join('');
    const s = sheetByKey(this.cfg.sizeKey);
    m.innerHTML = `<div class="modal fmt">
      <h2>Sheet Format / Size</h2>
      <div class="fmt-body"><div class="fmt-list">${list}</div>
      <div class="fmt-side"><div class="fmt-preview" id="fmt-prev"></div>
      <div id="fmt-dims">Width: ${s.w} mm<br>Height: ${s.h} mm</div></div></div>
      <div class="modal-actions"><button id="fmt-ok">OK</button>${firstTime ? '' : '<button id="fmt-cancel">Cancel</button>'}</div></div>`;
    document.body.appendChild(m);
    let pick = this.cfg.sizeKey;
    const prev = m.querySelector('#fmt-prev');
    const drawPrev = (k) => { const d = sheetByKey(k); const r = d.w / d.h; const pw = r >= 1 ? 150 : 150 * r, ph = r >= 1 ? 150 / r : 150; prev.innerHTML = `<svg width="160" height="160"><rect x="${(160 - pw) / 2}" y="${(160 - ph) / 2}" width="${pw}" height="${ph}" fill="#fff" stroke="#444"/><rect x="${(160 - pw) / 2 + 6}" y="${(160 - ph) / 2 + 6}" width="${pw - 12}" height="${ph - 12}" fill="none" stroke="#aaa"/></svg>`; m.querySelector('#fmt-dims').innerHTML = `Width: ${d.w} mm<br>Height: ${d.h} mm`; };
    drawPrev(pick);
    m.querySelectorAll('.fmt-item').forEach((it) => it.addEventListener('click', () => { m.querySelectorAll('.fmt-item').forEach((x) => x.classList.remove('sel')); it.classList.add('sel'); pick = it.dataset.key; drawPrev(pick); }));
    m.querySelector('#fmt-ok').addEventListener('click', () => { this.cfg.sizeKey = pick; m.remove(); this.buildPanel(); this.fitDrawing(); });
    const cancel = m.querySelector('#fmt-cancel'); if (cancel) cancel.addEventListener('click', () => m.remove());
  }

  // ---- export ----
  _exportSVGString() {
    const ev = new PaperView(); ev.scale = PX_PER_MM; ev.panX = 0; ev.panY = 0;
    const s = sheetByKey(this.cfg.sizeKey);
    const wpx = s.w * PX_PER_MM, hpx = s.h * PX_PER_MM;
    const body = buildSheetMarkup(ev, this.cfg, this.app.store.entities, 'expClip');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}mm" height="${s.h}mm" viewBox="0 0 ${wpx.toFixed(1)} ${hpx.toFixed(1)}">${body}</svg>`;
  }
  _download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  exportSVG() { this._download((this.cfg.fields.title || 'blueprint') + '.svg', new Blob([this._exportSVGString()], { type: 'image/svg+xml' })); }
  exportPNG() {
    const s = sheetByKey(this.cfg.sizeKey); const scale = 2;
    const svg = this._exportSVGString();
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = s.w * PX_PER_MM * scale; cv.height = s.h * PX_PER_MM * scale;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      cv.toBlob((b) => this._download((this.cfg.fields.title || 'blueprint') + '.png', b));
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }
  print() {
    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups to print.'); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>${this.cfg.fields.title || 'Blueprint'}</title><style>@page{size:auto;margin:0}body{margin:0}svg{display:block}</style></head><body>${this._exportSVGString()}<script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  }
}
