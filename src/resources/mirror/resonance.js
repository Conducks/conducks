/**
 * Conducks Mirror — Resonance Engine (v2.5.0) 💎 🏺
 * Core D3/Force-Graph Logic — High Fidelity Structural Rendering
 */

const Graph = ForceGraph()(document.getElementById('graph-container'));

// v2.5.0: High-Definition Shared Structural State
window.MirrorState = {
  activeWave: null,
  selectedLayers: [0, 1, 2, 3, 4, 5, 6],
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
  edgeColors: {
    'MEMBER_OF': '#484f5866',
    'CONTAINS': '#484f5866',
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

    // v2.7.0: Direct Sync Status (Rule UI-42)
    const status = document.getElementById('sync-status');
    if (status) {
      status.innerText = `Synced`;
      status.style.color = '#3fb950';
      status.style.borderColor = 'rgba(63, 185, 80, 0.3)';
    }

    if (Graph.d3Alpha) {
      Graph.d3Alpha(0.3).restart();
    }
  } catch (err) {
    console.error("[Mirror] Structural Refresh Error:", err);
  } finally {
    hideOverlay();
  }
}

// v2.5.0: Reactive Pulse Integration
let syncTimeout = null;
const sse = new EventSource('/api/pulse');
sse.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'PULSE') {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => refreshSynapse(), 300);
  }
};

function applyForces() {
  if (typeof d3 === 'undefined') return;
  const gravity = parseFloat(document.getElementById('ctrl-gravity')?.value || '0.15');

  Graph.d3Force('x', d3.forceX(d => d.clusterX || 0).strength(gravity));
  Graph.d3Force('y', d3.forceY(d => d.clusterY || 0).strength(gravity));
  Graph.d3Force('collide', d3.forceCollide(node => {
     const size = Math.max((node.rank || 0.1) * 32, 8);
     return size * 1.6;
  }).strength(1));
}

function configureGraph() {
  Graph
    .backgroundColor('#010409')
    .nodeId('id')
    .nodeRelSize(4)
    .linkCurvature(link => {
       if (link.category === 'LINEAGE') return 0;
       const id = link.id || "";
       let hash = 0;
       for (let i = 0; i < id.length; i++) {
           hash = ((hash << 5) - hash) + id.charCodeAt(i);
           hash |= 0;
       }
       return 0.1 + (Math.abs(hash % 100) / 100) * 0.3;
    })
    .linkWidth(link => {
       const category = link.category || 'STRUCTURAL'; // v2.5.6 Compatibility
       return (category === 'LINEAGE' || category === 'STRUCTURAL') ? 1.0 : 0.4;
    })
    .linkColor(link => {
       const category = link.category || 'STRUCTURAL';
       if (category === 'LINEAGE' || category === 'STRUCTURAL') return 'rgba(139, 148, 158, 0.4)';
       
       const edgeColors = window.MirrorState.edgeColors || {};
       const baseColor = edgeColors[link.type] || '#2f81f7';
       return baseColor + '15'; // Ghostly alpha (0.08)
    })
    .linkDirectionalParticles(link => window.MirrorState.focusLinks.has(link) ? 6 : 0)
    .linkDirectionalParticleSpeed(0.01)
    .linkDirectionalParticleWidth(3)
    .nodeCanvasObject((node, ctx, globalScale) => {
      const size = Math.max((node.rank || 0.1) * 28, 6);
      const color = node.clusterColor || '#9ca3af';
      const isDimmed = window.MirrorState.focusNodes.size > 0 && !window.MirrorState.focusNodes.has(node.id);
      
      ctx.globalAlpha = isDimmed ? 0.05 : 1.0;

      // 💎 GEOMETRIC SEMANTICS (v2.5.0)
      ctx.beginPath();
      if (node.level === 2) { // File / Unit
        const r = 4;
        ctx.roundRect(node.x - size, node.y - size/1.5, size*2, size*1.3, r);
      } else if (node.level === 4) { // Structure / Class
        ctx.moveTo(node.x, node.y - size);
        ctx.lineTo(node.x + size, node.y);
        ctx.lineTo(node.x, node.y + size);
        ctx.lineTo(node.x - size, node.y);
        ctx.closePath();
      } else { // Generic / Atom
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
      }

      // Hub Glow
      if (node.degree > 12 && !isDimmed) {
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, size * 2);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.3;
        ctx.arc(node.x, node.y, size * 2.5, 0, 2 * Math.PI, false);
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
      }

      ctx.fillStyle = color;
      ctx.fill();
      
      // Node Border
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();

      // Adaptive Labels
      const baseFontSize = 12;
      const adaptiveSize = baseFontSize / globalScale;
      let showText = globalScale > 1.2 || (node.degree > 8 && globalScale > 0.4);
      
      if (showText && !isDimmed) {
        ctx.font = `600 ${adaptiveSize}px var(--font)`;
        ctx.fillStyle = 'rgba(201, 209, 217, 0.8)';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, node.x, node.y + size + adaptiveSize + 4);
      }
    })
    .onNodeClick(node => focusSubgraph(node))
    .onBackgroundClick(() => resetFocus());

  Graph.d3Force('charge').strength(-2000);
  Graph.d3Force('link').distance(l => l.category === 'LINEAGE' ? 40 : 150).strength(0.8);
  Graph.d3VelocityDecay(0.45);
}

