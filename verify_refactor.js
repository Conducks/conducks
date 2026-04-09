import { SynapsePersistence } from './build/src/lib/core/persistence/persistence.js';
import { ConducksAdjacencyList } from './build/src/lib/core/graph/adjacency-list.js';

async function verify() {
  console.log('🛡️ [Conducks Test] Initializing Persistence Verification...');
  // We point to the open-pencil .conducks dir to test on a real dataset
  const persistence = new SynapsePersistence('.', true);
  const graph = new ConducksAdjacencyList();

  console.log('🛡️ [Conducks Test] Attempting Shallow Sync (load)...');
  const loaded = await persistence.load(graph);
  
  if (!loaded) {
    console.error('❌ Failed to load graph.');
    return;
  }

  const nodes = Array.from(graph.getAllNodes());
  console.log(`✅ Loaded ${nodes.length} nodes.`);

  const sample = nodes[0];
  console.log(`🛡️ [Conducks Test] Verifying Shallow State for Node: ${sample.id}`);
  console.log(' - isShallow:', sample.properties.isShallow);
  console.log(' - kinetic present?:', sample.properties.kinetic !== undefined);
  console.log(' - dna present?:', sample.properties.dna !== undefined);

  if (sample.properties.isShallow === true && sample.properties.kinetic === undefined) {
    console.log('✅ PASS: Shallow Sync working (RAM preserved).');
  } else {
    console.log('❌ FAIL: Shallow Sync leaking data into heap.');
  }

  console.log('\n🛡️ [Conducks Test] Attempting Deep Hydration (fetchNodeDeep)...');
  const deepNode = await persistence.fetchNodeDeep(sample.id);
  
  if (deepNode) {
    console.log(`✅ Fetched deep node: ${deepNode.id}`);
    console.log(' - isShallow:', deepNode.isShallow);
    console.log(' - kinetic present?:', deepNode.kinetic !== undefined);
    console.log(' - dna present?:', deepNode.dna !== undefined);
    
    if (deepNode.isShallow === false && deepNode.kinetic !== undefined && typeof deepNode.kinetic === 'object') {
      console.log('✅ PASS: Deep Hydration working (Data restored on demand).');
    } else {
      console.log('❌ FAIL: Deep Hydration failed to restore metadata.');
    }
  } else {
    console.error('❌ fetchNodeDeep failed.');
  }

  await persistence.close();
}

verify().catch(console.error);
