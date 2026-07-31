import { EXTERNAL_ROOT } from "@/lib/core/graph/external-nodes.js";
import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { canonicalize, getProjectRelativePath } from "@/lib/core/utils/path-utils.js";
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
        canonicalRank: 0
      }
    });

    // 2. Create repository Nodes (Rank 1)
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
          canonicalRank: 1,
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
            canonicalRank: 2,
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

    const layers = [
      { id: 'L0', name: 'ECOSYSTEM', rank: 0 },
      { id: 'L1', name: 'REPOSITORY', rank: 1 },
      { id: 'L2', name: 'DIRECTORY', rank: 2 },
      { id: 'L3', name: 'UNIT', rank: 3 },
      { id: 'L4', name: 'INFRA', rank: 4 },
      { id: 'L5', name: 'STRUCTURE', rank: 5 },
      { id: 'L6', name: 'BEHAVIOR', rank: 6 },
      { id: 'L7', name: 'ATOM', rank: 7 },
      { id: 'L8', name: 'DATA', rank: 8 }
    ];

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
          canonicalRank: 3,
          parentId,
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
