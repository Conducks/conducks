function initUI() {
  // 0. 🧬 COLLAPSE LOGIC
  const collapseBtn = document.getElementById('btn-collapse');
  const commandDeck = document.getElementById('command-deck');
  if (collapseBtn && commandDeck) {
    collapseBtn.addEventListener('click', () => {
      commandDeck.classList.toggle('collapsed');
    });
  }

  // 1. 🧬 DECK NAVIGATION
  const dockItems = document.querySelectorAll('.dock-item');
  dockItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetSlate = item.id.replace('dock-', 'slate-');
      if (!document.getElementById(targetSlate)) return;

      dockItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      document.querySelectorAll('.deck-content > div').forEach(slate => {
        slate.style.display = 'none';
        slate.classList.remove('slate-active');
      });
      const slateEl = document.getElementById(targetSlate);
      if (slateEl) {
        slateEl.style.display = 'block';
        slateEl.classList.add('slate-active');
      }

      if (item.id === 'dock-governance') {
        loadGovernance();
      }
    });
  });

  // 1b. 🛡️ GOVERNANCE PANEL
  async function loadGovernance() {
    const panel = document.getElementById('governance-panel');
    if (!panel) return;
    panel.innerHTML = '';

    let data;
    try {
      const resp = await fetch('/api/governance');
      data = await resp.json();
    } catch (err) {
      const errMsg = document.createElement('p');
      errMsg.textContent = 'Failed to load governance data.';
      errMsg.style.color = '#e53e3e';
      panel.appendChild(errMsg);
      return;
    }

    // Violations
    const violationsSection = document.createElement('section');
    violationsSection.className = 'deck-section';

    const violHeader = document.createElement('div');
    violHeader.className = 'section-header';
    const violTitle = document.createElement('span');
    violTitle.className = 'section-title';
    violTitle.textContent = 'Violations';
    const violBadge = document.createElement('div');
    violBadge.className = 'section-badge';
    violBadge.textContent = String(data.violations ? data.violations.length : 0);
    violHeader.appendChild(violTitle);
    violHeader.appendChild(violBadge);
    violationsSection.appendChild(violHeader);

    if (data.violations && data.violations.length > 0) {
      data.violations.forEach(v => {
        const item = document.createElement('div');
        item.className = 'metric-pill';
        item.style.marginBottom = '6px';
        item.style.display = 'flex';
        item.style.alignItems = 'flex-start';
        item.style.gap = '8px';
        item.style.padding = '10px 12px';

        const badge = document.createElement('span');
        const sev = v.severity ?? v.type ?? 'info';
        badge.textContent = sev;
        badge.style.background = sev === 'error' || sev === 'CIRCULAR' ? '#e53e3e' : sev === 'warning' || sev === 'REFACTOR' ? '#d69e2e' : '#4299e1';
        badge.style.color = 'white';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '4px';
        badge.style.fontSize = '9px';
        badge.style.fontWeight = '700';
        badge.style.textTransform = 'uppercase';
        badge.style.letterSpacing = '0.05em';
        badge.style.flexShrink = '0';

        const text = document.createElement('span');
        text.textContent = v.message ?? v.id ?? JSON.stringify(v);
        text.style.fontSize = '11px';
        text.style.lineHeight = '1.4';
        text.style.opacity = '0.8';
        text.style.wordBreak = 'break-all';

        item.appendChild(badge);
        item.appendChild(text);
        violationsSection.appendChild(item);
      });
    } else {
      const ok = document.createElement('p');
      ok.textContent = 'No violations detected.';
      ok.style.fontSize = '11px';
      ok.style.opacity = '0.5';
      ok.style.marginTop = '8px';
      violationsSection.appendChild(ok);
    }
    panel.appendChild(violationsSection);

    // Recommendations
    const recsSection = document.createElement('section');
    recsSection.className = 'deck-section';

    const recsHeader = document.createElement('div');
    recsHeader.className = 'section-header';
    const recsTitle = document.createElement('span');
    recsTitle.className = 'section-title';
    recsTitle.textContent = 'Recommendations';
    const recsBadge = document.createElement('div');
    recsBadge.className = 'section-badge';
    recsBadge.textContent = String(data.recommendations ? data.recommendations.length : 0);
    recsHeader.appendChild(recsTitle);
    recsHeader.appendChild(recsBadge);
    recsSection.appendChild(recsHeader);

    if (data.recommendations && data.recommendations.length > 0) {
      data.recommendations.slice(0, 20).forEach(r => {
        const item = document.createElement('div');
        item.className = 'metric-pill';
        item.style.marginBottom = '6px';
        item.style.display = 'flex';
        item.style.alignItems = 'flex-start';
        item.style.gap = '8px';
        item.style.padding = '10px 12px';

        const badge = document.createElement('span');
        badge.textContent = r.priority ?? r.severity ?? 'info';
        badge.style.background = '#805ad5';
        badge.style.color = 'white';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '4px';
        badge.style.fontSize = '9px';
        badge.style.fontWeight = '700';
        badge.style.textTransform = 'uppercase';
        badge.style.letterSpacing = '0.05em';
        badge.style.flexShrink = '0';

        const text = document.createElement('span');
        text.textContent = r.message ?? r.description ?? r.id ?? JSON.stringify(r);
        text.style.fontSize = '11px';
        text.style.lineHeight = '1.4';
        text.style.opacity = '0.8';
        text.style.wordBreak = 'break-all';

        item.appendChild(badge);
        item.appendChild(text);
        recsSection.appendChild(item);
      });
    } else {
      const ok = document.createElement('p');
      ok.textContent = 'No recommendations available.';
      ok.style.fontSize = '11px';
      ok.style.opacity = '0.5';
      ok.style.marginTop = '8px';
      recsSection.appendChild(ok);
    }
    panel.appendChild(recsSection);

    // Stats footer
    if (data.stats) {
      const statsSection = document.createElement('section');
      statsSection.className = 'deck-section';

      const statsTitle = document.createElement('p');
      statsTitle.className = 'text-dim';
      statsTitle.textContent = 'Audit Stats';
      statsTitle.style.fontSize = '9px';
      statsTitle.style.textTransform = 'uppercase';
      statsTitle.style.letterSpacing = '0.2em';
      statsTitle.style.fontWeight = '700';
      statsTitle.style.marginBottom = '8px';
      statsSection.appendChild(statsTitle);

      const grid = document.createElement('div');
      grid.className = 'grid grid-cols-2 gap-4';

      Object.entries(data.stats).forEach(([key, val]) => {
        const pill = document.createElement('div');
        pill.className = 'metric-pill';
        const label = document.createElement('p');
        label.className = 'metric-label';
        label.textContent = key.replace(/_/g, ' ');
        const value = document.createElement('span');
        value.className = 'metric-value';
        value.textContent = String(val);
        pill.appendChild(label);
        pill.appendChild(value);
        grid.appendChild(pill);
      });

      statsSection.appendChild(grid);
      panel.appendChild(statsSection);
    }
  }

  // 2. 🧬 LAYER FILTERS & EVENT DELEGATION
  const layerCtn = document.getElementById('layer-filters');
  if (layerCtn) {
    layerCtn.innerHTML = '';
    window.MirrorState.layers.forEach(l => {
      const item = document.createElement('div');
      item.className = 'filter-shield';
      item.style.setProperty('--shield-color', l.color);
      const meta = document.createElement('div');
      meta.className = 'filter-shield-meta';
      const title = document.createElement('span');
      title.className = 'filter-shield-title';
      title.textContent = l.name;
      meta.appendChild(title);

      const switchLabel = document.createElement('label');
      switchLabel.className = 'switch';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.layer = l.id;
      if (window.MirrorState.selectedLayers.includes(l.id)) checkbox.checked = true;
      const slider = document.createElement('span');
      slider.className = 'slider';
      switchLabel.appendChild(checkbox);
      switchLabel.appendChild(slider);

      item.appendChild(meta);
      item.appendChild(switchLabel);
      layerCtn.appendChild(item);
    });
    document.getElementById('layer-count').innerText = window.MirrorState.layers.length;

    // Delegation for Layers
    layerCtn.addEventListener('change', (e) => {
      if (e.target.dataset.layer) {
        const id = parseInt(e.target.dataset.layer);
        if (e.target.checked) {
          if (!window.MirrorState.selectedLayers.includes(id)) window.MirrorState.selectedLayers.push(id);
        } else {
          window.MirrorState.selectedLayers = window.MirrorState.selectedLayers.filter(l => l !== id);
        }
        // The Magic: Re-run Transitive Structural Contraction on the backend
        window.refreshSynapse();
      }
    });
  }

  // 3. 🔍 SEARCH & CLUSTER DELEGATION
  const clusterCtn = document.getElementById('cluster-filters');
  if (clusterCtn) {
    clusterCtn.addEventListener('change', (e) => {
      if (e.target.dataset.cluster) {
        const id = e.target.dataset.cluster;
        if (e.target.checked) {
          if (!window.MirrorState.selectedClusters.includes(id)) window.MirrorState.selectedClusters.push(id);
        } else {
          window.MirrorState.selectedClusters = window.MirrorState.selectedClusters.filter(c => c !== id);
        }
        // v3.0: Visual Highlight without restarting physics
        window.requestRedraw();
      }
    });
  }

  const searchInput = document.getElementById('origin-search');
  const clearSearchBtn = document.getElementById('btn-clear-search');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      
      // Toggle Clear Button
      if (clearSearchBtn) clearSearchBtn.style.display = q.length > 0 ? 'flex' : 'none';

      // Filter Sidebar Clusters
      document.querySelectorAll('.filter-shield[data-type="cluster"]').forEach(el => {
        el.style.display = el.innerText.toLowerCase().includes(q) ? 'flex' : 'none';
      });

      // v3.0: Trigger redraw to allow for future visual search tagging
      window.requestRedraw();
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = searchInput.value.toLowerCase();
        if (q.length > 1 && window.MirrorState.activeWave) {
          const match = window.MirrorState.activeWave.nodes.find(n => n.name.toLowerCase() === q) || 
                        window.MirrorState.activeWave.nodes.find(n => n.name.toLowerCase().startsWith(q));
          if (match) window.focusSubgraph(match);
        }
      }
      if (e.key === 'Escape') {
        clearSearch();
        searchInput.blur();
      }
    });

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        clearSearch();
        searchInput.focus();
      });
    }

    const clearSearch = () => {
      searchInput.value = '';
      if (clearSearchBtn) clearSearchBtn.style.display = 'none';
      document.querySelectorAll('.filter-shield[data-type="cluster"]').forEach(el => el.style.display = 'flex');
    };

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
    });
  }

  // 4. ⚙️ PHYSICS CONTROLS
  const updatePhysics = (id, force, isGravity = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById(id.replace('ctrl-', 'label-')).innerText = val.toFixed(isGravity ? 2 : 0);
      if (!isGravity) Graph.d3Force(force).strength(val);
      else window.applyForces();
      Graph.d3AlphaTarget(0.1).restart();
    });
  };

  updatePhysics('ctrl-repulsion', 'charge');
  updatePhysics('ctrl-gravity', null, true);
  
  document.getElementById('ctrl-spread')?.addEventListener('change', (e) => {
    document.getElementById('label-spread').innerText = e.target.value;
    window.refreshSynapse();
  });

  document.getElementById('btn-reset-physics')?.addEventListener('click', () => {
    const repulsion = -2000;
    const spread = 2000;
    Graph.d3Force('charge').strength(repulsion);
    document.getElementById('ctrl-repulsion').value = repulsion;
    document.getElementById('label-repulsion').innerText = repulsion;
    document.getElementById('ctrl-spread').value = spread;
    document.getElementById('label-spread').innerText = spread;
    window.refreshSynapse();
  });

  // 5. 🕹️ PRESETS
  const presetBtns = document.querySelectorAll('.preset-btn');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (preset === 'hubs') setPreset(-6000, 0.4, 2000);
      else if (preset === 'depth') setPreset(-1500, 0.1, 1000);
      else if (preset === 'atomic') setPreset(-400, 0.05, 600);
    });
  });

  const setPreset = (repulsion, gravity, spread) => {
     const ctrlRep = document.getElementById('ctrl-repulsion');
     const ctrlSpr = document.getElementById('ctrl-spread');
     if (ctrlRep) ctrlRep.value = repulsion;
     if (ctrlSpr) ctrlSpr.value = spread;
     document.getElementById('label-repulsion').innerText = repulsion;
     document.getElementById('label-spread').innerText = spread;
     window.refreshSynapse();
  };

  // 6. 🛠️ TRACE & GLOBAL
  document.getElementById('btn-clear-isolation')?.addEventListener('click', () => window.resetFocus());
  
  window.toggleSkeleton = (active) => {
    const inspector = document.getElementById('node-inspector');
    if (!inspector) return;
    if (active) inspector.classList.add('loading');
    else inspector.classList.add('active'), inspector.classList.remove('loading');
  };
}

