// Viewport transform: maps world coordinates (Y up, meters) to screen pixels.
// screen.x = (world.x - panX) * scale
// screen.y = (-world.y - panY) * scale    (Y flipped so up is up)
export class Camera {
  constructor() {
    this.scale = 60;     // pixels per world unit
    this.panX = -2;      // world coords at screen origin (after Y flip for y)
    this.panY = -7;
  }

  toScreen(p) {
    return { x: (p.x - this.panX) * this.scale, y: (-p.y - this.panY) * this.scale };
  }

  toWorld(s) {
    return { x: s.x / this.scale + this.panX, y: -(s.y / this.scale + this.panY) };
  }

  // Zoom keeping the world point under the cursor fixed on screen.
  zoomAt(screenPt, factor) {
    const before = this.toWorld(screenPt);
    this.scale = Math.max(4, Math.min(2000, this.scale * factor));
    const after = this.toWorld(screenPt);
    this.panX += before.x - after.x;
    this.panY += (-before.y) - (-after.y);
  }

  panBy(dxScreen, dyScreen) {
    this.panX -= dxScreen / this.scale;
    this.panY -= dyScreen / this.scale;
  }

  // Fit the given world bounds {minX,minY,maxX,maxY} into the viewport.
  fit(bounds, width, height, pad = 60) {
    if (!bounds || !isFinite(bounds.minX)) return;
    const w = Math.max(0.5, bounds.maxX - bounds.minX);
    const h = Math.max(0.5, bounds.maxY - bounds.minY);
    this.scale = Math.max(4, Math.min(2000, Math.min((width - 2 * pad) / w, (height - 2 * pad) / h)));
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    this.panX = cx - width / 2 / this.scale;
    this.panY = -cy - height / 2 / this.scale;
  }
}
