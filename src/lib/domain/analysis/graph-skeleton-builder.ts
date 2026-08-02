import { EXTERNAL_ROOT } from "@/lib/core/graph/external-nodes.js";
import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { canonicalize, getProjectRelativePath } from "@/lib/core/utils/path-utils.js";
import { CanonicalKind, CanonicalRank } from "@/lib/core/parsing/taxonomy.js";
import { logger } from "@/lib/core/utils/logger.js";
import path from "node:path";

/**
 * Conducks — Graph Skeleton Builder
 *
 * todo03 Phase 5 A1: extracted out of AnalyzeOrchestrator.analyze(), which had grown to 640 lines by
 * mixing this with worker dispatch, import resolution, and persistence flushing under one method.
 *
 * The containment hierarchy (ecosystem → repository → directory → unit, plus the taxonomy legend)
 * has to exist BEFORE a single file is parsed: induction results reference it by id (a unit's
 * `rootId`, a directory's `parentId`), and the reflector cannot know a file's directory ancestry —
 * that is purely a function of the file list and the project roots, not of anything in the source.
 * Isolating it here means the shape of the skeleton can be characterized and changed independently of
 * how files get parsed or how edges get flushed.
 */
export class GraphSkeletonBuilder {
  /**
   * Builds the L0-L3 containment skeleton (ecosystem, repository, directory, unit nodes) plus the
   * taxonomy legend, and returns the file → project-root map that later passes need to resolve a
   * unit's `rootId`.
   */
  public build(
    graph: ConducksGraph,
    normalizedFiles: Array<{ path: string; source: string }>,
    workspaceRoot: string,
    projectRoots: string[]
  ): Map<string, string> {
    // 1. Create the Unified ecosystem Node (Rank 0)
    // The root itself. Not an "external node" in the dependency sense, but the same literal, so it
    // comes from the same place (todo25#P12).
    const ecosystemId = EXTERNAL_ROOT;
    graph.getGraph().addNode({
      id: ecosystemId,
      label: "Ecosystem",
      properties: {
        name: path.basename(workspaceRoot),
        filePath: workspaceRoot,
        canonicalKind: 'ECOSYSTEM',
        canonicalRank: CanonicalRank[CanonicalKind.ECOSYSTEM]
      }
    });

    // 2. Create repository Nodes
    const projectMap = new Map<string, string>(); // filePath -> projectRoot
    for (const root of projectRoots) {
      const rootId = path.basename(root).toLowerCase();
      const repoId = `repository::${rootId}`;
      graph.getGraph().addNode({
        id: repoId,
        label: "Repository",
        properties: {
          name: path.basename(root),
          filePath: root,
          canonicalKind: 'REPOSITORY',
          canonicalRank: CanonicalRank[CanonicalKind.REPOSITORY],
          parentId: ecosystemId // Oracle DNA: Hierarchical Link
        }
      });

      // Materialize Ecosystem -> Repository Link
      graph.getGraph().addEdge({
        id: `member::${repoId}->${ecosystemId}`,
        sourceId: repoId,
        targetId: ecosystemId,
        type: 'MEMBER_OF',
        confidence: 1.0,
        properties: {}
      });

      // Populate Project Map for Unit assignment
      for (const file of normalizedFiles) {
        if (file.path.startsWith(root) || file.path === root) {
          const existing = projectMap.get(file.path);
          if (!existing || root.length > existing.length) {
            projectMap.set(file.path, root);
          }
        }
      }
    }

    // === Phase 0.1: Recursive Directory Population 🏺 ===
    const directoryIds = new Set<string>();
    for (const file of normalizedFiles) {
      let currentDir = path.dirname(file.path);
      const root = projectMap.get(file.path) || workspaceRoot;
      const rootId = path.basename(root).toLowerCase();

      while (currentDir.startsWith(root) && currentDir !== root) {
        const canonicalDir = canonicalize(currentDir);
        if (directoryIds.has(canonicalDir)) break;

        const dirId = `directory::${canonicalDir}`;
        const parentDir = path.dirname(currentDir);
        const parentId = parentDir.startsWith(root) && parentDir !== root ?
          `directory::${canonicalize(parentDir)}` :
          `repository::${rootId}`;

        graph.getGraph().addNode({
          id: dirId,
          label: "Directory",
          properties: {
            name: path.basename(currentDir),
            filePath: canonicalDir,
            canonicalKind: 'DIRECTORY',
            canonicalRank: CanonicalRank[CanonicalKind.DIRECTORY],
            parentId
          }
        });

        // Materialize Directory -> Parent Link
        graph.getGraph().addEdge({
          id: `member::${dirId}->${parentId}`,
          sourceId: dirId,
          targetId: parentId,
          type: 'MEMBER_OF',
          confidence: 1.0,
          properties: {}
        });

        directoryIds.add(canonicalDir);
        currentDir = parentDir;
      }
    }

    // Phase 0.2: Legendary Anchor (Taxonomy Guide) 🏺
    graph.getGraph().addNode({
      id: 'ecosystem::legend',
      label: 'Legend',
      properties: {
        name: 'Structural Legend',
        canonicalKind: 'ECOSYSTEM',
        // -1 is DELIBERATE and the one rank not drawn from the enum: the legend describes the
        // ladder, so it cannot stand on a rung of it. Everything else must use `CanonicalRank`.
        canonicalRank: -1,
        parentId: EXTERNAL_ROOT
      }
    });
    graph.getGraph().addEdge({
      id: 'member::legend->global',
      sourceId: 'ecosystem::legend',
      targetId: EXTERNAL_ROOT,
      type: 'MEMBER_OF',
      confidence: 1.0,
      properties: {}
    });

    // DERIVED from the enum, never listed by hand. This list used to be a literal nine-rung ladder
    // — ECOSYSTEM 0 … DATA 8 — from a taxonomy that has since grown to thirteen, and it was the
    // legend, so the graph shipped a self-description that contradicted the graph. Anything written
    // twice is written wrong once (ADR 0099).
    const layers = (Object.values(CanonicalKind) as CanonicalKind[])
      .map(name => ({ id: `l${CanonicalRank[name]}`, name, rank: CanonicalRank[name] }));

    for (const layer of layers) {
      graph.getGraph().addNode({
        id: `taxonomy::${layer.id.toLowerCase()}`,
        label: 'Taxonomy',
        properties: {
          name: layer.name,
          canonicalKind: layer.name,
          canonicalRank: layer.rank,
          parentId: 'ecosystem::legend'
        }
      });
      graph.getGraph().addEdge({
        id: `member::taxonomy::${layer.id.toLowerCase()}->legend`,
        sourceId: `taxonomy::${layer.id.toLowerCase()}`,
        targetId: 'ecosystem::legend',
        type: 'MEMBER_OF',
        confidence: 1.0,
        properties: {}
      });
    }

    // === Pass 1: Global Identity Discovery 🏺 ===
    // We build the entire containment graph before induction.
    logger.info(`🛡️ [Conducks] [Pass 1] Structural Discovery: Mapping ${normalizedFiles.length} units (Parallel)...`);

    for (const file of normalizedFiles) {
      const filePath = canonicalize(file.path);
      const unitId = `${filePath}::unit`;
      const projectRoot = projectMap.get(file.path) || workspaceRoot;
      const rootName = path.basename(projectRoot).toLowerCase();

      // File -> Parent Directory link
      const fileDir = path.dirname(file.path);
      const relativeDir = path.relative(projectRoot, fileDir);
      const parentId = relativeDir === '' || relativeDir === '.' ?
        `repository::${rootName}` :
        `directory::${canonicalize(fileDir)}`;

      graph.getGraph().addNode({
        id: unitId,
        label: "File",
        properties: {
          name: path.basename(file.path),
          filePath: filePath,
          rawPath: file.path,
          projectRelativePath: getProjectRelativePath(file.path, workspaceRoot),
          canonicalKind: 'UNIT',
          canonicalRank: CanonicalRank[CanonicalKind.UNIT],
          parentId,
          // Set HERE, for every unit, not only for the ones a language provider claims (todo26).
          // 172 units — 141 `.md`, plus `.mjs`/`.cjs`/`.json`/dotfiles — had none, because the
          // reflector is the only other writer and it never runs for a file with no provider.
          //
          // This was reclassified during triage as "probably an exemption rule, since a changelog
          // should not get a language-derived path". That was wrong, and reading the field settled
          // it: `layer_path` is `path.relative(projectRoot, file)` lowercased — a PATH, with no
          // language content whatsoever. A markdown file has one for exactly the same reason a
          // TypeScript file does.
          layer_path: getProjectRelativePath(file.path, workspaceRoot).toLowerCase(),
          rootId: `repository::${rootName}`
        }
      });

      // Materialize Unit -> Directory/Repository Link
      graph.getGraph().addEdge({
        id: `member::${unitId}->${parentId}`,
        sourceId: unitId,
        targetId: parentId,
        type: 'MEMBER_OF',
        confidence: 1.0,
        properties: {}
      });
    }

    return projectMap;
  }
}