function updateClusterUI(wave) {
  const clusterCtn = document.getElementById('cluster-filters');
  const countBadge = document.getElementById('cluster-count');
  const currentQ = document.getElementById('origin-search')?.value?.toLowerCase() || '';
  if (!clusterCtn) return;
  clusterCtn.innerHTML = '';

  if (countBadge) countBadge.innerText = wave.clusters.length;

  const sortedClusters = [...wave.clusters].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 50);

  sortedClusters.forEach(c => {
    const item = document.createElement('div');
    item.className = 'filter-shield';
    item.dataset.type = 'cluster';
    item.style.setProperty('--shield-color', c.color);
    if (currentQ && !c.name.toLowerCase().includes(currentQ)) item.style.display = 'none';
    
    const clMeta = document.createElement('div');
    clMeta.className = 'filter-shield-meta';
    const clTitle = document.createElement('span');
    clTitle.className = 'filter-shield-title';
    clTitle.textContent = c.name;
    const clCount = document.createElement('span');
    clCount.className = 'filter-shield-count';
    clCount.textContent = String(c.count || 0);
    clMeta.appendChild(clTitle);
    clMeta.appendChild(clCount);

    const clSwitch = document.createElement('label');
    clSwitch.className = 'switch';
    const clCheckbox = document.createElement('input');
    clCheckbox.type = 'checkbox';
    clCheckbox.dataset.cluster = c.id;
    if (window.MirrorState.selectedClusters.includes(c.id)) clCheckbox.checked = true;
    const clSlider = document.createElement('span');
    clSlider.className = 'slider';
    clSwitch.appendChild(clCheckbox);
    clSwitch.appendChild(clSlider);

    item.appendChild(clMeta);
    item.appendChild(clSwitch);
    clusterCtn.appendChild(item);
  });
}

window.updateClusterUI = updateClusterUI;
document.addEventListener('DOMContentLoaded', initUI);
