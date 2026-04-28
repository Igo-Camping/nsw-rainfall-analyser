import { csvSlug } from './exportHelpers.js';

export async function exportPNG() {
  const el = document.getElementById('results');
  if (!el || !el.classList.contains('show')) {
    alert('No results to export. Run an analysis first.');
    return;
  }
  if (typeof html2canvas === 'undefined') {
    alert('PNG export library did not load. Check your internet connection.');
    return;
  }

  const now    = new Date();
  const pad    = n => String(n).padStart(2, '0');
  const tsFile = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const slug   = csvSlug(selected?.name ?? '');
  const filename = `stormgauge_report${slug ? '_' + slug : ''}_${tsFile}.png`;

  // Temporarily remove overflow/max-height so html2canvas captures full content,
  // not just the clipped scrollable viewport.
  const prev = { maxHeight: el.style.maxHeight, overflow: el.style.overflow };
  el.style.maxHeight = 'none';
  el.style.overflow  = 'visible';

  // res-hdr is position:sticky — set to relative so it doesn't duplicate in capture.
  const hdr    = el.querySelector('.res-hdr');
  const prevPos = hdr ? window.getComputedStyle(hdr).position : null;
  if (hdr) hdr.style.position = 'relative';

  try {
    const canvas = await html2canvas(el, {
      backgroundColor: '#0A1520',
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false
    });
    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href   = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    }, 'image/png');
  } catch(e) {
    console.error('PNG export failed:', e);
    alert('PNG export failed: ' + e.message);
  } finally {
    el.style.maxHeight = prev.maxHeight;
    el.style.overflow  = prev.overflow;
    if (hdr) {
      if (prevPos && prevPos !== 'relative') hdr.style.position = prevPos;
      else hdr.style.removeProperty('position');
    }
  }
}
