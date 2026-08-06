import { describe, it, expect } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  lintVisuals, resolveAnchor, definesSymbol, constantValue, collectVisualPages,
  type VisualPage,
} from "@/lib/domain/analysis/visuals-lint.js";

/**
 * The gate that makes a diagram checkable. Each case below is a way a visual goes quietly wrong —
 * the point of the suite is that NONE of them can pass as clean.
 */

const FILES = [
  "src/services/voice/daemon/daemon.py",
  "src/services/voice/cli-bridge.ts",
  "src/systems/dispatch.ts",
  "src/systems/types.ts",
  "electron/main/index.ts",
  "renderer/src/index.ts",
];

const SOURCES: Record<string, string> = {
  "src/services/voice/daemon/daemon.py": [
    "SAMPLE_RATE   = 16000",
    "BLOCK_SIZE    = 1024",
    "VAD_THRESHOLD      = 0.5",
    'CONV_IDLE_SEC    = float(os.environ.get("CONV_IDLE_SEC", "5.0"))',
    "def run():",
    "    pass",
  ].join("\n"),
  "src/services/voice/cli-bridge.ts": [
    "export async function handleTranscript(app: App, text: string) {",
    "  return null;",
    "}",
  ].join("\n"),
  "src/systems/dispatch.ts": "export function nonEmptyOutput(x: string) { return x; }",
  "src/systems/types.ts": "export function runSystem() { return 1; }",
  "electron/main/index.ts": new Array(500).fill("// line").join("\n"),
  "renderer/src/index.ts": "export const x = 1;",
};

const read = (p: string) => SOURCES[p] ?? null;
const page = (text: string, p = "docs/visuals/turn-start.html"): VisualPage => ({ path: p, text });

describe("resolveAnchor — an abbreviation must name exactly one file", () => {
  it("resolves an abbreviation by unique path suffix", () => {
    expect(resolveAnchor("daemon.py", FILES)).toEqual({ ok: true, path: "src/services/voice/daemon/daemon.py" });
    expect(resolveAnchor("voice/cli-bridge.ts", FILES)).toEqual({ ok: true, path: "src/services/voice/cli-bridge.ts" });
  });

  it("REFUSES an ambiguous abbreviation instead of guessing one", () => {
    // `index.ts` matches two files here and dozens in a real repo. Guessing would let the checker
    // "verify" an anchor against a file the author never meant — a false green.
    const r = resolveAnchor("index.ts", FILES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ambiguous");
  });

  it("reports a file that is no longer in the tree", () => {
    const r = resolveAnchor("services/gone.ts", FILES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing");
  });
});

describe("definesSymbol — a definition, not a mention", () => {
  it("finds a function, a class and a python def", () => {
    expect(definesSymbol("export async function handleTranscript() {}", "handleTranscript")).toBe(true);
    expect(definesSymbol("class SpeechDispatcher {}", "SpeechDispatcher")).toBe(true);
    expect(definesSymbol("def run(self):", "run")).toBe(true);
    expect(definesSymbol("  private readonly foo = 1;\n  speak(text) {}", "speak")).toBe(true);
  });

  it("a bare mention is NOT a definition", () => {
    expect(definesSymbol("// see handleTranscript for the loop", "handleTranscript")).toBe(false);
    expect(definesSymbol("await other.runSystem();", "runSystem")).toBe(false);
  });
});

describe("constantValue — reads what the code actually says", () => {
  const py = SOURCES["src/services/voice/daemon/daemon.py"];
  it("reads a plain assignment", () => {
    expect(constantValue(py, "SAMPLE_RATE")).toBe("16000");
    expect(constantValue(py, "VAD_THRESHOLD")).toBe("0.5");
  });
  it("reads the DEFAULT out of an env lookup, where a python default really lives", () => {
    expect(constantValue(py, "CONV_IDLE_SEC")).toBe("5.0");
  });
  it("returns null when the name is not assigned at all", () => {
    expect(constantValue(py, "NOT_A_CONSTANT")).toBeNull();
  });
});

describe("lintVisuals", () => {
  it("passes a page whose every anchor is true", () => {
    const r = lintVisuals([page(
      '<g class="blk"><title>daemon.py:3 — VAD_THRESHOLD=0.5</title></g>' +
      '<span class="file">cli-bridge.ts::handleTranscript</span>',
    )], FILES, read);
    expect(r.violations).toEqual([]);
    expect(r.checked).toBeGreaterThan(0);
  });

  it("catches a CONSTANT that changed under the page — the check with teeth", () => {
    // The page still claims 0.5 while the code says 0.5 → clean; flip the page to 0.9 and it must fail.
    const r = lintVisuals([page('<title>daemon.py:3 — VAD_THRESHOLD=0.9</title>')], FILES, read);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].reason).toContain("now has VAD_THRESHOLD = 0.5");
    expect(r.violations[0].severity).toBe("error");
  });

  it("catches a line number past the end of the file", () => {
    const r = lintVisuals([page('<title>renderer/src/index.ts:900</title>')], FILES, read);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].reason).toContain("line 900 does not exist");
  });

  it("catches a symbol that no longer exists", () => {
    const r = lintVisuals([page('<title>dispatch.ts::speakEverything</title>')], FILES, read);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].reason).toContain("no definition of `speakEverything`");
  });

  it("catches a deleted file", () => {
    const r = lintVisuals([page('<title>services/removed.ts:12</title>')], FILES, read);
    expect(r.violations[0].reason).toContain("no such file");
  });

  it("a page with NO anchors is a warning, never a silent pass", () => {
    // The ADR 0044 / 0124 shape: nothing-checked must not read as clean.
    const r = lintVisuals([page("<p>a picture with no file references at all</p>")], FILES, read);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].reason).toContain("nothing in this page can be verified");
    expect(r.pagesWithAnchors).toBe(0);
  });

  it("ignores docs-standard filenames written as prose", () => {
    const r = lintVisuals([page('<span class="file">see architecture.md and MODULE.md</span>')], FILES, read);
    // No anchor claims were made, so the page reports as unverifiable — not as four broken anchors.
    expect(r.violations.every(v => !v.reason.includes("no such file"))).toBe(true);
  });

  it("a constant named in a context with no resolved file is prose, not a claim", () => {
    const r = lintVisuals([page("<title>MAX_HANDOVER_DEPTH=3 is the cap</title>")], FILES, read);
    expect(r.violations.every(v => !v.reason.includes("now has"))).toBe(true);
  });

  it("does not swallow a trailing list into the anchor (`:150-192, 156`)", () => {
    const r = lintVisuals([page('<title>electron/main/index.ts:150-192, 156</title>')], FILES, read);
    expect(r.violations).toEqual([]);
  });
});

