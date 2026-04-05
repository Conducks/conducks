import { registry } from '../build/src/registry/index.js';

async function debug() {
  await registry.initialize(true, process.cwd());
  const pulseId = await registry.analyze.query.getLatestPulseId();
  console.log(`Latest Pulse Found: [${pulseId}]`);

  const edgeCount = await registry.infrastructure.persistence.query(
    "SELECT COUNT(*) as count FROM edges WHERE pulseId = ?",
    [pulseId]
  );
  console.log(`Edges for this pulse: ${edgeCount[0].count}`);

  const targetId = `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/analysis/conducks-core.ts::this.graph.getgraph`;
  const callers = await registry.infrastructure.persistence.query(
    "SELECT sourceId FROM edges WHERE targetId = ? AND pulseId = ?",
    [targetId, pulseId]
  );
  console.log(`Direct callers for ${targetId}: ${callers.length}`);

  await registry.infrastructure.persistence.close();
  process.exit(0);
}

debug();
