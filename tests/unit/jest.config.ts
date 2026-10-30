import {createCjsPreset} from 'jest-preset-angular/presets';

export default {
    ...createCjsPreset({tsconfig: '<rootDir>/../../tsconfig.spec.json'}),
    displayName: 'training-tests',
    preset: '../../jest.preset.js',
    setupFilesAfterEnv: ['<rootDir>/setup.ts'],
    testMatch: ['<rootDir>/**/*.test.js'],
    coverageDirectory: '../../coverage/tests/unit',
};
