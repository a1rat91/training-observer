const {createCjsPreset} = require('jest-preset-angular/presets');
module.exports = {
    ...createCjsPreset({tsconfig: '<rootDir>/libs/element-spike/tsconfig.angular-tests.json'}),
    rootDir: '../..',
    roots: ['<rootDir>/libs/element-spike'],
    testMatch: ['<rootDir>/libs/element-spike/angular-tests/**/*.spec.ts'],
    setupFilesAfterEnv: ['<rootDir>/libs/element-spike/angular-tests/setup.ts'],
};
