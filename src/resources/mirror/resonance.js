/**
 * Conducks Mirror — Resonance Engine (v1.6.1) 💎
 * Core D3/Force-Graph Logic
 */

const Graph = ForceGraph()(document.getElementById('graph-container'));

// v1.7.5: High-Frequency Shared Structural State
window.MirrorState = {
  activeWave: null,
  selectedLayers: [0, 1, 2, 3, 4, 5],
  selectedClusters: [],
  focusNodes: new Set(),
  focusLinks: new Set(),
  lastSelectedNode: null,
  layers: [
    { id: 0, name: 'Ecosystem', color: '#60a5fa' },
    { id: 1, name: 'Namespaces', color: '#818cf8' },
    { id: 2, name: 'Units (Files)', color: '#22d3ee' },
    { id: 3, name: 'Infrastructure', color: '#fcd34d' },
    { id: 4, name: 'Structures', color: '#c084fc' },
    { id: 5, name: 'Behaviors', color: '#4ade80' },
    { id: 6, name: 'Atoms', color: '#fb923c' }
  ],
  defaults: {
    repulsion: -4477,
    tension: 20,
    stiffness: 0.9,
    buffer: 10,
    gravity: 0.15,
    curvature: 0,
    fluidity: 0.9,
    cooldown: 0.02
  }
};

async function refreshSynapse() {
  try {
    // v1.7.0: Pre-Hydrate all core layers (0-5) for non-destructive filtering.
    const layers = "0,1,2,3,4,5";
    const spread = document.getElementById('ctrl-spread')?.value || '1200';
    const res = await fetch(`/api/synapse?layers=${layers}&spread=${spread}`);
    if (!res.ok) throw new Error('Synapse Hydration Failed');

    const wave = await res.json();
    window.MirrorState.activeWave = wave;

    if (typeof updateClusterUI === 'function') {
      updateClusterUI(wave);
    }

    Graph.graphData(window.MirrorState.activeWave);
    applyForces();

    // v1.6.7: Reactive Structural Bloom. 
    if (Graph.d3Alpha) {
      Graph.d3Alpha(1).restart();
    }
  } catch (err) {
    console.error("[Mirror] Structural Refresh Error:", err);
  } finally {
    hideOverlay();
  }
}

function applyForces() {
  if (typeof d3 === 'undefined') return;
  const buffer = parseInt(document.getElementById('ctrl-buffer')?.value || '8');
  const gravity = parseFloat(document.getElementById('ctrl-gravity')?.value || '0.15');

  Graph.d3Force('x', d3.forceX(d => d.clusterX || 0).strength(gravity));
  Graph.d3Force('y', d3.forceY(d => d.clusterY || 0).strength(gravity));
  Graph.d3Force('collide', d3.forceCollide(node => {
    const size = Math.max((node.rank || 0.1) * 24, 6);
    return size * 1.5 + buffer;
  }).strength(1));
}

// v1.6.2: Improved Direction-Strict Tracing
function computeDirectionalSubgraph(rootNodeId, mode) {
  const gNodes = new Set([rootNodeId]);
  const gLinks = new Set();
  const queue = [rootNodeId];
  const MAX_DEPTH = mode === 'direct' ? 1 : 12; // 1 level for direct hub view
  let depth = 0;

  while (queue.length > 0 && depth < MAX_DEPTH) {
    const size = queue.length;
    for (let i = 0; i < size; i++) {
      const id = queue.shift();
      window.MirrorState.activeWave.links.forEach(l => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;

        let isMatch = false;
        let nextId = null;

        if (mode === 'downstream') {
          if (sId === id) { isMatch = true; nextId = tId; }
        } else if (mode === 'upstream') {
          if (tId === id) { isMatch = true; nextId = sId; }
        } else if (mode === 'direct') {
          if (sId === id || tId === id) { isMatch = true; nextId = (sId === id ? tId : sId); }
        } else {
          if (sId === id || tId === id) { isMatch = true; nextId = (sId === id ? tId : sId); }
        }

        if (isMatch) {
          if (!gLinks.has(l)) {
            gLinks.add(l);
            if (!gNodes.has(nextId)) {
              gNodes.add(nextId);
              queue.push(nextId);
            }
          }
        }
      });
    }
    depth++;
  }
  return { nodes: gNodes, links: gLinks };
}

