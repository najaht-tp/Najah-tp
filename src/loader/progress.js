// Weighted, monotonic progress tracker. Each task reports 0..1; the total is the weighted average.
// This is the single source of truth for "how ready is the page", used by the loader UI.
export class Progress {
  constructor() { this.tasks = new Map(); this.listeners = new Set(); this._done = null; }
  add(name, weight) { this.tasks.set(name, { weight, value: 0 }); return this; }
  set(name, value) {
    const t = this.tasks.get(name);
    if (!t) return;
    t.value = Math.max(t.value, Math.min(1, value));   // never goes backwards
    this.listeners.forEach((fn) => fn(this.value));
    if (this.complete && this._done) { this._done(); this._done = null; }
  }
  done(name) { this.set(name, 1); }
  get value() {
    let sum = 0, total = 0;
    this.tasks.forEach((t) => { sum += t.value * t.weight; total += t.weight; });
    return total ? sum / total : 1;
  }
  get complete() { for (const t of this.tasks.values()) if (t.value < 1) return false; return true; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  whenComplete() { return this.complete ? Promise.resolve() : new Promise((r) => { this._done = r; }); }
}
