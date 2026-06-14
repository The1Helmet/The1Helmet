// Parametric entity definitions. Each entity is a plain data object {type, ...params};
// its behaviour (defaults, editable fields, handles, drawing) lives in a DEFS entry.
// All params are world-space; angles are stored in DEGREES for friendlier editing.
import { V, deg, rad, fmt, normAngle, uid } from './geometry.js';
import { INK, DIM_COLOR, VEC_COLOR } from './renderer.js';

// ---- small helpers ----------------------------------------------------------
const P = (e, kx, ky) => ({ x: e[kx], y: e[ky] });
const setP = (e, kx, ky, p) => { e[kx] = p.x; e[ky] = p.y; };

function boundsOf(points, pad = 0) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

// Draw a curved arrow (used by moment / omega). dir: +1 = CCW, -1 = CW.
function arcArrow(pen, c, r, startDeg, sweepDeg, dir, color, w) {
  const a0 = rad(startDeg);
  const a1 = a0 + rad(sweepDeg) * dir;
  pen.arc(c, r, a0, a1, { stroke: color, w });
  const tip = V.add(c, V.fromAngle(a1, r));
  const tan = a1 + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  pen.arrow(tip, tan, { sizePx: 11, fill: color });
}

// Generic factory: fills in handles/anchors/translate/bounds from a `pts` list
// of [xKey,yKey] coordinate pairs unless the spec overrides them.
function def(spec) {
  const pts = spec.pts || [];
  const d = { snap: true, ...spec };
  if (!d.handles) d.handles = (e) => pts.map(([kx, ky], i) => ({ key: `p${i}`, x: e[kx], y: e[ky] }));
  if (!d.applyHandle) d.applyHandle = (e, key, w) => {
    const i = Number(key.slice(1)); if (pts[i]) setP(e, pts[i][0], pts[i][1], w);
  };
  if (!d.anchors) d.anchors = (e) => pts.map(([kx, ky]) => ({ x: e[kx], y: e[ky] }));
  if (!d.translate) d.translate = (e, dd) => pts.forEach(([kx, ky]) => { e[kx] += dd.x; e[ky] += dd.y; });
  if (!d.bounds) d.bounds = (e) => boundsOf(pts.map(([kx, ky]) => ({ x: e[kx], y: e[ky] })), 0.3);
  return d;
}

