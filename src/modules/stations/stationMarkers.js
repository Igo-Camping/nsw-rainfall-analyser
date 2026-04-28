export function plotAllMarkers(stations, ctx) {
  stations.forEach(s => {
    const m = ctx.L.circleMarker([s.lat, s.lon], {
      radius: 5, color: 'white', weight: 1.5,
      interactive: true, bubblingMouseEvents: false,
      fillColor: '#00847F', fillOpacity: 0.85
    }).bindPopup(`<b>${ctx.escapeHtml(s.name)}</b><br><small>${ctx.escapeHtml(ctx.getLGA(s))}</small>`).bindTooltip(s.name,{
      permanent:true,
      interactive:true,
      direction: ['Great Mackerel Rain', 'Spit Bridge', 'Manly Dam', 'Allambie Heights', 'Middle Creek'].includes(s.name) ? 'left' : 'right',
      className:'station-label',
      offset:[['Great Mackerel Rain', 'Spit Bridge', 'Manly Dam', 'Allambie Heights', 'Middle Creek'].includes(s.name) ? -4 : 4,0]
    });
    async function doHover() {
      m.openPopup();
      const cached = ctx.wxCache[s.station_id];
      if (cached && (Date.now() - cached.ts) < 600000) { m.setPopupContent(cached.html); return; }
      m.setPopupContent(`<b>${s.name}</b><br><small>${ctx.getLGA(s)}</small><br><small style="color:#888">Loading\u2026</small>`);
      try {
        const [wxRes, rainRes] = await Promise.allSettled([
          ctx.fetchWeather(s.lat, s.lon),
          ctx.fetchRainfallSinceMidnight(s)
        ]);
        const wx = wxRes.status==='fulfilled' ? wxRes.value : null;
        const rain = rainRes.status==='fulfilled' ? rainRes.value : null;
        const html = `<b>${s.name}</b><br><small>${ctx.getLGA(s)}</small>`
          + (wx ? `<br><small>${ctx.tempIcon(wx.weather_code)} ${wx.temperature_c}\u00B0C &nbsp;Wind ${wx.wind_speed_kmh} km/h ${ctx.degToCompass(wx.wind_dir_deg)}<br>Rain ${rain!=null?rain.toFixed(1)+' mm':'-'} since midnight</small>` : '');
        ctx.wxCache[s.station_id] = { html, ts: Date.now() };
        m.setPopupContent(html);
      } catch(e) {}
    }
    function doSelect(evt) {
      if (evt?.originalEvent) ctx.L.DomEvent.stop(evt.originalEvent);
      ctx.selectStation(s.station_id);
    }
    function wireTooltipInteractions() {
      const el = m.getTooltip()?.getElement();
      if (!el || el.dataset.stationBound === '1') return;
      el.dataset.stationBound = '1';
      el.addEventListener('click', evt => {
        evt.preventDefault();
        evt.stopPropagation();
        ctx.selectStation(s.station_id);
      });
      el.addEventListener('mouseenter', doHover);
      el.addEventListener('mouseleave', () => m.closePopup());
    }
    m.on('click', doSelect);
    m.on('mousedown', doSelect);
    m.on('mouseover', doHover);
    m.on('mouseout', () => m.closePopup());
    m.on('tooltipopen', wireTooltipInteractions);
    m.on('add', wireTooltipInteractions);
    ctx.markers[s.station_id] = m;
  });
}

export function isBomRainGauge(gauge) {
  const element = String(gauge?.element || '').toLowerCase();
  const layer = String(gauge?.sourceLayer || '').toLowerCase();
  return element === 'rainfall' || element.includes('rainfall intensity') || layer.includes('rain gauge');
}

export function getBomRainfallMarkerColour(gauge) {
  const element = String(gauge?.element || '').toLowerCase();
  const layer = String(gauge?.sourceLayer || '').toLowerCase();
  if (layer.includes('rain gauge')) return '#00847F';
  if (layer.includes('river') || layer.includes('tide')) return '#2E86C1';
  if (element.includes('rainfall intensity')) return '#C0392B';
  if (element === 'rainfall') return '#F39C12';
  return '#60717D';
}

export function buildBomRainfallPopup(gauge, ctx) {
  return `<b>${ctx.escapeHtml(gauge.baseName || gauge.name)}</b><br>
    <small>${ctx.escapeHtml(gauge.element || 'BOM record')}</small><br>
    <small>${ctx.escapeHtml(gauge.source || 'BOM')}${gauge.agency ? ` \u00B7 ${ctx.escapeHtml(gauge.agency)}` : ''}</small><br>
    <small>${ctx.escapeHtml(ctx.getLGA(gauge))} \u00B7 ${gauge.lat.toFixed(5)}, ${gauge.lon.toFixed(5)}</small><br>
    <small style="color:#888">${ctx.bomIfdCache?.[gauge.ifdKey] ? 'IFD table available.' : 'IFD table unavailable.'} Live rainfall analysis remains on official gauges.</small>`;
}

