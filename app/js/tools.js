// Pointer interaction + tool state machine: Select (pick / move / edit handles /
// marquee), Place (spawn prefabs with 1–3 clicks), and panning / zooming.
// Snapping gives the CAD feel: cursor locks onto joints, endpoints and the grid.
import { V, deg, pointSegment } from './geometry.js';
import { DEFS, createEntity } from './entities.js';

// How many clicks each prefab needs, and which handle each click drives.
const PLACE_STEPS = {
  node: ['p0'], link: ['p0', 'p1'], fixedWall: ['p0', 'p1'],
  pinSupport: ['p0'], rollerSupport: ['p0'], sliderSlot: ['p0'], piston: ['p0'],
  force: ['p0', 'tail'], distributed: ['p0', 'p1'], moment: ['p0'],
  vector: ['p0', 'tip'], omega: ['p0'], axes: ['p0'],
  dimLinear: ['p0', 'p1'], dimAngular: ['p0', 'p1', 'p2'],
  dimRadius: ['p0'], dimCoord: ['p0'], label: ['p0'], guideline: ['p0', 'p1'],
};

export class Tools {
  constructor(app) {
    this.app = app;            // { store, cam, svg, render(), setTool(), overlay }
    this.tool = 'select';      // 'select' | 'place'
    this.placeType = null;
    this.snapEnabled = true;
    this.gridSnap = 0.25;
    this.drag = null;          // active gesture
    this.placing = null;       // in-progress placement
  }

  setTool(tool, placeType = null) {
    this._cancelPlacing();
    this.tool = tool;
    this.placeType = placeType;
    this.ghost = null;
    this.app.overlay.ghost = null;
    this.app.overlay.mateTarget = null;
    this.app.overlay.cursor = tool === 'place' ? 'crosshair' : 'default';
    this.app.render();
  }

  // ---- snapping ---------------------------------------------------------------
  snap(world, excludeIds = new Set()) {
    let best = null, bestD = 10 / this.app.cam.scale;
    if (this.snapEnabled) {
      for (const e of this.app.store.entities) {
        const d = DEFS[e.type];
        if (!d.snap || excludeIds.has(e.id)) continue;
        for (const a of d.anchors(e)) {
          const dist = V.dist(world, a);
          if (dist < bestD) { bestD = dist; best = a; }
        }
      }
    }
    if (best) return { point: { x: best.x, y: best.y }, snapped: true, kind: 'point' };
    if (this.snapEnabled && this.gridSnap > 0) {
      const g = this.gridSnap;
      return { point: { x: Math.round(world.x / g) * g, y: Math.round(world.y / g) * g }, snapped: true, kind: 'grid' };
    }
    return { point: world, snapped: false };
  }

  // ---- picking ----------------------------------------------------------------
  // Skeleton used for hit-testing: handle points + segments between them.
  _skeleton(e) {
    const hs = DEFS[e.type].handles(e);
    const pts = hs.map((h) => ({ x: h.x, y: h.y }));
    const segs = [];
    for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
    return { pts, segs };
  }

  pickHandle(world) {
    const tol = 9 / this.app.cam.scale;
    for (const e of this.app.store.selected().reverse()) {
      for (const h of DEFS[e.type].handles(e)) {
        if (V.dist(world, h) <= tol) return { entity: e, handle: h.key };
      }
    }
    return null;
  }

