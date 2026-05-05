/* Stormgrid v0 — availability panel.
   Renders a small panel summarising the static rainfall payload:
   source, generated_at, frame count, window, file size, plus the
   stats for the currently selected catchment (if any). */

export function renderAvailabilityPanel(host, { rainfallResult, selected, summary }) {
  host.innerHTML = '';
  host.classList.add('stormgrid-availwrap');

  const head = document.createElement('header');
  head.className = 'stormgrid-availhead';
  head.innerHTML = `<h3>Static rainfall</h3>`;
  host.appendChild(head);

  if (!rainfallResult) {
    host.appendChild(blockMessage('Loading static rainfall data…'));
    return;
  }
  if (!rainfallResult.ok) {
    host.appendChild(blockMessage(
      `No precomputed rainfall available (${rainfallResult.error}). ` +
      `Generate locally with ` +
      `<code>python scripts/build_stormgrid_static_rainfall.py</code> ` +
      `then redeploy.`,
      'error'
    ));
    return;
  }

  const d = rainfallResult.data;
  const meta = document.createElement('dl');
  meta.className = 'stormgrid-availmeta';
  meta.innerHTML = `
    <div><dt>Source</dt><dd>${escapeHtml(d.source.kind)}</dd></div>
    <div><dt>Unit</dt><dd>${escapeHtml(d.source.unit)} per ${d.source.interval_hours} h</dd></div>
    <div><dt>Generated</dt><dd>${formatTs(d.generated_at)}</dd></div>
    <div><dt>Window</dt><dd>${formatTs(d.window.start)} → ${formatTs(d.window.end)}</dd></div>
    <div><dt>Frames</dt><dd>${d.window.frame_count}</dd></div>
    <div><dt>Catchments</dt><dd>${d.catchment_dataset.feature_count}</dd></div>
    <div><dt>Payload</dt><dd>${formatBytes(rainfallResult.sizeBytes)}</dd></div>
  `;
  host.appendChild(meta);

  const note = document.createElement('p');
  note.className = 'stormgrid-availnote';
  note.textContent = d.source.note || '';
  host.appendChild(note);

  // Selected-catchment stats
  const sel = document.createElement('section');
  sel.className = 'stormgrid-selstats';
  if (!selected) {
    sel.innerHTML = `<p class="stormgrid-selstats__empty">Click a catchment on the map to see rainfall.</p>`;
  } else if (!summary) {
    sel.innerHTML = `<p class="stormgrid-selstats__empty">Selected: <strong>${escapeHtml(selected.id)}</strong> — no stats for this window.</p>`;
  } else {
    const fmt = (n) => (n === null || n === undefined) ? '—' : `${n.toFixed(2)} mm`;
    const cov = summary.coverageMean === null ? '—' : `${(summary.coverageMean * 100).toFixed(0)}%`;
    sel.innerHTML = `
      <h4>${escapeHtml(selected.id)}
        <span class="stormgrid-selstats__sub">last ${summary.windowHours} h
          (${summary.framesCovered}/${summary.framesRequested} frames)</span>
      </h4>
      <dl class="stormgrid-selstats__grid">
        <div><dt>Total mean</dt><dd>${fmt(summary.total)}</dd></div>
        <div><dt>Mean / frame</dt><dd>${fmt(summary.mean)}</dd></div>
        <div><dt>Median / frame</dt><dd>${fmt(summary.median)}</dd></div>
        <div><dt>Min / frame</dt><dd>${fmt(summary.min)}</dd></div>
        <div><dt>Max / frame</dt><dd>${fmt(summary.max)}</dd></div>
        <div><dt>Coverage</dt><dd>${cov}</dd></div>
      </dl>
    `;
  }
  host.appendChild(sel);
}

function blockMessage(html, variant) {
  const el = document.createElement('p');
  el.className = 'stormgrid-availmsg' + (variant ? ` stormgrid-availmsg--${variant}` : '');
  el.innerHTML = html;
  return el;
}

function formatTs(s) {
  if (!s) return '—';
  // ISO UTC string, format briefly
  return s.replace('T', ' ').replace('Z', ' UTC');
}

function formatBytes(n) {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