export const DEFS = {
  // ======================= STRUCTURE =======================
  node: def({
    name: 'Pin joint', category: 'Structure', pts: [['x', 'y']],
    defaults: (at) => ({ x: at.x, y: at.y, r: 5, label: '' }),
    params: [
      { key: 'r', label: 'Radius (px)', type: 'number', min: 2, max: 40, step: 1 },
      { key: 'label', label: 'Label', type: 'text' },
    ],
    draw: (e, pen) => {
      pen.circlePx({ x: e.x, y: e.y }, e.r, { stroke: INK, w: 1.8, fill: '#fff' });
      if (e.label) pen.text(V.add(P(e, 'x', 'y'), { x: 0.18, y: 0.18 }), e.label, { sizePx: 15, anchor: 'start', italic: true });
    },
  }),

  link: def({
    name: 'Link / bar', category: 'Structure', pts: [['x1', 'y1'], ['x2', 'y2']],
    defaults: (at) => ({ x1: at.x, y1: at.y, x2: at.x + 2, y2: at.y, w: 5, label: '' }),
    params: [
      { key: 'w', label: 'Thickness (px)', type: 'number', min: 1, max: 24, step: 1 },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'length', label: 'Length', type: 'readonly' },
      { key: 'angle', label: 'Angle°', type: 'readonly' },
    ],
    compute: (e) => ({
      length: fmt(V.dist(P(e, 'x1', 'y1'), P(e, 'x2', 'y2')), 3),
      angle: fmt(deg(V.angle(V.sub(P(e, 'x2', 'y2'), P(e, 'x1', 'y1')))), 1),
    }),
    anchors: (e) => [P(e, 'x1', 'y1'), P(e, 'x2', 'y2'), V.mid(P(e, 'x1', 'y1'), P(e, 'x2', 'y2'))],
    draw: (e, pen) => {
      const a = P(e, 'x1', 'y1'), b = P(e, 'x2', 'y2');
      pen.line(a, b, { stroke: INK, w: e.w, cap: 'round' });
      if (e.label) pen.text(V.add(V.mid(a, b), { x: 0, y: 0.25 }), e.label, { sizePx: 15, italic: true });
    },
  }),

  // ======================= SUPPORTS =======================
  fixedWall: def({
    name: 'Fixed wall (ground)', category: 'Supports', pts: [['x1', 'y1'], ['x2', 'y2']],
    defaults: (at) => ({ x1: at.x - 1, y1: at.y, x2: at.x + 1, y2: at.y, side: 1 }),
    params: [{ key: 'side', label: 'Hatch side', type: 'select', options: [{ v: 1, t: 'Left/Up' }, { v: -1, t: 'Right/Down' }] }],
    draw: (e, pen) => pen.hatch(P(e, 'x1', 'y1'), P(e, 'x2', 'y2'), { side: Number(e.side), w: 1.6 }),
  }),

  pinSupport: def({
    name: 'Pin support (hinge)', category: 'Supports', pts: [['x', 'y']],
    defaults: (at) => ({ x: at.x, y: at.y, angle: 270, size: 0.7 }),
    params: [
      { key: 'angle', label: 'Direction°', type: 'number', step: 5 },
      { key: 'size', label: 'Size', type: 'number', min: 0.1, step: 0.1 },
    ],
    bounds: (e) => boundsOf([P(e, 'x', 'y')], e.size * 1.4),
    draw: (e, pen) => drawTriSupport(e, pen, false),
  }),

  rollerSupport: def({
    name: 'Roller support', category: 'Supports', pts: [['x', 'y']],
    defaults: (at) => ({ x: at.x, y: at.y, angle: 270, size: 0.7 }),
    params: [
      { key: 'angle', label: 'Direction°', type: 'number', step: 5 },
      { key: 'size', label: 'Size', type: 'number', min: 0.1, step: 0.1 },
    ],
    bounds: (e) => boundsOf([P(e, 'x', 'y')], e.size * 1.7),
    draw: (e, pen) => drawTriSupport(e, pen, true),
  }),

  sliderSlot: def({
    name: 'Slider in slot', category: 'Supports', pts: [['x', 'y']],
    defaults: (at) => ({ x: at.x, y: at.y, angle: 0, blockW: 0.7, gap: 0.5, guideLen: 2.4, hatch: true }),
    params: [
      { key: 'angle', label: 'Slot°', type: 'number', step: 5 },
      { key: 'blockW', label: 'Block width', type: 'number', min: 0.1, step: 0.1 },
      { key: 'gap', label: 'Slot gap', type: 'number', min: 0.1, step: 0.1 },
      { key: 'guideLen', label: 'Rail length', type: 'number', min: 0.2, step: 0.2 },
      { key: 'hatch', label: 'Ground hatch', type: 'bool' },
    ],
    bounds: (e) => boundsOf([P(e, 'x', 'y')], Math.max(e.guideLen, e.blockW, e.gap)),
    draw: (e, pen) => {
      const c = P(e, 'x', 'y');
      const u = V.fromAngle(rad(e.angle));
      const nrm = V.perp(u);
      const hh = e.gap / 2, hw = e.blockW / 2;
      const half = V.scale(u, e.guideLen / 2);
      // two parallel rails forming the slot, hatched outward
      const top = V.add(c, V.scale(nrm, hh)), bot = V.add(c, V.scale(nrm, -hh));
      const tA = V.sub(top, half), tB = V.add(top, half);
      const bA = V.sub(bot, half), bB = V.add(bot, half);
      if (e.hatch) { pen.hatch(tA, tB, { side: 1, w: 1.6 }); pen.hatch(bA, bB, { side: -1, w: 1.6 }); }
      else { pen.line(tA, tB, { w: 1.6 }); pen.line(bA, bB, { w: 1.6 }); }
      // slider block running between the rails, pin centred (connects to the beam)
      const hv = V.scale(nrm, hh * 0.82);
      const hu = V.scale(u, hw);
      const corner = (su, sv) => V.add(c, V.add(V.scale(hu, su), V.scale(hv, sv)));
      pen.poly([corner(1, 1), corner(-1, 1), corner(-1, -1), corner(1, -1)], { close: true, w: 1.6, fill: '#fff' });
      pen.circlePx(c, 5.5, { stroke: INK, w: 1.6, fill: '#fff' });
    },
  }),

  piston: def({
    name: 'Piston / cylinder', category: 'Structure', pts: [['x', 'y']],
    defaults: (at) => ({ x: at.x, y: at.y, angle: 0, bore: 0.8, cylLen: 1.8, rodLen: 1.2, headT: 0.28, wall: 0.12 }),
    params: [
      { key: 'angle', label: 'Direction°', type: 'number', step: 5 },
      { key: 'bore', label: 'Bore', type: 'number', min: 0.1, step: 0.05 },
      { key: 'cylLen', label: 'Cylinder length', type: 'number', min: 0.2, step: 0.1 },
      { key: 'rodLen', label: 'Rod length', type: 'number', min: 0.1, step: 0.1 },
      { key: 'headT', label: 'Head thickness', type: 'number', min: 0.05, step: 0.02 },
      { key: 'wall', label: 'Wall', type: 'number', min: 0.02, step: 0.02 },
    ],
    bounds: (e) => boundsOf([P(e, 'x', 'y')], e.cylLen + e.rodLen),
    draw: (e, pen) => {
      const pin = P(e, 'x', 'y');
      const u = V.fromAngle(rad(e.angle)); const n = V.perp(u);
      const half = e.bore / 2, outer = half + e.wall;
      const A = V.add(pin, V.scale(u, -e.rodLen));          // front face of head
      const headBack = V.add(A, V.scale(u, -e.headT));
      const cylBack = V.add(A, V.scale(u, -e.cylLen));
      // cylinder: top + bottom rails only (closed back/cap omitted), open at both ends
      pen.line(V.add(A, V.scale(n, outer)), V.add(cylBack, V.scale(n, outer)), { w: 1.8 });
      pen.line(V.add(A, V.scale(n, -outer)), V.add(cylBack, V.scale(n, -outer)), { w: 1.8 });
      // piston head
      pen.poly([
        V.add(A, V.scale(n, half)), V.add(headBack, V.scale(n, half)),
        V.add(headBack, V.scale(n, -half)), V.add(A, V.scale(n, -half)),
      ], { close: true, w: 1.6, fill: '#eef1f5' });
      // rod + pin
      pen.line(V.add(A, V.scale(u, -e.headT / 2)), pin, { w: 4, cap: 'round' });
      pen.circlePx(pin, 5.5, { stroke: INK, w: 1.6, fill: '#fff' });
    },
  }),

  // ======================= LOADS =======================
  force: def({
    name: 'Force (point load)', category: 'Loads', pts: [['x', 'y']],
    defaults: (at) => ({ x: at.x, y: at.y, angle: 90, length: 1.3, label: 'F', color: INK }),
    params: [
      { key: 'angle', label: 'Direction°', type: 'number', step: 5 },
      { key: 'length', label: 'Arrow length', type: 'number', min: 0.2, step: 0.1 },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'color', label: 'Color', type: 'color' },
    ],
    handles: (e) => [
      { key: 'p0', x: e.x, y: e.y },
      { key: 'tail', x: e.x - Math.cos(rad(e.angle)) * e.length, y: e.y - Math.sin(rad(e.angle)) * e.length },
    ],
    applyHandle: (e, key, w) => {
      if (key === 'p0') { e.x = w.x; e.y = w.y; }
      else { const d = V.sub(P(e, 'x', 'y'), w); e.length = Math.max(0.1, V.len(d)); e.angle = deg(V.angle(d)); }
    },
    bounds: (e) => boundsOf([P(e, 'x', 'y'), { x: e.x - Math.cos(rad(e.angle)) * e.length, y: e.y - Math.sin(rad(e.angle)) * e.length }], 0.3),
    draw: (e, pen) => {
      const tip = P(e, 'x', 'y');
      const tail = V.add(tip, V.fromAngle(rad(e.angle), -e.length));
      pen.line(tail, tip, { stroke: e.color, w: 2.2 });
      pen.arrow(tip, rad(e.angle), { sizePx: 12, fill: e.color });
      if (e.label) pen.text(V.add(tail, V.fromAngle(rad(e.angle), -0.25)), e.label, { sizePx: 16, color: e.color, weight: 'bold', bg: '#ffffffcc' });
    },
  }),

  distributed: def({
    name: 'Distributed load', category: 'Loads', pts: [['x1', 'y1'], ['x2', 'y2']],
    defaults: (at) => ({ x1: at.x, y1: at.y, x2: at.x + 3, y2: at.y, shape: 'uniform', peak: 1.0, side: 1, count: 6, label: 'q', color: INK }),
    params: [
      { key: 'shape', label: 'Shape', type: 'select', options: [{ v: 'uniform', t: 'Uniform' }, { v: 'triangular', t: 'Triangular ▶' }, { v: 'triangular2', t: 'Triangular ◀' }] },
      { key: 'peak', label: 'Height', type: 'number', min: 0.1, step: 0.1 },
      { key: 'count', label: 'Arrows', type: 'number', min: 2, max: 40, step: 1 },
      { key: 'side', label: 'Side', type: 'select', options: [{ v: 1, t: 'Left/Up' }, { v: -1, t: 'Right/Down' }] },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'color', label: 'Color', type: 'color' },
    ],
    anchors: (e) => [P(e, 'x1', 'y1'), P(e, 'x2', 'y2'), V.mid(P(e, 'x1', 'y1'), P(e, 'x2', 'y2'))],
    bounds: (e) => boundsOf([P(e, 'x1', 'y1'), P(e, 'x2', 'y2')], e.peak + 0.3),
    draw: (e, pen) => {
      const a = P(e, 'x1', 'y1'), b = P(e, 'x2', 'y2');
      const dir = V.sub(b, a); const L = V.len(dir) || 1; const u = V.scale(dir, 1 / L);
      const n = V.scale(V.perp(u), Number(e.side));
      const prof = (t) => e.shape === 'uniform' ? e.peak : e.shape === 'triangular' ? e.peak * t : e.peak * (1 - t);
      const topPts = [];
      const N = Math.max(2, Math.round(e.count));
      for (let i = 0; i <= N; i++) {
        const t = i / N; const base = V.add(a, V.scale(u, L * t)); const h = prof(t);
        const top = V.add(base, V.scale(n, h));
        topPts.push(top);
        if (h > 1e-3) { pen.line(top, base, { stroke: e.color, w: 1.4 }); pen.arrow(base, V.angle(V.scale(n, -1)), { sizePx: 8, fill: e.color }); }
      }
      pen.poly(topPts, { stroke: e.color, w: 1.6 });
      if (e.label) pen.text(V.add(V.mid(a, b), V.scale(n, e.peak + 0.25)), e.label, { sizePx: 15, color: e.color, italic: true, bg: '#ffffffcc' });
    },
  }),

  moment: def({
    name: 'Moment', category: 'Loads', pts: [['x', 'y']],
    defaults: (at) => ({ x: at.x, y: at.y, r: 0.5, dir: 1, start: 60, sweep: 270, label: 'M', color: INK }),
    params: [
      { key: 'r', label: 'Radius', type: 'number', min: 0.1, step: 0.05 },
      { key: 'dir', label: 'Direction', type: 'select', options: [{ v: 1, t: 'CCW ↺' }, { v: -1, t: 'CW ↻' }] },
      { key: 'start', label: 'Start°', type: 'number', step: 5 },
      { key: 'sweep', label: 'Sweep°', type: 'number', min: 10, max: 350, step: 5 },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'color', label: 'Color', type: 'color' },
    ],
    bounds: (e) => boundsOf([P(e, 'x', 'y')], e.r + 0.3),
    draw: (e, pen) => {
      arcArrow(pen, P(e, 'x', 'y'), e.r, e.start, e.sweep, Number(e.dir), e.color, 2);
      if (e.label) pen.text(V.add(P(e, 'x', 'y'), { x: e.r + 0.25, y: 0 }), e.label, { sizePx: 15, color: e.color, anchor: 'start', italic: true });
    },
  }),

  // ======================= VECTORS =======================
  vector: def({
    name: 'Vector (v / a)', category: 'Vectors', pts: [['x', 'y']],
    defaults: (at) => ({ x: at.x, y: at.y, angle: 0, length: 1.2, label: 'v', color: VEC_COLOR }),
    params: [
      { key: 'angle', label: 'Direction°', type: 'number', step: 5 },
      { key: 'length', label: 'Length', type: 'number', min: 0.1, step: 0.1 },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'color', label: 'Color', type: 'color' },
    ],
    handles: (e) => [
      { key: 'p0', x: e.x, y: e.y },
      { key: 'tip', x: e.x + Math.cos(rad(e.angle)) * e.length, y: e.y + Math.sin(rad(e.angle)) * e.length },
    ],
    applyHandle: (e, key, w) => {
      if (key === 'p0') { e.x = w.x; e.y = w.y; }
      else { const d = V.sub(w, P(e, 'x', 'y')); e.length = Math.max(0.1, V.len(d)); e.angle = deg(V.angle(d)); }
    },
    bounds: (e) => boundsOf([P(e, 'x', 'y'), { x: e.x + Math.cos(rad(e.angle)) * e.length, y: e.y + Math.sin(rad(e.angle)) * e.length }], 0.3),
    draw: (e, pen) => {
      const tail = P(e, 'x', 'y'); const tip = V.add(tail, V.fromAngle(rad(e.angle), e.length));
      pen.line(tail, tip, { stroke: e.color, w: 2.2 });
      pen.arrow(tip, rad(e.angle), { sizePx: 11, fill: e.color });
      if (e.label) pen.text(V.add(tip, V.fromAngle(rad(e.angle), 0.22)), e.label, { sizePx: 15, color: e.color, italic: true, weight: 'bold', bg: '#ffffffcc' });
    },
  }),

  omega: def({
    name: 'Angular velocity ω', category: 'Vectors', pts: [['x', 'y']],
    defaults: (at) => ({ x: at.x, y: at.y, r: 0.45, dir: 1, start: 120, sweep: 220, label: 'ω', color: INK }),
    params: [
      { key: 'r', label: 'Radius', type: 'number', min: 0.1, step: 0.05 },
      { key: 'dir', label: 'Direction', type: 'select', options: [{ v: 1, t: 'CCW ↺' }, { v: -1, t: 'CW ↻' }] },
      { key: 'start', label: 'Start°', type: 'number', step: 5 },
      { key: 'sweep', label: 'Sweep°', type: 'number', min: 10, max: 350, step: 5 },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'color', label: 'Color', type: 'color' },
    ],
    bounds: (e) => boundsOf([P(e, 'x', 'y')], e.r + 0.3),
    draw: (e, pen) => {
      arcArrow(pen, P(e, 'x', 'y'), e.r, e.start, e.sweep, Number(e.dir), e.color, 2);
      if (e.label) pen.text(V.add(P(e, 'x', 'y'), { x: 0, y: 0 }), e.label, { sizePx: 16, color: e.color, italic: true });
    },
  }),

  axes: def({
    name: 'Coordinate axes', category: 'Vectors', pts: [['x', 'y']],
    defaults: (at) => ({ x: at.x, y: at.y, length: 1.6, labelX: 'x', labelY: 'y' }),
    params: [
      { key: 'length', label: 'Length', type: 'number', min: 0.3, step: 0.1 },
      { key: 'labelX', label: 'X label', type: 'text' },
      { key: 'labelY', label: 'Y label', type: 'text' },
    ],
    bounds: (e) => boundsOf([P(e, 'x', 'y'), { x: e.x + e.length, y: e.y + e.length }], 0.3),
    draw: (e, pen) => {
      const o = P(e, 'x', 'y');
      const xt = V.add(o, { x: e.length, y: 0 }), yt = V.add(o, { x: 0, y: e.length });
      pen.line(o, xt, { w: 1.6 }); pen.arrow(xt, 0, { sizePx: 10 });
      pen.line(o, yt, { w: 1.6 }); pen.arrow(yt, Math.PI / 2, { sizePx: 10 });
      pen.text(V.add(xt, { x: 0.2, y: 0 }), e.labelX, { sizePx: 15, italic: true });
      pen.text(V.add(yt, { x: 0, y: 0.22 }), e.labelY, { sizePx: 15, italic: true });
    },
  }),

  // ======================= DIMENSIONS =======================
  dimLinear: def({
    name: 'Linear dimension', category: 'Dimensions', snap: false, pts: [['x1', 'y1'], ['x2', 'y2']],
    defaults: (at) => ({ x1: at.x, y1: at.y, x2: at.x + 2, y2: at.y, offset: 0.8, text: '', unit: '', decimals: 2 }),
    params: [
      { key: 'offset', label: 'Offset', type: 'number', step: 0.1 },
      { key: 'unit', label: 'Unit', type: 'text' },
      { key: 'decimals', label: 'Decimals', type: 'number', min: 0, max: 4, step: 1 },
      { key: 'text', label: 'Override text', type: 'text' },
    ],
    handles: (e) => {
      const a = P(e, 'x1', 'y1'), b = P(e, 'x2', 'y2');
      const n = V.scale(V.perp(V.norm(V.sub(b, a))), e.offset);
      const m = V.add(V.mid(a, b), n);
      return [{ key: 'p0', x: a.x, y: a.y }, { key: 'p1', x: b.x, y: b.y }, { key: 'off', x: m.x, y: m.y }];
    },
    applyHandle: (e, key, w) => {
      if (key === 'p0') setP(e, 'x1', 'y1', w);
      else if (key === 'p1') setP(e, 'x2', 'y2', w);
      else {
        const a = P(e, 'x1', 'y1'), b = P(e, 'x2', 'y2');
        const n = V.perp(V.norm(V.sub(b, a)));
        e.offset = V.dot(V.sub(w, V.mid(a, b)), n);
      }
    },
    bounds: (e) => {
      const a = P(e, 'x1', 'y1'), b = P(e, 'x2', 'y2');
      const n = V.scale(V.perp(V.norm(V.sub(b, a))), e.offset);
      return boundsOf([a, b, V.add(a, n), V.add(b, n)], 0.3);
    },
    draw: (e, pen) => {
      const a = P(e, 'x1', 'y1'), b = P(e, 'x2', 'y2');
      const u = V.norm(V.sub(b, a)); const n = V.perp(u);
      const off = V.scale(n, e.offset);
      const da = V.add(a, off), db = V.add(b, off);
      const ext = V.scale(n, Math.sign(e.offset || 1) * 0.12);
      // extension lines
      pen.line(V.add(a, V.scale(n, e.offset * 0.06)), V.add(da, ext), { stroke: DIM_COLOR, w: 1 });
      pen.line(V.add(b, V.scale(n, e.offset * 0.06)), V.add(db, ext), { stroke: DIM_COLOR, w: 1 });
      // dimension line + arrows pointing outward to the witness points
      pen.line(da, db, { stroke: DIM_COLOR, w: 1.2 });
      pen.arrow(da, V.angle(V.scale(u, -1)), { sizePx: 9, fill: DIM_COLOR });
      pen.arrow(db, V.angle(u), { sizePx: 9, fill: DIM_COLOR });
      const txt = e.text || (fmt(V.dist(a, b), e.decimals) + (e.unit ? ' ' + e.unit : ''));
      let ang = V.angle(u); if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI; // keep upright
      pen.text(V.add(V.mid(da, db), V.scale(n, 0.18)), txt, { sizePx: 14, color: DIM_COLOR, rotate: -ang, bg: '#ffffffd9' });
    },
  }),

  dimAngular: def({
    name: 'Angular dimension', category: 'Dimensions', snap: false, pts: [['vx', 'vy'], ['x1', 'y1'], ['x2', 'y2']],
    defaults: (at) => ({ vx: at.x, vy: at.y, x1: at.x + 1.5, y1: at.y, x2: at.x + 1, y2: at.y + 1.1, radius: 0.9, text: '', decimals: 1 }),
    params: [
      { key: 'radius', label: 'Arc radius', type: 'number', min: 0.1, step: 0.1 },
      { key: 'decimals', label: 'Decimals', type: 'number', min: 0, max: 3, step: 1 },
      { key: 'text', label: 'Override text', type: 'text' },
    ],
    handles: (e) => {
      const v = P(e, 'vx', 'vy');
      const am = (V.angle(V.sub(P(e, 'x1', 'y1'), v)) + V.angle(V.sub(P(e, 'x2', 'y2'), v))) / 2;
      const mid = V.add(v, V.fromAngle(am, e.radius));
      return [{ key: 'p0', x: e.vx, y: e.vy }, { key: 'p1', x: e.x1, y: e.y1 }, { key: 'p2', x: e.x2, y: e.y2 }, { key: 'rad', x: mid.x, y: mid.y }];
    },
    applyHandle: (e, key, w) => {
      if (key === 'p0') setP(e, 'vx', 'vy', w);
      else if (key === 'p1') setP(e, 'x1', 'y1', w);
      else if (key === 'p2') setP(e, 'x2', 'y2', w);
      else e.radius = Math.max(0.1, V.dist(P(e, 'vx', 'vy'), w));
    },
    bounds: (e) => boundsOf([P(e, 'vx', 'vy'), P(e, 'x1', 'y1'), P(e, 'x2', 'y2')], e.radius),
    draw: (e, pen) => {
      const v = P(e, 'vx', 'vy');
      let a1 = V.angle(V.sub(P(e, 'x1', 'y1'), v));
      let a2 = V.angle(V.sub(P(e, 'x2', 'y2'), v));
      let dA = normAngle(a2 - a1);            // signed shortest sweep
      const r = e.radius;
      // extension lines along the two arms
      pen.line(v, V.add(v, V.fromAngle(a1, r + 0.18)), { stroke: DIM_COLOR, w: 1 });
      pen.line(v, V.add(v, V.fromAngle(a2, r + 0.18)), { stroke: DIM_COLOR, w: 1 });
      pen.arc(v, r, a1, a1 + dA, { stroke: DIM_COLOR, w: 1.2 });
      pen.arrow(V.add(v, V.fromAngle(a1, r)), a1 + (dA > 0 ? Math.PI / 2 : -Math.PI / 2), { sizePx: 8, fill: DIM_COLOR });
      pen.arrow(V.add(v, V.fromAngle(a1 + dA, r)), a1 + dA + (dA > 0 ? -Math.PI / 2 : Math.PI / 2), { sizePx: 8, fill: DIM_COLOR });
      const txt = e.text || (fmt(Math.abs(deg(dA)), e.decimals) + '°');
      pen.text(V.add(v, V.fromAngle(a1 + dA / 2, r + 0.28)), txt, { sizePx: 14, color: DIM_COLOR, bg: '#ffffffd9' });
    },
  }),

  dimRadius: def({
    name: 'Radius / diameter', category: 'Dimensions', snap: false, pts: [['cx', 'cy']],
    defaults: (at) => ({ cx: at.x, cy: at.y, r: 0.6, angle: 45, prefix: 'R', text: '', decimals: 2 }),
    params: [
      { key: 'r', label: 'Radius', type: 'number', min: 0.01, step: 0.05 },
      { key: 'angle', label: 'Leader°', type: 'number', step: 5 },
      { key: 'prefix', label: 'Prefix', type: 'select', options: [{ v: 'R', t: 'Radius R' }, { v: '⌀', t: 'Diameter ⌀' }] },
      { key: 'decimals', label: 'Decimals', type: 'number', min: 0, max: 3, step: 1 },
      { key: 'text', label: 'Override text', type: 'text' },
    ],
    handles: (e) => {
      const tip = V.add(P(e, 'cx', 'cy'), V.fromAngle(rad(e.angle), e.r));
      return [{ key: 'p0', x: e.cx, y: e.cy }, { key: 'tip', x: tip.x, y: tip.y }];
    },
    applyHandle: (e, key, w) => {
      if (key === 'p0') setP(e, 'cx', 'cy', w);
      else { const d = V.sub(w, P(e, 'cx', 'cy')); e.r = Math.max(0.01, V.len(d)); e.angle = deg(V.angle(d)); }
    },
    bounds: (e) => boundsOf([P(e, 'cx', 'cy')], e.r + 0.4),
    draw: (e, pen) => {
      const c = P(e, 'cx', 'cy'); const tip = V.add(c, V.fromAngle(rad(e.angle), e.r));
      const out = V.add(c, V.fromAngle(rad(e.angle), e.r + 0.4));
      pen.line(c, out, { stroke: DIM_COLOR, w: 1.1 });
      pen.arrow(tip, rad(e.angle), { sizePx: 9, fill: DIM_COLOR });
      const val = e.prefix === '⌀' ? e.r * 2 : e.r;
      const txt = e.text || (e.prefix + fmt(val, e.decimals));
      pen.text(V.add(out, { x: 0.1, y: 0 }), txt, { sizePx: 14, color: DIM_COLOR, anchor: 'start', bg: '#ffffffd9' });
    },
  }),

  dimCoord: def({
    name: 'Coordinate', category: 'Dimensions', snap: false, pts: [['x', 'y']],
    defaults: (at) => ({ x: at.x, y: at.y, lead: 0.8, decimals: 2 }),
    params: [
      { key: 'lead', label: 'Leader', type: 'number', step: 0.1 },
      { key: 'decimals', label: 'Decimals', type: 'number', min: 0, max: 4, step: 1 },
    ],
    bounds: (e) => boundsOf([P(e, 'x', 'y')], Math.abs(e.lead) + 0.6),
    draw: (e, pen) => {
      const c = P(e, 'x', 'y');
      const t = V.add(c, { x: e.lead, y: e.lead });
      pen.line(c, t, { stroke: DIM_COLOR, w: 1 });
      pen.circlePx(c, 2.5, { fill: DIM_COLOR, stroke: DIM_COLOR });
      pen.text(V.add(t, { x: 0.08, y: 0 }), `(${fmt(e.x, e.decimals)}, ${fmt(e.y, e.decimals)})`, { sizePx: 13, color: DIM_COLOR, anchor: 'start', bg: '#ffffffd9' });
    },
  }),

  // ======================= ANNOTATION =======================
  label: def({
    name: 'Text label', category: 'Annotation', snap: false, pts: [['x', 'y']],
    defaults: (at) => ({ x: at.x, y: at.y, text: 'Text', size: 16, angle: 0, italic: false }),
    params: [
      { key: 'text', label: 'Text', type: 'text' },
      { key: 'size', label: 'Size (px)', type: 'number', min: 6, max: 72, step: 1 },
      { key: 'angle', label: 'Angle°', type: 'number', step: 5 },
      { key: 'italic', label: 'Italic', type: 'bool' },
    ],
    draw: (e, pen) => pen.text(P(e, 'x', 'y'), e.text, { sizePx: e.size, rotate: -rad(e.angle), italic: e.italic, anchor: 'start' }),
  }),
};

