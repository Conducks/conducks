/**
 * Conducks Mirror — UI Controller (v1.6.1) 💎
 * Event Listeners & Sidebar Logic
 */

function initUI() {
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

  document.body.addEventListener('change', e => {
    if (e.target.dataset.layer || e.target.dataset.cluster) {
      const isLayer = !!e.target.dataset.layer;
      const id = isLayer ? parseInt(e.target.dataset.layer) : e.target.dataset.cluster;
      const stateKey = isLayer ? 'selectedLayers' : 'selectedClusters';

      if (e.target.checked) window.MirrorState[stateKey].push(id);
      else window.MirrorState[stateKey] = window.MirrorState[stateKey].filter(x => x !== id);

      // v1.7.8: Force d3-force-graph to invalidate accessor caches
      const linkFn = Graph.linkColor();
      Graph.linkColor(link => linkFn(link));
      
      const nodeFn = Graph.nodeCanvasObject();
      Graph.nodeCanvasObject((n, ctx, scale) => nodeFn(n, ctx, scale));
      
      Graph.d3Alpha(0.1).restart();
    }
  });

  document.getElementById('trace-direction').addEventListener('change', () => {
    if (window.MirrorState.lastSelectedNode) focusSubgraph(window.MirrorState.lastSelectedNode);
  });

  document.getElementById('origin-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.cluster-item').forEach(el => {
      el.style.display = el.innerText.toLowerCase().includes(q) ? 'flex' : 'none';
    });
  });

  document.getElementById('focus-indicator').addEventListener('click', () => resetFocus());

  // v1.7.0: Resonance Actions
  document.getElementById('btn-resonance-pulse').addEventListener('click', () => {
    const btn = document.getElementById('btn-resonance-pulse');
    btn.innerText = 'PULSING...';
    btn.style.borderColor = 'var(--cyan)';
    btn.style.color = 'var(--cyan)';
    
    refreshSynapse().then(() => {
      setTimeout(() => {
        btn.innerText = 'PULSE';
        btn.style.borderColor = '';
        btn.style.color = '';
      }, 600);
    });
  });

  document.getElementById('btn-clear-isolation').addEventListener('click', () => {
    resetFocus();
  });

  // v1.7.5: Physics Controls & Reset
  document.getElementById('btn-reset-physics').addEventListener('click', () => {
    const d = window.MirrorState.defaults;
    
    document.getElementById('ctrl-repulsion').value = d.repulsion;
    document.getElementById('label-repulsion').innerText = d.repulsion;
    Graph.d3Force('charge').strength(d.repulsion);

    document.getElementById('ctrl-tension').value = d.tension;
    document.getElementById('label-tension').innerText = d.tension;
    Graph.d3Force('link').distance(d.tension);

    document.getElementById('ctrl-stiffness').value = d.stiffness;
    document.getElementById('label-stiffness').innerText = d.stiffness;
    Graph.d3Force('link').strength(d.stiffness);

    document.getElementById('ctrl-buffer').value = d.buffer;
    document.getElementById('label-buffer').innerText = d.buffer;

    document.getElementById('ctrl-spread').value = 1200;
    document.getElementById('label-spread').innerText = 1200;

    document.getElementById('ctrl-gravity').value = d.gravity;
    document.getElementById('label-gravity').innerText = d.gravity;

    document.getElementById('ctrl-curvature').value = d.curvature;
    document.getElementById('label-curvature').innerText = d.curvature;
    Graph.linkCurvature(d.curvature);
    
    // Optimizer defaults
    if (document.getElementById('ctrl-fluidity')) {
      document.getElementById('ctrl-fluidity').value = d.fluidity;
      document.getElementById('label-fluidity').innerText = d.fluidity.toFixed(2);
      Graph.d3VelocityDecay(1 - d.fluidity);
    }
    if (document.getElementById('ctrl-cooldown')) {
      document.getElementById('ctrl-cooldown').value = d.cooldown;
      document.getElementById('label-cooldown').innerText = d.cooldown.toFixed(3);
      Graph.d3AlphaDecay(d.cooldown);
    }

    applyForces();
    Graph.d3Alpha(1).restart();
    refreshSynapse(); // Triggers a re-fetch if spread changed
  });

  document.getElementById('ctrl-repulsion').addEventListener('input', e => {
    const val = parseInt(e.target.value);
    document.getElementById('label-repulsion').innerText = val;
    Graph.d3Force('charge').strength(val);
    Graph.d3AlphaTarget(0.3).restart();
  });

  document.getElementById('ctrl-tension').addEventListener('input', e => {
    const val = parseInt(e.target.value);
    document.getElementById('label-tension').innerText = val;
    Graph.d3Force('link').distance(val);
    Graph.d3AlphaTarget(0.3).restart();
  });

  document.getElementById('ctrl-stiffness').addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    document.getElementById('label-stiffness').innerText = val;
    Graph.d3Force('link').strength(val);
    Graph.d3AlphaTarget(0.3).restart();
  });

  document.getElementById('ctrl-buffer').addEventListener('input', e => {
    const val = parseInt(e.target.value);
    document.getElementById('label-buffer').innerText = val;
    applyForces();
    Graph.d3AlphaTarget(0.3).restart();
  });

  document.getElementById('ctrl-spread').addEventListener('input', e => {
    const val = parseInt(e.target.value);
    document.getElementById('label-spread').innerText = val;
  });

  document.getElementById('ctrl-spread').addEventListener('change', () => {
    refreshSynapse();
  });

  document.getElementById('ctrl-gravity').addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    document.getElementById('label-gravity').innerText = val;
    applyForces();
    Graph.d3AlphaTarget(0.3).restart();
  });

  document.getElementById('ctrl-curvature').addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    document.getElementById('label-curvature').innerText = val;
    Graph.linkCurvature(val);
  });

  // v1.6.3: Optimizer Logic
  document.getElementById('btn-untangle').addEventListener('click', () => {
    if (window.MirrorState.activeWave) {
      window.MirrorState.activeWave.nodes.forEach(n => {
        n.x += (Math.random() - 0.5) * 20;
        n.y += (Math.random() - 0.5) * 20;
      });
      Graph.d3Alpha(1).restart();
    }
  });

  document.getElementById('ctrl-fluidity').addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    document.getElementById('label-fluidity').innerText = val.toFixed(2);
    Graph.d3VelocityDecay(1 - val);
  });

  document.getElementById('ctrl-cooldown').addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    document.getElementById('label-cooldown').innerText = val.toFixed(3);
    Graph.d3AlphaDecay(val);
  });
}

function updateClusterUI(wave) {
  const clusterCtn = document.getElementById('cluster-filters');
  if (!clusterCtn) return;

  const currentQ = document.getElementById('origin-search')?.value?.toLowerCase() || '';
  clusterCtn.innerHTML = '';

  // Build the visual cluster list from the hydrated wave
  wave.clusters.forEach(c => {
    const item = document.createElement('div');
    item.className = 'flex justify-between items-center cluster-item';
    if (currentQ && !c.name.toLowerCase().includes(currentQ)) item.style.display = 'none';
    item.innerHTML = `
            <div class="flex items-center gap-4">
              <div style="width:6px; height:6px; border-radius:50%; background:${c.color}"></div>
              <span class="text-xs text-dim truncate" style="max-width: 140px;">${c.name}</span>
            </div>
            <label class="switch">
              <input type="checkbox" data-cluster="${c.id}" ${window.MirrorState.selectedClusters.includes(c.id) ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          `;
    clusterCtn.appendChild(item);
  });
}

// Attach to window so refreshSynapse can call it
window.updateClusterUI = updateClusterUI;

// Bootstrap
initUI();
configureGraph();
refreshSynapse();

const sse = new EventSource('/api/pulse');
sse.onmessage = () => refreshSynapse();
