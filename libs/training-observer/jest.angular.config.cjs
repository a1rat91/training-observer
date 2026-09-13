const {createCjsPreset} = require('jest-preset-angular/presets');

module.exports = {
    ...createCjsPreset({tsconfig: '<rootDir>/libs/training-observer/tsconfig.angular-tests.json'}),
    rootDir: '../..',
    moduleNameMapper: {'^@training-observer/core$': '<rootDir>/libs/training-observer/src/index.ts'},
    transformIgnorePatterns: [String.raw`node_modules/(?!(.*\.mjs$|@angular/common/locales/.*\.js$|@medv/finder/))`],
    roots: ['<rootDir>/libs/training-observer'],
    testMatch: ['<rootDir>/libs/training-observer/angular-tests/**/*.spec.ts'],
    setupFilesAfterEnv: ['<rootDir>/libs/training-observer/angular-tests/setup.ts'],
};
