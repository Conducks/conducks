// Lay the architecture out with ELK, then paint it. No coordinate is written by hand.
//
// WHY A LAYOUT ENGINE. The hand-rolled version placed every node and routed every elbow by eye. A
// collision gate could REJECT a bad picture but never IMPROVE one, so each fix was a nudge that
// risked the next. ELK does what the gate could not: assigns layers, minimises edge crossings, gives
// every edge its own port and its own channel, and lays out nested containers as first-class nodes.
//
// BUILD TIME, NOT RUNTIME. The page ships static SVG: it prints, it needs no library, and the same
// input always yields the same picture — so a diff shows a real change, not a re-layout.
import ELK from 'elkjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { BANDS, BAND_LINKS, PAGE, pageFor } from './graph.mjs';

const elk = new ELK();
const CH = { t: 7.4, s: 6.0 };                       // measured character widths, per text style
const wide = (t, s) => Math.max(210, Math.min(360, 34 + Math.max(t.length * CH.t, s.length * CH.s)));

const LAYOUT = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',      // containers are real nodes, edges may cross them
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.cycleBreaking.strategy': 'GREEDY',   // the voice loops are genuine cycles
  'elk.layered.spacing.nodeNodeBetweenLayers': '58',
  'elk.layered.spacing.edgeNodeBetweenLayers': '26',
  'elk.spacing.nodeNode': '38',
  'elk.spacing.edgeNode': '24',
  'elk.spacing.edgeEdge': '16',
  'elk.spacing.edgeLabel': '8',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
};
const CONTAINER = {
  'elk.padding': '[top=62,left=26,bottom=26,right=26]',
  'elk.spacing.nodeNode': '38',
};

/**
 * The canvas draws every feature as ONE box and none of its steps (conducks-visuals SKILL.md §2).
 *
 * So a container enters ELK as a LEAF, not as a parent, and the blocks it holds never reach the
 * layout at all — `detail.mjs` already draws them, on the feature's own page, which is the only
 * place they now live. Nothing in the data file changed to make this true; the renderer simply
 * stops descending.
 *
 * The rule this replaces was "draw each feature's spine, three to seven steps". It was specified
 * for months and implemented in no project, because "is this step important enough" has no machine
 * answer and so no gate could hold it. Zero is checkable, and §4's gate checks it.
 */
const FEATURE_H = 96;

/** A contract is not a peer of the features and gets no box — it is the strip beneath them. */
const isContract = c => c.kind === 'contract';

/**
 * Container-level edges, DERIVED from the block-level ones already in the data.
 *
 * Writing a second edge list by hand would be two things to keep in step, and they would not stay
 * in step — the same argument that keeps positions out of the data file. So every edge the data
 * declares is mapped to the containers holding its endpoints; an edge inside one container
 * collapses to a self-pair and is dropped, which is exactly right, because that edge is a step of
 * one feature and steps are not on this picture.
 *
 * An edge touching a contract is dropped too. A contract is read by nearly everything, so drawing
 * those edges puts the densest region of the picture on its least interesting node.
 */
function containerEdges(bands) {
  const owner = new Map();                     // block id -> container id
  const kind = new Map();                      // container id -> kind
  for (const b of bands) for (const c of b.containers) {
    kind.set(c.id, c.kind ?? 'feature');
    for (const n of c.nodes) owner.set(n.id, c.id);
  }
  const at = id => owner.get(id) ?? (kind.has(id) ? id : undefined);
  const merged = new Map();
  // An endpoint that names nothing is a TYPO, and the wrong answer is to drop the edge. Measured
  // while mutation-testing this file: renaming one endpoint to `addd` removed a real edge from the
  // picture and the build still printed `ELK OK`. Before this function existed the same typo
  // crashed the engine — unreadable, but at least loud. Silence is the worse of the two.
  const unknown = [];
  const add = ([sBlk, tBlk, lbl, o]) => {
    const s = at(sBlk), t = at(tBlk);
    if (!s) unknown.push(sBlk);
    if (!t) unknown.push(tBlk);
    if (!s || !t || s === t) return;
    if (kind.get(s) === 'contract' || kind.get(t) === 'contract') return;
    const key = `${s}\u0000${t}`;
    const prev = merged.get(key);
    if (!prev) { merged.set(key, { s, t, lbls: lbl ? [lbl] : [], prio: o?.prio }); return; }
    // Several block edges collapsing to one feature edge each said something; keep every distinct
    // sentence rather than whichever happened to be declared first.
    if (lbl && !prev.lbls.includes(lbl)) prev.lbls.push(lbl);
    if (prev.prio === undefined && o?.prio !== undefined) prev.prio = o.prio;
  };
  for (const b of bands) {
    for (const c of b.containers) for (const e of c.edges ?? []) add(e);
    for (const e of b.crossEdges ?? []) add(e);
  }
  for (const e of BAND_LINKS) add(e);
  if (unknown.length) {
    console.error('LAYOUT REFUSED:');
    for (const id of new Set(unknown))
      console.error(`  - 10 · edge endpoint "${id}" is neither a block nor a container. A typo here would otherwise drop the edge in silence.`);
    process.exit(1);
  }
  if (!merged.size) { console.error('LAYOUT REFUSED:\n  - 10 · the data yielded no edges between features at all'); process.exit(1); }
  return [...merged.values()].map(e => ({ ...e, lbl: e.lbls.join(' · ') }));
}