function focusSubgraph(node) {
  window.MirrorState.lastSelectedNode = node;
  const mode = document.getElementById('trace-direction')?.value || 'downstream';
  
  // v2.7.0: Mandatory Loading Skeleton (UI-10) 🏺
  if (typeof window.toggleSkeleton === 'function') {
    window.toggleSkeleton(true);
  }

  const ins = document.getElementById('node-inspector');
  ins.classList.add('active');
  document.getElementById('ins-name').innerText = node.name;
  document.getElementById('ins-type').innerText = (node.label || 'Symbol').toUpperCase();
  document.getElementById('ins-level').innerText = 'Layer ' + node.level;
  
  const cluster = window.MirrorState.activeWave.clusters.find(c => c.id === node.clusterId);
  document.getElementById('ins-cluster').innerText = cluster ? cluster.name : '-';
  document.getElementById('ins-degree').innerText = node.degree || 0;
  document.getElementById('ins-mass').innerText = node.mass?.toFixed(2) || '1.00';

  const { nodes, links } = computeDirectionalSubgraph(node.id, mode);
  window.MirrorState.focusNodes = nodes;
  window.MirrorState.focusLinks = links;

  document.getElementById('focus-indicator').style.display = 'flex';
  
  Graph.centerAt(node.x, node.y, 800);
  Graph.zoom(2.2, 800);

  // Async Hydration
  const meatPanel = document.getElementById('ins-meat');
  meatPanel.style.opacity = '0'; // Start hidden for transition
  meatPanel.classList.remove('opacity-100'); // Ensure transition reset

  fetch('/api/node/' + encodeURIComponent(node.id))
    .then(r => r.json())
    .then(hydrated => {
       document.getElementById('ins-complexity').innerText = hydrated.complexity || '1';
       document.getElementById('ins-entropy').innerText = (hydrated.entropy || 0).toFixed(2);
       document.getElementById('ins-resonance').innerText = hydrated.resonance || '0';
       
       // Success — Transition from Skeleton to Data
       if (typeof window.toggleSkeleton === 'function') {
         window.toggleSkeleton(false);
       }
       meatPanel.style.opacity = '1';
       node.isShallow = false;
    })
    .catch(() => {
       if (typeof window.toggleSkeleton === 'function') {
         window.toggleSkeleton(false);
       }
    });
}

function computeDirectionalSubgraph(rootNodeId, mode) {
  const gNodes = new Set([rootNodeId]);
  const gLinks = new Set();
  const queue = [rootNodeId];
  const MAX_DEPTH = mode === 'direct' ? 1 : 8;
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

        if (mode === 'downstream' && sId === id) { isMatch = true; nextId = tId; }
        else if (mode === 'upstream' && tId === id) { isMatch = true; nextId = sId; }
        else if (sId === id || tId === id) { isMatch = true; nextId = (sId === id ? tId : sId); }

        if (isMatch) {
          gLinks.add(l);
          if (!gNodes.has(nextId)) {
            gNodes.add(nextId);
            queue.push(nextId);
          }
        }
      });
    }
    depth++;
  }
  return { nodes: gNodes, links: gLinks };
}

function resetFocus() {
  window.MirrorState.focusNodes.clear();
  window.MirrorState.focusLinks.clear();
  document.getElementById('focus-indicator').style.display = 'none';
  document.getElementById('node-inspector').classList.remove('active');
  Graph.zoom(1, 800);
}

function hideOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 1000);
  }
}

// Initial resonance
configureGraph();
refreshSynapse();
