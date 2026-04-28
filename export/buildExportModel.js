// buildExportModel()
// Canonical export data builder — all exporters (CSV, XLSX, PNG, PDF) must call this
// and consume its output. No sorting or ranking logic belongs in the exporters.
//
// Reads from global state at call time. All referenced variables (lastResults,
// lastTopDurResults, lastDailyData, topSiteResultsCache, topSiteSort, selected,
// currentTab, DUR_LABELS, aepToARI, getSortedTopSiteResults) are defined in the
// main index.html script scope.
//
// Unsourced fields (no current state source): set to null.
//   - settings.selectedDurations  (no duration-filter UI; ALL_DURATIONS is a constant)
//   - settings.sourceOptions       (undefined concept in current codebase)
//
// topSiteResults is added beyond the original spec shape to provide coverage for the
// Top Intensity Per Site mode (spec shape had no field for multi-station results).

function buildExportModel() {

  // ── station ────────────────────────────────────────────────────────────────
  const station = selected ? {
    id:     selected.station_id,
    name:   selected.name,
    source: selected.source  ?? null,
    lga:    selected.lga     ?? null,
    region: selected.region  ?? null,
    lat:    selected.lat     ?? null,
    lon:    selected.lon     ?? null
  } : null;

  // ── event ──────────────────────────────────────────────────────────────────
  const event = lastResults ? {
    start:           lastResults.from,
    end:             lastResults.to,
    durationHours:   (new Date(lastResults.to) - new Date(lastResults.from)) / 3_600_000,
    totalDepthMm:    lastResults.rolling_max?.total_depth_mm ?? null,
    readingsCount:   lastResults.readings?.length            ?? null,
    intervalMinutes: lastResults.intervalMinutes             ?? null
  } : null;

  // ── peak ───────────────────────────────────────────────────────────────────
  const peak = lastResults ? (() => {
    const rm     = lastResults.rolling_max;
    const aepObj = lastResults.aep;
    const aepStr = aepObj?.aep ?? null;
    return {
      durationLabel: lastResults.durationLabel ??
        (DUR_LABELS[lastResults.duration_minutes] || lastResults.duration_minutes + ' min'),
      depthMm:    rm?.max_depth_mm  ?? null,
      start:      rm?.peak_start    ?? null,
      end:        rm?.peak_end      ?? null,
      aepPercent: aepStr,
      ariText:    aepToARI(aepObj || aepStr || ''),
      ariYears:   aepObj?.ari       ?? null
    };
  })() : null;

  // ── summaryCards — verbatim mirror of on-screen cards ─────────────────────
  const summaryCards = lastResults ? (() => {
    const rm       = lastResults.rolling_max;
    const aepObj   = lastResults.aep;
    const durLabel = DUR_LABELS[lastResults.duration_minutes] ||
                     lastResults.duration_minutes + ' min';
    const intLabel = (lastResults.intervalMinutes ?? 5) + '-min intervals';
    return [
      { label: 'Peak Depth',  value: rm?.max_depth_mm  ?? null, unit: 'mm', subtext: durLabel + ' rolling max' },
      { label: 'Total Depth', value: rm?.total_depth_mm ?? null, unit: 'mm', subtext: 'Event total' },
      { label: 'ARI',         value: aepToARI(aepObj || aepObj?.aep || ''), unit: null, subtext: 'Return period' },
      { label: 'Readings',    value: rm?.reading_count  ?? null, unit: null, subtext: intLabel }
    ];
  })() : [];

  // ── durationResults — All Durations tab, AEP-ascending (matches renderTopDurations) ──
  const durationResults = (() => {
    const raw    = lastTopDurResults?.results || [];
    const sorted = [...raw].sort((a, b) => {
      const pa = parseFloat((a.aep?.aep || '100').replace(/[~<>%]/g, ''));
      const pb = parseFloat((b.aep?.aep || '100').replace(/[~<>%]/g, ''));
      return pa - pb;
    });
    return sorted.map((r, i) => {
      const rm     = r.rolling_max;
      const aepStr = r.aep?.aep || (rm?.max_depth_mm > 0 ? 'IFD unavailable' : '>63.2%');
      return {
        displayOrder:    i + 1,
        durationLabel:   DUR_LABELS[r.duration_minutes] || r.duration_minutes + ' min',
        durationMinutes: r.duration_minutes,
        depthMm:         rm?.max_depth_mm ?? null,
        aepPercent:      aepStr,
        ariText:         aepToARI(r.aep || aepStr),
        ariYears:        r.aep?.ari        ?? null,
        windowStart:     rm?.peak_start    ?? null,
        windowEnd:       rm?.peak_end      ?? null,
        isPeak:          r.duration_minutes === lastResults?.duration_minutes
      };
    });
  })();

  // ── topSiteResults — Top Intensity Per Site, current topSiteSort order
  //    (getSortedTopSiteResults() implements the identical comparator to renderTopPerSite)
  const topSiteResults = getSortedTopSiteResults().map((r, i) => {
    const rm     = r.rolling_max;
    const aepStr = r.aep?.aep || (rm?.max_depth_mm > 0 ? 'IFD unavailable' : '>63.2%');
    return {
      displayOrder:    i + 1,
      stationId:       r.station_id,
      stationName:     r.station_name,
      durationLabel:   DUR_LABELS[r.duration_minutes] || r.duration_minutes + ' min',
      durationMinutes: r.duration_minutes,
      depthMm:         rm?.max_depth_mm   ?? null,
      totalDepthMm:    rm?.total_depth_mm ?? null,
      aepPercent:      aepStr,
      ariText:         aepToARI(r.aep || aepStr),
      ariYears:        r.aep?.ari         ?? null,
      windowStart:     rm?.peak_start     ?? null,
      windowEnd:       rm?.peak_end       ?? null
    };
  });

  // ── dailyTotals — chronological, matching renderDailyTotals ───────────────
  const dailyTotals = (() => {
    if (!lastDailyData?.readings?.length) return [];
    const byDay = {};
    lastDailyData.readings.forEach(r => {
      const day = new Date(r.timestamp.replace(' ', 'T'))
        .toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
      if (!byDay[day]) byDay[day] = 0;
      byDay[day] += r.value;
    });
    const days      = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
    const peakDay   = days.reduce((best, cur) => !best || cur[1] > best[1] ? cur : best, null);
    const highlight = lastDailyData.highlightDay || peakDay?.[0] || null;
    return days.map(([day, total], i) => ({
      displayOrder: i + 1,
      date:    day,
      label:   new Date(day + 'T00:00:00').toLocaleDateString('en-AU',
        { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }),
      depthMm: Math.round(total * 100) / 100,
      isPeak:  day === highlight
    }));
  })();

  // ── intervalReadings — cumulative computed inline ─────────────────────────
  const intervalReadings = (() => {
    let cum = 0;
    return (lastResults?.readings || []).map(r => {
      cum += r.value || 0;
      return {
        timestamp:         r.timestamp,
        depthMm:           r.value,
        cumulativeDepthMm: Math.round(cum * 1000) / 1000
      };
    });
  })();

  // ── settings ──────────────────────────────────────────────────────────────
  const isTopSite = currentTab === 'top-site';
  const settings = {
    selectedDurations: null,
    sortMode: isTopSite ? { ...topSiteSort } : null,
    filters: isTopSite ? {
      lga:    document.getElementById('lgaSel')?.value  || null,
      search: document.getElementById('search')?.value  || null,
      nbcSub: document.getElementById('nbcSub')?.value  || null
    } : null,
    sourceOptions: null
  };

  return {
    generatedAt:      new Date().toISOString(),
    appName:          'Stormgauge Rainfall Analysis',
    station,
    event,
    peak,
    summaryCards,
    durationResults,
    topSiteResults,
    dailyTotals,
    intervalReadings,
    settings
  };
}
