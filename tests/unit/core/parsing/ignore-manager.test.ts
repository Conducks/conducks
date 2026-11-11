/**
 * Ported out of tests/legacy/ on 2026-07-26 (todo18 Phase 3). IgnoreManager had no other coverage; its import path was rewritten to the @/ alias.
 *
 * It was archived, excluded from tsc and jest, and still passing against current source — so
 * it described live behaviour nothing else covered. Kept as it was, apart from its location.
 */
import { IgnoreManager } from '@/lib/core/parsing/ignore-manager.js';
import path from 'node:path';

describe('Exclude structural noise (IgnoreManager) 🛡️', () => {
    const root = path.resolve('/test/root');
    const mgr = new IgnoreManager(root);

    it('Should exclude default noise nodes (node_modules)', () => {
        expect(mgr.isIgnored(path.join(root, 'node_modules/lodash/index.js'))).toBe(true);
    });

    it('Should exclude build artifacts', () => {
        expect(mgr.isIgnored(path.join(root, 'dist/bundle.js'))).toBe(true);
        expect(mgr.isIgnored(path.join(root, 'build/main.o'))).toBe(true);
    });

    it('Should exclude VCS metadata', () => {
        expect(mgr.isIgnored(path.join(root, '.git/config'))).toBe(true);
    });

    it('Should allow source files', () => {
        expect(mgr.isIgnored(path.join(root, 'src/index.ts'))).toBe(false);
        expect(mgr.isIgnored(path.join(root, 'lib/core/graph.ts'))).toBe(false);
    });

    it('keeps a Cargo binary target (src/bin/*.rs) while bin/ stays build output elsewhere', () => {
        expect(mgr.isIgnored(path.join(root, 'crates/gates/src/bin/rules-report.rs'))).toBe(false);
        expect(mgr.isIgnored(path.join(root, 'src/bin/app.rs'))).toBe(false);
        expect(mgr.isIgnored(path.join(root, 'MyApp/bin/Debug/app.dll'))).toBe(true);
        expect(mgr.isIgnored(path.join(root, 'bin/tool.js'))).toBe(true);
        // Every OTHER rule still applies: a copy under target/ is build output.
        expect(mgr.isIgnored(path.join(root, 'target/package/x/src/bin/app.rs'))).toBe(true);
    });

    it('Should exclude SQLite and log files', () => {
        expect(mgr.isIgnored(path.join(root, 'data/cache.sqlite'))).toBe(true);
        expect(mgr.isIgnored(path.join(root, 'logs/error.log'))).toBe(true);
    });

    it('Should correctly handle relative paths for subfolders', () => {
       // Patterns like **/node_modules/** should match anywhere
       expect(mgr.isIgnored(path.join(root, 'packages/app/node_modules/react/index.js'))).toBe(true);
    });
});
