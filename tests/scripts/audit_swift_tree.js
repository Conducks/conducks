import Parser from 'tree-sitter';
import Swift from 'tree-sitter-swift';

async function audit() {
  const parser = new Parser();
  parser.setLanguage(Swift);
  
  const code = 'VStack { Text("Hello") }';
  const tree = parser.parse(code);
  const root = tree.rootNode;
  
  function dump(node, indent = '') {
    console.log(`${indent}${node.type} (${node.childCount} children)`);
    for (let i = 0; i < node.childCount; i++) {
        dump(node.child(i), indent + '  ');
    }
  }

  console.log('--- Swift Syntax Tree Audit ---');
  dump(root);
}

audit();