  pickEntity(world) {
    const tol = 6 / this.app.cam.scale;
    const ents = this.app.store.entities;
    // pass 1: near the skeleton (lines/points)
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i]; const sk = this._skeleton(e);
      let d = Infinity;
      for (const p of sk.pts) d = Math.min(d, V.dist(world, p));
      for (const [a, b] of sk.segs) {
        const ab = V.sub(b, a); const t = Math.max(0, Math.min(1, V.dot(V.sub(world, a), ab) / (V.dot(ab, ab) || 1)));
        d = Math.min(d, V.dist(world, V.add(a, V.scale(ab, t))));
      }
      if (d <= tol) return e;
    }
    // pass 2: inside the bounding box (area-like prefabs: blocks, supports, text)
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i]; const b = DEFS[e.type].bounds(e);
      if (world.x >= b.minX && world.x <= b.maxX && world.y >= b.minY && world.y <= b.maxY) return e;
    }
    return null;
  }

  // ---- event helpers ----------------------------------------------------------
  _evtWorld(ev) {
    const r = this.app.svg.getBoundingClientRect();
    return this.app.cam.toWorld({ x: ev.clientX - r.left, y: ev.clientY - r.top });
  }
  _evtScreen(ev) {
    const r = this.app.svg.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  // ---- pointer handlers -------------------------------------------------------
  onWheel(ev) {
    ev.preventDefault();
    const s = this._evtScreen(ev);
    this.app.cam.zoomAt(s, ev.deltaY < 0 ? 1.12 : 1 / 1.12);
    this.app.render();
  }

  onPointerDown(ev) {
    if (ev.button === 1 || ev.button === 2 || ev.spaceKey) { // middle/right/space = pan
      this.drag = { type: 'pan', last: this._evtScreen(ev) };
      this.app.svg.setPointerCapture(ev.pointerId);
      return;
    }
    const world = this._evtWorld(ev);

    if (this.tool === 'place') { this._placeClick(world); return; }

    // SELECT tool
    const h = this.pickHandle(world);
    if (h) {
      this.drag = { type: 'handle', entity: h.entity, handle: h.handle, moved: false };
      this.app.svg.setPointerCapture(ev.pointerId);
      return;
    }
    const hit = this.pickEntity(world);
    if (hit) {
      if (ev.shiftKey) this.app.store.toggle(hit.id);
      else if (!this.app.store.selection.has(hit.id)) this.app.store.selectOnly(hit.id);
      const snap = this.snap(world, this.app.store.selection);
      this.drag = { type: 'move', last: snap.point, moved: false };
      this.app.svg.setPointerCapture(ev.pointerId);
    } else {
      if (!ev.shiftKey) this.app.store.clearSelection();
      this.drag = { type: 'marquee', start: world, cur: world };
      this.app.svg.setPointerCapture(ev.pointerId);
    }
    this.app.render();
  }

  onPointerMove(ev) {
    const world = this._evtWorld(ev);
    // live snap indicator
    const snap = this.snap(world, this.drag && this.drag.type === 'handle' ? new Set([this.drag.entity.id]) : (this.drag && this.drag.type === 'move' ? this.app.store.selection : new Set()));
    this.app.overlay.snap = snap.snapped ? snap.point : null;

    if (this.placing) { this._placeHover(snap.point); this.app.render(); return; }

    // Ghost preview of the prefab about to be placed (with live link-snapping).
    if (this.tool === 'place' && !this.drag) { this._updateGhost(snap.point); this.app.render(); return; }

    if (!this.drag) { this.app.render(); return; }

    if (this.drag.type === 'pan') {
      const s = this._evtScreen(ev);
      this.app.cam.panBy(s.x - this.drag.last.x, s.y - this.drag.last.y);
      this.drag.last = s; this.app.render(); return;
    }
    if (this.drag.type === 'handle') {
      DEFS[this.drag.entity.type].applyHandle(this.drag.entity, this.drag.handle, snap.point);
      this.drag.moved = true; this.app.store.emit(); this.app.render(); return;
    }
    if (this.drag.type === 'move') {
      const d = V.sub(snap.point, this.drag.last);
      if (d.x || d.y) {
        for (const e of this.app.store.selected()) DEFS[e.type].translate(e, d);
        this.drag.last = snap.point; this.drag.moved = true; this.app.store.emit();
      }
      this.app.render(); return;
    }
    if (this.drag.type === 'marquee') {
      this.drag.cur = world; this.app.overlay.marquee = { a: this.drag.start, b: world }; this.app.render(); return;
    }
  }

  onPointerUp(ev) {
    if (!this.drag) return;
    const d = this.drag; this.drag = null;
    try { this.app.svg.releasePointerCapture(ev.pointerId); } catch (_) {}
    if (d.type === 'marquee') {
      this.app.overlay.marquee = null;
      const r = { minX: Math.min(d.start.x, d.cur.x), maxX: Math.max(d.start.x, d.cur.x), minY: Math.min(d.start.y, d.cur.y), maxY: Math.max(d.start.y, d.cur.y) };
      if (Math.abs(d.start.x - d.cur.x) > 0.02 || Math.abs(d.start.y - d.cur.y) > 0.02) {
        for (const e of this.app.store.entities) {
          const b = DEFS[e.type].bounds(e);
          if (b.minX >= r.minX && b.maxX <= r.maxX && b.minY >= r.minY && b.maxY <= r.maxY) this.app.store.selection.add(e.id);
        }
        this.app.store.emit();
      }
    } else if ((d.type === 'move' || d.type === 'handle') && d.moved) {
      this.app.store.commit();
    }
    this.app.render();
  }

  // ---- placement --------------------------------------------------------------
  _placeClick(world) {
    const snap = this.snap(world, this.placing ? new Set([this.placing.entity.id]) : new Set());
    const w = snap.point;
    this.ghost = null; this.app.overlay.ghost = null; this.app.overlay.mateTarget = null;
    if (!this.placing) {
      const e = createEntity(this.placeType, w);
      this.app.store.add(e, { select: true, commit: false });
      const steps = PLACE_STEPS[this.placeType] || ['p0'];
      DEFS[e.type].applyHandle(e, steps[0], w);
      this.placing = { entity: e, steps, idx: 1 };
      if (steps.length === 1) this._finishPlacing();
    } else {
      const { entity, steps, idx } = this.placing;
      DEFS[entity.type].applyHandle(entity, steps[idx], w);
      this.placing.idx++;
      if (this.placing.idx >= steps.length) this._finishPlacing();
    }
    this.app.store.emit(); this.app.render();
  }

  _placeHover(w) {
    if (!this.placing) return;
    const { entity, steps, idx } = this.placing;
    if (idx < steps.length) DEFS[entity.type].applyHandle(entity, steps[idx], w);
  }

  _finishPlacing() {
    if (!this.placing) return;
    this._mateToLink(this.placing.entity, true);
    this.app.store.selectOnly(this.placing.entity.id);
    this.placing = null;
    this.app.store.commit(); // entity already in store; commit records it
  }

  // Live preview of the prefab under the cursor before the first click.
  _updateGhost(w) {
    const g = createEntity(this.placeType, w);
    const link = this._mateToLink(g, true, true); // mate, exclude nothing (ghost not in store)
    this.ghost = g;
    this.app.overlay.ghost = g;
    this.app.overlay.mateTarget = link;
  }

  // Mate a slider/support to the nearest link: orient to it and (optionally) snap
  // its position onto the bar. Returns the link it mated to, or null. The mate is
  // only a starting point — every value stays editable in Properties afterward.
  _mateToLink(e, snapPos = false) {
    if (!['sliderSlot', 'rollerSupport', 'pinSupport'].includes(e.type)) return null;
    const p = { x: e.x, y: e.y };
    let best = null, bestD = 0.6, proj = null;
    for (const o of this.app.store.entities) {
      if (o.type !== 'link' || o.id === e.id) continue;
      const r = pointSegment(p, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 });
      if (r.dist < bestD) { bestD = r.dist; best = o; proj = r.point; }
    }
    if (!best) return null;
    const ang = deg(V.angle(V.sub({ x: best.x2, y: best.y2 }, { x: best.x1, y: best.y1 })));
    e.angle = e.type === 'sliderSlot' ? ang : ang - 90; // slider slides along; supports stand perpendicular
    if (snapPos && proj) { e.x = proj.x; e.y = proj.y; }
    return best;
  }

  _cancelPlacing() {
    if (this.placing) {
      this.app.store.remove([this.placing.entity.id]);
      this.placing = null;
    }
  }

  onEscape() {
    if (this.placing) { this._cancelPlacing(); this.app.render(); }
    this.setTool('select');
  }
}
