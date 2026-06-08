// App bootstrap: builds the scene, wires pointer/keyboard/menu events, runs the
// render loop, and handles file Save/Open (Electron IPC, with a browser fallback).
import { Store } from './store.js';
import { Camera } from './camera.js';
import { Tools } from './tools.js';
import { Palette, Properties } from './panels.js';
import { DEFS } from './entities.js';
import { uid } from './geometry.js';
import { Pen, renderGrid, SEL, HANDLE } from './renderer.js';
import { openBlueprint } from './blueprint.js';

const app = {
  store: new Store(),
  cam: new Camera(),
  svg: document.getElementById('canvas'),
  showGrid: true,
  overlay: { snap: null, marquee: null, cursor: 'default', ghost: null, mateTarget: null },
  render() { render(); },
};
app.tools = new Tools(app);

const palette = new Palette(document.getElementById('palette'), app);
const props = new Properties(document.getElementById('properties'), app);

// ---- rendering --------------------------------------------------------------
function viewSize() {
  const r = app.svg.getBoundingClientRect();
  return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
}

function render() {
  const { w, h } = viewSize();
  app.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  app.svg.style.cursor = app.tools.tool === 'place' ? 'crosshair' : 'default';
  const out = [renderGrid(app.cam, w, h, app.showGrid)];

  // entities
  for (const e of app.store.byZ()) {
    const pen = new Pen(app.cam);
    try { DEFS[e.type].draw(e, pen, { selected: app.store.selection.has(e.id), scale: app.cam.scale }); } catch (_) {}
    out.push(`<g class="ent">${pen.out()}</g>`);
  }

  // mate highlight: the link a hovered support/slider would snap onto
  if (app.overlay.mateTarget) {
    const o = app.overlay.mateTarget;
    const a = app.cam.toScreen({ x: o.x1, y: o.y1 }), c = app.cam.toScreen({ x: o.x2, y: o.y2 });
    out.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${c.x.toFixed(1)}" y2="${c.y.toFixed(1)}" stroke="${SEL}" stroke-width="${(o.w || 5) + 5}" stroke-linecap="round" opacity="0.28"/>`);
  }

  // ghost preview of the prefab about to be placed
  if (app.overlay.ghost) {
    const pen = new Pen(app.cam);
    try { DEFS[app.overlay.ghost.type].draw(app.overlay.ghost, pen, { selected: false, scale: app.cam.scale }); } catch (_) {}
    out.push(`<g opacity="0.5" style="pointer-events:none">${pen.out()}</g>`);
  }

  // selection: bounds box + handles
  for (const e of app.store.selected()) {
    const b = DEFS[e.type].bounds(e);
    const a = app.cam.toScreen({ x: b.minX, y: b.maxY });
    const c = app.cam.toScreen({ x: b.maxX, y: b.minY });
    out.push(`<rect x="${Math.min(a.x, c.x).toFixed(1)}" y="${Math.min(a.y, c.y).toFixed(1)}" width="${Math.abs(c.x - a.x).toFixed(1)}" height="${Math.abs(c.y - a.y).toFixed(1)}" fill="none" stroke="${SEL}" stroke-width="1" stroke-dasharray="4 3" opacity="0.7"/>`);
    for (const hnd of DEFS[e.type].handles(e)) {
      const s = app.cam.toScreen(hnd);
      out.push(`<rect x="${(s.x - 4).toFixed(1)}" y="${(s.y - 4).toFixed(1)}" width="8" height="8" fill="#fff" stroke="${HANDLE}" stroke-width="1.5"/>`);
    }
  }

  // marquee
  if (app.overlay.marquee) {
    const a = app.cam.toScreen(app.overlay.marquee.a), c = app.cam.toScreen(app.overlay.marquee.b);
    out.push(`<rect x="${Math.min(a.x, c.x)}" y="${Math.min(a.y, c.y)}" width="${Math.abs(c.x - a.x)}" height="${Math.abs(c.y - a.y)}" fill="${SEL}22" stroke="${SEL}" stroke-width="1" stroke-dasharray="3 2"/>`);
  }

  // snap marker
  if (app.overlay.snap) {
    const s = app.cam.toScreen(app.overlay.snap);
    out.push(`<g stroke="#ff8c00" stroke-width="1.4" fill="none"><line x1="${s.x - 6}" y1="${s.y}" x2="${s.x + 6}" y2="${s.y}"/><line x1="${s.x}" y1="${s.y - 6}" x2="${s.x}" y2="${s.y + 6}"/><rect x="${s.x - 4}" y="${s.y - 4}" width="8" height="8"/></g>`);
  }

  app.svg.innerHTML = out.join('');
  updateStatus();
}

