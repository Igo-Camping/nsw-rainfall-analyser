export function setMode(mode, ctx) {
  ctx.setModeState(mode);
  ctx.document.getElementById('m-recent').classList.toggle('active', mode === 'recent');
  ctx.document.getElementById('m-custom').classList.toggle('active', mode === 'custom');
  ctx.document.getElementById('p-recent').style.display = mode === 'recent' ? '' : 'none';
  ctx.document.getElementById('p-custom').style.display = mode === 'custom' ? '' : 'none';
}

export function switchTab(tab, skipRun = false, ctx) {
  ctx.setCurrentTab(tab);
  ctx.document.querySelectorAll('.tab').forEach((el, index) => {
    el.classList.toggle('active', ['map','rainfall-totals','top-site','top-dur','daily','monitors'][index] === tab);
  });
  const leafletMap = ctx.document.getElementById('map');
  const rainfallTab = ctx.document.getElementById('tab-rainfall');
  if (tab === 'rainfall-totals') {
    leafletMap.style.display = 'none';
    rainfallTab.style.display = 'flex';
    ctx.document.getElementById('results').classList.remove('show');
  } else {
    rainfallTab.style.display = 'none';
    if (leafletMap.style.display === 'none') {
      leafletMap.style.display = '';
      setTimeout(() => ctx.map.invalidateSize(), 0);
    }
  }
  ctx.updateRecalcButton();
  if (tab === 'monitors') {
    ctx.loadOtherMonitors();
  } else if (!skipRun && ctx.getSelected()) {
    ctx.renderCachedCurrentTab();
  }
}

export function showLoad(text, ctx) {
  ctx.document.getElementById('load-txt').textContent = text;
  ctx.document.getElementById('loading').classList.add('show');
  ctx.document.body.classList.add('busy-ui');
}

export function setLoadTxt(text, ctx) {
  ctx.document.getElementById('load-txt').textContent = text;
}

export function hideLoad(ctx) {
  ctx.document.getElementById('loading').classList.remove('show');
  ctx.document.body.classList.remove('busy-ui');
}

export function closeResults(ctx) {
  const results = ctx.document.getElementById('results');
  results.classList.remove('show', 'no-rtabs');
  ctx.setResultsTabMode('map');
  ctx.setAllSiteResults(null);
}

export function switchPage(page, options = {}, ctx) {
  ctx.setCurrentPage(page);
  const flexPages = new Set(['home','aep']);
  ctx.pages.forEach(p => {
    const el = ctx.document.getElementById('page-' + p);
    if (!el) return;
    el.style.display = p === page ? (flexPages.has(p) ? 'flex' : '') : 'none';
  });
  ctx.document.getElementById('page-nav').style.display = page === 'home' ? 'none' : 'flex';
  ctx.document.querySelectorAll('.pnav-btn[data-page]').forEach(button =>
    button.classList.toggle('active', button.dataset.page === page));
  if (page === 'aep') {
    if (!ctx.isAepInited()) {
      ctx.setAepInited(true);
      ctx.init();
    }
    ctx.mapReadyPromise.then(() => setTimeout(() => ctx.map.invalidateSize(), 50));
  }
}

export function wireStartupControls(ctx) {
  ctx.switchPage('home');
  ctx.syncTheme();
}
