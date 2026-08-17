import { describe, it, expect } from '@jest/globals';
import path from 'node:path';
import {
  checkVisualsDrift, generatorCommandOf, type DriftIO,
} from "@/lib/domain/docs/visuals-drift.js";

/**
 * The generator-drift half of the visuals gate (ADR 0139). The failure it exists for: a data edit
 * without a re-render, where every anchor still resolves and the picture is silently wrong. Each
 * case is a way that staleness — or the check's own restore contract — could go quietly wrong.
 */

/** An in-memory repo the "generator" can mutate; `generate` is what running the command does. */
function fakeIO(files: Record<string, string>, generate: (files: Record<string, string>) => void, opts?: { crash?: string }): { io: DriftIO; files: Record<string, string> } {
  const io: DriftIO = {
    listFiles: (dir) => Object.keys(files)
      .filter(f => f.startsWith(dir + path.sep))
      .map(f => path.relative(dir, f))
      .sort(),
    read: (abs) => abs in files ? Buffer.from(files[abs]) : null,
    write: (abs, data) => { files[abs] = data.toString(); },
    remove: (abs) => { delete files[abs]; },
    run: () => {
      if (opts?.crash) return { ok: false, output: opts.crash };
      generate(files);
      return { ok: true };
    },
  };
  return { io, files };
}

const ROOT = "/repo";
const PAGE = path.join(ROOT, "docs", "visuals", "architecture.html");

describe('checkVisualsDrift', () => {
  it('clean when a re-render reproduces the committed pages byte-for-byte', () => {
    const { io } = fakeIO({ [PAGE]: "<svg>207 nodes</svg>" }, () => { /* generator writes the same bytes */ });
    const result = checkVisualsDrift(ROOT, "npm run visuals", io);
    expect(result).toEqual({ status: "clean", files: 1 });
  });

  it('reports the drifted page and RESTORES the committed bytes', () => {
    const { io, files } = fakeIO(
      { [PAGE]: "<svg>117 nodes</svg>" },
      f => { f[PAGE] = "<svg>207 nodes</svg>"; },
    );
    const result = checkVisualsDrift(ROOT, "npm run visuals", io);
    expect(result).toEqual({ status: "drift", files: [path.join("docs", "visuals", "architecture.html")] });
    // Read-only contract: a failing check leaves the tree exactly as it found it.
    expect(files[PAGE]).toBe("<svg>117 nodes</svg>");
  });

  it('a file the generator CREATES is drift, and is deleted again by the restore', () => {
    const extra = path.join(ROOT, "docs", "visuals", "entry", "new-page.html");
    const { io, files } = fakeIO({ [PAGE]: "same" }, f => { f[extra] = "fresh"; });
    const result = checkVisualsDrift(ROOT, "npm run visuals", io);
    expect(result).toEqual({ status: "drift", files: [path.join("docs", "visuals", "entry", "new-page.html")] });
    expect(extra in files).toBe(false);
  });

  it('a file the generator DELETES is drift, and is written back by the restore', () => {
    const stale = path.join(ROOT, "docs", "visuals", "entry", "removed.html");
    const { io, files } = fakeIO({ [PAGE]: "same", [stale]: "old" }, f => { delete f[stale]; });
    const result = checkVisualsDrift(ROOT, "npm run visuals", io);
    expect(result).toEqual({ status: "drift", files: [path.join("docs", "visuals", "entry", "removed.html")] });
    expect(files[stale]).toBe("old");
  });

  it('a generator crash is CRASHED with its output, never reported as drift', () => {
    const { io, files } = fakeIO({ [PAGE]: "committed" }, () => {}, { crash: "layout refused: 3 nodes overlap" });
    const result = checkVisualsDrift(ROOT, "npm run visuals", io);
    expect(result).toEqual({ status: "crashed", output: "layout refused: 3 nodes overlap" });
    expect(files[PAGE]).toBe("committed");
  });

  it('skipped when docs/visuals holds nothing — there is nothing a re-render could disprove', () => {
    const { io } = fakeIO({}, () => {});
    const result = checkVisualsDrift(ROOT, "npm run visuals", io);
    expect(result.status).toBe("skipped");
  });
});

describe('generatorCommandOf', () => {
  it('reads visuals.generate from conducks.json', () => {
    expect(generatorCommandOf('{"visuals": {"generate": "npm run visuals"}}')).toBe("npm run visuals");
  });

  it('null for a missing file, a missing field, an empty command, or unparseable JSON', () => {
    expect(generatorCommandOf(null)).toBeNull();
    expect(generatorCommandOf('{"services": ["app"]}')).toBeNull();
    expect(generatorCommandOf('{"visuals": {"generate": "  "}}')).toBeNull();
    expect(generatorCommandOf('not json')).toBeNull();
  });
});
