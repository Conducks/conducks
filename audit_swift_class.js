import Parser from 'tree-sitter';
import Swift from 'tree-sitter-swift';

async function audit() {
  const parser = new Parser();
  parser.setLanguage(Swift);
  
  const code = 'class MyView: View { extension MyView { func foo() {} } }';
  const tree = parser.parse(code);
  const root = tree.rootNode;
  
  function dump(node, indent = '') {
    console.log(`${indent}${node.type} (${node.childCount} children)`);
    for (let i = 0; i < node.childCount; i++) {
        dump(node.child(i), indent + '  ');
    }
  }

  console.log('--- Swift Syntax Tree Audit (Class & Extension) ---');
  dump(root);
}

audit();
