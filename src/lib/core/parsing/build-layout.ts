import fs from "node:fs";
import path from "node:path";

/**
 * Conducks — where a source file ENDS UP, read from the project's own build configuration.
 *
 * Some specifiers only resolve through the build layout. The shape, measured on subject-c:
 *
 *     electron/main/index.ts:1199
 *       await import('../engine/executor/prompt-loader.js')
 *
 * `electron/engine/` does not exist. The file is `src/engine/executor/prompt-loader.ts`, and the
 * import is written against where the two halves LAND, not where they live:
 *
 *     electron/main/index.ts  --electron-vite-->  dist/main/index.cjs
 *     src/engine/…/x.ts       --tsc-->            dist/engine/…/x.js
 *     dist/main/../engine/…            =          dist/engine/…            ✓
 *
 * Nothing resolves that from the specifier alone, so the import produced no edge and every export of
 * the target read as unconsumed — six false verdicts from one unresolved specifier, one of them the
 * strongest wording `prune` has (todo66, ADR 0153).
 *
 * WHAT THIS READS, AND WHAT IT REFUSES TO INVENT. Only DECLARED facts, from files the project
 * already keeps for its own build:
 *
 *   tsconfig.json          `rootDir` + `outDir`      →  src/**      lands in dist/**
 *   electron.vite.config   `entry`/`input` + `outDir` →  electron/main/** lands in dist/main/**
 *
 * When a project declares neither, there are no mappings and the answer is UNDEFINED — exactly
 * today's behaviour. That refusal is the point of the whole file: this todo was deferred for twelve
 * days because a WRONG mapping binds a symbol to the wrong file and makes `prune` confidently
 * silent about real dead code, which is worse than the false verdicts it removes (ADR 0070).
 *
 * It is deliberately NOT a general bundler-config evaluator. It reads two declarations by name. A
 * project using something else gets no mappings and the old answer, which is honest; guessing at an
 * arbitrary config would be the failure mode this exists to avoid.
 */
/** Not exported: `buildMappings` returns these and TypeScript infers the shape at every call site.
 *  Exporting a name nothing imports is the UNUSED_EXPORT this project's own `prune` reports. */
interface BuildMapping {
  /** Absolute directory the sources live in. */
  sourceDir: string;
  /** Absolute directory those sources are emitted to. */
  outDir: string;
  /** Which declaration this came from — carried so a wrong answer can be traced to its source. */
  declaredBy: string;
}

interface Cached {
  key: string;
  mappings: BuildMapping[];
}

let cache: Cached | null = null;

/** `"./src"` → absolute, tolerating the leading `./` every tsconfig writes. */
const abs = (root: string, rel: string) => path.resolve(root, rel);

/**
 * A tsconfig is JSONC by specification — TypeScript's own generated one ships comments — so a raw
 * `JSON.parse` throws on perfectly legal files. Same two-step the resolver uses.
 */
const readJsonc = (file: string): any => {
  const raw = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(raw) || {};
  } catch {
    return JSON.parse(raw.replace(/\/\/[^\n]*/g, "").replace(/,(\s*[}\]])/g, "$1")) || {};
  }
};

/**
 * Pair each `entry:`/`input:` with the `outDir:` that follows it.
 *
 * Read as TEXT rather than evaluated, and that is a deliberate limit rather than laziness: the file
 * is TypeScript that imports plugins and calls `defineConfig`, so running it would mean executing a
 * subject project's code inside the analyser. A declaration written as a variable or a computed path
 * is not matched here, and not matching is the correct outcome — it yields no mapping and the
 * specifier stays unresolved.
 */
const readViteSections = (file: string, root: string, mappings: BuildMapping[]): void => {
  const src = fs.readFileSync(file, "utf8");
  const token = /\b(entry|input)\s*:\s*['"]([^'"]+)['"]|\boutDir\s*:\s*['"]([^'"]+)['"]/g;

  let pendingEntry: string | null = null;
  for (let m = token.exec(src); m; m = token.exec(src)) {
    if (m[2] !== undefined) {
      pendingEntry = m[2];
      continue;
    }
    const outDir = m[3]!;
    if (!pendingEntry) continue;
    // The entry names a FILE (`electron/main/index.ts`); what maps is the directory it sits in,
    // because the bundler emits that whole graph into `outDir`.
    const sourceDir = abs(root, path.dirname(pendingEntry));
    mappings.push({ sourceDir, outDir: abs(root, outDir), declaredBy: path.basename(file) });
    pendingEntry = null;
  }
};

/**
 * Every declared source→output mapping for a project, most specific first.
 *
 * Cached on the paths and mtimes of the files it read, so an edited config is picked up while a
 * pulse over thousands of files does not re-read them once per import.
 */
