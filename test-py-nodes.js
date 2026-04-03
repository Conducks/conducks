import Parser from 'web-tree-sitter';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  try {
    const wasmPath = path.resolve(__dirname, 'build/src/resources/grammars/tree-sitter.wasm');
    const pyWasmPath = path.resolve(__dirname, 'build/src/resources/grammars/tree-sitter-python.wasm');
    
    await Parser.init({
      locateFile: (file) => file === 'tree-sitter.wasm' ? wasmPath : file
    });
    
    const lang = await Parser.Language.load(fs.readFileSync(pyWasmPath));
    const parser = new Parser();
    parser.setLanguage(lang);
    
    const source = `x.y = z\ndef foo():\n  """docstring"""\n  # comment`;
    const tree = parser.parse(source);
    
    console.log('--- PYTHON NODE STRUCTURE ---');
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
