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
	// DuckDB is single-writer; tests share fixture vaults, so parallel
	// workers collide on the DB lock. Force serial execution.
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
