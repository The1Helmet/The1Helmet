// Document model: the list of entities, the current selection, undo/redo
// history, and (de)serialization. Emits 'change' so views can re-render.
import { DEFS } from './entities.js';

export class Store {
  constructor() {
    this.entities = [];
    this.selection = new Set();
    this.filePath = null;
    this.dirty = false;
    this._undo = [];
    this._redo = [];
    this._subs = new Set();
    this._snapshot = this._cap(); // baseline
  }

  // ---- pub/sub ----
  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); }
  emit() { for (const fn of this._subs) fn(this); }

  // ---- history ----
  _cap() { return JSON.stringify(this.entities); }
  commit() {
    this._undo.push(this._snapshot);
    if (this._undo.length > 200) this._undo.shift();
    this._redo.length = 0;
    this._snapshot = this._cap();
    this.dirty = true;
    this.emit();
  }
  undo() {
    if (!this._undo.length) return;
    this._redo.push(this._cap());
    const s = this._undo.pop();
    this.entities = JSON.parse(s);
    this._snapshot = s;
    this._pruneSelection();
    this.dirty = true;
    this.emit();
  }
  redo() {
    if (!this._redo.length) return;
    this._undo.push(this._cap());
    const s = this._redo.pop();
    this.entities = JSON.parse(s);
    this._snapshot = s;
    this._pruneSelection();
    this.dirty = true;
    this.emit();
  }

  // ---- entity ops ----
  add(entity, { select = true, commit = true } = {}) {
    this.entities.push(entity);
    if (select) { this.selection.clear(); this.selection.add(entity.id); }
    if (commit) this.commit(); else this.emit();
    return entity;
  }
  remove(ids) {
    const set = new Set(ids);
    this.entities = this.entities.filter((e) => !set.has(e.id));
    for (const id of ids) this.selection.delete(id);
    this.commit();
  }
  get(id) { return this.entities.find((e) => e.id === id); }
  byZ() { return this.entities; } // draw order = insertion order
  _pruneSelection() {
    const live = new Set(this.entities.map((e) => e.id));
    for (const id of [...this.selection]) if (!live.has(id)) this.selection.delete(id);
  }

  // ---- selection ----
  selectOnly(id) { this.selection.clear(); if (id) this.selection.add(id); this.emit(); }
  toggle(id) { this.selection.has(id) ? this.selection.delete(id) : this.selection.add(id); this.emit(); }
  selectAll() { this.selection = new Set(this.entities.map((e) => e.id)); this.emit(); }
  clearSelection() { this.selection.clear(); this.emit(); }
  selected() { return this.entities.filter((e) => this.selection.has(e.id)); }

  // ---- file ----
  serialize() {
    return JSON.stringify({ app: 'helmet-cad', version: 1, entities: this.entities }, null, 2);
  }
  loadData(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || !Array.isArray(data.entities)) throw new Error('Not a Helmet CAD file');
    // keep only entities whose type we understand
    this.entities = data.entities.filter((e) => DEFS[e.type]);
    this.selection.clear();
    this._undo.length = 0; this._redo.length = 0;
    this._snapshot = this._cap();
    this.dirty = false;
    this.emit();
  }
  newDocument() {
    this.entities = []; this.selection.clear(); this.filePath = null;
    this._undo.length = 0; this._redo.length = 0; this._snapshot = this._cap();
    this.dirty = false; this.emit();
  }
}
