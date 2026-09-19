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
      });
      const slateEl = document.getElementById(targetSlate);
      if (slateEl) {
        slateEl.style.display = 'block';
      }

      if (item.id === 'dock-governance') {
        loadGovernance();
      }
      if (item.id === 'dock-docs') {
        loadDocs();
      }
    });
  });

  // The docs watcher re-lints on write and pulses; redraw only when the panel is actually open,
  // so an editor save does not cost a fetch nobody is looking at.
  window.onDocsPulse = (pulse) => {
    const slate = document.getElementById('slate-docs');
    if (!slate || slate.style.display === 'none') return;
    loadDocs();
    const stamp = document.getElementById('docs-stamp');
    if (stamp) stamp.textContent = pulse.filePath + ' \u2192 ' + (pulse.violations ? pulse.violations + ' violation(s)' : 'clean');
  };


  /**
   * Build an element. The two panels below used to call `document.createElement`
   * and then assign `style.cssText` for every row — 78 of them — which meant a
   * restyle was a JavaScript edit and the two panels drifted apart. Class names
   * now, styles in styles.css.
   */
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  /** A titled block with an optional count, shared by both panels. */
  const section = (title, count) => {
    const s = el('section', 'deck-section');
    const h = el('div', 'section-header');
    h.appendChild(el('span', 'section-title', title));
    if (count !== undefined) h.appendChild(el('div', 'section-badge', String(count)));
    s.appendChild(h);
    return s;
  };

  /**
   * Empty and failure are different answers and must not look alike. A panel that
   * cannot reach its endpoint says so and names the command that shows the same
   * data; a panel with genuinely nothing in it says what that means.
   */
  const state = (headline, detail, kind) => {
    const p = el('div', 'panel-state' + (kind === 'error' ? ' is-error' : ''));
    p.appendChild(el('strong', null, headline));
    if (detail) {
      const d = el('span');
      // Split on backticks so a command name renders as one, without innerHTML.
      String(detail).split(/`([^`]+)`/).forEach((part, i) =>
        d.appendChild(i % 2 ? el('code', null, part) : document.createTextNode(part)));
      p.appendChild(d);
    }
    return p;
  };

  /** Fetch JSON, or render the failure into the panel and report it handled. */
  const load = async (url, panel, what) => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(resp.status + ' ' + resp.statusText);
      return await resp.json();
    } catch (err) {
      panel.appendChild(state(
        'Cannot read ' + what + '.',
        String(err.message || err) + '. The server is still running — this one endpoint failed. Run `conducks mirror` again, or read the same data with `conducks docs-status`.',
        'error'));
      return null;
    }
  };

  // 1a. 📄 DOCS PANEL — what is in flight (todo phases) and which decisions still bind.
  // Reads /api/docs, the same board `conducks docs-status` prints. Nothing here touches the graph.
  async function loadDocs() {
    const panel = document.getElementById('docs-panel');
    if (!panel) return;
    panel.replaceChildren();

    const stamp = el('p', 'panel-stamp', 'Live — re-reads when a doc is saved');
    stamp.id = 'docs-stamp';
    panel.appendChild(stamp);

    const data = await load('/api/docs', panel, 'the docs board');
    if (!data) return;

    const COLOUR = {
      done: 'var(--state-done)', blocked: 'var(--state-blocked)',
      doing: 'var(--state-doing)', todo: 'var(--state-todo)',
    };

    /** One phase: its address, how far it has got, and what is next or what blocks it. */
    const phaseRow = (ph, colour) => {
      const row = el('div', 'record-line');
      const addr = el('span', 'record-addr', ph.addr);
      addr.style.setProperty('--rec-color', colour);
      row.appendChild(addr);
      row.appendChild(el('span', 'record-count', ph.done + '/' + ph.total));
      row.appendChild(el('span', 'record-note record-wrap',
        ph.state === 'blocked'
          ? 'Waits on ' + (ph.blockedBy || []).join(', ')
          : ph.next ? ph.next : 'No open task'));
      return row;
    };

    const record = (headline, tag, colour, phases) => {
      const item = el('div', 'record');
      item.style.setProperty('--rec-color', colour);
      const head = el('div', 'record-head');
      head.appendChild(el('span', 'record-title', headline));
      if (tag) head.appendChild(el('span', 'record-tag', tag));
      item.appendChild(head);
      phases.forEach(ph => item.appendChild(phaseRow(ph, colour)));
      return item;
    };

    // DECISIONS THAT STILL OWE WORK — the question that otherwise costs a walk through every record.
    const owing = (data.decisions || []).filter(d => d.buildState === 'partial' || d.buildState === 'unbuilt');
    if (owing.length) {
      const s = section('Decisions with open work', owing.length);
      owing.forEach(d => {
        const dead = /^superseded$/i.test(d.state || '');
        const card = record(
          d.id + '  ' + String(d.title).replace(/^\d+\s*—\s*/, ''),
          dead ? 'superseded · ' + d.buildState : d.buildState,
          dead ? COLOUR.blocked : COLOUR.doing,
          (d.builtBy || []).filter(ph => ph.state !== 'done'));
        if (d.enforcedBy) card.appendChild(el('div', 'record-meta record-wrap', 'Enforced by ' + d.enforcedBy));
        s.appendChild(card);
      });
      panel.appendChild(s);
    }

    // OPEN WORK NOBODY LINKED TO A DECISION — valid, but it should be a deliberate choice.
    const unlinked = (data.todos || [])
      .filter(t => !/^done$/i.test(t.state || ''))
      .map(t => ({ t, phases: (t.phases || []).filter(ph => ph.state !== 'done' && !(ph.builds || []).length) }))
      .filter(x => x.phases.length);
    if (unlinked.length) {
      const s = section('Open work, no decision linked', unlinked.length);
      unlinked.forEach(x => s.appendChild(record(
        x.t.id + '  ' + String(x.t.title).replace(/^\S+\s*—\s*/, ''),
        x.t.done + '/' + x.t.total, COLOUR.todo, x.phases)));
      panel.appendChild(s);
    }

    if (!owing.length && !unlinked.length) {
      const s = section('Open work', 0);
      s.appendChild(state('Nothing open.',
        'Every phase in every todo is finished and every decision has its build link.'));
      panel.appendChild(s);
    }

    // HYGIENE — true findings that do not break the grammar, so they never fail the gate.
    const warns = data.warns || [];
    const unlinkedAdrs = data.unlinked || [];
    if (warns.length || unlinkedAdrs.length) {
      const s = section('Hygiene', warns.reduce((a, w) => a + w.errs.length, 0));
      warns.forEach(w => w.errs.forEach(e => {
        const row = el('div', 'record-meta record-wrap');
        row.appendChild(el('span', 'record-addr', w.file));
        row.appendChild(document.createTextNode(' ' + e));
        s.appendChild(row);
      }));
      if (unlinkedAdrs.length) {
        s.appendChild(el('div', 'record-meta record-wrap',
          unlinkedAdrs.length + ' decision(s) with no build link and no enforcing test: ' + unlinkedAdrs.join(' ')));
      }
      panel.appendChild(s);
    }

    // GRAMMAR — a violating doc is a doc the board is reading wrong, so it is stated here.
    const lint = data.lint || [];
    const s = section('Grammar', lint.length);
    if (lint.length) {
      lint.forEach(l => {
        const item = el('div', 'record');
        item.style.setProperty('--rec-color', COLOUR.blocked);
        item.appendChild(el('div', 'record-title record-wrap', l.file));
        (l.errs || []).forEach(e => item.appendChild(el('div', 'record-note record-wrap', e)));
        s.appendChild(item);
      });
    } else {
      s.appendChild(state('Grammar clean.', 'Every governed doc parses. Run `conducks docs-lint` in CI to keep it that way.'));
    }
    panel.appendChild(s);
  }

  // 1b. 🛡️ GOVERNANCE PANEL — what the audit found, and what it advises.
  async function loadGovernance() {
    const panel = document.getElementById('governance-panel');
    if (!panel) return;
    panel.replaceChildren();

    const data = await load('/api/governance', panel, 'the audit');
    if (!data) return;

    const severity = (v) => {
      const s = String(v ?? 'info').toLowerCase();
      if (s === 'error' || s === 'circular') return 'var(--state-blocked)';
      if (s === 'warning' || s === 'refactor') return 'var(--state-doing)';
      return 'var(--state-todo)';
    };

    const finding = (tag, text, colour) => {
      const item = el('div', 'record');
      item.style.setProperty('--rec-color', colour);
      const head = el('div', 'record-head');
      head.appendChild(el('span', 'record-tag', String(tag)));
      item.appendChild(head);
      item.appendChild(el('div', 'record-note record-wrap', String(text)));
      return item;
    };

    const violations = data.violations || [];
    const vs = section('Violations', violations.length);
    if (violations.length) {
      violations.forEach(v => vs.appendChild(finding(
        v.severity ?? v.type ?? 'info',
        v.message ?? v.id ?? JSON.stringify(v),
        severity(v.severity ?? v.type))));
    } else {
      vs.appendChild(state('No violations.', 'The audit found no cycles, no layer breaches and no self-imports in this graph.'));
    }
    panel.appendChild(vs);

    // Capped at 20: past that the panel stops being readable and the CLI is the right surface.
    const recs = data.recommendations || [];
    const rs = section('Recommendations', recs.length);
    if (recs.length) {
      recs.slice(0, 20).forEach(r => rs.appendChild(finding(
        r.priority ?? r.severity ?? 'info',
        r.message ?? r.description ?? r.id ?? JSON.stringify(r),
        'var(--state-note)')));
      if (recs.length > 20) {
        rs.appendChild(el('div', 'record-meta',
          'Showing 20 of ' + recs.length + '. Run `conducks advise` for the rest.'));
      }
    } else {
      rs.appendChild(state('Nothing to advise.', 'The audit produced no recommendations for this graph.'));
    }
    panel.appendChild(rs);

    if (data.stats) {
      const ss = section('Audit stats');
      const grid = el('div', 'filter-grid');
      Object.entries(data.stats).forEach(([key, val]) => {
        const pill = el('div', 'metric-pill');
        pill.appendChild(el('p', 'metric-label', key.replace(/_/g, ' ')));
        pill.appendChild(el('span', 'metric-value', String(val)));
        grid.appendChild(pill);
      });
      ss.appendChild(grid);
      panel.appendChild(ss);
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
  // Repulsion is applied to the running simulation; spread is a server parameter, so it re-fetches.
  document.getElementById('ctrl-repulsion')?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('label-repulsion').innerText = val.toFixed(0);
    Graph.d3Force('charge').strength(val);
    Graph.d3AlphaTarget(0.1).restart();
  });

  document.getElementById('ctrl-spread')?.addEventListener('change', (e) => {
    document.getElementById('label-spread').innerText = e.target.value;
    window.refreshSynapse();
  });

  // 5. 🕹️ PRESETS
  const presetBtns = document.querySelectorAll('.preset-btn');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (preset === 'hubs') setPreset(-6000, 2000, 0.40);
      else if (preset === 'depth') setPreset(-1500, 1000, 0.10);
      else if (preset === 'atomic') setPreset(-400, 600, 0.05);
    });
  });

  const setPreset = (repulsion, spread, gravity) => {
     window.MirrorState.gravity = gravity;
     const ctrlRep = document.getElementById('ctrl-repulsion');
     const ctrlSpr = document.getElementById('ctrl-spread');
     if (ctrlRep) ctrlRep.value = repulsion;
     if (ctrlSpr) ctrlSpr.value = spread;
     document.getElementById('label-repulsion').innerText = repulsion;
     document.getElementById('label-spread').innerText = spread;
     window.applyForces();
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

  const sortedClusters = [...wave.clusters].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 50);

  // Say what is LISTED, and say so when that is not all of them. The badge used to report the wave's
  // full cluster count above a list capped at fifty, so the two disagreed on every large graph.
  if (countBadge) {
    countBadge.innerText = sortedClusters.length < wave.clusters.length
      ? sortedClusters.length + '/' + wave.clusters.length
      : String(wave.clusters.length);
    countBadge.title = sortedClusters.length < wave.clusters.length
      ? 'The 50 largest of ' + wave.clusters.length + ' clusters'
      : '';
  }

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