function configureGraph() {
  Graph
    .backgroundColor('#010409')
    .nodeId('id')
    .nodeRelSize(4)
    .linkCurvature(0.1)
    .linkWidth(link => {
      if (window.MirrorState.focusLinks.size > 0) return window.MirrorState.focusLinks.has(link) ? 3 : 0.05;
      return link.isTransitive ? 0.4 : 1.2;
    })
    .linkColor(link => {
      // v1.7.7: Robust Link Hiding
      const s = typeof link.source === 'object' ? link.source : { level: -1 };
      const t = typeof link.target === 'object' ? link.target : { level: -1 };

      if (s.level !== -1 && t.level !== -1) {
        const sVis = window.MirrorState.selectedLayers.includes(s.level);
        const tVis = window.MirrorState.selectedLayers.includes(t.level);
        // User Preference: Don't hide edges if they connect to a hidden layer, ONLY if both are hidden!
        // To prevent floating edges, we'll hide them if EITHER is hidden, but make it explicit.
        if (!sVis || !tVis) return 'transparent';
      }

      if (window.MirrorState.focusLinks.size > 0) return window.MirrorState.focusLinks.has(link) ? '#00d2ff' : 'rgba(255,255,255,0.01)';

      let alpha = link.isTransitive ? '33' : '66';
      if (window.MirrorState.selectedClusters.length > 0) {
        const inFocus = window.MirrorState.selectedClusters.includes(link.source.clusterId) || window.MirrorState.selectedClusters.includes(link.target.clusterId);
        if (!inFocus) alpha = '05'; // Super dim for context
      }

      const base = link.isTransitive ? '#484f58' : (link.source.clusterColor || '#3b82f6');
      return base + alpha;
    })
    .linkDirectionalParticles(link => window.MirrorState.focusLinks.has(link) ? 6 : 0)
    .linkDirectionalParticleSpeed(0.015)
    .linkDirectionalParticleWidth(4)
    .nodeCanvasObject((node, ctx, globalScale) => {
      const size = Math.max((node.rank || 0.1) * 24, 6);
      const color = node.clusterColor || '#9ca3af';

      // v1.7.0: Professional Structural Highlighting & Ghosting
      const isLayerVisible = window.MirrorState.selectedLayers.includes(node.level);
      
      if (!isLayerVisible) {
        return; // Completely hidden (do not poison ctx.globalAlpha!)
      }

      let alpha = 1.0;
      if (window.MirrorState.selectedClusters.length > 0 && !window.MirrorState.selectedClusters.includes(node.clusterId)) {
        alpha = 0.05; // Ghosted context
      }

      const isDimmedByFocus = window.MirrorState.focusNodes.size > 0 && !window.MirrorState.focusNodes.has(node.id);
      if (isDimmedByFocus) alpha = 0.02;

      ctx.globalAlpha = alpha;

      if (node.level <= 1 && !isDimmedByFocus && alpha === 1.0) {
        ctx.shadowBlur = 15 / globalScale;
        ctx.shadowColor = color;
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.shadowBlur = 0;

      const baseFontSize = 14;
      const adaptiveSize = Math.max(1, baseFontSize / globalScale);

      let showText = true;
      if (globalScale < 0.3 && node.level > 1) showText = false;
      if (globalScale < 0.8 && node.level > 2) showText = false;
      if (globalScale < 2 && node.level > 4) showText = false;

      if (showText && ctx.globalAlpha > 0.05) {
        ctx.font = `${adaptiveSize}px var(--font)`;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, node.x, node.y + size + adaptiveSize + 2);
      }
      ctx.globalAlpha = 1;
    })
    .onNodeClick(node => focusSubgraph(node))
    .onLinkClick(link => focusSubgraph(link.source))
    .onBackgroundClick(() => resetFocus());

  Graph.d3Force('charge').strength(-4477);
  Graph.d3Force('center', d3.forceCenter(0, 0).strength(0.01));
  Graph.d3Force('link').distance(20).strength(0.9);
  Graph.d3VelocityDecay(0.1); // 1 - Fluidity(0.9)
  Graph.d3AlphaDecay(0.02);   // v1.6.7: Smoother Bloom
  Graph.linkCurvature(0);
}

