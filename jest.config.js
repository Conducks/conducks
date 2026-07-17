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
