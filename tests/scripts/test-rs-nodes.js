import Parser from 'web-tree-sitter';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  try {
    const wasmPath = path.resolve(__dirname, 'build/src/resources/grammars/tree-sitter.wasm');
    const rsWasmPath = path.resolve(__dirname, 'build/src/resources/grammars/tree-sitter-rust.wasm');
    
    await Parser.init({
      locateFile: (file) => file === 'tree-sitter.wasm' ? wasmPath : file
    });
    
    const lang = await Parser.Language.load(fs.readFileSync(rsWasmPath));
    const parser = new Parser();
    parser.setLanguage(lang);
    
    const source = `// line comment\n/* block comment */\nfn main() {}`;
    const tree = parser.parse(source);
    
    console.log('--- RUST NODE STRUCTURE ---');
    function printNode(node, depth = 0) {
      console.log('  '.repeat(depth) + node.type + (node.isNamed ? '*' : ''));
      for (let i = 0; i < node.childCount; i++) {
        printNode(node.child(i), depth + 1);
      }
    }
    printNode(tree.rootNode);
    
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
