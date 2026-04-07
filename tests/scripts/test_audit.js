const { DuckDbPersistence } = require('./conducks/build/src/lib/core/persistence/persistence.js');
const { ConducksAdjacencyList } = require('./conducks/build/src/lib/core/graph/adjacency-list.js');
const { GovernanceService } = require('./conducks/build/src/lib/domain/governance/index.js');
const { ConducksAdvisor } = require('./conducks/build/src/lib/domain/governance/advisor.js');
const { ConducksSentinel } = require('./conducks/build/src/lib/domain/governance/sentinel.js');
const { ContextGenerator } = require('./conducks/build/src/lib/domain/governance/context-generator.js');
const { BlueprintGenerator } = require('./conducks/build/src/lib/domain/governance/blueprint-generator.js');

async function testOrphanDetection() {
  console.log("--- STARTING APOSTOLIC AUDIT TEST ---");
  const graph = new ConducksAdjacencyList();
  
  // 1. Create a Caller (Node A)
  graph.addNode({
    id: 'file_b.ts::caller',
    label: 'BEHAVIOR',
    properties: { name: 'caller', filePath: 'file_b.ts', canonicalKind: 'BEHAVIOR', canonicalRank: 6 }
  });

  // 2. Create an Edge to a NON-EXISTENT target (Node X)
  graph.addEdge({
    id: 'call::caller->missing_target',
    sourceId: 'file_b.ts::caller',
    targetId: 'file_a.ts::missing_target',
    type: 'CALLS',
    confidence: 1.0,
    properties: {}
  });

  const governance = new GovernanceService(
    graph,
    new ConducksAdvisor(),
    new ConducksSentinel(),
    new ContextGenerator(),
    new BlueprintGenerator()
  );

  const result = governance.audit();
  console.log("\n--- AUDIT RESULT ---");
  console.log("Success:", result.success);
  console.log("Stats:", result.stats);
  console.log("Violations:", result.violations);

  if (result.violations.some(v => v.includes("Orphaned Edge"))) {
    console.log("\n✅ SUCCESS: Orphaned Edge detected correctly!");
  } else {
    console.log("\n❌ FAILURE: Orphaned Edge NOT detected.");
    process.exit(1);
  }
}

testOrphanDetection().catch(err => {
  console.error(err);
  process.exit(1);
});