function toElk(bands) {
  // Each band is a top-level container so they stack in order; ELK still routes the edges BETWEEN
  // them, which is what makes this one drawing rather than N pictures in a column.
  const derived = containerEdges(bands);
  const bandOf = new Map();
  for (const b of bands) for (const c of b.containers) bandOf.set(c.id, b.id);

  const children = bands.map(band => ({
    id: band.id,
    layoutOptions: { ...CONTAINER, 'elk.padding': '[top=86,left=30,bottom=30,right=30]' },
    children: band.containers.filter(c => !isContract(c)).map(c => ({
      id: c.id,
      isCont: true,                            // a leaf that still paints as a container
      width: Math.max(wide(c.title, (c.sub || '').slice(0, 64)), 300),
      height: FEATURE_H,
    })),
    // NO `labels` here on purpose. Handing ELK a label box makes it reserve space for one, and
    // measured on this graph that cost 11% more ink, 38% more width and MORE THAN DOUBLE the
    // direction reversals (20 vs 9) — the reserved boxes shove nodes apart and force detours.
    // Labels are placed afterwards by the occlusion resolver, which is better at it anyway.
    edges: derived.filter(e => bandOf.get(e.s) === band.id && bandOf.get(e.t) === band.id)
      .map((e, i) => ({ id: `${band.id}_x${i}`, sources: [e.s], targets: [e.t], lbl: e.lbl,
        ...(e.prio !== undefined ? { layoutOptions: { 'elk.layered.priority.direction': String(e.prio) } } : {}) })),
  }));
  // 10 · Every edge must name a box that is actually drawn.
  //
  // This catches two things with one check. A contract is read by nearly everything, so an edge to
  // one is a hairball rather than information — and it is filtered out of the boxes, so an edge
  // reaching it names a node ELK has never heard of. Measured: ELK's answer to that is a 64 KB
  // stack trace out of `elk-worker.min.js` naming a GWT internal, with nothing in it about the
  // edge. The same check refuses a plain typo in a container id, which used to surface the same way.
  const drawn = new Set(children.flatMap(b => b.children.map(c => c.id)));
  const dangling = derived.filter(e => !drawn.has(e.s) || !drawn.has(e.t));
  if (dangling.length) {
    console.error('LAYOUT REFUSED:');
    for (const e of dangling) {
      const which = !drawn.has(e.s) ? e.s : e.t;
      console.error(`  - 10 · edge ${e.s} → ${e.t} names ${which}, which is not a drawn box.`);
      console.error('        A contract carries no edges (SKILL.md §2); anything else here is a typo.');
    }
    process.exit(1);
  }
  const edges = derived.filter(e => bandOf.get(e.s) !== bandOf.get(e.t))
    .map((e, i) => ({ id: `bl${i}`, sources: [e.s], targets: [e.t], lbl: e.lbl,
      ...(e.prio !== undefined ? { layoutOptions: { 'elk.layered.priority.direction': String(e.prio) } } : {}) }));
  return { id: 'root', layoutOptions: LAYOUT, children, edges };
}

/**
 * ELK reports a node's position relative to its parent, and an EDGE relative to the lowest common
 * ancestor of its two endpoints — not relative to the node whose `edges` array declared it. Those are
 * the same thing for an edge inside one container and DIFFERENT for one that spans containers, which
 * is why three return edges once floated ~30px clear of the boxes they were supposed to touch.
 * Resolve the ancestor per edge, and the sections land on the boundary every time.
 */
function flatten(root) {
  const out = { nodes: [], conts: [], edges: [] };
  const offset = new Map();       // container id -> absolute [x, y]
  const parent = new Map();       // any id -> parent container id
  (function walk(n, dx, dy) {
    offset.set(n.id, [dx, dy]);
    for (const c of n.children ?? []) {
      parent.set(c.id, n.id);
      const x = dx + (c.x ?? 0), y = dy + (c.y ?? 0);
      if (c.children?.length) { out.conts.push({ ...c, x, y }); walk(c, x, y); }
      else out.nodes.push({ ...c, x, y });
    }
  })(root, 0, 0);

  const chain = id => { const c = []; for (let k = id; k !== undefined; k = parent.get(k)) c.unshift(k); return c; };
  const lca = (a, b) => {
    const A = chain(a), B = chain(b);
    let best = 'root';
    for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i] === B[i]) best = A[i]; else break;
    return best;
  };
  (function collect(n) {
    for (const e of n.edges ?? []) {
      const anc = lca(e.sources[0], e.targets[0]);
      const [ox, oy] = offset.get(anc) ?? [0, 0];
      out.edges.push({ ...e, ox, oy });
    }
    for (const c of n.children ?? []) if (c.children?.length) collect(c);
  })(root);
  out.parent = parent;
  return out;
}


/**
 * NOTHING MAY BE HIDDEN.
 *
 * ELK places nodes and routes edges, but it does not know that a connector tag, an edge label and a
 * block can all want the same square of canvas. Detecting that is not enough — a gate that only
 * refuses leaves the picture broken. So: everything already drawn CLAIMS a rectangle, and anything
 * placed afterwards is moved to the nearest free spot that touches nothing.
 *
 * Claim order matters and is deliberate: blocks first (they are the content), then container
 * headings, then edge labels, then connector tags. Later things yield to earlier ones.
 */
function makeSpace() {
  const claimed = [];
  const hit = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  return {
    claim(x, y, w, h, what) { claimed.push({ x, y, w, h, what }); },
    free(r) { return !claimed.some(c => hit(r, c)); },
    /** Nearest free spot to (x,y): try the anchor, then ring outwards. Returns null if boxed in. */
    place(x, y, w, h, { rings = 9, step = 17 } = {}) {
      const cand = [[0, 0]];
      for (let r = 1; r <= rings; r++)
        for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1],[-2,0],[2,0],[0,-2],[0,2]])
          cand.push([dx * step * r, dy * step * r]);
      for (const [dx, dy] of cand) {
        const rect = { x: x + dx - w / 2, y: y + dy - h / 2, w, h };
        if (this.free(rect)) { claimed.push({ ...rect, what: 'placed' }); return { x: x + dx, y: y + dy }; }
      }
      return null;
    },
    all: claimed,
  };
}