export function plotBomRainfallMarkers(gauges, ctx) {
  gauges.forEach(gauge => {
    const marker = ctx.L.circleMarker([gauge.lat, gauge.lon], {
      radius: 5,
      color: 'white',
      weight: 1.5,
      interactive: true,
      bubblingMouseEvents: false,
      fillColor: '#1E88E5',
      fillOpacity: 0.85
    }).bindPopup(buildBomRainfallPopup(gauge, ctx))
      .bindTooltip(gauge.baseName || gauge.name, {
        permanent: true,
        interactive: true,
        direction: 'right',
        className: 'bom-label',
        offset: [4, 0]
      });
    async function doBomHover() {
      marker.openPopup();
      const cached = ctx.wxCache[gauge.station_id];
      if (cached && (Date.now() - cached.ts) < 600000) { marker.setPopupContent(cached.html); return; }
      marker.setPopupContent(buildBomRainfallPopup(gauge, ctx) + '<br><small style="color:#aaa">Loading conditions\u2026</small>');
      try {
        const [wxRes, rainRes] = await Promise.allSettled([
          ctx.fetchWeather(gauge.lat, gauge.lon),
          ctx.fetchRainfallSinceMidnight(gauge)
        ]);
        const wx = wxRes.status === 'fulfilled' ? wxRes.value : null;
        const rain = rainRes.status === 'fulfilled' ? rainRes.value : null;
        const condHtml = wx
          ? `<br><small>${ctx.tempIcon(wx.weather_code)} ${wx.temperature_c}\u00B0C \u00A0 Wind ${wx.wind_speed_kmh}\u00A0km/h ${ctx.degToCompass(wx.wind_dir_deg)}${rain != null ? `<br>Rain ${rain.toFixed(1)}\u00A0mm since midnight` : ''}</small>`
          : '<br><small style="color:#aaa">Current conditions unavailable</small>';
        const html = buildBomRainfallPopup(gauge, ctx) + condHtml;
        ctx.wxCache[gauge.station_id] = { html, ts: Date.now() };
        marker.setPopupContent(html);
      } catch(e) {}
    }
    function wireBomTooltip() {
      const el = marker.getTooltip()?.getElement();
      if (!el || el.dataset.stationBound === '1') return;
      el.dataset.stationBound = '1';
      el.addEventListener('click', evt => {
        evt.preventDefault(); evt.stopPropagation();
        ctx.selectStation(gauge.station_id);
      });
      el.addEventListener('mouseenter', doBomHover);
      el.addEventListener('mouseleave', () => marker.closePopup());
    }
    marker.on('click', evt => {
      if (evt?.originalEvent) ctx.L.DomEvent.stop(evt.originalEvent);
      ctx.selectStation(gauge.station_id);
    });
    marker.on('mouseover', doBomHover);
    marker.on('mouseout', () => marker.closePopup());
    marker.on('tooltipopen', wireBomTooltip);
    marker.on('add', wireBomTooltip);
    ctx.bomRainfallMarkers[gauge.station_id] = marker;
  });
}

export function setMarkerStyle(id, style, ctx) {
  const m = ctx.markers[id] || ctx.bomRainfallMarkers[id];
  if (!m) return;
  const station = ctx.findDisplayStationById(id);
  if (station?.isBomGauge && style === 'default') {
    m.setStyle({fillColor:'#1E88E5', radius:5, color:'white', weight:1.5, fillOpacity:0.85});
    return;
  }
  if (style === 'selected') m.setStyle({fillColor:'#1A2B3C', radius:8, weight:2, fillOpacity:0.9});
  else if (style === 'result') m.setStyle({fillColor:'#E74C3C', radius:7, weight:2});
  else m.setStyle({fillColor:'#00847F', radius:5, weight:1.5});
}

export function syncFilteredStationViews(stations, ctx) {
  const visibleIds = new Set(stations.map(s => s.station_id));
  ctx.renderList(stations);
  Object.entries(ctx.markers).forEach(([id, m]) => {
    if (visibleIds.has(id)) {
      if (!ctx.map.hasLayer(m)) m.addTo(ctx.map);
    } else if (ctx.map.hasLayer(m)) {
      ctx.map.removeLayer(m);
    }
  });
  Object.entries(ctx.bomRainfallMarkers).forEach(([id, m]) => {
    if (visibleIds.has(id)) {
      if (!ctx.map.hasLayer(m)) m.addTo(ctx.map);
    } else if (ctx.map.hasLayer(m)) {
      ctx.map.removeLayer(m);
    }
  });
}
