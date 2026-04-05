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
  },
  edgeColors: {
    'MEMBER_OF': '#484f58aa',
    'CONTAINS': '#484f58aa',
    'CALL': '#3b82f6',
    'EXTENDS': '#a855f7',
    'IMPLEMENTS': '#8b5cf6',
    'REFERENCES': '#10b981',
    'DEPENDS_ON': '#f59e0b',
    'UNKNOWN': '#6b7280'
  }
};

async function refreshSynapse() {
  try {
    // v1.7.0: Pre-Hydrate all core layers (0-6) for non-destructive filtering.
    const layers = "0,1,2,3,4,5,6";
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

    // v2.0.0: Apostolic Bloom effect
    const container = document.getElementById('graph-container');
    container.classList.add('sync-pulse');
    setTimeout(() => container.classList.remove('sync-pulse'), 800);

    const status = document.getElementById('sync-status');
    if (status) {
      status.innerText = 'LIVE SYNC';
      status.classList.add('live');
    }

    // v1.6.7: Reactive Structural Bloom. 
    if (Graph.d3Alpha) {
      Graph.d3Alpha(1).restart();
    }
  } catch (err) {
    console.error("[Mirror] Structural Refresh Error:", err);
    const status = document.getElementById('sync-status');
    if (status) {
      status.innerText = 'OFFLINE';
      status.classList.remove('live');
    }
  } finally {
    hideOverlay();
  }
}

// v2.0.0: Reactive Pulse Integration
let syncTimeout = null;
const sse = new EventSource('/api/pulse');
sse.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'PULSE') {
    console.log("🛡️ [Synapse Gateway] Received structural heartbeat. Re-resonating...");
    // Debounce to prevent stuttering on batch file saves
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => refreshSynapse(), 300);
  }
};

sse.onerror = () => {
  const status = document.getElementById('sync-status');
  if (status) {
    status.innerText = 'RECONNECTING...';
    status.classList.remove('live');
  }
};

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
    .linkCurvature(link => {
      if (link.category === 'LINEAGE') return 0;
      
      // v2.4.0: Deterministic "Edge Repulsion" Hash 🏺
      // We calculate a unique bend for every link to prevent Overlap Contention.
      const id = link.id || "";
      let hash = 0;
      for (let i = 0; i < id.length; i++) {
          hash = ((hash << 5) - hash) + id.charCodeAt(i);
          hash |= 0;
      }
      const bend = 0.1 + (Math.abs(hash % 100) / 100) * 0.4;
      return bend;
    })
    .linkWidth(link => {
      const isFocused = window.MirrorState.focusLinks.has(link);
      if (window.MirrorState.focusLinks.size > 0) return isFocused ? 3 : 0.02;
      return link.category === 'LINEAGE' ? 1.0 : 0.2; // Call links are thin by default
    })
    .linkColor(link => {
      const s = typeof link.source === 'object' ? link.source : { level: -1 };
      const t = typeof link.target === 'object' ? link.target : { level: -1 };

      if (s.level !== -1 && t.level !== -1) {
        const sVis = window.MirrorState.selectedLayers.includes(s.level);
        const tVis = window.MirrorState.selectedLayers.includes(t.level);
        if (!sVis || !tVis) return 'transparent';
      }

      const isFocused = window.MirrorState.focusLinks.has(link);
      const edgeColors = window.MirrorState.edgeColors || {};
      
      // v2.2.0: High-Frequency Chromatic Resonance 🏺
      if (window.MirrorState.focusLinks.size > 0) {
        if (isFocused) {
          return edgeColors[link.type] || '#00d2ff';
        }
        return 'rgba(255,255,255,0.01)';
      }

      // Default State: Lineage is stable, Kinesis is Ghostly
      if (link.category === 'LINEAGE') return edgeColors[link.type] || '#484f5866';
      
      // Multi-Colored Ghostly Arcs (High Fidelity, Low Noise)
      const baseColor = edgeColors[link.type] || '#3b82f6';
      return baseColor + '03'; // v2.2: Ultra-low alpha (0.01) for clean tree visualization
    })
    .linkDirectionalParticles(link => {
      if (window.MirrorState.focusLinks.has(link)) return 6;
      return 0; // No particles unless resonating (saves CPU & reduces mess)
    })
    .linkDirectionalParticleSpeed(0.02) // Increased speed for visibility (0.01 -> 0.02)
    .linkDirectionalParticleWidth(3) // Increased width for visibility (2 -> 3)
    .nodeCanvasObject((node, ctx, globalScale) => {
      const size = Math.max((node.rank || 0.1) * 24, 6);
      const color = node.clusterColor || '#9ca3af';

      const isLayerVisible = window.MirrorState.selectedLayers.includes(node.level);
      if (!isLayerVisible) return;

      let alpha = 1.0;
      if (window.MirrorState.selectedClusters.length > 0 && !window.MirrorState.selectedClusters.includes(node.clusterId)) {
        alpha = 0.05;
      }

      const isDimmedByFocus = window.MirrorState.focusNodes.size > 0 && !window.MirrorState.focusNodes.has(node.id);
      if (isDimmedByFocus) alpha = 0.02;

      ctx.globalAlpha = alpha;

      // Outer Glow for Hubs
      if (node.degree > 10 && !isDimmedByFocus) {
        ctx.shadowBlur = 15 / globalScale;
        ctx.shadowColor = color;
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
      ctx.fillStyle = color;
      ctx.fill();

      // Inner Core for Atoms
      if (node.level >= 5) {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
      }

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

  // v2.3.0: Relational Softness Simulation (Waterfall Tree) 🏺
  Graph.d3Force('charge').strength(-1500); // Reduced repulsion for closer parent-child affinity
  Graph.d3Force('center', d3.forceCenter(0, 0).strength(0.05));
  
  // High-Contrast Force Mapping
  Graph.d3Force('link')
    .distance(l => l.category === 'LINEAGE' ? 30 : 600) // Lineage is compact, Kinesis is distant
    .strength(l => l.category === 'LINEAGE' ? 1.2 : 0.005); // Lineage is absolute, Kinesis is barely felt
  
  // Custom Forces for Waterfall Seeding (Gravity Sync)
  Graph.d3Force('x', d3.forceX(d => d.clusterX || 0).strength(1.0)); // Strict horizontal grouping
  Graph.d3Force('y', d3.forceY(d => d.clusterY || 0).strength(1.0)); // Strict vertical waterfall
  
  // v2.3.0: Removed strict 'layer' force to prevent grid-fighting 🏺

  Graph.d3VelocityDecay(0.4); // v2.2.0: High friction to eliminate jitter
  Graph.d3AlphaDecay(0.05);  // v2.2.0: Fast cooling for instant resonance settlement
  
  // v2.2.0: Removed manual restart from configureGraph to prevent race condition with refreshSynapse
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
