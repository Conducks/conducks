import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

try {
  const parser = new Parser();
  // GrammarRegistry v3.0 logic
  const lang = TypeScript.typescript || TypeScript.default || TypeScript;
  const nativeLang = lang.language || lang;
  
  console.log('Language object keys:', Object.keys(lang));
  
  parser.setLanguage(nativeLang);
  
  const sourceCode = 'export class Test { hello() { console.log("hi"); } }';
  const tree = parser.parse(sourceCode);
  
  const QUERY = `
    (class_declaration name: (type_identifier) @name) @isStruct
    (method_definition name: (property_identifier) @name) @isMethod
  `;
  
  const query = new Parser.Query(nativeLang, QUERY);
  const matches = query.matches(tree.rootNode);
  
  console.log('Success! Tree root type:', tree.rootNode.type);
  console.log('Matches found:', matches.length);
  for (const m of matches) {
    console.log('  - Capture:', m.captures[0].name, 'Text:', m.captures[0].node.text);
  }
} catch (err) {
  console.error('Failure:', err);
}
