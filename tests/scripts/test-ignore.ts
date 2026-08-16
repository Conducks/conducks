import path from 'node:path';
import { IgnoreManager } from "@/lib/core/parsing/index.js";
import { registry } from '../../src/registry/index.js';

const root = path.join(process.cwd(), "../archive/TargetedCV");
const manager = new IgnoreManager(root);
const testPath = path.join(root, "application/src/lib/core/index.ts");

console.log("Testing path:", testPath);
console.log("Is Ignored:", manager.isIgnored(testPath));
console.log("Active Patterns:", manager.getPatterns());
