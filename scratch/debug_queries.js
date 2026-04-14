import { ConducksReflector } from '../build/src/lib/domain/analysis/reflector.js';
import { PythonProvider } from '../build/src/lib/core/parsing/languages/python/index.js';
import { AnalyzeContext } from '../build/src/lib/core/parsing/context.js';
import { grammars } from '../build/src/lib/core/parsing/grammar-registry.js';
import Parser from 'tree-sitter';

async function test() {
  const provider = new PythonProvider();
  await grammars.loadLanguage(provider.langId);
  const lang = grammars.getLanguage(provider.langId);
  
  const source = `
class MapperRunner:
    def explore(self, url: str):
        return True
`;
  
  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(source);
  
  console.log("Query String:\n", provider.queryScm);
  
  try {
    const query = lang.query(provider.queryScm);
    const matches = query.matches(tree.rootNode);
    console.log("Match Count:", matches.length);
    
    matches.forEach((m, i) => {
      console.log(`Match ${i}:`, m.captures.map(c => c.name));
    });
  } catch (err) {
    console.error("Query Error:", err);
  }
}

test().catch(console.error);
