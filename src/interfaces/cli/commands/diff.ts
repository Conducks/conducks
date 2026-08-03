import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { execSync } from 'node:child_process';
import path from 'node:path';
import { syncGraph } from "@/interfaces/cli/shared/context.js";

/**
 * Conducks — Diff Command (PR Risk Engine)
 * 
 * Maps Git hunks to architectural symbols and calculates 
 * the aggregated structural risk of a set of changes.
 */
export class DiffCommand implements ConducksCommand {
  public id = "diff";
  public description = "Analyze structural risk of current changes (staged/unstaged)";
  public usage = "conducks diff [--base <id>] [--head <id>] [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const baseIdx = args.indexOf('--base');
    const headIdx = args.indexOf('--head');
    const useJson = args.includes('--json');

    // `--head` was read ONLY inside the `--base` branch, so on its own it was accepted and the
    // command silently ran the git path instead — the caller asked to compare two pulses and got
    // an answer about their working tree (ADR 0122).
    if (headIdx !== -1 && baseIdx === -1) {
      console.error('--head names the pulse to compare TO, and needs --base to compare FROM.');
      console.error(`Usage: ${this.usage}`);
      process.exitCode = 1;
      return;
    }

    if (baseIdx !== -1) {
      const basePulseId = args[baseIdx + 1];
      const headPulseId = headIdx !== -1 ? args[headIdx + 1] : null; // null means current
      if (!basePulseId || basePulseId.startsWith('-')) {
        console.error('--base needs a pulse id. List them with `conducks status --json` (staleness.pulseId).');
        process.exitCode = 1;
        return;
      }
      await this.executeChronoscopicDiff(basePulseId, headPulseId, registry, useJson);
      return;
    }

    // Default: Git-based PR Risk Engine
    await syncGraph(registry);

    if (!useJson) console.log(`\n\x1b[1m--- 🛡️ Conducks PR Risk Engine ---\x1b[0m`);

    // 1. Get changed hunks from Git.
    //
    // `git diff HEAD`, not `git diff`. The bare form shows UNSTAGED changes only, so a change set
    // that had been fully `git add`-ed reported "No structural changes detected in workspace" —
    // while this command's own description says "staged/unstaged". The reading a user wants before
    // committing is everything not yet in HEAD (ADR 0122).
    let diff = "";
    try {
      diff = execSync('git diff -U0 HEAD', { encoding: 'utf-8' });
    } catch (e) {
      // Before the first commit there is no HEAD to diff against; fall back to the worktree form
      // rather than reporting "not a git repository", which would be a wrong diagnosis.
      try {
        diff = execSync('git diff -U0', { encoding: 'utf-8' });
      } catch {
        console.error("Error: Git diff failed. Is this a git repository?");
        process.exit(1);
      }
    }
    const changes = this.parseDiff(diff);

    if (changes.length === 0) {
      console.log("No structural changes detected in workspace.");
      return;
    }

    const impactedSymbols = new Set<string>();

    // 2. Map Hunks to Symbols
    for (const change of changes) {
      const nodes = Array.from(registry.query.graph.getGraph().getAllNodes() as Iterable<any>)
        .filter(n => n.properties.filePath === change.file);

      for (const line of change.lines) {
        const symbol = nodes.find(n => n.properties.range &&
          line >= n.properties.range.start.line &&
          line <= n.properties.range.end.line);
        if (symbol) impactedSymbols.add(symbol.id);
      }
    }

    if (impactedSymbols.size === 0) {
      console.log("Changes do not impact any indexed structural symbols.");
      return;
    }

    console.log(`Analyzed ${changes.length} hunks. ${impactedSymbols.size} symbols impacted.\n`);

    let totalRisk = 0;
    const reports = [];

    // 3. Calculate Aggregated Risk
    for (const symbolId of impactedSymbols) {
      const risk = await registry.explain.calculateCompositeRisk(symbolId);
      if (risk) {
        totalRisk += risk.score;
        reports.push({ id: symbolId, risk: risk.score });
      }
    }

