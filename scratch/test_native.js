import Parser from 'tree-sitter';
import { grammars } from '../build/src/lib/core/parsing/grammar-registry.js';

async function test() {
  await grammars.loadLanguage('python');
  const lang = grammars.getLanguage('python');
  
  const source = `
class MapperRunner:
    def explore(self, url: str):
        return True
`;
  
  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(source);
  
  const queryScm = `
    (class_definition name: (identifier) @name) @isClass
    (function_definition name: (identifier) @name) @isFunction
  `;
  
  try {
    const query = new Parser.Query(lang, queryScm);
    const matches = query.matches(tree.rootNode);
    console.log("Match Count:", matches.length);
    
    matches.forEach((m, i) => {
      console.log(`Match ${i}:`, m.captures.map(c => ({ name: c.name, text: c.node.text })));
    });
  } catch (err) {
    console.error("Query Error:", err);
  }
}

test().catch(console.error);