/**
 * SHORTEST PATH, WITHIN THE RULES.
 *
 * ELK gives every edge its own channel, which is why a cross-container edge sometimes travels the
 * long way round rather than crossing another line. The rules here are different, and all three are
 * enforced rather than hoped for:
 *
 *   1. crossing another EDGE is fine
 *   2. crossing a BLOCK, or a CONTAINER, the edge has nothing to do with is NOT
 *   3. every segment is horizontal or vertical — never a diagonal
 *
 * Rule 2 cost a version: the first router treated only blocks as obstacles, so a re-routed edge
 * happily cut straight across the VOICE container on its way somewhere else. A container an edge
 * legitimately passes through is one that CONTAINS an endpoint — its own, or a shared ancestor.
 *
 * Rule 3 cost the same version: A* walks a grid, so the interior is axis-aligned by construction,
 * but the true ports do not sit on grid lines. Joining them straight to the first grid point drew a
 * diagonal at each end. Both ends now get an explicit elbow, and a final check REJECTS any path with
 * a diagonal in it rather than drawing one.
 */
function makeRouter(nodes, conts, ancestorsOf, step = 22) {
  const pad = 14;               // clearance from a block — an edge grazing a border reads as touching it
  const cpad = 8;               // clearance from a container it may not enter
  const blocks = nodes.map(n => ({ id: n.id, x: n.x - pad, y: n.y - pad, w: n.width + 2 * pad, h: n.height + 2 * pad }));
  const boxes = conts.map(c => ({ id: c.id, x: c.x - cpad, y: c.y - cpad, w: c.width + 2 * cpad, h: c.height + 2 * cpad }));

  // LANES. Crossing another edge is fine; running ALONG one is not — two lines on the same track read
  // as a single line and neither can be followed. So every cell an already-routed edge occupies costs
  // extra to enter, which makes the search prefer the next lane over rather than the same track.
  const used = new Map();                       // "x,y" -> how many edges already run through it
  const OCCUPIED_COST = 6;
  const mark = pts => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / step;
      for (let t = 0; t <= n; t++) {
        const k = Math.round(a.x + (b.x - a.x) * (t / Math.max(n, 1)) ) / step;
        const l = Math.round(a.y + (b.y - a.y) * (t / Math.max(n, 1)) ) / step;
        const key = Math.round(k) + ',' + Math.round(l);
        used.set(key, (used.get(key) ?? 0) + 1);
      }
    }
  };

  const route = function (from, to, srcId, dstId) {
    // A container is passable only if it holds one of the two endpoints.
    const open2 = new Set([...ancestorsOf(srcId), ...ancestorsOf(dstId)]);
    const solid = [
      ...blocks.filter(b => b.id !== srcId && b.id !== dstId),
      ...boxes.filter(b => !open2.has(b.id)),
    ];
    const blocked = (x, y) => solid.some(b => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);

    const gx = v => Math.round(v / step), key = (a, b) => a + ',' + b;
    const start = [gx(from.x), gx(from.y)], goal = [gx(to.x), gx(to.y)];
    const h = (a, b) => Math.abs(a - goal[0]) + Math.abs(b - goal[1]);
    const open = [{ x: start[0], y: start[1], g: 0, f: h(start[0], start[1]), dir: null, prev: null }];
    const seen = new Map([[key(start[0], start[1]), 0]]);
    let guard = 24000;
    while (open.length && guard-- > 0) {
      open.sort((a, b) => a.f - b.f);
      const cur = open.shift();
      if (cur.x === goal[0] && cur.y === goal[1]) {
        const pts = []; for (let n = cur; n; n = n.prev) pts.unshift({ x: n.x * step, y: n.y * step });
        // collapse collinear runs so the path is corners, not grid steps
        const mid = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i], c = pts[i + 1];
          if (!a || !c || !((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y))) mid.push(b);
        }
        // Join the real ports to the grid with an ELBOW, never a diagonal (rule 3).
        const elbow = (p, q) => (p.x === q.x || p.y === q.y) ? [] : [{ x: q.x, y: p.y }];
        const out = [from, ...elbow(from, mid[0] ?? to), ...mid, ...elbow(mid[mid.length - 1] ?? from, to), to];
        const clean = out.filter((p, i) => i === 0 || p.x !== out[i-1].x || p.y !== out[i-1].y);
        for (let i = 1; i < clean.length; i++)                 // rule 3, enforced
          if (clean[i].x !== clean[i-1].x && clean[i].y !== clean[i-1].y) return null;
        return clean;
      }
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < -4 || ny < -4 || nx > 4000 || ny > 4000) continue;
        if (blocked(nx * step, ny * step)) continue;
        const turn = cur.dir && (cur.dir[0] !== dx || cur.dir[1] !== dy) ? 3 : 0;  // corners cost
        const busy = (used.get(nx + ',' + ny) ?? 0) * OCCUPIED_COST;
        const g = cur.g + 1 + turn + busy, k = key(nx, ny);
        if (seen.has(k) && seen.get(k) <= g) continue;
        seen.set(k, g);
        open.push({ x: nx, y: ny, g, f: g + h(nx, ny), dir: [dx, dy], prev: cur });
      }
    }
    return null;
  };
  route.mark = mark;
  return route;
}
const manhattan = pts => { let d = 0; for (let i = 1; i < pts.length; i++) d += Math.abs(pts[i].x - pts[i-1].x) + Math.abs(pts[i].y - pts[i-1].y); return d; };

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Containers with a hand-written page own their own links; every other block's link is DERIVED from
// the container it is in. Hardcoding it broke the moment two blocks moved container — the links kept
// pointing at the page they used to live on. A derived link cannot go stale that way.
// ONE rule for every link: the page comes from the container, the fragment is the node id. Nothing
// is written by hand, so a block moving container updates its link, and a renamed block updates its
// fragment. The hand-written pages carry an anchor per node id so this rule holds for them too — the
// link checker fails the build if one is missing.
const linkFor = (cid, id, prob) => prob ? `problems.html#p${prob}` : `modules/${PAGE[cid] ?? cid.replace(/^c_/, '')}.html#${id}`;

