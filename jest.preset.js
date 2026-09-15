const nxPreset = require('@nx/jest/preset').default;
const {pathsToModuleNameMapper} = require('ts-jest');
const {compilerOptions} = require('./tsconfig.json');
const {resolve} = require('node:path');

module.exports = {
    ...nxPreset,
    moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
        prefix: `${__dirname}/`,
    }),
    coverageReporters: ['lcov', 'clover'],
    transform: {
        ...nxPreset.transform,
        '^.+\\.(ts|js|html)$': [
            'ts-jest',
            {
                tsconfig: resolve(__dirname, 'tsconfig.spec.json'),
                stringifyContentPathRegex: String.raw`\.(html|svg)$`,
            },
        ],
    },
};
