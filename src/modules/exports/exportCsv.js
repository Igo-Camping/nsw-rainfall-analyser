import { buildExportModel } from './buildExportModel.js';

export function exportCSV() {
  const model = buildExportModel();
  const now   = new Date();
  const tsDisplay = now.toLocaleString('en-AU');
  const pad = n => String(n).padStart(2, '0');
  const tsFile = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

  let csv = '', filename = '';

  if (currentTab === 'top-site' && model.topSiteResults.length) {
    const lga    = model.settings.filters?.lga  || 'All stations';
    const search = model.settings.filters?.search || '';
    const sort   = model.settings.sortMode
      ? `${model.settings.sortMode.key} ${model.settings.sortMode.dir}` : '';

    csv += csvRow('Export Type',   'Top Intensity Per Site');
    csv += csvRow('Generated',     tsDisplay);
    csv += csvRow('Area / LGA',    lga);
    if (search) csv += csvRow('Search filter', search);
    if (sort)   csv += csvRow('Sort',          sort);
    csv += csvRow('Stations',      model.topSiteResults.length);
    csv += '\n';
    csv += csvRow('Rank', 'Station', 'Best Duration',
                  'Peak Depth (mm)', 'Total Depth (mm)',
                  'AEP', 'Return Period', 'Peak Start');
    model.topSiteResults.forEach(r => {
      csv += csvRow(r.displayOrder, r.stationName, r.durationLabel,
                    r.depthMm ?? '', r.totalDepthMm ?? '',
                    r.aepPercent ?? '', r.ariText, r.windowStart ?? '');
    });
    filename = `stormgauge_top-intensity_${csvSlug(lga)}_${tsFile}.csv`;

  } else if (currentTab === 'top-dur' && model.durationResults.length) {
    csv += csvRow('Export Type', 'All Durations');
    csv += csvRow('Generated',   tsDisplay);
    if (model.station) {
      csv += csvRow('Station',    model.station.name   ?? '');
      csv += csvRow('Station ID', model.station.id     ?? '');
      csv += csvRow('Source',     model.station.source ?? '');
    }
    if (model.event) {
      csv += csvRow('Event Start', model.event.start ?? '');
      csv += csvRow('Event End',   model.event.end   ?? '');
    }
    csv += '\n';
    csv += csvRow('Rank', 'Duration', 'Peak Depth (mm)',
                  'AEP', 'Return Period',
                  'Window Start', 'Window End', 'Is Peak Duration');
    model.durationResults.forEach(r => {
      csv += csvRow(r.displayOrder, r.durationLabel, r.depthMm ?? '',
                    r.aepPercent ?? '', r.ariText,
                    r.windowStart ?? '', r.windowEnd ?? '',
                    r.isPeak ? 'Yes' : '');
    });
    filename = `stormgauge_all-durations_${csvSlug(model.station?.name)}_${tsFile}.csv`;

  } else if (currentTab === 'daily' && model.dailyTotals.length) {
    csv += csvRow('Export Type', 'Daily Totals');
    csv += csvRow('Generated',   tsDisplay);
    if (model.station) {
      csv += csvRow('Station',    model.station.name   ?? '');
      csv += csvRow('Station ID', model.station.id     ?? '');
      csv += csvRow('Source',     model.station.source ?? '');
    }
    if (model.event) {
      csv += csvRow('Event Start', model.event.start ?? '');
      csv += csvRow('Event End',   model.event.end   ?? '');
    }
    csv += '\n';
    csv += csvRow('Date', 'Day', 'Total Depth (mm)', 'Peak Day');
    model.dailyTotals.forEach(r => {
      csv += csvRow(r.date, r.label, r.depthMm, r.isPeak ? 'Yes' : '');
    });
    filename = `stormgauge_daily-totals_${csvSlug(model.station?.name)}_${tsFile}.csv`;

  } else if (model.intervalReadings.length) {
    csv += csvRow('Export Type', 'Rainfall Readings');
    csv += csvRow('Generated',   tsDisplay);
    if (model.station) {
      csv += csvRow('Station',    model.station.name   ?? '');
      csv += csvRow('Station ID', model.station.id     ?? '');
      csv += csvRow('Source',     model.station.source ?? '');
    }
    if (model.peak) {
      csv += csvRow('AEP',              model.peak.aepPercent   ?? '');
      csv += csvRow('Return Period',    model.peak.ariText      ?? '');
      csv += csvRow('Peak Duration',    model.peak.durationLabel ?? '');
      csv += csvRow('Peak Depth (mm)',  model.peak.depthMm      ?? '');
      csv += csvRow('Total Depth (mm)', model.event?.totalDepthMm ?? '');
    }
    if (model.event) {
      csv += csvRow('Event Start', model.event.start ?? '');
      csv += csvRow('Event End',   model.event.end   ?? '');
    }
    csv += '\n';
    csv += csvRow('Timestamp', 'Depth (mm)', 'Cumulative Depth (mm)');
    model.intervalReadings.forEach(r => {
      csv += csvRow(r.timestamp, r.depthMm, r.cumulativeDepthMm);
    });
    filename = `stormgauge_rainfall-readings_${csvSlug(model.station?.name)}_${tsFile}.csv`;
  }

  if (!csv) { alert('No data to export. Run an analysis first.'); return; }

  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
