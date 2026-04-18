import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

try {
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript);
  const sourceCode = 'export class Test { hello() { console.log("hi"); } }';
  const tree = parser.parse(sourceCode);
  console.log('Success! Tree root type:', tree.rootNode.type);
  console.log('Child count:', tree.rootNode.childCount);
} catch (err) {
  console.error('Failure:', err);
}
