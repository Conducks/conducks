import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector } from "@/lib/core/parsing/index.js";
import { AnalyzeContext } from "@/lib/core/parsing/index.js";
import { TypeScriptProvider } from "@/lib/core/parsing/index.js";
import { grammars } from "@/lib/core/parsing/index.js";

/**
 * ADR 0085 — a renamed binding is CALLED by its local name and DEFINED under its original one.
 *
 *     import { POST as stepAction } from './route';
 *     const { POST: sendMessage } = await import('./route');
 *
 * The call processor knew the file and used the LOCAL name, producing `<route>::stepaction` — an id
 * no node has. Two different failures came out of that, and the second is the reason this is a bug
 * rather than a gap:
 *
 *   - where nothing else owned the local name, the call DANGLED (77 edges on subject-b);
 *   - where something did, it bound to that unrelated export. Measured: a test calling a route's
 *     `POST` through the local name `sendMessage` was linked to `MessagingService.sendMessage`, a
 *     completely different function, at confidence 0.85.
 *
 * The second is invisible: nothing counts a wrong edge, and every command downstream reads it as a
 * real call. It was found by verifying resolutions against the SOURCE rather than against the graph.
 */
describe('a renamed import is called by one name and defined under another', () => {
  const reflector = new ConducksReflector();
  const provider = new TypeScriptProvider();
  const ROUTE = '/repo/route.ts';

  const callTargets = async (source: string) => {
    const context = new AnalyzeContext();
    const file = { path: '/repo/caller.ts', source };
    const spectrum: any = await reflector.reflect(file, provider as any, context, [file.path, ROUTE]);
    // CALLS **or** CONSTRUCTS: `isConstructor()` classifies by CAPITALISATION, so a call to an
    // uppercase export (`POST(...)`, the Next.js handler convention) is filed as a construction.
    // That heuristic is not what these tests are about — the target ID is — so both are collected.
    return spectrum.relationships
      .filter((r: any) => r.type === 'CALLS' || r.type === 'CONSTRUCTS')
      .map((r: any) => String(r.targetName).toLowerCase());
  };

  beforeAll(async () => {
    await grammars.loadLanguage('typescript');
  });

  it('targets the ORIGINAL name for a renamed static import', async () => {
    const targets = await callTargets(`import { POST as stepAction } from './route.js';\nexport function run() { stepAction(1); }\n`);
    expect(targets.some((t: string) => t.endsWith('::post'))).toBe(true);
    expect(targets.some((t: string) => t.endsWith('::stepaction'))).toBe(false);
  });

  it('targets the ORIGINAL name for a renamed destructured dynamic import', async () => {
    const targets = await callTargets(`export async function run() { const { POST: sendMessage } = await import('./route.js'); await sendMessage(1); }\n`);
    expect(targets.some((t: string) => t.endsWith('::post'))).toBe(true);
    expect(targets.some((t: string) => t.endsWith('::sendmessage'))).toBe(false);
  });

  /** An import that is NOT renamed must be untouched — the local name IS the original. */
  it('leaves an unrenamed import alone', async () => {
    const targets = await callTargets(`import { POST } from './route.js';\nexport function run() { POST(1); }\n`);
    expect(targets.some((t: string) => t.endsWith('::post'))).toBe(true);
  });

  /**
   * Only the FIRST segment of a dotted target is a binding. `Svc.create()` where `Svc` is renamed
   * must become `<file>::original.create`, not have the method rewritten too.
   */
  it('rewrites only the receiver segment of a dotted call', async () => {
    const targets = await callTargets(`import { UserService as Svc } from './route.js';\nexport function run() { Svc.create(1); }\n`);
    expect(targets.some((t: string) => t.endsWith('::userservice.create'))).toBe(true);
    expect(targets.some((t: string) => t.includes('svc.'))).toBe(false);
  });
});

describe('a renamed binding records where the original lives', () => {
  const reflector = new ConducksReflector();
  const provider = new TypeScriptProvider();

  beforeAll(async () => {
    await grammars.loadLanguage('typescript');
  });

  /**
   * The ALIASES edge is qualified with the resolved file. A bare original name relies on IntraLinker
   * scoping the lookup to files this unit imports, and a dynamic import gives it no such scope — so
   * a bare target dangled on `post`/`get`, 16 edges of it.
   */
  it('points the alias at the resolved file, not at a bare name', async () => {
    const context = new AnalyzeContext();
    const file = { path: '/repo/caller.ts', source: `export async function run() { const { POST: sendMessage } = await import('./route.js'); }\n` };
    const spectrum: any = await reflector.reflect(file, provider as any, context, [file.path, '/repo/route.ts']);
    const alias = spectrum.relationships.find((r: any) => r.type === 'ALIASES');
    expect(alias).toBeDefined();
    expect(String(alias.targetName)).toBe('/repo/route.ts::post');
  });
});
