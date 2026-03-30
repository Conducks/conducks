import * as Parser from "web-tree-sitter";
import { PythonExtractor } from "./lib/product/indexing/languages/python/extractor.js";
import { grammars } from "./lib/core/parser/grammar-registry.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testComplexity() {
  await grammars.init();
  const grammarPath = path.resolve(__dirname, "grammars/tree-sitter-python.wasm");
  await grammars.loadLanguage("python", grammarPath);
  const parser = grammars.getUnifiedParser("python")!;

  const sourceB = `
def entry():
    if True:
        for i in range(10):
            if i % 2 == 0:
                print(i)
            else:
                try:
                    pass
                except:
                    pass
`;
  const tree = parser.parse(sourceB);
  const extractor = new PythonExtractor();
  
  // Find the function_definition node
  const query = new (Parser as any).Query(grammars.getLanguage("python")!, "(function_definition) @func");
  const matches = query.matches(tree.rootNode);
  const funcNode = matches[0].captures[0].node;
  
  const complexity = extractor.calculateComplexity(funcNode);
  console.log(`Calculated Complexity: ${complexity}`);
  
  // Log node types to see what's being traversed
  const traverse = (n: any, depth = 0) => {
    console.log(`${"  ".repeat(depth)}${n.type}`);
    for (let i = 0; i < n.childCount; i++) {
        traverse(n.child(i), depth + 1);
    }
  };
  // traverse(funcNode);
}

testComplexity().catch(console.error);
