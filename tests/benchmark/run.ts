import { performance } from 'node:perf_hooks';
import { registry } from '../../src/registry/index.js';
import { chronicle } from '../../src/lib/core/git/chronicle-interface.js';
import path from 'node:path';

/**
 * Conducks — Resonance Benchmark
 * 
 * Measures the structural mirroring speed and synapsed pulse performance.
 */
async function run() {
  console.log('\x1b[35m[Conducks Benchmark] Initializing Synapse resonance...\x1b[0m');

  const files = await chronicle.discoverFiles();

  console.log(`- Benchmarking on \x1b[36m${files.length}\x1b[0m units...`);

  const startResonance = performance.now();
  const stream: Array<{path: string, source: string}> = [];
  
  for (const f of files) {
    stream.push({
      path: f,
      source: await chronicle.readFile(f)
    });
  }
  const endResonance = performance.now();

  const startPulse = performance.now();
  await registry.analyze.analyze(stream);
  const endPulse = performance.now();

  const status = registry.audit.status();

  console.log('\n\x1b[1m--- 📊 Resonance Metrics ---\x1b[0m');
  console.log(`- Discovery & Read (Mirroring): ${(endResonance - startResonance).toFixed(2)}ms`);
  console.log(`- Synapse Pulse (Reflection):   ${(endPulse - startPulse).toFixed(2)}ms`);
  console.log(`- Total Time:                   ${(endPulse - startResonance).toFixed(2)}ms`);
  console.log(`- Performance:                  ${(files.length / ((endPulse - startResonance) / 1000)).toFixed(2)} units/sec`);
  
  console.log('\n\x1b[1m--- 🧠 Structural Complexity ---\x1b[0m');
  console.log(`- Neurons:   ${status.stats.nodeCount}`);
  console.log(`- Synapses:  ${status.stats.edgeCount}`);
  console.log(`- Density:   ${status.stats.density.toFixed(4)} synapses/neuron`);

  if (status.stats.nodeCount > 0) {
    console.log('\n\x1b[32m✅ Benchmark Complete. Synapse bandwidth is stable.\x1b[0m');
  } else {
    console.log('\n\x1b[31m❌ Benchmark Failed. Synapse resonance is zero.\x1b[0m');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal Benchmark Error:', err);
  process.exit(1);
});