function paint(bands, laid) {
  const meta = new Map(), bmeta = new Map();
  for (const b of bands) {
    bmeta.set(b.id, b);
    // §8 — a feature's link is DERIVED from its id, never typed. `href` in the data is an override,
    // for the few whose page is not `pageFor(id)`. Without it a repo that wrote no hrefs got detail
    // pages nothing on the canvas opened: generated, and linked from nowhere.
    for (const c of b.containers) meta.set(c.id, { ...c, link: c.href ?? `modules/${pageFor(c.id)}` });
  }
  const flat = flatten(laid);
  const o = [];
  const space = makeSpace();
  // Blocks are the content: they claim first and never move.
  for (const nd of flat.nodes) space.claim(nd.x, nd.y, nd.width, nd.height, `block ${nd.id}`);
  // A container's heading strip claims its own band so nothing lands on the title.
  for (const c of flat.conts) space.claim(c.x, c.y, c.width, 80, `head ${c.id}`);

  for (const c of flat.conts) {
    const b = bmeta.get(c.id);
    if (b) {                                   // a BAND: a heading, not a clickable container
      // THE NUMBER COMES FROM THE DATA, NOT THE ARRAY POSITION. It was `indexOf(b) + 1`, which is
      // the same thing only while the bands are contiguous. A repo that had drawn bands 1 and 3 and
      // not yet drawn 2 got its band3 painted with a big "2" — the number of the band that is NOT on
      // the canvas — while its index page called the same thing Band 3. Two numbers, one band, and
      // the wrong one was the one drawn largest.
      const num = b.n ?? (Number(String(b.id).match(/\d+/)?.[0]) || bands.indexOf(b) + 1);
      // The band frame carries its id so `architecture.html#band3` lands on the band. Without it the
      // only anchors on the page are blocks, and an index card linking to a band had nowhere to go.
      o.push(`<rect class="band-r" id="${esc(b.id)}" x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="14"/>`);
      o.push(`<text class="band-n" x="${c.x + 26}" y="${c.y + 52}">${num}</text>`);
      o.push(`<text class="band-t" x="${c.x + 74}" y="${c.y + 44}">${esc(b.title)}</text>`);
      o.push(`<text class="band-s" x="${c.x + 74}" y="${c.y + 66}">${esc(b.sub)}</text>`);
      continue;
    }
  }

  // Every edge is drawn in full. An earlier version replaced the long ones with lettered off-page
  // connectors to save ink — but that is a PAPER convention, and this is a canvas you can pan and
  // zoom. Following a line beats matching letters, and the measurement settled it: ELK routes all 82
  // edges, the long ones included, WITHOUT passing through a single block.
  //
  // Long edges get their own class so they read as a deliberate span rather than clutter, and every
  // edge is its own group carrying a from → to title, so hovering one brings it to full strength.
  // That is how you trace a long edge without a letter to match.
  const FAR = 1100, dropped = [];
  // Which containers may an edge pass through? Its own, and every ancestor up to the root.
  const ancestorsOf = id => { const a = new Set(); for (let k = flat.parent.get(id); k; k = flat.parent.get(k)) a.add(k); return a; };
  const router = makeRouter(flat.nodes, flat.conts, ancestorsOf);
  const drawn = [];
  // Every path already committed, as (orientation, track, span) — used to spot an edge running ALONG
  // another rather than across it.
  const tracks = [];
  const addTracks = pts => { for (let i = 1; i < pts.length; i++) { const a = pts[i-1], b = pts[i];
    if (Math.abs(a.x - b.x) < 0.6) tracks.push({ v: 1, c: a.x, lo: Math.min(a.y,b.y), hi: Math.max(a.y,b.y) });
    else tracks.push({ v: 0, c: a.y, lo: Math.min(a.x,b.x), hi: Math.max(a.x,b.x) }); } };
  const sharesTrack = pts => {
    for (let i = 1; i < pts.length; i++) { const a = pts[i-1], b = pts[i];
      const v = Math.abs(a.x - b.x) < 0.6;
      const c = v ? a.x : a.y, lo = v ? Math.min(a.y,b.y) : Math.min(a.x,b.x), hi = v ? Math.max(a.y,b.y) : Math.max(a.x,b.x);
      for (const t of tracks) if (t.v === (v ? 1 : 0) && Math.abs(t.c - c) < 10 && Math.min(t.hi,hi) - Math.max(t.lo,lo) > 8) return true; }
    return false;
  };
  let rerouted = 0;
  const lenOf = sec => {
    const p = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint];
    let d = 0; for (let i = 1; i < p.length; i++) d += Math.abs(p[i].x - p[i-1].x) + Math.abs(p[i].y - p[i-1].y);
    return d;
  };
  const nameOf = id => (meta.get(id)?.t ?? id);
  for (const e of flat.edges) {
    for (const sec of e.sections ?? []) {
      let pts = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint]
        .map(p => ({ x: p.x + e.ox, y: p.y + e.oy }));
      // Two reasons to re-route. A DETOUR: ELK sent it more than 1.6x further than it needed. An
      // OVERLAP: it runs along a track another edge already occupies, which reads as one line and
      // makes both unfollowable. The router charges for occupied cells, so it picks the next lane.
      const need = Math.abs(pts[0].x - pts[pts.length-1].x) + Math.abs(pts[0].y - pts[pts.length-1].y);
      const detoured = need > 0 && manhattan(pts) / need > 1.6;
      if (detoured || sharesTrack(pts)) {
        const alt = router(pts[0], pts[pts.length-1], e.sources[0], e.targets[0]);
        if (alt && manhattan(alt) <= manhattan(pts) * (detoured ? 0.92 : 1.35)) { pts = alt; rerouted++; }
      }
      router.mark(pts);
      addTracks(pts);
      drawn.push({ id: e.id, from: e.sources[0], to: e.targets[0], pts });
      const far = manhattan(pts) > FAR;
      const d = `M${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')}`;
      // A fat transparent path under the thin one: an orthogonal line is 1.5px wide and nearly
      // impossible to hit with a pointer, so the hit area is widened without changing the look.
      // from/to are carried on the element so the page can answer "what touches this block?" without
      // re-deriving the graph in the browser.
      o.push(`<g class="e${far ? ' far' : ''}" data-e="${e.id}" data-from="${e.sources[0]}" data-to="${e.targets[0]}">`
           + `<title>${esc(nameOf(e.sources[0]))} \u2192 ${esc(nameOf(e.targets[0]))}</title>`);
      o.push(`<path class="edge-hit" d="${d}"/>`);
      // An edge may declare its own class — `{cls:'edge-d'}` for a dashed line, the one used for a
      // path that carries something the normal flow does not. It was accepted by the data, validated
      // by the gate below, and then DROPPED here: the emit hard-coded `edge`, so a repo that marked
      // its secret-delivery edge dashed got a plain line and no way to tell. A long span still wins,
      // because `edge-far` is about legibility across the canvas rather than about meaning.
      o.push(`<path class="${far ? 'edge-far' : (e.cls || 'edge')}" d="${d}"/>`);
      o.push('</g>');

      // The label goes on this edge's LONGEST STRAIGHT RUN — the one place it reads as belonging to
      // the line rather than floating near a corner — then the occlusion placer moves it if taken.
      if (e.lbl) {
        let best = null, bestLen = -1;
        for (let i = 1; i < pts.length; i++) {
          const len = Math.abs(pts[i].x - pts[i-1].x) + Math.abs(pts[i].y - pts[i-1].y);
          if (len > bestLen) { bestLen = len; best = { x: (pts[i].x + pts[i-1].x) / 2, y: (pts[i].y + pts[i-1].y) / 2 }; }
        }
        const w = e.lbl.length * 6 + 8, h = 16;
        const p = best && space.place(best.x, best.y, w, h, { rings: 10, step: 15 });
        if (p) o.push(`<text class="lbl" data-e="${e.id}" x="${(p.x - w / 2 + 4).toFixed(1)}" y="${(p.y + 4).toFixed(1)}">${esc(e.lbl)}</text>`);
        else dropped.push(`label "${e.lbl}"`);
      }
    }
  }

  for (const nd of flat.nodes) {
    const m = meta.get(nd.id); if (!m) continue;
    // The drawn unit is the feature. It keeps the block vocabulary — the `blk` group, a `b-t`
    // title, the `i` marker and its hit disc — because the GESTURES did not change when the
    // altitude did: click selects and traces, the marker and a double click open. Renaming the
    // classes would have meant editing `system.js`, which is shared byte-for-byte, to say the same
    // thing in different words.
    o.push(`<g class="blk cont" id="blk-${nd.id}"><a href="${m.link}">`);
    // The main-feature anchor — where the feature BEGINS. A container without one is a boundary
    // nobody can argue with, which was the state of every canvas built to these rules until now.
    if (m.anchor) o.push(`<title>${esc(m.anchor)}</title>`);
    o.push(`<rect class="cont-r" x="${nd.x}" y="${nd.y}" width="${nd.width}" height="${nd.height}" rx="12"/>`);
    o.push(`<text class="cont-t b-t" x="${nd.x + 20}" y="${nd.y + 38}">${esc(m.title)}</text>`);
    if (m.sub) o.push(`<text class="cont-s" x="${nd.x + 20}" y="${nd.y + 62}">${esc(m.sub)}</text>`);
    o.push(`<circle class="hint" cx="${nd.x + nd.width - 17}" cy="${nd.y + 17}" r="6"/>`);
    o.push(`<text class="hint-t" x="${nd.x + nd.width - 17}" y="${nd.y + 20.5}">i</text>`);
    // A 6px circle with a 9px glyph is not a click target — at 40% zoom it is under three real
    // pixels. This transparent disc sits on top and catches the click for it. Emitted last so it
    // wins the hit test against the rect underneath.
    o.push(`<circle class="hint-h" cx="${nd.x + nd.width - 17}" cy="${nd.y + 17}" r="16"/>`);
    o.push(`</a></g>`);
  }
  // ── the substrate strip ───────────────────────────────────────────────────
  //
  // A contract is the shape every feature above is written against — the vault, the seam. Change
  // one and every feature moves, which is exactly why it is NOT a peer of the boxes: drawn as one
  // it earns an edge from nearly everything, and the densest region of the picture ends up on its
  // least interesting node. The strip says the same fact and costs no ink (SKILL.md §2).
  //
  // It is laid out here rather than by ELK because it has no edges to route: a row of boxes under
  // the drawing is arithmetic, and handing it to the engine would let it drift up into the bands.
  const contracts = bands.flatMap(b => b.containers.filter(isContract));
  let extraH = 0;
  if (contracts.length) {
    const bottom = Math.max(...flat.conts.map(c => c.y + c.height), 0);
    const y = bottom + 54, W = 300, GAP = 22, H = 92;
    const left = flat.conts.length ? Math.min(...flat.conts.map(c => c.x)) : 0;
    o.push(`<text class="sec-t" x="${left}" y="${y - 16}">THE SUBSTRATE — EVERY FEATURE ABOVE IS WRITTEN AGAINST THESE</text>`);
    contracts.forEach((c, i) => {
      const x = left + i * (W + GAP);
      o.push(`<g class="blk cont sub-c" id="blk-${c.id}"><a href="${c.href ?? `modules/${pageFor(c.id)}`}">`);
      if (c.anchor) o.push(`<title>${esc(c.anchor)}</title>`);
      o.push(`<rect class="cont-r sub-r" x="${x}" y="${y}" width="${W}" height="${H}" rx="12"/>`);
      o.push(`<text class="cont-t b-t" x="${x + 20}" y="${y + 36}">${esc(c.title)}</text>`);
      if (c.sub) o.push(`<text class="cont-s" x="${x + 20}" y="${y + 60}">${esc(c.sub.slice(0, 52))}</text>`);
      o.push(`<circle class="hint" cx="${x + W - 17}" cy="${y + 17}" r="6"/>`);
      o.push(`<text class="hint-t" x="${x + W - 17}" y="${y + 20.5}">i</text>`);
      o.push(`<circle class="hint-h" cx="${x + W - 17}" cy="${y + 17}" r="16"/>`);
      o.push(`</a></g>`);
    });
    extraH = (y + H + 30) - bottom;
  }

  return { body: o.join('\n'), flat, space, dropped, rerouted, drawn, extraH };
}