// Shared drawing for pin/roller triangular supports.
// No ground line/hatch — pair with a Fixed wall prefab when you want ground.
function drawTriSupport(e, pen, roller) {
  const apex = P(e, 'x', 'y');
  const down = V.fromAngle(rad(e.angle));
  const baseC = V.add(apex, V.scale(down, e.size));
  const bdir = V.perp(down);
  const bh = e.size * 0.62;
  const p1 = V.add(baseC, V.scale(bdir, bh)), p2 = V.add(baseC, V.scale(bdir, -bh));
  pen.poly([apex, p1, p2], { close: true, w: 1.7, fill: '#fff' });
  pen.circlePx(apex, 5, { stroke: INK, w: 1.6, fill: '#fff' });
  if (roller) {
    const rr = e.size * 0.16;
    const off = V.scale(down, rr);
    pen.circlePx(V.add(V.add(baseC, V.scale(bdir, bh * 0.5)), off), rr * pen.scale, { stroke: INK, w: 1.4, fill: '#fff' });
    pen.circlePx(V.add(V.add(baseC, V.scale(bdir, -bh * 0.5)), off), rr * pen.scale, { stroke: INK, w: 1.4, fill: '#fff' });
  }
}

// Factory: create a fresh entity of `type` placed at world point `at`.
export function createEntity(type, at) {
  const d = DEFS[type];
  if (!d) throw new Error('Unknown entity type: ' + type);
  return { id: uid(), type, ...d.defaults(at) };
}
