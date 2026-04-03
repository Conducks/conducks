import { ConducksGraph } from './src/lib/core/graph/graph-engine.js';
import { ConducksReflector } from './src/lib/domain/analysis/reflector.js';
import { chronicle } from './src/lib/core/git/chronicle-interface.js';
import { GrammarRegistry } from './src/lib/core/parsing/grammar-registry.js';
import { AnalysisContext } from './src/lib/domain/analysis/context.js';
import path from 'path';

async function debug() {
  console.log('--- Conducks Structural Diagnostic (Hardening Sweep) ---');
  
  const graph = new ConducksGraph();
  const grammars = new GrammarRegistry();
  const reflector = new ConducksReflector(graph, grammars);
  const context = new AnalysisContext('/tmp', 'resolution');

  // Test 1: Kinetic Git Signal Integrity
  const dummyPath = '/non/existent/unit.ts';
  console.log(`Testing Kinetic Signals for: ${dummyPath}`);
  
  try {
    const resonance = await chronicle.getCommitResonance(dummyPath);
    const distribution = await chronicle.getAuthorDistribution(dummyPath);
    console.log('Resonance:', resonance);
    console.log('Distribution:', distribution);
    
    // This is the line that might throw in the real engine
    if (distribution) {
      console.log('Distribution Keys Length:', Object.keys(distribution).length);
    } else {
      console.log('Distribution is NULL or UNDEFINED');
      // If it's undefined, Object.keys(distribution) will throw!
    }
  } catch (err) {
    console.error('CRASH in Kinetic Discovery:', err.message);
  }

  // Test 2: Swift Query Compilation
  console.log('\n--- Swift Query Compilation Audit ---');
  try {
    const Parser = (await import('tree-sitter')).default;
    const Swift = (await import('tree-sitter-swift')).default;
    const parser = new Parser();
    parser.setLanguage(Swift);

    const { SWIFT_QUERIES } = await import('./src/lib/core/parsing/languages/swift/queries.js');
    console.log('Compiling SWIFT_QUERIES...');
    const query = new Parser.Query(Swift, SWIFT_QUERIES);
    console.log('Query Compiled Successfully! ✅');
  } catch (err) {
    console.error('Swift Query Error:', err.message);
    // Find the position of the error
    const match = err.message.match(/at position (\d+)/);
    if (match) {
      const pos = parseInt(match[1]);
      console.log('Error context at pos:', pos);
      // Read the query and show the context
    }
  }
}

debug();
