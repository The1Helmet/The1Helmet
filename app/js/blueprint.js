// Reserved hook for the future "Blueprint" feature (sheet border + title block,
// scale, and PDF/SVG export to match the source documents). Intentionally a
// stub for now — wired to the menu and toolbar so the slot exists.
export function openBlueprint(app) {
  const existing = document.getElementById('bp-modal');
  if (existing) existing.remove();
  const m = document.createElement('div');
  m.id = 'bp-modal';
  m.className = 'modal-backdrop';
  m.innerHTML = `
    <div class="modal">
      <h2>📐 Blueprint <span class="badge">coming soon</span></h2>
      <p>This is the reserved slot for the Blueprint feature we'll build next.
      Planned: a printable sheet (A4/A3) with border + title block, a drawing
      scale, and export to <b>PDF / SVG</b> that matches your reference documents.</p>
      <p class="muted">The drawing engine already renders to vector (SVG) world-space,
      so this hook can wrap the current scene without changes to your prefabs.</p>
      <div class="modal-actions"><button id="bp-close">Got it</button></div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', (e) => { if (e.target === m) close(); });
  m.querySelector('#bp-close').addEventListener('click', close);
}
