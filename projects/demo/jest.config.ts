/** Angular TestBed требует преобразования ESM-зависимостей Angular, включая .mjs. */
import {createCjsPreset} from 'jest-preset-angular/presets';

export default {
    ...createCjsPreset({tsconfig: '<rootDir>/tsconfig.spec.json'}),
    displayName: 'demo',
    preset: '../../jest.preset.js',
    setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
    coverageDirectory: '../../coverage/projects/demo',
};
