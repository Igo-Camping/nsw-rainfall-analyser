import { buildExportModel } from './buildExportModel.js';
import { csvSlug, autoFitSheet } from './exportHelpers.js';

export function exportXLSX() {
  if (typeof XLSX === 'undefined') { alert('Excel export library did not load.'); return; }
  // xlsx-js-style may expose itself either as XLSXStyle or by replacing window.XLSX.
  // Treat the loaded workbook writer as style-capable and always attach style objects.
  const XS     = window.XLSXStyle || window.XLSX;
  const styled = true;

  const m = buildExportModel();
  if (!m.event && !m.topSiteResults.length) {
    alert('No results to export. Run an analysis first.'); return;
  }

  const wb  = XS.utils.book_new();
  const pad = n => String(n).padStart(2, '0');
  const fmtTs = ts => ts ? String(ts).replace('T', ' ').slice(0, 16) : '';

  // ── Stormgauge palette ───────────────────────────────────────────────────
  const P = {
    bg1:'050D16', bg2:'0D1826', bg3:'0B1824', bg4:'0C1A28',
    teal:'00C4BE', text:'DCE8F2', mid:'8AAFC8', dim:'3E5E76', bdr:'1C2E40'
  };
  const mk = (fg, fontRgb, bold, sz) => ({
    fill: { patternType:'solid', fgColor:{ rgb:fg } },
    font: { sz: sz||10, bold:!!bold, color:{ rgb:fontRgb } }
  });
  const S = styled ? {
    title:  mk(P.bg1, P.teal, true,  16),
    info:   mk(P.bg1, P.mid,  false, 10),
    sec:    { fill:{ patternType:'solid', fgColor:{ rgb:P.bg3 } }, font:{ sz:9, bold:true, color:{ rgb:P.dim } }, border:{ top:{ style:'thin', color:{ rgb:P.bdr } } } },
    colHdr: mk(P.bg3, P.mid,  true,   9),
    data:   mk(P.bg2, P.text, false, 10),
    dataAlt:mk(P.bg4, P.text, false, 10),
    hi:     mk('06251F', P.teal, true,  10),
    lbl:    mk(P.bg2, P.dim,  false,  9),
    blank:  mk(P.bg2, P.bg2,  false,  9)
  } : {};

  // ── Cell setters ─────────────────────────────────────────────────────────
  const NCOLS = 8;
  const enc   = (r, c) => XS.utils.encode_cell({ r, c });
  const setS  = (ws, r, c, v, s) => { ws[enc(r,c)] = { v:String(v??''), t:'s', s: styled ? s : undefined }; };
  const setN  = (ws, r, c, v, s) => { ws[enc(r,c)] = { v:v==null?0:Number(v), t:'n', s: styled ? s : undefined }; };
  const setAny = (ws, r, c, v, s) => typeof v === 'number' ? setN(ws,r,c,v,s) : setS(ws,r,c,String(v??''),s);
  const fill  = (ws, r, fromC, s) => {
    for (let c = fromC; c < NCOLS; c++) if (!ws[enc(r,c)]) setS(ws, r, c, '', s);
  };

  // ── 1. Report sheet ───────────────────────────────────────────────────────
  function buildReportSheet() {
    const ws = {};
    let r = 0;

    // Title block
    setS(ws, r, 0, 'STORMGAUGE RAINFALL ANALYSIS', S.title); fill(ws, r, 1, S.title); r++;
    const stName = m.station?.name || m.topSiteResults[0]?.stationName || '';
    setS(ws, r, 0, `Generated: ${m.generatedAt.slice(0,10)} ${m.generatedAt.slice(11,19)} UTC`, S.info);
    setS(ws, r, 4, `Station: ${stName}`, S.info);
    setS(ws, r, 6, `Source: ${(m.station?.source||'').toUpperCase()}`, S.info);
    fill(ws, r, 0, S.info); r++;
    if (m.station?.lga) { setS(ws,r,0,`LGA: ${m.station.lga}`,S.info); fill(ws,r,1,S.info); r++; }
    if (m.event) {
      setS(ws,r,0,`Event: ${fmtTs(m.event.start)} → ${fmtTs(m.event.end)}`,S.info);
      setS(ws,r,5,`Duration: ${m.event.durationHours?.toFixed(1)} h  |  Readings: ${m.event.readingsCount??''}`,S.info);
      fill(ws,r,0,S.info); r++;
    }
    fill(ws, r, 0, S.blank); r++; // spacer

    // Summary cards
    setS(ws,r,0,'SUMMARY',S.sec); fill(ws,r,1,S.sec); r++;
    if (m.summaryCards.length) {
      m.summaryCards.forEach((c,i) => setS(ws,r,i,`${c.label}${c.unit?' ('+c.unit+')':''}`,S.colHdr));
      fill(ws,r,m.summaryCards.length,S.colHdr); r++;
      m.summaryCards.forEach((c,i) => setS(ws,r,i,c.value!=null?String(c.value):'—',S.hi));
      fill(ws,r,m.summaryCards.length,S.hi); r++;
      m.summaryCards.forEach((c,i) => setS(ws,r,i,c.subtext||'',S.lbl));
      fill(ws,r,m.summaryCards.length,S.lbl); r++;
    }
    fill(ws, r, 0, S.blank); r++;

    // Peak analysis
    if (m.peak) {
      setS(ws,r,0,'PEAK ANALYSIS',S.sec); fill(ws,r,1,S.sec); r++;
      ['Duration','Peak (mm)','AEP','ARI','ARI (yrs)','Window Start','Window End']
        .forEach((h,i) => setS(ws,r,i,h,S.colHdr));
      fill(ws,r,7,S.colHdr); r++;
      [m.peak.durationLabel,m.peak.depthMm,m.peak.aepPercent,m.peak.ariYears,m.peak.ariText,fmtTs(m.peak.start),fmtTs(m.peak.end)]
        .forEach((v,i) => setAny(ws,r,i,v,(i===1||i===2)?S.hi:S.data));
      fill(ws,r,7,S.data); r++;
      fill(ws,r,0,S.blank); r++;
    }

    // All Durations
    if (m.durationResults.length) {
      setS(ws,r,0,'ALL DURATIONS',S.sec); fill(ws,r,1,S.sec); r++;
      ['Duration','Min','Peak (mm)','AEP','ARI','Window Start','Window End','Peak?']
        .forEach((h,i) => setS(ws,r,i,h,S.colHdr));
      r++;
      m.durationResults.forEach(d => {
        const s = d.isPeak ? S.hi : S.data;
        [d.durationLabel,d.durationMinutes,d.depthMm,d.aepPercent,d.ariText,fmtTs(d.windowStart),fmtTs(d.windowEnd),d.isPeak?'Yes':'']
          .forEach((v,i) => setAny(ws,r,i,v,s));
        fill(ws,r,8,s); r++;
      });
      fill(ws,r,0,S.blank); r++;
    }

    // Top Intensity Per Site
    if (m.topSiteResults.length) {
      setS(ws,r,0,'TOP INTENSITY PER SITE',S.sec); fill(ws,r,1,S.sec); r++;
      ['Rank','Station','Duration','Peak (mm)','Total (mm)','AEP','ARI','Window']
        .forEach((h,i) => setS(ws,r,i,h,S.colHdr));
      r++;
      m.topSiteResults.forEach(t => {
        const s = t.displayOrder===1 ? S.hi : S.data;
        [t.displayOrder,t.stationName,t.durationLabel,t.depthMm,t.totalDepthMm,t.aepPercent,t.ariText,fmtTs(t.windowStart)]
          .forEach((v,i) => setAny(ws,r,i,v,s));
        fill(ws,r,8,s); r++;
      });
    }

    ws['!ref']  = XS.utils.encode_range({ s:{ r:0, c:0 }, e:{ r:Math.max(r,1), c:NCOLS-1 } });
    ws['!cols'] = [{ wch:28 },{ wch:16 },{ wch:12 },{ wch:10 },{ wch:14 },{ wch:20 },{ wch:20 },{ wch:16 }];
    ws['!rows'] = [{ hpt:28 }];
    return ws;
  }
  XS.utils.book_append_sheet(wb, buildReportSheet(), 'Report');

  // ── Helper: clean data sheet with frozen header + auto-sized columns ──────
  const dataSheet = (headers, rows, peakColumnName = null) => {
    const ws = XS.utils.aoa_to_sheet([headers, ...rows]);
    const ref = ws['!ref'];
    if (ref) {
      const range = XS.utils.decode_range(ref);
      const peakCol = peakColumnName ? headers.indexOf(peakColumnName) : -1;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XS.utils.encode_cell({ r: 0, c })];
        if (cell) cell.s = S.colHdr;
      }
      for (let rr = 1; rr <= range.e.r; rr++) {
        const isPeak = peakCol >= 0 && String(ws[XS.utils.encode_cell({ r: rr, c: peakCol })]?.v || '').toLowerCase() === 'yes';
        const rowStyle = isPeak ? S.hi : (rr % 2 === 0 ? S.dataAlt : S.data);
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XS.utils.encode_cell({ r: rr, c })];
          if (cell) cell.s = rowStyle;
        }
      }
      ws['!autofilter'] = { ref };
    }
    ws['!freeze'] = { xSplit:0, ySplit:1 };
    autoFitSheet(ws);
    return ws;
  };

  // ── 2. Summary ────────────────────────────────────────────────────────────
  XS.utils.book_append_sheet(wb,
    dataSheet(
      ['Metric','Value','Unit','Subtext'],
      m.summaryCards.map(c => [c.label, c.value??'', c.unit??'', c.subtext??''])
    ), 'Summary');

  // ── 3. Top Intensity Per Site ─────────────────────────────────────────────
  XS.utils.book_append_sheet(wb,
    dataSheet(
      ['Rank','Station','Duration','Duration (min)','Peak (mm)','Total Depth (mm)','AEP','ARI','ARI (years)','Window Start','Window End'],
      m.topSiteResults.map(t => [
        t.displayOrder, t.stationName, t.durationLabel, t.durationMinutes,
        t.depthMm, t.totalDepthMm, t.aepPercent, t.ariText, t.ariYears,
        fmtTs(t.windowStart), fmtTs(t.windowEnd)
      ])
    ), 'Top Intensity Per Site');

  // ── 4. All Durations ──────────────────────────────────────────────────────
  XS.utils.book_append_sheet(wb,
    dataSheet(
      ['Rank','Duration','Duration (min)','Peak (mm)','AEP','ARI','ARI (years)','Window Start','Window End','Is Peak'],
      m.durationResults.map(d => [
        d.displayOrder, d.durationLabel, d.durationMinutes, d.depthMm,
        d.aepPercent, d.ariText, d.ariYears,
        fmtTs(d.windowStart), fmtTs(d.windowEnd), d.isPeak?'Yes':''
      ]),
      'Is Peak'
    ), 'All Durations');

  // ── 5. Daily Totals ───────────────────────────────────────────────────────
  XS.utils.book_append_sheet(wb,
    dataSheet(
      ['Date','Day','Depth (mm)','Is Peak Day'],
      m.dailyTotals.map(d => [d.date, d.label, d.depthMm, d.isPeak?'Yes':'']),
      'Is Peak Day'
    ), 'Daily Totals');

  // ── 6. Interval Data ──────────────────────────────────────────────────────
  XS.utils.book_append_sheet(wb,
    dataSheet(
      ['Timestamp','Depth (mm)','Cumulative (mm)'],
      m.intervalReadings.map(rd => [rd.timestamp, rd.depthMm, rd.cumulativeDepthMm])
    ), 'Interval Data');

  // ── 7. Metadata ───────────────────────────────────────────────────────────
  XS.utils.book_append_sheet(wb,
    dataSheet(
      ['Field','Value'],
      [
        ['App',              m.appName],
        ['Generated',        m.generatedAt],
        ['Station ID',       m.station?.id        ?? ''],
        ['Station Name',     m.station?.name      ?? ''],
        ['Source',           m.station?.source    ?? ''],
        ['LGA',              m.station?.lga       ?? ''],
        ['Region',           m.station?.region    ?? ''],
        ['Latitude',         m.station?.lat       ?? ''],
        ['Longitude',        m.station?.lon       ?? ''],
        ['Event Start',      m.event?.start       ?? ''],
        ['Event End',        m.event?.end         ?? ''],
        ['Duration (h)',     m.event?.durationHours ?? ''],
        ['Total Depth (mm)', m.event?.totalDepthMm  ?? ''],
        ['Readings Count',   m.event?.readingsCount ?? ''],
        ['Interval (min)',   m.event?.intervalMinutes ?? ''],
        ['Sort Mode',        m.settings?.sortMode ? JSON.stringify(m.settings.sortMode) : ''],
        ['Filters',          m.settings?.filters  ? JSON.stringify(m.settings.filters)  : '']
      ]
    ), 'Metadata');

  // Workbook metadata and tab colours
  wb.Props = {
    Title: 'Stormgauge Rainfall Analysis Report',
    Subject: 'Rainfall AEP analysis export',
    Author: 'Pluviometrics Stormgauge',
    Company: 'Pluviometrics',
    CreatedDate: new Date()
  };
  wb.Workbook = wb.Workbook || {};
  wb.Workbook.Sheets = (wb.SheetNames || []).map((name, i) => ({ name, Hidden: 0, TabColor: { rgb: i === 0 ? P.teal : P.bg3 } }));

  // ── Download ──────────────────────────────────────────────────────────────
  const now = new Date();
  const tsFile = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const slug = csvSlug(m.station?.name ?? (m.topSiteResults[0]?.stationName ?? ''));
  XS.writeFile(wb, `stormgauge_report${slug?'_'+slug:''}_${tsFile}.xlsx`);
}
