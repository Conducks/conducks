function initUI() {
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
    });
  });

  // 2. 🧬 LAYER FILTERS & EVENT DELEGATION
  const layerCtn = document.getElementById('layer-filters');
  if (layerCtn) {
    layerCtn.innerHTML = '';
    window.MirrorState.layers.forEach(l => {
      const item = document.createElement('div');
      item.className = 'filter-shield';
      item.style.setProperty('--shield-color', l.color);
      item.innerHTML = `
        <div class="filter-shield-meta">
          <span class="filter-shield-title">${l.name}</span>
        </div>
        <label class="switch">
          <input type="checkbox" data-layer="${l.id}" ${window.MirrorState.selectedLayers.includes(l.id) ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      `;
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
        // v3.0: Instant Zero-Restart Refresh
        window.requestRedraw();
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
    
    item.innerHTML = `
      <div class="filter-shield-meta">
        <span class="filter-shield-title">${c.name}</span>
        <span class="filter-shield-count">${c.count || 0}</span>
      </div>
      <label class="switch">
        <input type="checkbox" data-cluster="${c.id}" ${window.MirrorState.selectedClusters.includes(c.id) ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    `;
    clusterCtn.appendChild(item);
  });
}

window.updateClusterUI = updateClusterUI;
document.addEventListener('DOMContentLoaded', initUI);