/** The gate survives the move: ELK is trusted to lay out, never trusted blindly. */
function verify(flat, meta) {
  const bad = [];
  // Connectivity: an edge that does not touch both of its boxes is a drawing that lies about the
  // system. Checked against the node the edge NAMES, not the nearest box.
  const at = new Map(flat.nodes.map(n => [n.id, n]));
  const onEdgeOf = (p, n, tol = 2.5) =>
    p.x >= n.x - tol && p.x <= n.x + n.width + tol && p.y >= n.y - tol && p.y <= n.y + n.height + tol &&
    (Math.abs(p.x - n.x) <= tol || Math.abs(p.x - (n.x + n.width)) <= tol ||
     Math.abs(p.y - n.y) <= tol || Math.abs(p.y - (n.y + n.height)) <= tol);
  for (const e of flat.edges) {
    const s0 = at.get(e.sources[0]), t0 = at.get(e.targets[0]);
    for (const sec of e.sections ?? []) {
      const a = { x: sec.startPoint.x + e.ox, y: sec.startPoint.y + e.oy };
      const b = { x: sec.endPoint.x + e.ox, y: sec.endPoint.y + e.oy };
      if (s0 && !onEdgeOf(a, s0)) bad.push(`edge ${e.id} does not start on ${e.sources[0]}`);
      if (t0 && !onEdgeOf(b, t0)) bad.push(`edge ${e.id} does not end on ${e.targets[0]}`);
    }
  }
  const boxes = flat.nodes.map(n => [n.x, n.y, n.width, n.height, n.id]);
  const ov = (a, b, p = 0) => !(a[0] + a[2] + p <= b[0] || b[0] + b[2] + p <= a[0] ||
                                a[1] + a[3] + p <= b[1] || b[1] + b[3] + p <= a[1]);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      if (ov(boxes[i], boxes[j])) bad.push(`blocks ${boxes[i][4]}/${boxes[j][4]} overlap`);
  for (const n of flat.nodes) {
    const m = meta.get(n.id); if (!m) continue;
    if (15 + m.t.length * CH.t > n.width - 6) bad.push(`title overflows ${n.id}`);
  }
  return bad;
}

