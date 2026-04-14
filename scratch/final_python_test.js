import Parser from 'tree-sitter';
import { PYTHON_QUERIES } from '../build/src/lib/core/parsing/languages/python/queries.js';
import Python from 'tree-sitter-python';

function test() {
  const parser = new Parser();
  parser.setLanguage(Python);
  
  const source = `
class MapperRunner:
    def explore(self, url: str):
        return True
`;
  
  const tree = parser.parse(source);
  console.log("Root Node Type:", tree.rootNode.type);
  
  const query = new Parser.Query(Python, PYTHON_QUERIES);
  const matches = query.matches(tree.rootNode);
  
  console.log("Match Count:", matches.length);
  matches.forEach((m, i) => {
    console.log(`Match ${i}:`, m.captures.map(c => ({ name: c.name, text: c.node.text })));
  });
}

test();
