import * as Parser from "web-tree-sitter";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function debugParser() {
  await Parser.init();
  const langPath = path.resolve(__dirname, "../grammars/tree-sitter-python.wasm");
  const Python = await Parser.Language.load(langPath);
  const parser = new Parser();
  parser.setLanguage(Python);

  const source = `
from fastapi import FastAPI
app = FastAPI()

@app.get("/api/user/profile")
def get_profile():
    user_data = db.fetch("user")
    formatted = format_output(user_data)
    return formatted
  `;

  const tree = parser.parse(source);
  const queryScm = `
  (decorator 
    (call 
      function: (attribute object: (identifier) @route_receiver attribute: (identifier) @route_method)
      arguments: (argument_list (string (string_content) @kinesis_route_path)))) @kinesis_route

  (assignment left: (identifier) @pulse_assignment_name right: (_) @pulse_assignment_value)
  
  (call function: (identifier) @kinesis_target arguments: (argument_list (_) @kinesis_arg)*)
  `;

  const query = new Parser.Query(Python, queryScm);
  const matches = query.matches(tree.rootNode);

  console.log(`Found ${matches.length} matches`);
  for (const match of matches) {
    console.log("Match:");
    for (const cap of match.captures) {
      console.log(`  - ${cap.name}: ${cap.node.text} (${cap.node.type})`);
    }
  }
}

debugParser();