// Every node id must be unique across the WHOLE graph: ELK keys on id, so a repeat silently merges
// two different blocks into one. Cost me a confusing layout refusal before it was caught.
{
  const seen = new Set(), dup = [];
  for (const b of BANDS) for (const c of b.containers) for (const n of c.nodes)
    { if (seen.has(n.id)) dup.push(n.id); seen.add(n.id); }
  if (dup.length) { console.error('DUPLICATE NODE IDS:', [...new Set(dup)].join(', ')); process.exit(1); }
}
// `n(id, title, sub, hover, opts)` takes ONE options object. Writing the options positionally —
// n(..., 'n-hi', 'dia', {}) — is silently accepted by JS and drops the style, the shape and the
// link. One node was drawn as a plain unclickable box for days because of it.
{
  const bad = [];
  for (const b of BANDS) for (const c of b.containers) for (const n of c.nodes) {
    for (const k of Object.keys(n)) if (!['id','t','s','hov','cls','shape','prob'].includes(k)) bad.push(`${n.id}: stray key "${k}"`);
    if (n.cls && !/^n-/.test(n.cls)) bad.push(`${n.id}: cls "${n.cls}" is not an n-* class`);
    if (n.shape && n.shape !== 'dia') bad.push(`${n.id}: shape "${n.shape}" is not a shape`);
  }
  if (bad.length) { console.error('MALFORMED NODES:'); for (const x of bad) console.error('  -', x); process.exit(1); }
}
const graph = toElk(BANDS);
const laid = await elk.layout(graph);
const { body, flat, space, dropped, rerouted, drawn, extraH } = paint(BANDS, laid);
const meta = new Map(); for (const b of BANDS) for (const c of b.containers) for (const n of c.nodes) meta.set(n.id, n);
// ── THE RULES ────────────────────────────────────────────────────────────────
// Six of them, checked on the finished drawing, not on intent. Anything that fails means something
// on the page is hidden or ambiguous, and the build refuses rather than shipping it.
const bad = verify(flat, meta);
const hit = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
const R = space.all;
for (let i = 0; i < R.length; i++)
  for (let j = i + 1; j < R.length; j++)
    if (hit(R[i], R[j])) bad.push(`1/2/3 · ${R[i].what} overlaps ${R[j].what}`);
// 4 · a container must not overlap another container
const cs = flat.conts.map(c => ({ x: c.x, y: c.y, w: c.width, h: c.height, id: c.id }));
for (let i = 0; i < cs.length; i++)
  for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    const nested = (a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h) ||
                   (b.x <= a.x && b.y <= a.y && b.x + b.w >= a.x + a.w && b.y + b.h >= a.y + a.h);
    if (!nested && hit(a, b)) bad.push(`4 · container ${a.id} overlaps ${b.id}`);
  }
// 5 · every block sits inside a container
for (const n of flat.nodes)
  if (!flat.conts.some(c => c.x <= n.x && c.y <= n.y && c.x + c.width >= n.x + n.width && c.y + c.height >= n.y + n.height))
    bad.push(`5 · block ${n.id} escapes its container`);
