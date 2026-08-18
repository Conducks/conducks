import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A method written inside an object literal is a MEMBER of what that literal builds. Its reachability
 * is the container's question, and the container is judged on its own row.
 *
 * The scope map is built from function/class/method captures, so an object literal is not a scope and
 * a method inside one comes out parented to the FILE — indistinguishable from a top-level
 * declaration, and then reported as an unreferenced module symbol.
 *
 * MEASURED on the orchestrator subject: NextAuth's `authorize`, written inside
 * `CredentialsProvider({ ... })` inside `export const adminAuthOptions = { providers: [...] }`, was
 * reported `[ORPHAN] Symbol is defined but never referenced` in both
 * `admin/src/lib/auth/nextauth-admin.ts:36` and `packages/core/auth/server/modules/nextauth.ts:47`.
 * It is the admin sign-in callback: acting on that verdict removes admin login, and the code still
 * compiles afterwards, so nothing fails loudly.
 *
 * Recorded at PARSE time (`dna.nestedInExpression`) rather than inferred from line ranges, because a
 * variable's recorded range is its identifier — the container spans one line of a thirteen-line
 * literal — so the nesting is invisible to any downstream range comparison.
 */
describe('a member inside an object literal is not judged as a module symbol', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('object-literal-members');

    writeFile(repo, 'src/auth.ts', `
function CredentialsProvider(config: any) { return config; }

export const adminAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Admin Portal",
            async authorize(credentials: any) {
                return credentials ? { id: "1" } : null;
            },
        }),
    ],
    callbacks: {
        async signIn({ user }: any) { return !!user; },
    },
};

/** Genuinely unreferenced, at module scope. The finding that must survive. */
export function trulyDead(): number { return 1; }
`);
    writeFile(repo, 'src/main.ts', `
import { adminAuthOptions } from './auth.js';
export function boot() { return adminAuthOptions; }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });

    expect(JSON.parse(runCli(['query', '*', '--json'], { cwd: repo }).stdout).length).toBeGreaterThan(0);
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('does not report an object-literal callback as dead code', () => {
    const findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
    const reported = findings.map((f: any) => f.symbol);
    expect(reported).not.toContain('authorize');
    expect(reported).not.toContain('signIn');
  }, 180000);

  it('still reports a genuinely unreferenced module-scoped function', () => {
    // The counter-test. "Stop reporting methods" would pass the case above while silencing every
    // true finding in the same file — this is the one it must still catch.
    const findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
    expect(findings.map((f: any) => f.symbol)).toContain('trulyDead');
  }, 180000);
});
