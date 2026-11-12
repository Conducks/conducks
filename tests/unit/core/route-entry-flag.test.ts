import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector, AnalyzeContext, TypeScriptProvider, grammars } from "@/lib/core/parsing/index.js";

/**
 * A route registration marks the scope that registers it as an entry point — the file for a
 * module-level `app.get(...)`, the function for one inside a function. Inside a function the lookup
 * used `file::<scope>.<scope>` (the scope chain twice, the same defect as the debt markers), matched
 * no node, and flagged nothing (state-machine audit P-03-2).
 */
describe('route registration flags its scope as an entry point', () => {
  beforeAll(async () => { await grammars.loadLanguage('typescript'); });

  it('flags the function that registers a route', async () => {
    const src = [
      "import express from 'express';",
      'const app = express();',
      'export function setup() {',
      "  app.get('/health', (req, res) => res.send('ok'));",
      '}',
      '',
    ].join('\n');
    const s: any = await new ConducksReflector().reflect(
      { path: '/repo/server.ts', source: src }, new TypeScriptProvider() as never, new AnalyzeContext(), ['/repo/server.ts']);
    const setup = s.nodes.find((n: any) => n.name === 'setup');
    expect(setup?.metadata?.isEntryPoint).toBe(true);
  });
});
