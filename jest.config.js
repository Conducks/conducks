/**
 * @format
 * @type {import('ts-jest').JestConfigWithTsJest}
 */

export default {
	preset: 'ts-jest/presets/default-esm',
	testEnvironment: 'node',
	moduleNameMapper: {
		'^@/(.*)\\.js$': '<rootDir>/src/$1',
		'^(\\.{1,2}/.*)\\.js$': '$1',
	},
	transform: {
		'^.+\\.tsx?$': [
			'ts-jest',
			{
				useESM: true,
			},
		],
	},
	testMatch: ['**/tests/**/*.test.ts'],
	testPathIgnorePatterns: ['<rootDir>/tests/legacy/archived-tests/'],
	modulePathIgnorePatterns: ['<rootDir>/build/'],
	collectCoverageFrom: [
		'src/**/*.ts',
		'!src/**/*.d.ts',
		'!src/resources/**',
	],
	setupFilesAfterEnv: [],
	verbose: true,
};