function updateStatus() {
  document.getElementById('st-zoom').textContent = `Zoom ${Math.round(app.cam.scale)}px/u`;
  document.getElementById('st-snap').textContent = `Snap ${app.tools.snapEnabled ? 'On' : 'Off'}`;
  document.getElementById('st-grid').textContent = `Grid ${app.showGrid ? 'On' : 'Off'}`;
  document.getElementById('st-count').textContent = `${app.store.entities.length} objects`;
}

// Re-render + refresh properties when the document changes.
app.store.subscribe(() => { props.refresh(); render(); updateTitle(); });

function updateTitle() {
  const name = app.store.filePath ? app.store.filePath.split(/[\\/]/).pop() : 'Untitled';
  document.title = `Helmet CAD — ${name}${app.store.dirty ? ' *' : ''}`;
  const el = document.getElementById('st-file'); if (el) el.textContent = name + (app.store.dirty ? ' *' : '');
}

// ---- pointer wiring ---------------------------------------------------------
let spaceDown = false;
app.svg.addEventListener('pointerdown', (e) => { e.spaceKey = spaceDown; app.tools.onPointerDown(e); });
app.svg.addEventListener('pointermove', (e) => {
  app.tools.onPointerMove(e);
  const r = app.svg.getBoundingClientRect();
  const wpt = app.cam.toWorld({ x: e.clientX - r.left, y: e.clientY - r.top });
  document.getElementById('st-pos').textContent = `x ${wpt.x.toFixed(2)}  y ${wpt.y.toFixed(2)}`;
});
window.addEventListener('pointerup', (e) => app.tools.onPointerUp(e));
app.svg.addEventListener('wheel', (e) => app.tools.onWheel(e), { passive: false });
app.svg.addEventListener('contextmenu', (e) => e.preventDefault());
app.svg.addEventListener('pointerleave', () => {
  if (app.tools.drag) return; // keep state mid-gesture
  app.overlay.snap = null; app.overlay.ghost = null; app.overlay.mateTarget = null;
  app.tools.ghost = null; render();
});
window.addEventListener('resize', render);

// ---- actions ----------------------------------------------------------------
function del() { if (app.store.selection.size) app.store.remove([...app.store.selection]); }
function duplicate() {
  const copies = app.store.selected().map((e) => ({ ...JSON.parse(JSON.stringify(e)), id: uid() }));
  if (!copies.length) return;
  for (const c of copies) { if ('x' in c) { c.x += 0.5; c.y -= 0.5; } if ('x1' in c) { c.x1 += 0.5; c.y1 -= 0.5; c.x2 += 0.5; c.y2 -= 0.5; } if ('vx' in c) { c.vx += 0.5; c.vy -= 0.5; } if ('cx' in c) { c.cx += 0.5; c.cy -= 0.5; } app.store.entities.push(c); }
  app.store.selection = new Set(copies.map((c) => c.id));
  app.store.commit();
}
function zoomFit() {
  if (!app.store.entities.length) return;
  let b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of app.store.entities) { const eb = DEFS[e.type].bounds(e); b.minX = Math.min(b.minX, eb.minX); b.minY = Math.min(b.minY, eb.minY); b.maxX = Math.max(b.maxX, eb.maxX); b.maxY = Math.max(b.maxY, eb.maxY); }
  const { w, h } = viewSize(); app.cam.fit(b, w, h); render();
}

