import { describe, it, expect } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  lintVisuals, resolveAnchor, definesSymbol, constantValue, collectVisualPages,
  buildStamps, staleStamps,
  type VisualPage,
} from "@/lib/domain/docs/visuals-lint.js";

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

  it("a page with NO anchors and no declaration FAILS, never a silent pass", () => {
    // The ADR 0044 / 0124 shape: nothing-checked must not read as clean — and "0 still true,
    // exit 0" is the denominator trap, so the undeclared case is an ERROR (todo47#P1).
    const r = lintVisuals([page("<p>a picture with no file references at all</p>")], FILES, read);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].severity).toBe("error");
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

describe("markdown module notes mark a claim by backticking it (ADR 0140)", () => {
  const mdPage = (text: string): VisualPage => ({ path: "docs/visuals/modules/core/graph.md", text });

  it("a backticked path:line is a claim and a dead line fails it", () => {
    const r = lintVisuals([mdPage("The loop lives at `renderer/src/index.ts:900`.")], FILES, read);
    expect(r.violations.map(v => v.reason).join(" ")).toContain("line 900 does not exist");
  });

  it("a backticked path::symbol is a claim", () => {
    const r = lintVisuals([mdPage("See `src/systems/dispatch.ts::gone`.")], FILES, read);
    expect(r.violations.map(v => v.reason).join(" ")).toContain("no definition of `gone`");
  });

  it("a bare backticked filename is prose, not a claim — `index.ts` cannot cry wolf", () => {
    const r = lintVisuals([mdPage("open `index.ts` and look around — Provenance: authored, no code claims")], FILES, read);
    // A bare filename must never become an ambiguity error; the page declares authored to pass.
    expect(r.violations).toHaveLength(0);
    expect(r.pagesWithAnchors).toBe(0);
  });

  it("unbackticked paths in markdown are not scanned — the backtick IS the mark", () => {
    const r = lintVisuals([mdPage("Provenance: authored — prose mentioning renderer/src/index.ts:900 without a mark")], FILES, read);
    // An unbackticked path is not scanned, so the dead line 900 cannot fail — the backtick is the mark.
    expect(r.violations).toHaveLength(0);
    expect(r.pagesWithAnchors).toBe(0);
  });
});

describe("review stamps — the second tier of rot (ADR 0141)", () => {
  const note = (text: string): VisualPage => ({ path: "docs/visuals/modules/voice.md", text });
  const SRC: Record<string, string> = {
    "src/daemon.py": [
      "SAMPLE = 1",
      "def run():",
      "    a = 1",
      "    b = 2",
      "",
      "def other():",
      "    pass",
    ].join("\n"),
  };
  const files = Object.keys(SRC);
  const readSrc = (p: string): string | null => SRC[p] ?? null;

  it("stamps every resolving anchor with a span hash", () => {
    const stamps = buildStamps([note("see `src/daemon.py::run` and `src/daemon.py:1`")], files, readSrc);
    expect(Object.keys(stamps["docs/visuals/modules/voice.md"])).toHaveLength(2);
  });

  it("an edit INSIDE the cited symbol flags the claim; an edit elsewhere does not", () => {
    const pages = [note("see `src/daemon.py::run`")];
    const stamps = buildStamps(pages, files, readSrc);
    const editedElsewhere: Record<string, string> = { ...SRC, "src/daemon.py": SRC["src/daemon.py"].replace("pass", "return 9") };
    expect(staleStamps(pages, files, p => editedElsewhere[p] ?? null, stamps).flags).toHaveLength(0);
    const editedInside: Record<string, string> = { ...SRC, "src/daemon.py": SRC["src/daemon.py"].replace("b = 2", "b = 3") };
    const { flags } = staleStamps(pages, files, p => editedInside[p] ?? null, stamps);
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("warn");
  });

  it("a stamp is keyed by the RESOLVED span, so rewording the anchor keeps the review (ADR 0142)", () => {
    const stamps = buildStamps([note("see `src/daemon.py::run`")], files, readSrc);
    // The author rewrites the abbreviation; the claim cites the same code.
    const reworded = [note("see `daemon.py::run`")];
    const r = staleStamps(reworded, files, readSrc, stamps);
    expect(r.flags).toHaveLength(0);
    expect(r.orphans).toHaveLength(0);
  });

  it("a DELETED claim orphans its stamp VISIBLY — editing the note is not a way around the gate", () => {
    const stamps = buildStamps([note("see `src/daemon.py::run`")], files, readSrc);
    const r = staleStamps([note("the claim is gone")], files, readSrc, stamps);
    expect(r.flags).toHaveLength(0);
    expect(r.orphans).toEqual([{ page: "docs/visuals/modules/voice.md", key: "src/daemon.py::run" }]);
  });

  it("a decorator appearing above the cited symbol fires the flag — it changes behaviour", () => {
    const pages = [note("see `src/daemon.py::run`")];
    const stamps = buildStamps(pages, files, readSrc);
    const decorated: Record<string, string> = { ...SRC, "src/daemon.py": SRC["src/daemon.py"].replace("def run():", "@lru_cache\ndef run():") };
    expect(staleStamps(pages, files, p => decorated[p] ?? null, stamps).flags).toHaveLength(1);
  });

  it("a line anchor flags only when ITS line changes, and a pure re-indent never fires", () => {
    const pages = [note("see `src/daemon.py:1`")];
    const stamps = buildStamps(pages, files, readSrc);
    const reindented: Record<string, string> = { ...SRC, "src/daemon.py": "  " + SRC["src/daemon.py"] };
    expect(staleStamps(pages, files, p => reindented[p] ?? null, stamps).flags).toHaveLength(0);
    const changed: Record<string, string> = { ...SRC, "src/daemon.py": SRC["src/daemon.py"].replace("SAMPLE = 1", "SAMPLE = 2") };
    expect(staleStamps(pages, files, p => changed[p] ?? null, stamps).flags).toHaveLength(1);
  });

  it("an unstamped anchor is never flagged — stamping IS the review", () => {
    const pages = [note("see `src/daemon.py::run`")];
    const r = staleStamps(pages, files, readSrc, {});
    expect(r.flags).toHaveLength(0);
    expect(r.orphans).toHaveLength(0);
  });

  it("`--stamp <page>` stamps only that page — reviewing one note asserts nothing about the others", () => {
    const two = [note("see `src/daemon.py::run`"), { path: "docs/visuals/modules/other.md", text: "see `src/daemon.py:1`" }];
    const stamps = buildStamps(two, files, readSrc, "docs/visuals/modules/voice.md");
    expect(Object.keys(stamps)).toEqual(["docs/visuals/modules/voice.md"]);
  });
});