function focusSubgraph(node) {
  window.MirrorState.lastSelectedNode = node;
  const mode = document.getElementById('trace-direction').value;
  const { nodes, links } = computeDirectionalSubgraph(node.id, mode);
  window.MirrorState.focusNodes = nodes;
  window.MirrorState.focusLinks = links;

  const indicator = document.getElementById('focus-indicator');
  indicator.style.display = 'flex';

  const txt = mode === 'downstream' ? 'IMPACT ISOLATION ACTIVE' : (mode === 'upstream' ? 'LINEAGE ISOLATION ACTIVE' : (mode === 'direct' ? 'DIRECT HUB ISOLATION ACTIVE' : 'FULL CIRCUIT ACTIVE'));
  document.getElementById('focus-text').innerText = `${txt} — CLICK TO RESET`;

  // Update Inspector
  const ins = document.getElementById('node-inspector');
  ins.classList.add('active');
  document.getElementById('ins-name').innerText = node.name;
  document.getElementById('ins-type').innerText = (node.group || node.label || 'SYMBOL').toUpperCase();
  document.getElementById('ins-level').innerText = 'L' + node.level;

  const cluster = window.MirrorState.activeWave.clusters.find(c => c.id === node.clusterId);
  document.getElementById('ins-cluster').innerText = cluster ? cluster.name : 'Unknown Cluster';

  document.getElementById('ins-degree').innerText = node.degree || 0;
  document.getElementById('ins-mass').innerText = node.mass?.toFixed(2) || '1.00';

  Graph.centerAt(node.x, node.y, 800);
  Graph.zoom(2.5, 800);

  // Conducks: On-Demand Hydration (v1.6.5)
  const meatPanel = document.getElementById('ins-meat');
  if (node.isShallow) {
    meatPanel.style.opacity = '0.3';
    fetch('/api/node/' + encodeURIComponent(node.id))
      .then(r => r.json())
      .then(hydrated => {
        document.getElementById('ins-complexity').innerText = hydrated.complexity || '1';
        document.getElementById('ins-entropy').innerText = (hydrated.entropy || 0).toFixed(2);
        document.getElementById('ins-resonance').innerText = hydrated.resonance || '0';
        meatPanel.style.opacity = '1';
        // Cache on the node so we don't fetch again
        node.properties = { ...node.properties, ...hydrated };
        node.isShallow = false;
      });
  } else {
    document.getElementById('ins-complexity').innerText = node.complexity || '1';
    document.getElementById('ins-entropy').innerText = (node.entropy || 0).toFixed(2);
    document.getElementById('ins-resonance').innerText = node.resonance || '0';
    meatPanel.style.opacity = '1';
  }
}

function resetFocus() {
  window.MirrorState.focusNodes.clear();
  window.MirrorState.focusLinks.clear();
  window.MirrorState.lastSelectedNode = null;
  document.getElementById('focus-indicator').style.display = 'none';
  document.getElementById('node-inspector').classList.remove('active');
  Graph.zoom(1, 1000);
}

function hideOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 1000);
  }
}

// Export for UI
window.Graph = Graph;
window.refreshSynapse = refreshSynapse;
window.configureGraph = configureGraph;
window.resetFocus = resetFocus;
window.focusSubgraph = focusSubgraph;