    // 4. Report
    const avgRisk = (totalRisk / impactedSymbols.size) * 10;
    const color = avgRisk > 7 ? '\x1b[31m' : avgRisk > 4 ? '\x1b[33m' : '\x1b[32m';

    console.log(`\x1b[1mPR Risk Profile:\x1b[0m ${color}${avgRisk.toFixed(2)} / 10.0\x1b[0m`);

    console.log(`\nHigh-Risk Symbols Impacted:`);
    reports.sort((a, b) => b.risk - a.risk).slice(0, 5).forEach(r => {
      console.log(`- \x1b[35m${r.id}\x1b[0m (Risk: ${(r.risk * 10).toFixed(2)})`);
    });
  }

  /**
   * Compare two pulses using WHAT THE VAULT ACTUALLY RETAINS.
   *
   * This used to query `SELECT * FROM nodes WHERE pulseId = ?`. But `sweepRowsNotInPulse` deletes
   * every row not written by the CURRENT pulse, so a historical pulse has no rows in `nodes` at
   * all — the base graph loaded EMPTY and the command reported every symbol in the project as newly
   * added. Measured on conducks, comparing two consecutive pulses three minutes apart:
   *
   *     Loaded Base: 0 nodes, 0 edges
   *     Summary: Delta: +5472/-0 Symbols, +19675/-0 Relationships.
   *
   * A pulse id that does not exist produced the identical answer, so nothing told a real comparison
   * from a fabricated one (ADR 0122).
   *
   * `node_history` is the table that keeps per-pulse rows: pulseId, nodeId, gravity, complexity,
   * fingerprint. Names and kinds are joined from `nodes` where the symbol still exists. There is NO
   * edge history, so relationship counts are not reported rather than invented — what is retained is
   * stated in the output instead of implied.
   */
  private async executeChronoscopicDiff(baseId: string, headId: string | null, registry: Registry, useJson: boolean): Promise<void> {
    const db = registry.infrastructure.persistence;
    if (typeof (db as any)?.query !== 'function') {
      console.error('Chronoscopic diff requires a queryable vault.');
      process.exit(1);
    }

    // A pulse the vault does not hold is refused by name. Comparing against nothing and calling the
    // result a delta is the defect this whole command had.
    const known = async (id: string) =>
      (await db.query<{ n: number }>('SELECT count(*) AS n FROM node_history WHERE pulseId = ?', [id]))[0];
    const baseRows = Number((await known(baseId))?.n ?? 0);
    if (baseRows === 0) {
      const recent = await db.query<{ id: string }>('SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 5');
      console.error(`No history for pulse '${baseId}' — the vault does not hold it.`);
      if (recent.length > 0) console.error('Pulses it does hold: ' + recent.map(r => r.id).join(', '));
      process.exitCode = 1;
      return;
    }
    if (headId && Number((await known(headId))?.n ?? 0) === 0) {
      console.error(`No history for pulse '${headId}' — the vault does not hold it.`);
      process.exitCode = 1;
      return;
    }

    const headPulse = headId ?? (await db.query<{ id: string }>(
      'SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1'))[0]?.id;

    type Row = { nodeId: string; gravity: number; complexity: number; fingerprint: string };
    const rowsOf = (id: string) => db.query<Row>(
      'SELECT nodeId, gravity, complexity, fingerprint FROM node_history WHERE pulseId = ?', [id]);
    const baseMap = new Map((await rowsOf(baseId)).map(r => [String(r.nodeId), r]));
    const headMap = new Map((await rowsOf(headPulse)).map(r => [String(r.nodeId), r]));

    const nameRows = await db.query<{ id: string; name: string }>('SELECT id, name FROM nodes');
    const names = new Map(nameRows.map(r => [String(r.id), String(r.name)]));
    const label = (id: string) => names.get(id) ?? id;

    const added = [...headMap.keys()].filter(id => !baseMap.has(id));
    const removed = [...baseMap.keys()].filter(id => !headMap.has(id));
    const changed: Array<{ id: string; name: string; gravityShift: number; complexityBloat: number; dnaShift: boolean }> = [];
    for (const [id, h] of headMap) {
      const b = baseMap.get(id);
      if (!b) continue;
      const gravityShift = Number(h.gravity ?? 0) - Number(b.gravity ?? 0);
      const complexityBloat = Number(h.complexity ?? 0) - Number(b.complexity ?? 0);
      const dnaShift = !!b.fingerprint && !!h.fingerprint && b.fingerprint !== h.fingerprint;
      if (gravityShift !== 0 || complexityBloat !== 0 || dnaShift) {
        changed.push({ id, name: label(id), gravityShift, complexityBloat, dnaShift });
      }
    }
    changed.sort((a, b) => Math.abs(b.gravityShift) - Math.abs(a.gravityShift));

    if (useJson) {
      process.stdout.write(JSON.stringify({
        base: baseId,
        head: headPulse,
        // Named so a caller cannot mistake a partial comparison for a whole one.
        retains: 'node identity, gravity, complexity and fingerprint per pulse; edge history is not retained',
        baseNodeCount: baseMap.size,
        headNodeCount: headMap.size,
        nodes: {
          addedCount: added.length,
          removedCount: removed.length,
          changedCount: changed.length,
          added: added.map(id => ({ id, name: label(id) })),
          removed: removed.map(id => ({ id, name: label(id) })),
        },
        changed: changed.slice(0, 50),
      }, null, 2) + '\n');
      return;
    }

    console.log(`\n\x1b[1m--- 🏺 Chronoscopic Structural Diff ---\x1b[0m`);
    console.log(`Base: \x1b[33m${baseId}\x1b[0m  (${baseMap.size} symbols)`);
    console.log(`Head: \x1b[33m${headPulse}\x1b[0m  (${headMap.size} symbols)`);
    console.log(`\n\x1b[1mSummary:\x1b[0m +${added.length} / -${removed.length} symbols, ${changed.length} changed.`);
    console.log(`\x1b[2mRelationship deltas are not shown: the vault keeps no edge history.\x1b[0m`);

    if (changed.length > 0) {
      console.log(`\n\x1b[1mArchitectural Drift:\x1b[0m`);
      for (const d of changed.slice(0, 10)) {
        let line = `- \x1b[35m${d.name}\x1b[0m: `;
        if (d.gravityShift) line += `\x1b[36mΔGravity:\x1b[0m ${d.gravityShift > 0 ? '+' : ''}${d.gravityShift.toFixed(4)} `;
        if (d.complexityBloat) line += `\x1b[31mΔComplexity:\x1b[0m ${d.complexityBloat > 0 ? '+' : ''}${d.complexityBloat} `;
        if (d.dnaShift) line += `\x1b[34m[DNA shift]\x1b[0m`;
        console.log(line);
      }
    }
    if (added.length > 0) {
      console.log(`\n\x1b[1mNew Symbols:\x1b[0m`);
      added.slice(0, 5).forEach(id => console.log(`  + ${label(id)}`));
    }
    if (removed.length > 0) {
      console.log(`\n\x1b[1mRemoved Symbols:\x1b[0m`);
      removed.slice(0, 5).forEach(id => console.log(`  - ${label(id)}`));
    }
    console.log();
  }

  private parseDiff(diff: string): Array<{ file: string, lines: number[] }> {
    const changes: Array<{ file: string, lines: number[] }> = [];
    let currentFile = '';
    const lines = diff.split('\n');

    for (const line of lines) {
      if (line.startsWith('+++ b/')) {
        const userPath = line.replace('+++ b/', '');
        const resolved = path.resolve(process.cwd(), userPath);
        const cwd = path.resolve(process.cwd());
        // S9: Reject paths that escape the repository root.
        if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
          console.error(`Error: path '${userPath}' is outside repository root`);
          process.exit(1);
        }
        currentFile = resolved.toLowerCase();
        changes.push({ file: currentFile, lines: [] });
      } else if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        if (match && currentFile) {
          const start = parseInt(match[1], 10);
          const count = parseInt(match[2] || '1', 10);
          const last = changes[changes.length - 1];
          for (let i = 0; i < count; i++) {
            last.lines.push(start + i);
          }
        }
      }
    }
    return changes.filter(c => c.lines.length > 0);
  }
}