// 6 · nothing was given up on
for (const d of dropped) bad.push(`6 · nowhere free to put ${d}`);
// 9 · THE ALTITUDE. The canvas draws every feature as one box and none of its steps (SKILL.md §2).
//
// Checked by counting what was DRAWN against what the data says should be drawn, because that is
// the only form of this check a machine can settle. The rule it replaced — "draw each feature's
// spine, the three to seven steps that matter" — asks whether a step is important enough, which has
// no machine answer, so it drifted for months while every other rule in this file held. A renderer
// that started descending into containers again would put 74 boxes here instead of 13.
const wantBoxes = BANDS.flatMap(b => b.containers).filter(c => c.kind !== 'contract').length;
if (flat.nodes.length !== wantBoxes)
  bad.push(`9 · the canvas drew ${flat.nodes.length} boxes for ${wantBoxes} features — a step of a feature has reached the canvas, and steps belong on the feature's own page`);
// And refuse on an empty parse: a check whose subject came back empty reports a clean run over
// nothing, which is the failure mode §4 of references/layout.md exists to name.
if (!wantBoxes) bad.push('9 · no feature to draw — the data parsed to zero containers');
// 11 · A feature without a main-feature anchor is a boundary nobody can argue with. Every claim on
// the page was checkable except the claim about what the page is divided INTO — measured on one
// canvas as thirty-nine containers, not one of them saying where its feature started.
for (const c of BANDS.flatMap(b => b.containers))
  if (!c.anchor) bad.push(`11 · container ${c.id} carries no main-feature anchor — nothing says where this feature begins`);

if (bad.length) { console.error('LAYOUT REFUSED:'); for (const b of new Set(bad)) console.error('  -', b); process.exit(1); }
// PUBLISH, rather than leaving the SVG in /tmp for a human to paste. The paste was the drift the
// whole generator exists to stop: the run reported "ELK OK — 207 nodes" while the page on disk still
// showed 117, and nothing said so. Splice between the `<svg id="canvas"` open tag and its matching
// `</svg>`, so the surrounding chrome (toolbar, minimap, the scripts) is untouched.
// `<g id="viewport">` is NOT decoration — the page's pan/zoom holds it as `vp` and writes every
// transform onto it. Emitting the shapes bare into `<svg>` left `getElementById('viewport')` null,
// so the first pan threw and the canvas was frozen: it rendered, and nothing moved. The gates all
// passed, because a picture that is correct and unusable is still byte-identical to itself.
const svg = `<svg id="canvas" viewBox="0 0 ${Math.ceil(laid.width)} ${Math.ceil(laid.height + (extraH ?? 0))}"`
          + ` xmlns="http://www.w3.org/2000/svg">\n<g id="viewport">\n${body}\n</g>\n</svg>`;
const PAGE_PATH = 'docs/visuals/architecture.html';
const page = readFileSync(PAGE_PATH, 'utf8');
const open = page.indexOf('<svg id="canvas"');
const close = page.indexOf('</svg>', open);
if (open === -1 || close === -1) {
  console.error(`LAYOUT REFUSED:\n  - ${PAGE_PATH} has no <svg id="canvas"> … </svg> to splice into`);
  process.exit(1);
}
let published = page.slice(0, open) + svg + page.slice(close + '</svg>'.length);

