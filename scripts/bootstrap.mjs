// Conducks — dependency-free installer.
//
// Conducks parses with native `tree-sitter` bindings. On Node 23+ the bundled V8
// headers require C++20, but tree-sitter's binding.gyp defaults to C++17, so a plain
// `npm install` fails to compile with: "C++20 or later required."
//
// This script forces the C++ standard only where needed (Node >= 23) and then runs
// the install. It uses no dependencies so it works on a fresh clone before node_modules
// exists, and on any platform (no shell-specific env syntax).
//
// Usage: `npm run bootstrap`  (Node LTS 20/22 can also just use `npm install`).
import { execSync } from 'node:child_process';

const major = parseInt(process.versions.node, 10);
const env = { ...process.env };

if (major >= 23) {
  // Only CXXFLAGS — adding -std=c++20 to CFLAGS breaks the C compile of tree-sitter's lib.c.
  env.CXXFLAGS = `-std=c++20 ${env.CXXFLAGS ?? ''}`.trim();
  console.log(`[bootstrap] Node ${process.versions.node} (>= 23): CXXFLAGS="${env.CXXFLAGS}"`);
} else {
  console.log(`[bootstrap] Node ${process.versions.node}: no extra flags needed.`);
}

execSync('npm install --legacy-peer-deps', { stdio: 'inherit', env });