describe("collectVisualPages — a subfolder is not invisible", () => {
  it("walks nested folders, so a split visuals tree is fully checked", () => {
    // The live regression: `visuals/entry/` held four pages and the command reported clean over the
    // three at the top level. A gate that checks less than it appears to is worse than no gate.
    const root = mkdtempSync(path.join(tmpdir(), "vis-"));
    mkdirSync(path.join(root, "docs", "visuals", "entry"), { recursive: true });
    writeFileSync(path.join(root, "docs", "visuals", "top.html"), "<title>a.ts:1</title>");
    writeFileSync(path.join(root, "docs", "visuals", "entry", "deep.html"), "<title>b.ts:1</title>");
    const pages = collectVisualPages(root);
    expect(pages.map(p => p.path).sort()).toEqual([
      path.join("docs", "visuals", "entry", "deep.html"),
      path.join("docs", "visuals", "top.html"),
    ]);
    rmSync(root, { recursive: true, force: true });
  });

  it("a repo with no visuals folder is empty, not an error", () => {
    const root = mkdtempSync(path.join(tmpdir(), "vis-"));
    expect(collectVisualPages(root)).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("where an anchor is looked for — the page's side of the contract", () => {
  it("reads an anchor out of a hover, a .file span, a .where div and a data-anchor element", () => {
    for (const markup of [
      '<title>renderer/src/index.ts:900</title>',
      '<span class="file">renderer/src/index.ts:900</span>',
      '<div class="where">renderer/src/index.ts:900</div>',
      '<div class="det-where mono">renderer/src/index.ts:900</div>',
      '<p data-anchor>renderer/src/index.ts:900</p>',
    ]) {
      const r = lintVisuals([page(markup)], FILES, read);
      expect(r.violations.map(v => v.reason).join(" ")).toContain("line 900 does not exist");
    }
  });

  it("ordinary prose is NOT scanned, so an unmarked filename cannot cry wolf", () => {
    // Scanning the whole page would read this as an ambiguous anchor and fail the run.
    const r = lintVisuals([page("<p>open index.ts and look at the loop</p>")], FILES, read);
    expect(r.violations.every(v => !v.reason.includes("ambiguous"))).toBe(true);
  });
});
