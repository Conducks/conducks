import express from 'express';
import cors from 'cors';
import { ConducksGraph } from '@/lib/core/graph/graph-engine.js';
import { registry } from '@/registry/index.js';

/**
 * Conducks — Unified Visual Mirror Server (v1.0.0)
 * 
 * Provides a real-time HTTP + SSE bridge for the Structural Dashboard.
 * HTML is embedded to ensure a single source of truth and robust pathing.
 */
export class MirrorServer {
  private app = express();
  private clients: any[] = [];

  constructor(private graph: ConducksGraph) {
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.use(cors());
    this.app.get('/', (req, res) => {
      res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conducks — Synapse Visual Mirror</title>
  <script src="https://unpkg.com/force-graph"></script>
  <script src="https://unpkg.com/d3-force"></script>
  <script src="https://unpkg.com/d3-quadtree"></script>
  <script src="https://unpkg.com/d3-dispatch"></script>
  <script src="https://unpkg.com/d3-timer"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; background: #010409; font-family: 'Outfit', sans-serif; overflow: hidden; color: #e6edf3; }
    #graph-container { width: 100vw; height: 100vh; }
    .glass {
      background: rgba(13, 17, 23, 0.7);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
    }
    .pulse { animation: pulse-ring 2s cubic-bezier(0.25, 0.8, 0.25, 1) infinite; }
    @keyframes pulse-ring { 
      0% { transform: scale(.95); box-shadow: 0 0 0 0 rgba(79, 172, 254, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(79, 172, 254, 0); }
      100% { transform: scale(.95); box-shadow: 0 0 0 0 rgba(79, 172, 254, 0); }
    }
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.3); border-radius: 10px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.5); }
  </style>
</head>
<body>
  <div id="loading-overlay" class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#010409] transition-opacity duration-1000">
    <div class="relative w-24 h-24 mb-8">
      <div class="absolute inset-0 border-4 border-blue-500/10 rounded-full"></div>
      <div id="loading-spinner" class="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <div class="absolute inset-0 flex items-center justify-center">
        <span id="loading-pct" class="text-[10px] font-mono text-blue-400">0%</span>
      </div>
    </div>
    <div class="text-blue-400 font-mono text-xs tracking-[0.3em] uppercase animate-pulse mb-6">Syncing Synapse</div>
    <div class="w-64 h-1 bg-white/5 rounded-full overflow-hidden mb-2">
      <div id="loading-bar" class="h-full bg-blue-500 transition-all duration-300 shadow-[0_0_15px_#3b82f6]" style="width: 0%"></div>
    </div>
    <div id="loading-status" class="text-gray-500 text-[9px] font-mono uppercase tracking-widest">Refracting Structural Wave</div>
  </div>

  <div id="graph-container"></div>
  
  <div class="absolute top-8 left-8 p-6 glass w-[380px] z-10">
    <div class="flex items-center gap-3 mb-6">
      <div class="w-3 h-3 rounded-full bg-blue-500 pulse"></div>
      <h1 class="text-xl font-semibold tracking-tight uppercase">Visual Mirror</h1>
      <span class="ml-auto text-[8px] font-mono text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded border border-blue-500/20">V3 BUBBLE</span>
    </div>
    
    <div class="space-y-4 mb-8">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Structural Filter</span>
        <button id="reset-filters" class="text-[9px] text-blue-400 hover:text-blue-300 transition-colors">RESET</button>
      </div>
      
      <div id="layer-selector" class="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
        <label class="flex items-center justify-between group cursor-pointer">
          <div class="flex items-center gap-3">
            <input type="checkbox" data-layer="0" checked class="accent-blue-400">
            <span class="text-[11px] text-gray-400 group-hover:text-white transition-colors">L0: Ecosystem</span>
          </div>
          <div class="w-1.5 h-1.5 rounded-full bg-blue-400/50"></div>
        </label>
        <label class="flex items-center justify-between group cursor-pointer">
          <div class="flex items-center gap-3">
            <input type="checkbox" data-layer="1" checked class="accent-indigo-400">
            <span class="text-[11px] text-gray-400 group-hover:text-white transition-colors">L1: Namespaces</span>
          </div>
          <div class="w-1.5 h-1.5 rounded-full bg-indigo-400/50"></div>
        </label>
        <label class="flex items-center justify-between group cursor-pointer">
          <div class="flex items-center gap-3">
            <input type="checkbox" data-layer="2" checked class="accent-cyan-400">
            <span class="text-[11px] text-gray-400 group-hover:text-white transition-colors">L2: Units (Files)</span>
          </div>
          <div class="w-1.5 h-1.5 rounded-full bg-cyan-400/50"></div>
        </label>
        <label class="flex items-center justify-between group cursor-pointer">
          <div class="flex items-center gap-3">
            <input type="checkbox" data-layer="3" checked class="accent-yellow-400">
            <span class="text-[11px] text-gray-400 group-hover:text-white transition-colors">L3: Infrastructure</span>
          </div>
          <div class="w-1.5 h-1.5 rounded-full bg-yellow-400/50"></div>
        </label>
        <label class="flex items-center justify-between group cursor-pointer">
          <div class="flex items-center gap-3">
            <input type="checkbox" data-layer="4" checked class="accent-purple-400">
            <span class="text-[11px] text-gray-400 group-hover:text-white transition-colors">L4: Structures</span>
          </div>
          <div class="w-1.5 h-1.5 rounded-full bg-purple-400/50"></div>
        </label>
        <label class="flex items-center justify-between group cursor-pointer">
          <div class="flex items-center gap-3">
            <input type="checkbox" data-layer="5" checked class="accent-green-400">
            <span class="text-[11px] text-gray-400 group-hover:text-white transition-colors">L5: Behaviors</span>
          </div>
          <div class="w-1.5 h-1.5 rounded-full bg-green-400/50"></div>
        </label>
        <label class="flex items-center justify-between group cursor-pointer">
          <div class="flex items-center gap-3">
            <input type="checkbox" data-layer="6" class="accent-orange-400">
            <span class="text-[11px] text-gray-400 group-hover:text-white transition-colors">L6: Atoms</span>
          </div>
          <div class="w-1.5 h-1.5 rounded-full bg-orange-400/50"></div>
        </label>
        <label class="flex items-center justify-between group cursor-pointer">
          <div class="flex items-center gap-3">
            <input type="checkbox" data-layer="7" class="accent-gray-400">
            <span class="text-[11px] text-gray-400 group-hover:text-white transition-colors">L7: Data</span>
          </div>
          <div class="w-1.5 h-1.5 rounded-full bg-gray-400/50"></div>
        </label>
      </div>
    </div>

    <div class="mt-8 space-y-4">
      <span class="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Diagnostic Lens</span>
      <select id="diagnostic-lens" class="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-gray-300 focus:outline-none focus:border-blue-500/50">
        <option value="default">Default: Cluster Wave</option>
        <option value="complexity">Heatmap: Complexity</option>
        <option value="coverage">Audit: Test Coverage</option>
        <option value="risk">Risk: Bus Factor (Entropy)</option>
        <option value="age">History: Temporal Decay</option>
      </select>
    </div>

    <div class="flex gap-2 mb-6">
      <button id="mode-graph" class="flex-1 py-2 glass text-[10px] font-mono text-blue-400 border-blue-500/40 bg-blue-500/10">GRAPH VIEW</button>
      <button id="mode-bubble" class="flex-1 py-2 glass text-[10px] font-mono text-gray-500 hover:text-blue-400 transition-colors">BUBBLE VIEW</button>
    </div>

    <div id="buddy-advice" class="p-3 bg-blue-900/10 border border-blue-500/10 rounded-lg">
      <p class="text-[11px] text-blue-200/60 leading-relaxed font-light">
        Layered Batching active. The Synapse is Materializing in structural sequences.
      </p>
    </div>
  </div>

  <div class="absolute bottom-8 right-8 z-10 pointer-events-none">
    <div id="node-inspector" class="p-6 glass w-[380px] opacity-0 translate-y-4 transition-all duration-500 pointer-events-auto">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 id="node-name" class="text-lg font-semibold text-white truncate max-w-[280px]">Symbol</h3>
          <p id="node-type" class="text-[10px] font-mono text-blue-400 uppercase tracking-widest mt-1">Kind</p>
          <div id="lens-status" class="hidden mt-2 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-[9px] font-mono text-blue-300 animate-pulse">LENS ACTIVE</div>
        </div>
        <div class="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-gray-500" id="node-level">L0</div>
      </div>
      
      <div class="space-y-4">
        <div class="text-[11px] text-gray-400 border-l-2 border-blue-500/30 pl-3">
          <p class="uppercase text-[9px] tracking-tighter text-gray-500 mb-1">Location</p>
          <span id="node-file" class="font-mono">Internal</span>
        </div>
        
        <div class="grid grid-cols-2 gap-4 py-3 border-y border-white/5">
          <div>
            <p class="text-[9px] uppercase text-gray-500 mb-1">Fan Out</p>
            <span id="node-degree" class="text-xs font-mono text-white">0</span>
          </div>
          <div>
            <p class="text-[9px] uppercase text-gray-500 mb-1">Mass</p>
            <span id="node-mass" class="text-xs font-mono text-white">1.0</span>
          </div>
        </div>

        <div id="gravity-editor-inner">
          <div class="flex justify-between text-[9px] font-mono text-gray-500 uppercase tracking-widest mb-2">
            <span>Structural Gravity</span>
            <span id="gravity-val" class="text-blue-400">0.00</span>
          </div>
          <input type="range" id="gravity-slider" min="0" max="1" step="0.01" class="w-full h-1 bg-blue-500/20 rounded-full appearance-none cursor-pointer accent-blue-500">
        </div>
      </div>
    </div>
  </div>

  <script>
    const Graph = ForceGraph()(document.getElementById('graph-container'));
    let fullWave = null;
    let activeWave = null;
    let isBubbleMode = false;
    let activeLens = 'default';
    let selectedNode = null;
    const manualOverrides = new Map();
    const palette = [
      '#60a5fa', '#818cf8', '#22d3ee', '#fac638', '#c084fc', '#4ade80', '#fb923c', '#9ca3af'
    ];
    const heatmapColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
    const activePulses = new Map();

    async function materialiseSynapse() {
      const res = await fetch('/api/synapse');
      fullWave = await res.json();
      
      const statusEl = document.getElementById('loading-status');
      if (statusEl) statusEl.innerText = 'Materializing ' + fullWave.nodes.length + ' Structural Units';

      try {
        const stored = localStorage.getItem('conducks_filters');
        if (stored) {
          layerFilters = JSON.parse(stored);
        } else {
          layerFilters = { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false };
          localStorage.setItem('conducks_filters', JSON.stringify(layerFilters));
        }
      } catch (e) {
        layerFilters = { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false };
      }

      configureGraph();
      applyFilters();
    }

    function configureGraph() {
      Graph
        .backgroundColor('#010409')
        .nodeId('id')
        .nodeVal(node => {
          const override = manualOverrides.get(node.id);
          const r = override !== undefined ? override : (node.rank || 0);
          return Math.max(r * 30, node.level === 0 ? 12 : 5);
        })
        .nodeColor(node => palette[node.level % palette.length] || '#444444')
        .nodeRelSize(4)
        .linkCurvature(0.15)
        .linkWidth(link => link.type === 'MEMBER_OF' ? 0.5 : 1)
        .linkColor(link => {
           const t = link.type;
           const opacity = link.isTransitive ? '0.15' : '0.4';
           if (t === 'MEMBER_OF') return 'rgba(139, 92, 246, ' + opacity + ')';
           if (t === 'CALLS') return 'rgba(59, 130, 246, ' + opacity + ')';
           if (t === 'IMPORTS') return 'rgba(34, 197, 94, ' + opacity + ')';
           if (t === 'ACCESSES') return 'rgba(245, 158, 11, ' + opacity + ')';
           return 'rgba(255, 255, 255, ' + opacity + ')';
        })
        .linkDirectionalArrowLength(link => (Graph.zoom() > 2 ? 3 : 0))
        .d3VelocityDecay(0.3)
        .cooldownTicks(150)
        .onEngineStop(() => hideOverlay())
        .nodeCanvasObject((node, ctx, globalScale) => {
          renderNode(node, ctx, globalScale);
        })
        .onNodeClick(node => focusNode(node))
        .onBackgroundClick(() => defocus());
        
      syncFilterUI();
    }

    function applyFilters() {
      if (!fullWave) return;
      
      const activeNodes = fullWave.nodes.filter(n => layerFilters[n.level]);
      const nodeIds = new Set(activeNodes.map(n => n.id));
      const nodeMap = new Map(fullWave.nodes.map(n => [n.id, n]));

      // 1. Recursive Nearest Visible Parent (NVP) lookup
      function getNVP(nodeId) {
        if (!nodeId) return null;
        if (nodeIds.has(nodeId)) return nodeId;
        const n = nodeMap.get(nodeId);
        return n ? getNVP(n.parentId) : null;
      }

      // 2. Transitive Edge Resolution (Structural Contraction)
      const transitiveLinks = [];
      const linkCheck = new Set();

      fullWave.links.forEach(l => {
        const sId = typeof l.source === 'string' ? l.source : l.source.id;
        const tId = typeof l.target === 'string' ? l.target : l.target.id;
        
        const vSrc = getNVP(sId);
        const vTgt = getNVP(tId);

        if (vSrc && vTgt && vSrc !== vTgt) {
          const key = vSrc + '->' + vTgt;
          if (!linkCheck.has(key)) {
            transitiveLinks.push({
              source: vSrc,
              target: vTgt,
              type: l.type,
              isTransitive: (vSrc !== sId || vTgt !== tId)
            });
            linkCheck.add(key);
          }
        }
      });

      activeWave = { nodes: activeNodes, links: transitiveLinks };
      Graph.graphData(activeWave);
      if (activeNodes.length > 0) hideOverlay();
      Graph.d3Force('charge').strength(node => -600 * (node.mass || 1));
      if (typeof d3 !== 'undefined' && d3.forceCollide) {
        Graph.d3Force('collide', d3.forceCollide(node => {
          const override = manualOverrides.get(node.id);
          const r = override !== undefined ? override : (node.rank || 0);
          return Math.max(r * 40, 25);
        }));
      }
    }

    function renderNode(node, ctx, globalScale) {
      const override = manualOverrides.get(node.id);
      const effectiveRank = override !== undefined ? override : (node.rank || 0);
      const size = Math.max(effectiveRank * 20, node.level <= 2 ? 10 : 5);
      let color = (palette[node.level] || '#444444').substring(0, 7);
      let opacity = 1.0;
      let hollow = false;

      if (activeLens === 'complexity') {
        const c = Math.min(node.complexity || 1, 20) / 20;
        color = heatmapColors[Math.min(Math.floor(c * heatmapColors.length), heatmapColors.length - 1)];
      } else if (activeLens === 'coverage') {
        if (node.level > 1 && !node.isTest) {
          hollow = (node.coverageCount === 0);
          color = hollow ? '#ef4444' : '#10b981';
        }
      } else if (activeLens === 'risk') {
        const e = Math.min(node.entropy || 0, 1);
        if (e > 0.5) {
          color = '#f59e0b';
          if (Math.sin(Date.now()/500) > 0) color = '#ef4444';
        }
      } else if (activeLens === 'age') {
        const now = Date.now() / 1000;
        const age = now - node.lastModified;
        const week = 60 * 60 * 24 * 7;
        opacity = Math.max(0.1, 1 - (age / (week * 52)));
      }

      const label = node.name || node.label;

      if (isBubbleMode && node.level <= 4) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, size * 2.5, 0, 2 * Math.PI, false);
        ctx.fillStyle = color + '08';
        ctx.strokeStyle = color + '22';
        ctx.lineWidth = 1/globalScale;
        ctx.fill();
        ctx.stroke();
      }

