/**
 * Conducks Mirror — UI Controller (v2.5.0) 💎 🏺
 * Event Listeners & High-Definition Interaction Logic
 */

function initUI() {
  // 1. 🧱 DOCK NAVIGATION
  const dockItems = document.querySelectorAll('.dock-item');
  dockItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetSlate = item.id.replace('dock-', 'slate-');
      
      // Update Dock state
      dockItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Update Slate state
      document.querySelectorAll('#command-viewport > div').forEach(slate => {
        slate.style.display = 'none';
      });
      const slateEl = document.getElementById(targetSlate);
      if (slateEl) slateEl.style.display = 'block';
    });
  });

  // 2. 🧬 LAYER FILTERS
  const layerCtn = document.getElementById('layer-filters');
  window.MirrorState.layers.forEach(l => {
    const item = document.createElement('div');
    item.className = 'flex justify-between items-center';
    item.innerHTML = `
      <span class="text-xs text-dim">${l.name}</span>
      <label class="switch">
        <input type="checkbox" data-layer="${l.id}" ${window.MirrorState.selectedLayers.includes(l.id) ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    `;
    layerCtn.appendChild(item);
  });

  // 3. 🔍 SEARCH & DISCOVERY
  const searchInput = document.getElementById('origin-search');
  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    
    // Filter Cluster UI
    document.querySelectorAll('.cluster-item').forEach(el => {
      el.style.display = el.innerText.toLowerCase().includes(q) ? 'flex' : 'none';
    });

    // Zoom to first match if high confidence
    if (q.length > 2 && window.MirrorState.activeWave) {
      const match = window.MirrorState.activeWave.nodes.find(n => n.name.toLowerCase().startsWith(q));
      if (match) {
        window.focusSubgraph(match);
      }
    }
  });

  // 4. ⚙️ PHYSICS CONTROLS
  const updatePhysics = (id, force, isGravity = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById(id.replace('ctrl-', 'label-')).innerText = val.toFixed(isGravity ? 2 : 0);
      if (isGravity) {
        window.applyForces();
      } else {
        Graph.d3Force(force).strength(val);
      }
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
    Graph.d3Force('charge').strength(-2000);
    document.getElementById('ctrl-repulsion').value = -2000;
    document.getElementById('label-repulsion').innerText = -2000;
    window.refreshSynapse();
  });

  // 5. 🕹️ PRESETS (Apostolic Modes)
  const setPreset = (repulsion, gravity, spread) => {
     document.getElementById('ctrl-repulsion').value = repulsion;
     document.getElementById('label-repulsion').innerText = repulsion;
     document.getElementById('ctrl-gravity').value = gravity;
     document.getElementById('label-gravity').innerText = gravity.toFixed(2);
     document.getElementById('ctrl-spread').value = spread;
     document.getElementById('label-spread').innerText = spread;
     window.applyForces();
     window.refreshSynapse();
  };

  const presetBtns = document.querySelectorAll('.action-btn, .action-btn-hd');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.innerText;
      if (text.includes('Hubs')) setPreset(-6000, 0.4, 2000);
      else if (text.includes('Depth')) setPreset(-1500, 0.1, 1000);
      else if (text.includes('Atomic')) setPreset(-400, 0.05, 600);
    });
  });

  // 6. 🛠️ TRACE & GLOBAL
  document.getElementById('btn-clear-isolation').addEventListener('click', () => window.resetFocus());
  
  // Selection Logic for Node Detail Blade (v2.7.0)
  window.toggleSkeleton = (active) => {
    const inspector = document.getElementById('node-inspector');
    if (!inspector) return;
    if (active) inspector.classList.add('loading');
    else inspector.classList.add('active'), inspector.classList.remove('loading');
  };
}

function updateClusterUI(wave) {
  const clusterCtn = document.getElementById('cluster-filters');
  const currentQ = document.getElementById('origin-search')?.value?.toLowerCase() || '';
  if (!clusterCtn) return;
  clusterCtn.innerHTML = '';

  const sortedClusters = [...wave.clusters].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 50);

  sortedClusters.forEach(c => {
    const item = document.createElement('div');
    item.className = 'flex justify-between items-center cluster-item';
    if (currentQ && !c.name.toLowerCase().includes(currentQ)) item.style.display = 'none';
    item.innerHTML = `
      <div class="flex items-center gap-3">
        <div style="width:8px; height:8px; border-radius:1px; background:${c.color};"></div>
        <span class="text-xs text-dim truncate" style="max-width: 160px;">${c.name}</span>
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

window.updateClusterUI = updateClusterUI;
document.addEventListener('DOMContentLoaded', initUI);
