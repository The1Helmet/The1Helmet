// 2D vector math and small geometry helpers used across the app.
// World coordinates use mathematical orientation (Y points up).

export const V = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (a, s) => ({ x: a.x * s, y: a.y * s }),
  len: (a) => Math.hypot(a.x, a.y),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  norm: (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; },
  // perpendicular (rotate +90°)
  perp: (a) => ({ x: -a.y, y: a.x }),
  dot: (a, b) => a.x * b.x + a.y * b.y,
  cross: (a, b) => a.x * b.y - a.y * b.x,
  angle: (a) => Math.atan2(a.y, a.x),
  fromAngle: (rad, len = 1) => ({ x: Math.cos(rad) * len, y: Math.sin(rad) * len }),
  rotate: (a, rad, about = { x: 0, y: 0 }) => {
    const c = Math.cos(rad), s = Math.sin(rad);
    const dx = a.x - about.x, dy = a.y - about.y;
    return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
  },
  mid: (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
  clone: (a) => ({ x: a.x, y: a.y }),
};

export const deg = (rad) => rad * 180 / Math.PI;
export const rad = (d) => d * Math.PI / 180;

// Normalize an angle (radians) to (-PI, PI].
export function normAngle(a) {
  while (a <= -Math.PI) a += 2 * Math.PI;
  while (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

// Distance from point p to segment a-b, plus the closest point on it.
export function pointSegment(p, a, b) {
  const ab = V.sub(b, a);
  const t = Math.max(0, Math.min(1, V.dot(V.sub(p, a), ab) / (V.dot(ab, ab) || 1)));
  const proj = V.add(a, V.scale(ab, t));
  return { dist: V.dist(p, proj), point: proj, t };
}

// Intersection of two infinite lines, each given by a point + direction.
export function lineIntersect(p1, d1, p2, d2) {
  const denom = V.cross(d1, d2);
  if (Math.abs(denom) < 1e-9) return null; // parallel
  const t = V.cross(V.sub(p2, p1), d2) / denom;
  return V.add(p1, V.scale(d1, t));
}

// Round to a sensible number of decimals for display.
export function fmt(n, decimals = 2) {
  if (!isFinite(n)) return '0';
  const r = Math.round(n * 10 ** decimals) / 10 ** decimals;
  return String(r).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

let _id = 1;
export function uid(prefix = 'e') { return `${prefix}${(_id++).toString(36)}${Date.now().toString(36).slice(-3)}`; }
