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
	// PARALLEL, once the thing actually killing test processes was found (todo65).
	//
	// The reason recorded here for years was wrong: "tests share fixture vaults, so parallel workers
	// collide on the DB lock". They do not share — `helpers.ts` gives every suite its own mkdtemp'd
	// repo, so two suites contend no more than two git repositories contend on each other's
	// `index.lock`.
	//
	// What actually happened: `conducks clean` matched processes by ENTRY POINT
	// (`build/src/interfaces/cli/index.js`), which every conducks process on the machine shares, and
	// SIGTERM'd all of them. Three suites run `clean`, so with two workers one suite's clean killed
	// whatever the other had in flight. Serially that is invisible — nothing else is running.
	//
	// It cost an afternoon of wrong suspects (the per-command timeout, worker recycling, the DB lock)
	// because a killed child reports EMPTY output. Instrumenting `runCli` to report `signal=SIGTERM`
	// named it in one run: SIGTERM is neither the spawnSync timeout nor the OOM killer, both of which
	// send SIGKILL.
	//
	// MEASURED after scoping `clean` to its own project: 3 consecutive full runs, 129s / 130s / 129s,
	// 1,838 passing, ZERO SIGTERMs, against 248s serial.
	maxWorkers: 2,
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
