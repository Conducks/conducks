import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import fs from 'node:fs';
import path from 'node:path';

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

const source = fs.readFileSync('/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks/src/lib/domain/analysis/orchestrator.ts', 'utf8');
const tree = parser.parse(source);

const query = new Parser.Query(TypeScript.typescript, `
  (class_declaration name: (type_identifier) @name) @isStruct
  (method_definition name: (_) @name) @isMethod
  (function_declaration name: (identifier) @name) @isFunction
`);

const matches = query.matches(tree.rootNode);
console.log(`Found ${matches.length} matches.`);

matches.forEach((m, i) => {
  console.log(`Match ${i}:`);
  m.captures.forEach(c => {
    console.log(`  Capture: ${c.name}, Text: ${c.node.text}`);
  });
});
