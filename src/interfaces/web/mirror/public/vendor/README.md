# Vendored, not a dependency

Two files, copied verbatim from a CDN and committed. They are not in `package.json` because the
dashboard is static assets with no build step — a bundler would be a build chain, which ADR 0027
removed from the install path.

| file | package | version | why this one |
|---|---|---|---|
| `d3-force.min.js` | `d3-force` | 3.0.0 | the page calls `d3.forceX`, `d3.forceY` and `d3.forceCollide` — three functions. The full `d3` bundle is 273 kB for those three; `d3-force` is 8 kB and exposes exactly them |
| `force-graph.min.js` | `force-graph` | 1.51.4 | the renderer. Self-contained: its UMD factory takes no dependency arguments and it bundles its own copy of d3-force, so the global above is only for the page's own three calls |

**They were unpinned CDN loads before.** `unpkg.com/d3@7` and `unpkg.com/force-graph` — the second
with no version at all, so the dashboard would break the day that package shipped a major, and it
rendered nothing with no network. That contradicted the install story: ADR 0027 made conducks
installable with no compiler and no toolchain, and the dashboard still needed the internet.

To update: fetch the same paths at a new version, replace the file, change the version in this table
and re-run `conducks mirror` — there is nothing to rebuild.
