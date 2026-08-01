import { describe, it, expect, beforeAll } from '@jest/globals';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';
import { JAVASCRIPT_QUERIES } from '@/lib/core/parsing/languages/javascript/queries.js';
import { PYTHON_QUERIES } from '@/lib/core/parsing/languages/python/queries.js';
import { GO_QUERIES } from '@/lib/core/parsing/languages/go/queries.js';
import { JAVA_QUERIES } from '@/lib/core/parsing/languages/java/queries.js';
import { CSHARP_QUERIES } from '@/lib/core/parsing/languages/csharp/queries.js';
import { PHP_QUERIES } from '@/lib/core/parsing/languages/php/queries.js';
import { RUBY_QUERIES } from '@/lib/core/parsing/languages/ruby/queries.js';
import { RUST_QUERIES } from '@/lib/core/parsing/languages/rust/queries.js';

/**
 * The REQUEST half of a cross-service pair, outside TypeScript (todo22#P15).
 *
 * Seven languages could already declare a ROUTE and NONE could declare a caller, so a cross-service
 * edge was one-directional anywhere but TypeScript — conducks could see that a Go service exposes
 * `/users` and could never see the Python service calling it.
 *
 * These run the REAL grammars against REAL source. A query that compiles but matches nothing is the
 * exact failure ADR 0071 records — `@isBinding`, `processAlias` and `RESOLVABLE.ALIASES` were all
 * built and wired and produced zero edges for weeks, because no query emitted the capture. Asserting
 * on the parse is the only thing that catches that.
 */
const captures = async (lang: string, scm: string, source: string): Promise<Map<string, string[]>> => {
  await grammars.loadLanguage(lang);
  const parser = grammars.getUnifiedParser(lang);
  if (!parser) throw new Error(`no parser for ${lang} — the native grammar is not installed`);
  const tree = parser.parse(source);
  const query = grammars.createQuery(grammars.getLanguage(lang), scm);
  const out = new Map<string, string[]>();
  for (const m of query.matches(tree.rootNode)) {
    for (const c of m.captures) {
      out.set(c.name, [...(out.get(c.name) ?? []), c.node.text]);
    }
  }
  return out;
};

beforeAll(async () => { await grammars.init(); });

describe('JavaScript emits a request capture', () => {
  it('captures fetch with its url and receiver', async () => {
    const c = await captures('javascript', JAVASCRIPT_QUERIES, `async function load() { await fetch('/api/users'); }`);
    expect(c.get('kinesis_request_url')).toEqual(["'/api/users'"]);
    expect(c.get('req_fn')).toContain('fetch');
  });

  /** The receiver is not decoration — `flow.ts` rejects an unknown one unless the URL is absolute. */
  it('captures an axios call with its receiver and method', async () => {
    const c = await captures('javascript', JAVASCRIPT_QUERIES, `axios.post('https://api.example.com/orders', body);`);
    expect(c.get('kinesis_request_url')).toEqual(["'https://api.example.com/orders'"]);
    expect(c.get('kinesis_object')).toContain('axios');
    expect(c.get('req_method')).toContain('post');
  });

  it('does not capture an unrelated .get() as a network call', async () => {
    const c = await captures('javascript', JAVASCRIPT_QUERIES, `const v = cache.get('some-key');`);
    expect(c.get('kinesis_request_url')).toBeUndefined();
  });
});

/**
 * JavaScript had NEITHER half. The express route pattern lived in the TypeScript queries and was
 * never copied across, so a plain `.js` server declared no route at all — found by building a
 * two-service fixture and watching the Python caller resolve while the JS route it called stayed
 * invisible.
 */
describe('JavaScript emits a route capture', () => {
  it('captures an express route with its method and path', async () => {
    const c = await captures('javascript', JAVASCRIPT_QUERIES,
      `const app = require('express')();\napp.get('/users', (req, res) => res.json([]));\n`);
    expect(c.get('kinesis_route_path')).toEqual(["'/users'"]);
    expect(c.get('route_method')).toContain('get');
  });
});