export const buildMappings = (projectRoot: string): BuildMapping[] => {
  const root = path.resolve(projectRoot);
  const files = [path.join(root, "tsconfig.json"), path.join(root, "electron.vite.config.ts")];
  const key = files
    .map(f => {
      try {
        return `${f}:${fs.statSync(f).mtimeMs}`;
      } catch {
        return `${f}:absent`;
      }
    })
    .join("|");

  if (cache && cache.key === key) return cache.mappings;

  const mappings: BuildMapping[] = [];
  try {
    const tsconfig = files[0];
    if (fs.existsSync(tsconfig)) {
      const co = readJsonc(tsconfig).compilerOptions || {};
      // BOTH are required. `outDir` alone says where output goes and nothing about what maps onto
      // it, and assuming the project root as the source would map every file in the repository.
      if (co.rootDir && co.outDir) {
        mappings.push({
          sourceDir: abs(root, co.rootDir),
          outDir: abs(root, co.outDir),
          declaredBy: "tsconfig.json",
        });
      }
    }
    const vite = files[1];
    if (fs.existsSync(vite)) readViteSections(vite, root, mappings);
  } catch {
    // A malformed config is not a reason to answer wrongly. No mappings, old behaviour.
    cache = { key, mappings: [] };
    return cache.mappings;
  }

  // Longest source path first, so `electron/main` wins over a mapping rooted at `electron`.
  mappings.sort((a, b) => b.sourceDir.length - a.sourceDir.length);
  cache = { key, mappings };
  return mappings;
};

/** The mapping whose `sourceDir` contains `file`, or null. */
const owning = (mappings: BuildMapping[], file: string): BuildMapping | null =>
  mappings.find(m => file === m.sourceDir || file.startsWith(m.sourceDir + path.sep)) ?? null;

/**
 * Resolve a specifier that only makes sense in the BUILD layout, back to a source file.
 *
 * Returns the source path (as spelled in `allFiles`) or undefined. Undefined is the answer whenever
 * anything is missing or ambiguous — no declaration, no owning mapping, no output mapping covering
 * the landing spot, or two mappings that could both claim it.
 */
export const resolveThroughBuildLayout = (
  cleanSpecifier: string,
  currentFile: string,
  projectRoot: string,
  lowerToOriginal: Map<string, string>,
): string | undefined => {
  // Only a CLIMBING relative specifier can land outside its own output directory. `./x` resolves
  // inside the same emitted folder and is already answered by ordinary resolution.
  if (!cleanSpecifier.startsWith("../")) return undefined;

  const mappings = buildMappings(projectRoot);
  if (mappings.length === 0) return undefined;

  const from = owning(mappings, path.resolve(currentFile));
  if (!from) return undefined;

  // Where the importing file LANDS, keeping its subdirectory under the output root.
  //
  // The first version collapsed every file to `outDir` itself, on the reasoning that a bundled entry
  // graph ends up in one file. It resolved `electron/main/index.ts` and MISSED
  // `electron/main/ipc/memory.ts`, which writes `../../services/…` — two levels, because it is one
  // level deeper. Both specifiers are consistent with a structure-preserving emit and only one is
  // consistent with a collapse, so the sources themselves say which model the authors wrote against.
  const within = path.relative(from.sourceDir, path.resolve(currentFile));
  const landedFrom = path.dirname(path.resolve(from.outDir, within));
  const landed = path.resolve(landedFrom, cleanSpecifier);

  // Which mapping OWNS the landing spot — and it must not be the one we came from, or this is an
  // ordinary intra-bundle import that ordinary resolution already refused for a real reason.
  const targets = mappings.filter(
    m => m !== from && (landed === m.outDir || landed.startsWith(m.outDir + path.sep)),
  );
  if (targets.length === 0) return undefined;
  // Two declarations covering one output path cannot be told apart, and a wrong pick here is the
  // confident-wrong-edge this whole file is written to avoid.
  if (targets.length > 1 && targets[0].outDir !== targets[1].outDir) return undefined;

  const to = targets[0];
  const withinOut = path.relative(to.outDir, landed);
  const sourceGuess = path.resolve(to.sourceDir, withinOut);

  // The specifier is written with the EMITTED extension (`.js`), and the source is `.ts`.
  const base = sourceGuess.replace(/\.(js|jsx|mjs|cjs)$/, "");
  for (const ext of [".ts", ".tsx", ".d.ts", ".js", ".jsx", ""]) {
    const hit = lowerToOriginal.get((base + ext).toLowerCase());
    if (hit) return hit;
  }
  for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
    const hit = lowerToOriginal.get(path.join(base, "index" + ext).toLowerCase());
    if (hit) return hit;
  }
  return undefined;
};
