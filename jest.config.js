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
			testMatch: ['**/tests/**/*.test.ts'],
			testPathIgnorePatterns: [
				'<rootDir>/tests/legacy/archived-tests/',
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
		{
			displayName: 'persistence',
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
			testMatch: ['**/tests/persistence/**/*.test.ts'],
			modulePathIgnorePatterns: ['<rootDir>/build/'],
			extensionsToTreatAsEsm: [],
		},
	],
	verbose: true,
};