describe('Python emits a request capture', () => {
  it('captures requests.get with its receiver and method', async () => {
    const c = await captures('python', PYTHON_QUERIES, `def load():\n    return requests.get("https://api.example.com/users")\n`);
    expect(c.get('kinesis_request_url')).toEqual(['"https://api.example.com/users"']);
    expect(c.get('kinesis_object')).toContain('requests');
    expect(c.get('req_method')).toContain('get');
  });

  it('captures httpx', async () => {
    const c = await captures('python', PYTHON_QUERIES, `r = httpx.post("https://api.example.com/orders")\n`);
    expect(c.get('kinesis_object')).toContain('httpx');
  });

  /** `d.get("k")` on a dict is the overwhelmingly common shape and must not become a request. */
  it('does not capture a dict lookup', async () => {
    const c = await captures('python', PYTHON_QUERIES, `v = config.get("timeout")\n`);
    expect(c.get('kinesis_request_url')).toBeUndefined();
  });
});

describe('Go emits a request capture', () => {
  it('captures http.Get with its receiver', async () => {
    const c = await captures('go', GO_QUERIES,
      `package main\nimport "net/http"\nfunc load() { http.Get("https://api.example.com/users") }\n`);
    expect(c.get('kinesis_request_url')).toEqual(['"https://api.example.com/users"']);
    expect(c.get('kinesis_object')).toContain('http');
    expect(c.get('req_method')).toContain('Get');
  });

  it('captures a client method', async () => {
    const c = await captures('go', GO_QUERIES,
      `package main\nfunc load() { client.Post("https://api.example.com/orders", "application/json", nil) }\n`);
    expect(c.get('kinesis_object')).toContain('client');
    expect(c.get('req_method')).toContain('Post');
  });

  it('does not capture an unrelated selector call', async () => {
    const c = await captures('go', GO_QUERIES, `package main\nfunc f() { logger.Info("hello") }\n`);
    expect(c.get('kinesis_request_url')).toBeUndefined();
  });
});

/**
 * The remaining five. Every one of these was route-only, so a service written in them could be
 * CALLED and could never be seen calling anything.
 *
 * Each case pairs a positive with a negative, because the receiver whitelist is the whole safety
 * rail: `.get(...)` is a network call on an HTTP client and a map lookup on everything else, and a
 * pattern that ignores the receiver turns every collection access in the codebase into a request.
 */
describe('the remaining languages emit a request capture', () => {
  const cases: Array<[string, string, string, string, string]> = [
    ['java', JAVA_QUERIES,
      'class A { void f() { restTemplate.getForObject("https://api.example.com/users"); } }',
      'restTemplate',
      'class A { void f() { cache.getForObject("k"); } }'],
    ['csharp', CSHARP_QUERIES,
      'class A { void F() { httpClient.GetAsync("https://api.example.com/users"); } }',
      'httpClient',
      'class A { void F() { dict.GetAsync("k"); } }'],
    ['php', PHP_QUERIES,
      '<?php $client->get("https://api.example.com/users");',
      '$client',
      '<?php $cache->get("k");'],
    ['ruby', RUBY_QUERIES,
      'RestClient.get("https://api.example.com/users")',
      'RestClient',
      'settings.get("k")'],
    ['rust', RUST_QUERIES,
      'fn f() { client.get("https://api.example.com/users"); }',
      'client',
      'fn f() { map.get("k"); }'],
  ];

  for (const [lang, scm, positive, receiver, negative] of cases) {
    it(`${lang}: captures a request and its receiver`, async () => {
      const c = await captures(lang, scm, positive);
      expect(c.get('kinesis_request_url')?.join()).toContain('api.example.com/users');
      expect(c.get('kinesis_object')?.join()).toContain(receiver);
    });

    it(`${lang}: does not capture a lookup on a non-client receiver`, async () => {
      const c = await captures(lang, scm, negative);
      expect(c.get('kinesis_request_url')).toBeUndefined();
    });
  }
});
