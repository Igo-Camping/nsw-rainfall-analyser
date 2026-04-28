export function csvEscape(val) {
  const s = String(val ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

export function csvRow(...vals) {
  return vals.map(csvEscape).join(',') + '\n';
}

export function csvSlug(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

export function autoFitSheet(ws) {
  const ref = ws['!ref'];
  if (!ref || typeof XLSX === 'undefined') return;
  const range = XLSX.utils.decode_range(ref);
  const widths = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    let maxLen = 10;
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const text = cell ? String(cell.v ?? '') : '';
      maxLen = Math.max(maxLen, Math.min(40, text.length + 2));
    }
    widths.push({ wch: maxLen });
  }
  ws['!cols'] = widths;
}