// 7 · THE PAGE MUST STILL WORK, not merely be correct.
//
// Every other gate here checks the DRAWING — do blocks overlap, does an edge cross a container, is
// a label hidden. All of them passed on a canvas that rendered perfectly and could not be panned,
// because the splice dropped `<g id="viewport">` and the script's `getElementById('viewport')`
// returned null. A picture that is right and unusable is byte-identical to itself, so the drift
// gate called it clean too. Nothing in the build was looking at the half that makes it interactive.
//
// So: resolve every selector the page's own script asks the DOM for. This cannot prove the script
// RUNS, but it catches the whole class of failure where the renderer and the page chrome drift
// apart — which is the only way this file can break the page it writes.
//
// The script is `docs/visuals/system.js`, a SHARED file (conducks-visuals §0) — not an inline block. It used
// to be inline, and this gate read it back out of its own output with `slice(indexOf('<script>'))`.
// That is the empty-parse lie §12 names: the moment the script moved to a file, the slice returned
// the one-line `<script src>` tag, matched no selector, and the gate reported a clean run over
// nothing. So: read the file, and REFUSE if it is missing or has no selectors in it.
{
  const JS_PATH = 'docs/visuals/system.js';
  let js = '';
  try { js = readFileSync(JS_PATH, 'utf8'); } catch { js = ''; }
  const asked = [...js.matchAll(/getElementById\((['"])(.+?)\1\)/g),
                 ...js.matchAll(/querySelector(?:All)?\((['"])(.+?)\1\)/g)].length;
  if (!asked) {
    console.error('LAYOUT REFUSED:');
    console.error(`  - 7 · ${JS_PATH} is missing or asks the DOM for nothing. This gate would pass over an`);
    console.error('        empty set, which reads exactly like passing over a full one.');
    process.exit(1);
  }
  if (!published.includes('src="system.js"')) {
    console.error('LAYOUT REFUSED:');
    console.error('  - 7 · the page does not load system.js. The canvas would draw and never respond.');
    process.exit(1);
  }
  const missing = [];
  for (const [, , id] of js.matchAll(/getElementById\((['"])(.+?)\1\)/g))
    if (!published.includes(`id="${id}"`)) missing.push(`#${id}`);
  for (const [, , sel] of js.matchAll(/querySelector(?:All)?\((['"])(.+?)\1\)/g)) {
    const ok = sel.startsWith('.') ? new RegExp(`class="[^"]*\\b${sel.slice(1)}\\b`).test(published)
             : sel.startsWith('#') ? published.includes(`id="${sel.slice(1)}"`)
             : sel.startsWith('[') ? published.includes(sel.slice(1, -1))
             : new RegExp(`<${sel}[ >/]`).test(published);
    if (!ok) missing.push(sel);
  }
  if (missing.length) {
    console.error('LAYOUT REFUSED:');
    console.error(`  - 7 · the page script queries ${[...new Set(missing)].join(', ')} — nothing in the`);
    console.error('        published SVG matches. The canvas would render and not respond.');
    process.exit(1);
  }
}

// 8 · THE CHROME IS THE SHARED ARTIFACT, not a description of one.
//
// Gate 7 proves the script finds what it looks for IN THIS REPO. It cannot notice that the toolbar
// here has drifted from the toolbar in the next repo — a renamed button, a dropped hint, a missing
// mini-map all pass it, and the two canvases stop being comparable while both stay internally
// consistent. `_chrome.html` is the one copy of that markup; this refuses a page that has edited it.
{
  const CHROME_PATH = 'scripts/visuals/_chrome.html';
  const chrome = readFileSync(CHROME_PATH, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')                        // the file's own note about itself
    .split('\n').map(l => l.trim())
    .filter(l => l && l !== '__BODY__' && !l.includes('__VIEWBOX__'));
  if (chrome.length < 10) {
    console.error('LAYOUT REFUSED:');
    console.error(`  - 8 · ${CHROME_PATH} parsed to ${chrome.length} lines. An empty chrome passes every`);
    console.error('        comparison below, which is the same lie gate 7 was rewritten to stop.');
    process.exit(1);
  }
  const gone = chrome.filter(l => !published.includes(l));
  if (gone.length) {
    console.error('LAYOUT REFUSED:');
    console.error(`  - 8 · the page's chrome has drifted from ${CHROME_PATH}. Missing:`);
    for (const l of gone.slice(0, 6)) console.error(`        ${l}`);
    if (gone.length > 6) console.error(`        …and ${gone.length - 6} more`);
    process.exit(1);
  }
}

// ── THE READ LOG ────────────────────────────────────────────────────────────────────────────────
//
// conducks-visuals §0 requires every page to say which files it was built from and at which commit. A canvas
// this size cannot keep that by hand: sofie's had no read log at all, and the honest reason is that
// nobody was going to retype 38 filenames after each walk.
//
// So it is DERIVED, and it says exactly what it is. It lists the files the page's own hovers CITE —
// which is not the same claim as "a human opened these", and pretending otherwise would be the
// fabricated-provenance failure §6.13 exists to stop. A page that WAS walked by a person keeps its
// hand-written log instead; this only fills a slot that asks for it.
function derivedReadLog() {
  const files = new Set();
  for (const b of BANDS)
    for (const c of b.containers)
      for (const n of c.nodes)
        for (const m of String(n.hov || '').matchAll(/([\w./-]+\.[a-z]{2,4}):\d+/g)) files.add(m[1]);
  // NO GIT STATE HERE. This footer used to stamp `git rev-parse HEAD` and a `git status` dirty
  // count, which made the rendered page change whenever the REPOSITORY moved rather than whenever
  // the DATA did — so the drift gate, whose entire job is "the data changed and the page did not",
  // reported drift on every commit and every edit. A gate that fires for a reason unrelated to what
  // it checks is one you learn to ignore. The page's currency is proven continuously by
  // `visuals-lint` resolving every anchor, and WHEN it changed is in git history already; neither
  // needs a copy baked into a byte-compared artifact.
  const list = [...files].sort().map(f => `<code>${esc(f)}</code>`).join(' · ');
  return `<footer class="readlog" data-derived>\n`
       + `  ${files.size} file${files.size === 1 ? '' : 's'} carry the anchors on this page:<br>\n`
       + `  ${list}<br>\n`
       + `  <b>Derived from the anchors, not a record of what a person opened.</b> `
       + `Every one is checked by <code>conducks visuals-lint</code>; that an anchor resolves is not `
       + `evidence the sentence attached to it is still true (<a href="rules.md">rules.md</a> §13).\n`
       + `</footer>`;
}
{
  const slot = /<footer class="readlog" data-derived>[\s\S]*?<\/footer>/;
  if (slot.test(published)) published = published.replace(slot, derivedReadLog());
}

// 9 · EVERY PAGE SAYS WHAT IT WAS BUILT FROM.
// One of the two forms, never neither: a hand-written log (a person walked it and listed what they
// opened) or the derived slot above. sofie's canvas had neither and the gap went unnoticed for the
// life of the page, because nothing was looking for it.
if (!/<footer class="readlog"/.test(published)) {
  console.error('LAYOUT REFUSED:');
  console.error('  - 9 · the page carries no read log. Add <footer class="readlog" data-derived></footer>');
  console.error('        for the derived one, or write it by hand if a person walked this canvas.');
  process.exit(1);
}

writeFileSync(PAGE_PATH, published);
writeFileSync('/tmp/canvas-elk.svg', svg);
// DETOUR measured on what is actually DRAWN — including any path the re-router replaced. Measuring
// ELK's own sections here would have reported the old numbers and hidden whether re-routing helped.
let ink = 0, sumD = 0, worst = { d: 0, e: null }, over2 = [];
for (const e of drawn) {
  const len = manhattan(e.pts);
  const need = Math.abs(e.pts[0].x - e.pts[e.pts.length-1].x) + Math.abs(e.pts[0].y - e.pts[e.pts.length-1].y);
  const d = len / Math.max(need, 1);
  ink += len; sumD += d;
  if (d > worst.d) worst = { d, e: `${e.from} → ${e.to}` };
  if (d > 2) over2.push(`${e.from} → ${e.to} (x${d.toFixed(1)})`);
}
console.log(`   ink ${Math.round(ink).toLocaleString()} · avg detour x${(sumD / drawn.length).toFixed(2)}`
          + ` · worst x${worst.d.toFixed(1)} (${worst.e}) · over 2x: ${over2.length} · re-routed ${rerouted}`);
if (over2.length) console.log(`   ${over2.join(' · ')}`);
console.log(`ELK OK — ${flat.nodes.length} nodes, ${flat.conts.length} groups, ` +
            `${flat.edges.length} edges, canvas ${Math.ceil(laid.width)}×${Math.ceil(laid.height)}`);