describe("a page with no anchors must declare itself authored", () => {
  it("declared authored → passes honestly", () => {
    const p: VisualPage = { path: "docs/visuals/index.html", text: "<p><b>Provenance:</b> authored — brand page, no code claims.</p>" };
    const r = lintVisuals([p], FILES, read);
    expect(r.violations).toHaveLength(0);
  });

  it("neither anchors nor a declaration → ERROR, not a warning", () => {
    const p: VisualPage = { path: "docs/visuals/trace.html", text: "<p>a long system trace with unmarked claims</p>" };
    const r = lintVisuals([p], FILES, read);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].severity).toBe("error");
  });

  it("the bare word `authored` in prose does NOT open the escape hatch (ADR 0142)", () => {
    const p: VisualPage = { path: "docs/visuals/trace.html", text: "<p>this section was authored in July</p>" };
    const r = lintVisuals([p], FILES, read);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].severity).toBe("error");
  });

  it("a constant claimed in the SAME backtick as its file is checked in a markdown note", () => {
    const p: VisualPage = { path: "docs/visuals/modules/voice.md", text: "the gate is `daemon.py:3 VAD_THRESHOLD=0.9`" };
    const r = lintVisuals([p], FILES, read);
    expect(r.violations.map(v => v.reason).join(" ")).toContain("now has VAD_THRESHOLD = 0.5");
  });
});

describe("a DERIVED render is exempt from declare-or-fail", () => {
  it("its claims live in the checked source; the drift gate proves fidelity", () => {
    const p: VisualPage = { path: "docs/visuals/modules/voice.html", text: "<div><b>DERIVED</b> — rendered from voice.md. no marked anchors here</div>" };
    const r = lintVisuals([p], FILES, read);
    expect(r.violations).toHaveLength(0);
  });
});

/**
 * `definesSymbol` must see a method however many modifiers it carries.
 *
 * It allowed exactly one. `public async discoverFiles()` and `public static topologicalSort()` are
 * the two commonest declaration forms in this codebase and neither matched, so every `::symbol`
 * anchor pointing at one produced a WARNING rather than a pass — twelve of them on the first
 * generated canvas, all false.
 *
 * That is worse than a missed check: a gate whose warnings are usually wrong is one whose real
 * warnings get scrolled past, which is the failure `rules.md` §12 names about gates that check less
 * than they appear to.
 */
describe('definesSymbol sees a method behind any number of modifiers', () => {
  const cases: Array<[string, string]> = [
    ['public async discoverFiles(stagedOnly: boolean = false): Promise<string[]> {', 'discoverFiles'],
    ['public static topologicalSort(importMap: Map<string, Set<string>>): string[][] {', 'topologicalSort'],
    ['protected readonly resolve(spec: string) {', 'resolve'],
    ['private async load(): Promise<void> {', 'load'],
    ['public reflect(', 'reflect'],
    ['export function attachDocs<T>(', 'attachDocs'],
    ['export class ChronicleInterface {', 'ChronicleInterface'],
    ['const sameFamily = (a: string) => true;', 'sameFamily'],
  ];

  for (const [line, name] of cases) {
    it(`finds ${name} in "${line.slice(0, 34)}…"`, () => {
      expect(definesSymbol(`class X {\n  ${line}\n}\n`, name)).toBe(true);
    });
  }

  it('still refuses a name that is only USED, never defined', () => {
    // The counter-test. Widening the modifier list must not turn every mention into a definition —
    // that would make the check pass for a symbol that was renamed, which is exactly what it exists
    // to catch.
    expect(definesSymbol('const x = discoverFiles();\nawait obj.discoverFiles();\n', 'discoverFiles')).toBe(false);
  });

  it('does not match a longer name that merely starts the same', () => {
    expect(definesSymbol('public async discoverFilesAndThings() {}', 'discoverFiles')).toBe(false);
  });
});
