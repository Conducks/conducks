import { ConducksReflector } from '../build/src/lib/domain/analysis/reflector.js';
import { PythonProvider } from '../build/src/lib/core/parsing/languages/python/index.js';
import { AnalyzeContext } from '../build/src/lib/core/parsing/context.js';
import { grammars } from '../build/src/lib/core/parsing/grammar-registry.js';
import path from 'node:path';

async function test() {
  const provider = new PythonProvider();
  await grammars.loadLanguage(provider.langId);
  
  const source = `
class MapperRunner:
    def explore(self, url: str):
        return True
`;
  const reflector = new ConducksReflector();
  const context = new AnalyzeContext();
  const spectrum = await reflector.reflect(
    { path: '/fake/test.py', source },
    provider,
    context,
    ['/fake/test.py']
  );
  
  console.log("Spectrum Nodes:", spectrum.nodes.map(n => ({ name: n.name, kind: n.canonicalKind, id: n.metadata?.id })));
}

test().catch(console.error);
