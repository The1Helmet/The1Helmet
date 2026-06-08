// SVG renderer. Entities draw through a "pen" that takes WORLD coordinates and
// emits SVG markup, converting via the camera. This keeps entity code free of
// pixel/zoom concerns and makes vector export (future Blueprint feature) trivial.
import { V, rad } from './geometry.js';

export const INK = '#14181f';
export const DIM_COLOR = '#1b3a6b';
export const VEC_COLOR = '#c0392b';
export const SEL = '#2d7ef7';
export const HANDLE = '#2d7ef7';

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export class Pen {
  constructor(cam) {
    this.cam = cam;
    this.scale = cam.scale;
    this._out = [];
  }
  _p(w) { return this.cam.toScreen(w); }       // world -> screen point
  _xy(w) { const s = this._p(w); return `${s.x.toFixed(2)},${s.y.toFixed(2)}`; }
  out() { return this._out.join(''); }

  _attrs(o = {}) {
    const stroke = o.stroke ?? INK;
    const w = o.w ?? 1.5;
    let a = `stroke="${stroke}" stroke-width="${w}" fill="${o.fill ?? 'none'}"`;
    if (o.cap) a += ` stroke-linecap="${o.cap}"`;
    if (o.join) a += ` stroke-linejoin="${o.join}"`;
    if (o.dash) a += ` stroke-dasharray="${o.dash}"`;
    if (o.opacity != null) a += ` opacity="${o.opacity}"`;
    return a;
  }

  line(a, b, o = {}) {
    const A = this._p(a), B = this._p(b);
    this._out.push(`<line x1="${A.x.toFixed(2)}" y1="${A.y.toFixed(2)}" x2="${B.x.toFixed(2)}" y2="${B.y.toFixed(2)}" ${this._attrs(o)}/>`);
  }

  poly(points, o = {}) {
    const pts = points.map((p) => this._xy(p)).join(' ');
    const tag = o.close ? 'polygon' : 'polyline';
    this._out.push(`<${tag} points="${pts}" ${this._attrs(o)}/>`);
  }

  circle(c, rWorld, o = {}) { this.circlePx(c, rWorld * this.scale, o); }

  circlePx(c, rPx, o = {}) {
    const C = this._p(c);
    this._out.push(`<circle cx="${C.x.toFixed(2)}" cy="${C.y.toFixed(2)}" r="${Math.max(0, rPx).toFixed(2)}" ${this._attrs(o)}/>`);
  }

  // Arc by world center & radius, from a0 to a1 (radians, world/math angles).
  arc(c, rWorld, a0, a1, o = {}) {
    const seg = [];
    const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 36)));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      seg.push(this._xy(V.add(c, V.fromAngle(a, rWorld))));
    }
    this._out.push(`<polyline points="${seg.join(' ')}" ${this._attrs(o)}/>`);
  }

  // Filled arrowhead with tip at world point `tip`, pointing along world angle.
  arrow(tip, dirRad, o = {}) {
    const size = o.sizePx ?? 11;
    const wing = o.wing ?? 0.38;
    const T = this._p(tip);
    // Screen direction: world dir has Y up; screen Y is down, so negate y.
    const dx = Math.cos(dirRad), dy = -Math.sin(dirRad);
    const px = -dy, py = dx;
    const bx = T.x - dx * size, by = T.y - dy * size;
    const p1 = `${(bx + px * size * wing).toFixed(2)},${(by + py * size * wing).toFixed(2)}`;
    const p2 = `${(bx - px * size * wing).toFixed(2)},${(by - py * size * wing).toFixed(2)}`;
    const fill = o.fill ?? o.stroke ?? INK;
    this._out.push(`<polygon points="${T.x.toFixed(2)},${T.y.toFixed(2)} ${p1} ${p2}" fill="${fill}" stroke="${fill}" stroke-width="0.5"/>`);
  }

  text(pos, str, o = {}) {
    const P = this._p(pos);
    const size = o.sizePx ?? 14;
    const anchor = o.anchor ?? 'middle';
    const baseline = o.baseline ?? 'middle';
    const color = o.color ?? INK;
    let transform = '';
    if (o.rotate) transform = ` transform="rotate(${(o.rotate * 180 / Math.PI).toFixed(2)} ${P.x.toFixed(2)} ${P.y.toFixed(2)})"`;
    let bg = '';
    if (o.bg) {
      const w = String(str).length * size * 0.6 + 6, h = size + 4;
      let bx = P.x, by = P.y - h / 2;
      if (anchor === 'middle') bx -= w / 2; else if (anchor === 'end') bx -= w;
      bg = `<rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${o.bg}" ${transform}/>`;
    }
    this._out.push(
      `${bg}<text x="${P.x.toFixed(2)}" y="${P.y.toFixed(2)}" font-family="${o.font ?? 'Cambria, Georgia, serif'}" font-size="${size}" font-style="${o.italic ? 'italic' : 'normal'}" font-weight="${o.weight ?? 'normal'}" fill="${color}" text-anchor="${anchor}" dominant-baseline="${baseline}"${transform}>${esc(str)}</text>`
    );
  }

  // Ground hatching: short 45° ticks along baseline a->b, on the given side (±1).
  hatch(a, b, o = {}) {
    const spacing = (o.spacingPx ?? 9) / this.scale;
    const len = (o.lenPx ?? 9) / this.scale;
    const dir = V.norm(V.sub(b, a));
    const total = V.dist(a, b);
    const side = (o.side ?? 1);
    // hatch direction: 45° from baseline, toward `side`
    const n = V.scale(V.perp(dir), side);
    const hd = V.norm(V.add(V.scale(dir, -1), n)); // points back-and-out (45°)
    this.line(a, b, { stroke: o.stroke ?? INK, w: o.w ?? 1.4 });
    let d = spacing * 0.5;
    while (d < total) {
      const base = V.add(a, V.scale(dir, d));
      this.line(base, V.add(base, V.scale(hd, len)), { stroke: o.stroke ?? INK, w: o.w ?? 1 });
      d += spacing;
    }
  }
}

