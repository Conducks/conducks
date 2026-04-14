/**
 * Conducks Mirror — Resonance Engine (v2.5.0) 💎 🏺
 * Core D3/Force-Graph Logic — High Fidelity Structural Rendering
 */

const Graph = ForceGraph()(document.getElementById('graph-container'));
let hoverNode = null;

// v2.5.0: High-Definition Shared Structural State
window.MirrorState = {
  activeWave: null,
  selectedLayers: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  selectedClusters: [],
  focusNodes: new Set(),
  focusLinks: new Set(),
  lastSelectedNode: null,
  layers: [
    { id: 0, name: 'Ecosystem', color: '#60a5fa' },
    { id: 1, name: 'Repositories', color: '#3b82f6' },
    { id: 2, name: 'Namespaces', color: '#818cf8' },
    { id: 3, name: 'Units (Files)', color: '#22d3ee' },
    { id: 4, name: 'Infrastructure', color: '#fcd34d' },
    { id: 5, name: 'Structures', color: '#c084fc' },
    { id: 6, name: 'Behaviors', color: '#4ade80' },
    { id: 7, name: 'Atoms', color: '#fb923c' },
    { id: 8, name: 'Data', color: '#f43f5e' }
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
    // True Structural Contraction: Send exact visible layers to the NVP engine
    const layers = window.MirrorState.selectedLayers.length > 0 
      ? window.MirrorState.selectedLayers.join(',') 
      : "0,1,2,3,4,5,6,7,8";
    const spread = document.getElementById('ctrl-spread')?.value || '1200';
    let url = `/api/synapse?layers=${layers}&spread=${spread}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Synapse Hydration Failed');

    const wave = await res.json();
    window.MirrorState.activeWave = wave;

    if (typeof updateClusterUI === 'function') {
      updateClusterUI(wave);
    }

    Graph.graphData(window.MirrorState.activeWave);
    applyForces();

    const status = document.getElementById('sync-status');
    if (status) status.innerText = `Synced`;

    if (Graph.d3Alpha) Graph.d3Alpha(0.3).restart();
  } catch (err) {
    console.error("[Mirror] Structural Refresh Error:", err);
  } finally {
    hideOverlay();
  }
}

// v3.1: Zero-Restart Redraw Mechanic 🏺
window.requestRedraw = () => {
   // Increased energy pulse to guarantee frame re-render across all engines
   if (Graph.d3AlphaTarget) {
     Graph.d3AlphaTarget(0.1).restart();
     setTimeout(() => Graph.d3AlphaTarget(0), 400); // 400ms duration for stability
   }
};

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
     const level = Number(node.level);
     let size = 6;
     if (level === 0) size = 42;
     else if (level === 1) size = 36;
     else if (level === 2) size = 32;
     else if (level === 3) size = 26;
     else if (level === 4) size = 20;
     else if (level === 5) size = 16;
     else if (level === 6) size = 12;
     else if (level === 7) size = 8;
     else if (level === 8) size = 6;
     return size * 1.4;
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
       const sNode = typeof link.source === 'object' ? link.source : null;
       const tNode = typeof link.target === 'object' ? link.target : null;
       const isHighlighted = hoverNode && (sNode?.id === hoverNode.id || tNode?.id === hoverNode.id);

       if (isHighlighted) return 2.0;

       const category = link.category || 'STRUCTURAL';
       return (category === 'LINEAGE' || category === 'STRUCTURAL') ? 1.0 : 0.4;
    })
    .linkColor(link => {
       // 🕵️ DYNAMIC LINK SHADOWING & HOVERING
       const sNode = typeof link.source === 'object' ? link.source : null;
       const tNode = typeof link.target === 'object' ? link.target : null;
       
       let isShadowed = false;
       let isHoveredEdge = false;

       if (sNode && tNode) {
         const sSelected = window.MirrorState.selectedLayers.includes(Number(sNode.level));
         const tSelected = window.MirrorState.selectedLayers.includes(Number(tNode.level));
         isShadowed = !sSelected || !tSelected;
         
         if (hoverNode && (sNode.id === hoverNode.id || tNode.id === hoverNode.id)) {
           isHoveredEdge = true;
         }
       }

       if (isHoveredEdge) {
         return '#ffffffcc'; // Bright white highlight for hovered edges
       }

       const category = link.category || 'STRUCTURAL';     
       if (category === 'LINEAGE' || category === 'STRUCTURAL') {
         return `rgba(139, 148, 158, ${isShadowed ? 0.05 : 0.15})`; // Low un-hovered opacity
       }
       
       const edgeColors = window.MirrorState.edgeColors || {};
       const baseColor = edgeColors[link.type] || '#2f81f7';
       return baseColor + (isShadowed ? '05' : '15'); 
    })
    .linkDirectionalParticles(link => window.MirrorState.focusLinks.size > 0 && window.MirrorState.focusLinks.has(link) ? 6 : 0)
    .linkDirectionalParticleSpeed(0.01)
    .linkDirectionalParticleWidth(3)
    .nodeCanvasObject((node, ctx, globalScale) => {
      // 🕵️ STRUCTURAL DISCOVERY (Pure Highlight Model) 🏺
      // v3.1: Defensive type conversion for layer IDs
      const nodeLevelValue = Number(node.level);
      const isLayerSelected = window.MirrorState.selectedLayers.includes(nodeLevelValue);
      const isClusterSelected = window.MirrorState.selectedClusters.includes(node.clusterId);
      const isTraceFocus = window.MirrorState.focusNodes.size > 0 && window.MirrorState.focusNodes.has(node.id);
      const isHovered = hoverNode && hoverNode.id === node.id;
      
      // 📐 EXPLICIT LAYER SIZING
      let size = 6;
      if (nodeLevelValue === 0) size = 42; // Ecosystem
      else if (nodeLevelValue === 1) size = 36; // Repo
      else if (nodeLevelValue === 2) size = 32; // Namespace
      else if (nodeLevelValue === 3) size = 26; // Unit
      else if (nodeLevelValue === 4) size = 20; // Infra
      else if (nodeLevelValue === 5) size = 16; // Structure
      else if (nodeLevelValue === 6) size = 12; // Behavior
      else if (nodeLevelValue === 7) size = 8;  // Atom
      else if (nodeLevelValue === 8) size = 6;  // Data
      
      // 🎨 EXPLICIT LAYER COLORING
      const layerConfig = window.MirrorState.layers.find(l => l.id === nodeLevelValue);
      const color = layerConfig ? layerConfig.color : '#9ca3af';
      
      // All nodes stay visible, unselected layers become 'Shadows'
      ctx.globalAlpha = isLayerSelected ? (isHovered ? 1.0 : 0.9) : 0.1;

      // 🌟 LUMINESCENT GLOW (Behind the node)
      if (isClusterSelected || isTraceFocus || isHovered) {
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, size * 3.5);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.2, color + '66');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.arc(node.x, node.y, size * 4, 0, 2 * Math.PI, false);
        ctx.fill();
        ctx.globalAlpha = 1.0; // Highlighted nodes ignore layer shadows
      }

      // 💎 GEOMETRIC SEMANTICS
      ctx.beginPath();
      if (nodeLevelValue === 2) { // File / Unit
        const r = 4;
        ctx.roundRect(node.x - size, node.y - size/1.5, size*2, size*1.3, r);
      } else if (nodeLevelValue === 4) { // Structure / Class
        ctx.moveTo(node.x, node.y - size);
        ctx.lineTo(node.x + size, node.y);
        ctx.lineTo(node.x, node.y + size);
        ctx.lineTo(node.x - size, node.y);
        ctx.closePath();
      } else { // Generic / Atom
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
      }

      ctx.fillStyle = color;
      ctx.fill();
      
      // 💎 HIGH-CONTRAST BORDER
      if (isClusterSelected || isTraceFocus || isHovered) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3 / globalScale;
        ctx.stroke();
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      } else {
        ctx.strokeStyle = `rgba(255,255,255, ${isLayerSelected ? 0.4 : 0.1})`;
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
      }

      // Adaptive Labels
      const baseFontSize = 12;
      const adaptiveSize = baseFontSize / globalScale;
      let showText = globalScale > 1.2 || (node.degree > 8 && globalScale > 0.4);
      
      if (showText || isHovered) {
        ctx.font = `600 ${adaptiveSize}px var(--font)`;
        ctx.fillStyle = (isClusterSelected || isTraceFocus || isHovered) ? '#fff' : `rgba(201, 209, 217, ${isLayerSelected ? 0.8 : 0.2})`;
        ctx.textAlign = 'center';
        ctx.fillText(node.name, node.x, node.y + size + adaptiveSize + 4);
      }
    })
    .onNodeClick(node => focusSubgraph(node))
    .onNodeHover(node => {
      if ((!node && !hoverNode) || (node && hoverNode && node.id === hoverNode.id)) return;
      hoverNode = node;
      
      // Force refresh of link styles to apply highlighting
      Graph.linkWidth(Graph.linkWidth());
      Graph.linkColor(Graph.linkColor());

      // Pulse redraw to apply hover styles instantly
      if (Graph.d3AlphaTarget) {
        Graph.d3AlphaTarget(0.1).restart();
        setTimeout(() => Graph.d3AlphaTarget(0), 100);
      }
    })
    .onBackgroundClick(() => resetFocus());

  const linkForce = Graph.d3Force('link');
  if (linkForce) {
    linkForce
      .distance(l => {
        const type = l.type || 'UNKNOWN';
        if (type === 'MEMBER_OF' || type === 'CONTAINS') return 40;
        if (type === 'IMPORTS' || type === 'CALLS') return 350;
        return 150;
      })
      .strength(l => {
        const type = l.type || 'UNKNOWN';
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        
        // 🛡️ NOISE HUB DAMPING (The typing.py Savior)
        const isNoiseHub = (id) => id && (
          id.includes('typing.py') || 
          id.includes('logging') ||
          id.includes('builtins') || 
          id.includes('__init__.py') ||
          id.includes('node_modules') ||
          id.includes('json')
        );

        if (isNoiseHub(targetId) || isNoiseHub(sourceId)) return 0.005; // Dropped from 0.01 to 0.005
        
        if (type === 'MEMBER_OF' || type === 'CONTAINS') return 1.0; // Stiff structural spine
        if (type === 'IMPORTS' || type === 'CALLS') return 0.02; // Dropped from 0.05 to 0.02
        return 0.1;
      });
  }

  Graph.d3Force('charge').strength(-5000); // Increased from -3000
  Graph.d3VelocityDecay(0.35); // Dropped decay to allow more movement for unbraiding
}

function focusSubgraph(node) {
  window.MirrorState.lastSelectedNode = node;
  const mode = document.getElementById('trace-direction')?.value || 'downstream';
  
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