      const pulse = activePulses.get(node.id);
      if (pulse) {
        const age = Date.now() - pulse.time;
        if (age < 2000) {
          const ratio = age / 2000;
          ctx.beginPath();
          ctx.arc(node.x, node.y, size + (ratio * 60), 0, 2 * Math.PI, false);
          ctx.strokeStyle = color + Math.floor((1-ratio) * 255).toString(16).padStart(2, '0');
          ctx.lineWidth = 4 / globalScale;
          ctx.stroke();
        } else activePulses.delete(node.id);
      }

      if (globalScale > 1.2 || node.level <= 1 || node.rank > 0.1) {
        const fontSize = 12/globalScale;
        ctx.font = '300 ' + fontSize + 'px Outfit';
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = \`rgba(255, 255, 255, \${opacity * 0.6})\`;
        ctx.fillText(label, node.x - textWidth/2, node.y + size + 10);
      }

      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
      if (hollow) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    }

    function focusNode(node) {
      selectedNode = node;
      Graph.centerAt(node.x, node.y, 1000);
      Graph.zoom(4, 1000);
      const ins = document.getElementById('node-inspector');
      ins.parentElement.classList.remove('pointer-events-none');
      ins.style.opacity = '1';
      ins.style.transform = 'translateY(0)';
      document.getElementById('node-name').innerText = node.name;
      document.getElementById('node-type').innerText = (node.kind || node.group || 'unknown').toUpperCase();
      document.getElementById('node-level').innerText = 'L' + node.level;
      document.getElementById('node-file').innerText = node.filePath || 'Internal';
      document.getElementById('node-degree').innerText = node.degree || 0;
      document.getElementById('node-mass').innerText = node.mass?.toFixed(2) || '1.00';
      const override = manualOverrides.get(node.id);
      const gravity = override !== undefined ? override : (node.rank || 0);
      document.getElementById('gravity-val').innerText = gravity.toFixed(2);
      document.getElementById('gravity-slider').value = gravity;
    }

    document.getElementById('gravity-slider').addEventListener('input', (e) => {
      if (!selectedNode) return;
      const val = parseFloat(e.target.value);
      manualOverrides.set(selectedNode.id, val);
      document.getElementById('gravity-val').innerText = val.toFixed(2);
      Graph.refresh();
      Graph.d3AlphaTarget(0.1).restart();
      setTimeout(() => Graph.d3AlphaTarget(0), 500);
    });

    function defocus() {
      selectedNode = null;
      const ins = document.getElementById('node-inspector');
      ins.parentElement.classList.add('pointer-events-none');
      ins.style.opacity = '0';
      ins.style.transform = 'translateY(1rem)';
      Graph.zoomToFit(1000);
    }

    document.getElementById('layer-selector').addEventListener('change', (e) => {
      layerFilters[e.target.dataset.layer] = e.target.checked;
      localStorage.setItem('conducks_filters', JSON.stringify(layerFilters));
      applyFilters();
    });

    document.getElementById('reset-filters').addEventListener('click', () => {
      layerFilters = { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false };
      localStorage.setItem('conducks_filters', JSON.stringify(layerFilters));
      syncFilterUI();
      applyFilters();
    });

    function syncFilterUI() {
      document.querySelectorAll('#layer-selector input').forEach(input => {
        input.checked = layerFilters[input.dataset.layer];
      });
    }

    document.getElementById('diagnostic-lens').addEventListener('change', (e) => {
      activeLens = e.target.value;
      const lensStatus = document.getElementById('lens-status');
      if (lensStatus) {
        if (activeLens !== 'default') {
          lensStatus.innerText = 'LENS: ' + activeLens.toUpperCase();
          lensStatus.classList.remove('hidden');
        } else {
          lensStatus.classList.add('hidden');
        }
      }
      console.log('[Mirror] Lens Switched:', activeLens);
      Graph.refresh();
      Graph.d3AlphaTarget(0.4).restart();
      setTimeout(() => Graph.d3AlphaTarget(0), 1000);
    });

    document.getElementById('mode-graph').addEventListener('click', () => setMode(false));
    document.getElementById('mode-bubble').addEventListener('click', () => setMode(true));

    function setMode(bubble) {
      isBubbleMode = bubble;
      const btnG = document.getElementById('mode-graph');
      const btnB = document.getElementById('mode-bubble');
      if (bubble) {
        btnB.classList.add('text-blue-400', 'border-blue-500/40', 'bg-blue-500/10');
        btnB.classList.remove('text-gray-500');
        btnG.classList.remove('text-blue-400', 'border-blue-500/40', 'bg-blue-500/10');
        btnG.classList.add('text-gray-500');
      } else {
        btnG.classList.add('text-blue-400', 'border-blue-500/40', 'bg-blue-500/10');
        btnG.classList.remove('text-gray-500');
        btnB.classList.remove('text-blue-400', 'border-blue-500/40', 'bg-blue-500/10');
        btnB.classList.add('text-gray-500');
      }
      console.log('[Mirror] Mode Change:', bubble ? 'Bubble' : 'Graph');
      Graph.refresh();
      Graph.d3AlphaTarget(0.4).restart();
      setTimeout(() => Graph.d3AlphaTarget(0), 1200);
    }

    function hideOverlay() {
      const overlay = document.getElementById('loading-overlay');
      if (overlay.style.display === 'none') return;
      overlay.classList.add('opacity-0');
      setTimeout(() => overlay.style.display = 'none', 1000);
    }

    const pulseSource = new EventSource('/api/pulse');
    pulseSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const adv = document.getElementById('buddy-advice');
      adv.innerHTML = '<p class=\"text-[11px] text-blue-300 font-semibold uppercase tracking-widest mb-1\">Mirror Alert</p>' +
                      '<p class=\"text-[10px] text-gray-400\">Structural shift in <span class=\"text-blue-200 font-mono\">' + data.filePath + '</span></p>';
      const node = Graph.graphData().nodes.find(n => n.filePath === data.filePath);
      if (node) activePulses.set(node.id, { time: Date.now() });
    };

    function animate() { requestAnimationFrame(animate); }
    animate();
    materialiseSynapse();
  </script>
</body>
</html>
      `);
    });

    this.app.get('/api/synapse', (req, res) => {
      const wave = registry.mirror.getWave();
      res.json(wave);
    });

    this.app.get('/api/pulse', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      this.clients.push(res);
      req.on('close', () => {
        this.clients = this.clients.filter(c => c !== res);
      });
    });
  }

  public broadcastPulse(data: any) {
    this.clients.forEach(c => {
      c.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }

  public start(port: number = 3333) {
    this.app.listen(port, () => {
      console.error(`[Mirror Server] Unified Dashboard active at http://localhost:${port}`);
    });
  }
}

export let globalMirror: MirrorServer | null = null;
export function initGlobalMirror(graph: ConducksGraph) {
  globalMirror = new MirrorServer(graph);
  return globalMirror;
}
