import { IgnoreManager } from '../../../../src/lib/core/parsing/ignore-manager.js';
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

    it('Should exclude SQLite and log files', () => {
        expect(mgr.isIgnored(path.join(root, 'data/cache.sqlite'))).toBe(true);
        expect(mgr.isIgnored(path.join(root, 'logs/error.log'))).toBe(true);
    });

    it('Should correctly handle relative paths for subfolders', () => {
       // Patterns like **/node_modules/** should match anywhere
       expect(mgr.isIgnored(path.join(root, 'packages/app/node_modules/react/index.js'))).toBe(true);
    });
});
