/**
 * @format
 * @type {import('ts-jest').JestConfigWithTsJest}
 */

/** Shared alias mapper — used by both projects */
const moduleNameMapper = {
	'^@/(.*)\\.js$': '<rootDir>/src/$1',
	'^(\\.{1,2}/.*)\\.js$': '$1',
};

export default {
	// Serial, and the REASON here was wrong until it was measured (todo65).
	//
	// It said "tests share fixture vaults, so parallel workers collide on the DB lock". They do not
	// share: `helpers.ts` gives every suite its own mkdtemp'd repo. The real blocker is CPU
	// contention. Each jest worker spawns a CLI that runs its own 4-worker analyze pool, so 4 jest
	// workers is 16 processes on 12 cores, and the helper's 90s per-command timeout fires — the
	// analyze SUCCEEDS and is then SIGKILLed, which reads as a test failure.
	//
	// MEASURED on this machine: serial 248s green; --maxWorkers=2 133s with 1 suite failing;
	// --maxWorkers=4 150s with 3 failing (slower than 2, which is contention). So roughly HALF the
	// wall clock is available here once the per-command timeout and the nested worker pool are
	// reconciled. Left serial until then, because a suite that fails 1 in N is worth less than a
	// slow one.
	maxWorkers: 1,
	// The tree-sitter native addon serves ONE JS-wrapper instance per process. Four suites now load
	// grammars (java/php/swift extraction + type-only-imports); the second one in the same process
	// gets a wrapper whose tree.rootNode is undefined and fails at random. Recycling the worker
	// after every test file gives each suite a fresh process while maxWorkers:1 keeps DuckDB serial.
	// CAUTION: --runInBand bypasses workers entirely (everything in one process) and reintroduces
	// the collision — do not use it; plain `npm test` is already serial via maxWorkers.
	workerIdleMemoryLimit: '1KB',
	projects: [
		{
			displayName: 'unit',
			preset: 'ts-jest/presets/default-esm',
			testEnvironment: 'node',
			moduleNameMapper,
			transform: {
				'^.+\\.tsx?$': [
					'ts-jest',
					{
						useESM: true,
					},
				],
			},
			// Cap analyze's worker pool for the whole run — see tests/helpers/cap-workers.mjs.
			setupFiles: ['<rootDir>/tests/helpers/cap-workers.mjs'],
			testMatch: ['**/tests/**/*.test.ts'],
			testPathIgnorePatterns: [
				'<rootDir>/tests/persistence/',
				// Abandoned agent worktrees keep their own stale copy of the suite, but moduleNameMapper
				// resolves '@/' to the real <rootDir>/src — so they run outdated expectations against
				// current source and fail spuriously.
				'<rootDir>/.claude/worktrees/',
			],
			modulePathIgnorePatterns: ['<rootDir>/build/'],
			collectCoverageFrom: [
				'src/**/*.ts',
				'!src/**/*.d.ts',
				'!src/resources/**',
			],
			setupFilesAfterEnv: [],
		},
		// REMOVED: a 'persistence' project whose testMatch pointed at tests/persistence/**, a directory
		// that does not exist — so it contributed zero tests while appearing in the config as a whole
		// suite. The unit project's testPathIgnorePatterns still excludes that path, so recreating the
		// directory would silently run nothing; delete the ignore too if it ever comes back.
		// todo25#P5.
	],
	verbose: true,
};
