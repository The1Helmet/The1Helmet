// Left palette (spawnable prefabs with live thumbnails) and the right-hand
// Properties panel (edit the selected entity's dimensions / parameters).
import { DEFS, createEntity } from './entities.js';
import { prefabGroups } from './prefabs.js';
import { Camera } from './camera.js';
import { Pen } from './renderer.js';

// Render a prefab into a small standalone SVG thumbnail.
function thumbnail(type, w = 46, h = 36) {
  const e = createEntity(type, { x: 0, y: 0 });
  // give two-point prefabs a sensible spread for the icon
  if ('x2' in e) { e.x2 = 1.4; e.y2 = type === 'distributed' ? 0 : 0; }
  const cam = new Camera();
  const b = DEFS[type].bounds(e);
  cam.fit(b, w, h, 8);
  const pen = new Pen(cam);
  DEFS[type].draw(e, pen, { selected: false, scale: cam.scale });
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${pen.out()}</svg>`;
}

export class Palette {
  constructor(el, app) { this.el = el; this.app = app; this.build(); }
  build() {
    const parts = ['<button class="tool-btn sel-tool active" data-tool="select">▣ Select / Move</button>'];
    for (const g of prefabGroups()) {
      parts.push(`<div class="cat">${g.category}</div><div class="grid">`);
      for (const it of g.items) {
        parts.push(`<button class="prefab" data-type="${it.type}" title="${it.name}"><span class="thumb">${thumbnail(it.type)}</span><span class="pname">${it.name}</span></button>`);
      }
      parts.push('</div>');
    }
    this.el.innerHTML = parts.join('');
    this.el.addEventListener('click', (ev) => {
      const sel = ev.target.closest('.sel-tool');
      if (sel) { this.app.tools.setTool('select'); this.setActive('select'); return; }
      const btn = ev.target.closest('.prefab');
      if (btn) { this.app.tools.setTool('place', btn.dataset.type); this.setActive(btn.dataset.type); }
    });
  }
  setActive(key) {
    for (const b of this.el.querySelectorAll('.tool-btn, .prefab')) b.classList.remove('active');
    const target = key === 'select' ? this.el.querySelector('.sel-tool') : this.el.querySelector(`.prefab[data-type="${key}"]`);
    if (target) target.classList.add('active');
  }
}

export class Properties {
  constructor(el, app) { this.el = el; this.app = app; this.sig = null; }

  refresh() {
    const sel = [...this.app.store.selection].sort();
    const sig = sel.join(',');
    // Avoid clobbering focus while the user is typing in a field.
    if (sig === this.sig && this.el.contains(document.activeElement)) { this.updateComputed(); return; }
    this.sig = sig;
    this.render();
  }

  render() {
    const sel = this.app.store.selected();
    if (sel.length === 0) {
      this.el.innerHTML = `<div class="prop-empty">No selection.<br><span>Pick a prefab on the left to place it, then select it here to edit its dimensions.</span></div>`;
      return;
    }
    if (sel.length > 1) {
      this.el.innerHTML = `<div class="prop-head">${sel.length} objects selected</div>
        <div class="prop-empty"><span>Move them together, reorder, or delete. Select a single object to edit its parameters.</span></div>${this.arrangeHTML()}`;
      this.wireArrange();
      return;
    }
    const e = sel[0]; const d = DEFS[e.type];
    const rows = [`<div class="prop-head">${d.name}</div>`];
    const computed = d.compute ? d.compute(e) : {};
    for (const p of d.params) {
      const val = p.type === 'readonly' ? (computed[p.key] ?? '') : e[p.key];
      rows.push(`<label class="prop-row"><span>${p.label}</span>${this.field(p, val)}</label>`);
    }
    // position (always editable)
    if ('x' in e) rows.push(`<label class="prop-row"><span>X</span><input type="number" step="0.1" data-k="x" value="${e.x}"></label>`);
    if ('y' in e) rows.push(`<label class="prop-row"><span>Y</span><input type="number" step="0.1" data-k="y" value="${e.y}"></label>`);
    rows.push(this.arrangeHTML());
    this.el.innerHTML = rows.join('');
    this.bind(e, d);
    this.wireArrange();
  }

  // Draw-order (z) controls — later in the list draws on top.
  arrangeHTML() {
    return `<div class="cat">Arrange (draw order)</div>
      <div class="bp-row2">
        <button data-arr="front" title="Bring to front">⤒ Front</button>
        <button data-arr="raise" title="Forward ( ] )">▲</button>
        <button data-arr="lower" title="Backward ( [ )">▼</button>
        <button data-arr="back" title="Send to back">⤓ Back</button>
      </div>`;
  }
  wireArrange() {
    const ids = () => [...this.app.store.selection];
    this.el.querySelectorAll('[data-arr]').forEach((b) => b.addEventListener('click', () => {
      const s = this.app.store, i = ids();
      ({ front: () => s.toFront(i), back: () => s.toBack(i), raise: () => s.raise(i), lower: () => s.lower(i) }[b.dataset.arr])();
    }));
  }

  field(p, val) {
    if (p.type === 'readonly') return `<output data-c="${p.key}">${val}</output>`;
    if (p.type === 'text') return `<input type="text" data-k="${p.key}" value="${val ?? ''}">`;
    if (p.type === 'color') return `<input type="color" data-k="${p.key}" value="${val || '#000000'}">`;
    if (p.type === 'bool') return `<input type="checkbox" data-k="${p.key}" ${val ? 'checked' : ''}>`;
    if (p.type === 'select') {
      const opts = p.options.map((o) => `<option value="${o.v}" ${String(o.v) === String(val) ? 'selected' : ''}>${o.t}</option>`).join('');
      return `<select data-k="${p.key}">${opts}</select>`;
    }
    const attrs = [`type="number"`, `data-k="${p.key}"`, `value="${val}"`];
    if (p.step != null) attrs.push(`step="${p.step}"`);
    if (p.min != null) attrs.push(`min="${p.min}"`);
    if (p.max != null) attrs.push(`max="${p.max}"`);
    return `<input ${attrs.join(' ')}>`;
  }

  bind(e, d) {
    for (const input of this.el.querySelectorAll('[data-k]')) {
      const k = input.dataset.k;
      const param = d.params.find((p) => p.key === k);
      const apply = (commit) => {
        let v;
        if (input.type === 'checkbox') v = input.checked;
        else if (input.type === 'number') v = parseFloat(input.value);
        else v = input.value;
        if (input.type === 'number' && !isFinite(v)) return;
        // numeric-valued selects (side/dir) -> keep numbers numeric
        if (param && param.type === 'select' && /^-?\d+(\.\d+)?$/.test(input.value)) v = parseFloat(input.value);
        e[k] = v;
        this.updateComputed();
        this.app.render();
        if (commit) this.app.store.commit();
      };
      const ev = (input.type === 'checkbox' || input.tagName === 'SELECT' || input.type === 'color') ? 'change' : 'input';
      input.addEventListener(ev, () => apply(input.tagName === 'SELECT' || input.type === 'checkbox' || input.type === 'color'));
      input.addEventListener('change', () => this.app.store.commit());
    }
  }

  updateComputed() {
    const sel = this.app.store.selected();
    if (sel.length !== 1) return;
    const e = sel[0]; const d = DEFS[e.type];
    if (!d.compute) return;
    const c = d.compute(e);
    for (const out of this.el.querySelectorAll('output[data-c]')) {
      if (c[out.dataset.c] != null) out.textContent = c[out.dataset.c];
    }
  }
}