// ---- file I/O ---------------------------------------------------------------
async function saveDoc(saveAs) {
  const data = app.store.serialize();
  if (window.electronAPI) {
    const res = saveAs ? await window.electronAPI.saveAs(data) : await window.electronAPI.save(data, app.store.filePath);
    if (!res.canceled) { app.store.filePath = res.filePath; app.store.dirty = false; updateTitle(); }
  } else {
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = (app.store.filePath || 'drawing') + '.hcad.json'; a.click();
    URL.revokeObjectURL(a.href); app.store.dirty = false; updateTitle();
  }
}
async function openDoc() {
  if (window.electronAPI) {
    const res = await window.electronAPI.open();
    if (!res.canceled) { app.store.loadData(res.data); app.store.filePath = res.filePath; zoomFit(); updateTitle(); }
  } else {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,.hcad.json';
    inp.onchange = () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { app.store.loadData(rd.result); app.store.filePath = f.name.replace(/\.(hcad\.)?json$/, ''); zoomFit(); } catch (err) { alert('Could not open file: ' + err.message); } }; rd.readAsText(f); };
    inp.click();
  }
}

// ---- command dispatch (menu + toolbar + keyboard) ---------------------------
function dispatch(cmd) {
  switch (cmd) {
    case 'new': app.store.newDocument(); break;
    case 'open': openDoc(); break;
    case 'save': saveDoc(false); break;
    case 'saveAs': saveDoc(true); break;
    case 'blueprint': openBlueprint(app); break;
    case 'undo': app.store.undo(); break;
    case 'redo': app.store.redo(); break;
    case 'delete': del(); break;
    case 'duplicate': duplicate(); break;
    case 'selectAll': app.store.selectAll(); break;
    case 'zoomIn': app.cam.zoomAt({ x: viewSize().w / 2, y: viewSize().h / 2 }, 1.2); render(); break;
    case 'zoomOut': app.cam.zoomAt({ x: viewSize().w / 2, y: viewSize().h / 2 }, 1 / 1.2); render(); break;
    case 'zoomFit': zoomFit(); break;
    case 'toggleGrid': app.showGrid = !app.showGrid; render(); break;
    case 'toggleSnap': app.tools.snapEnabled = !app.tools.snapEnabled; render(); break;
    case 'selectTool': app.tools.setTool('select'); palette.setActive('select'); break;
  }
}
if (window.electronAPI) window.electronAPI.onMenu(({ cmd }) => dispatch(cmd));

// toolbar buttons
for (const btn of document.querySelectorAll('[data-cmd]')) btn.addEventListener('click', () => dispatch(btn.dataset.cmd));

// ---- keyboard ---------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.key === ' ') spaceDown = true;
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
  const mod = e.ctrlKey || e.metaKey;
  if (typing && !(mod && ['z', 'y', 's', 'o'].includes(e.key.toLowerCase()))) return;
  if (e.key === 'Escape') { app.tools.onEscape(); palette.setActive('select'); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) { e.preventDefault(); del(); }
  else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? app.store.redo() : app.store.undo(); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); app.store.redo(); }
  else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveDoc(e.shiftKey); }
  else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openDoc(); }
  else if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); app.store.newDocument(); }
  else if (mod && e.key.toLowerCase() === 'a' && !typing) { e.preventDefault(); app.store.selectAll(); }
  else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
  else if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); openBlueprint(app); }
  else if (mod && (e.key === '0')) { e.preventDefault(); zoomFit(); }
  else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); dispatch('zoomIn'); }
  else if (mod && e.key === '-') { e.preventDefault(); dispatch('zoomOut'); }
  else if (!typing && e.key.toLowerCase() === 'g') { dispatch('toggleGrid'); }
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });

// ---- go ---------------------------------------------------------------------
updateTitle();
render();