// Builds the static grid + axes background as an SVG string.
export function renderGrid(cam, width, height, show) {
  if (!show) return '';
  const out = [];
  const tl = cam.toWorld({ x: 0, y: 0 });
  const br = cam.toWorld({ x: width, y: height });
  let step = 1;
  // choose grid step so lines are ~>=14px apart
  while (step * cam.scale < 14) step *= 5;
  while (step * cam.scale > 90) step /= 5;
  const x0 = Math.floor(Math.min(tl.x, br.x) / step) * step;
  const x1 = Math.ceil(Math.max(tl.x, br.x) / step) * step;
  const y0 = Math.floor(Math.min(tl.y, br.y) / step) * step;
  const y1 = Math.ceil(Math.max(tl.y, br.y) / step) * step;
  for (let x = x0; x <= x1; x += step) {
    const major = Math.abs(x % (step * 5)) < 1e-6;
    const a = cam.toScreen({ x, y: y0 }), b = cam.toScreen({ x, y: y1 });
    out.push(`<line x1="${a.x.toFixed(1)}" y1="0" x2="${a.x.toFixed(1)}" y2="${height}" stroke="${major ? '#dfe4ea' : '#eef1f5'}" stroke-width="1"/>`);
  }
  for (let y = y0; y <= y1; y += step) {
    const major = Math.abs(y % (step * 5)) < 1e-6;
    const a = cam.toScreen({ x: x0, y });
    out.push(`<line x1="0" y1="${a.y.toFixed(1)}" x2="${width}" y2="${a.y.toFixed(1)}" stroke="${major ? '#dfe4ea' : '#eef1f5'}" stroke-width="1"/>`);
  }
  // world origin
  const o = cam.toScreen({ x: 0, y: 0 });
  out.push(`<line x1="${o.x}" y1="0" x2="${o.x}" y2="${height}" stroke="#c7cfda" stroke-width="1.2"/>`);
  out.push(`<line x1="0" y1="${o.y}" x2="${width}" y2="${o.y}" stroke="#c7cfda" stroke-width="1.2"/>`);
  return out.join('');
}
