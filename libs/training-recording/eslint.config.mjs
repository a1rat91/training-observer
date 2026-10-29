import {defineConfig} from 'eslint/config';

import baseConfig from '../../eslint.config.ts';

export default defineConfig([
    ...baseConfig,

    {
        name: 'training-recording-typescript',

        files: ['**/*.ts'],

        languageOptions: {
            parserOptions: {
                project: ['tsconfig.*?.json'],
                tsconfigRootDir: import.meta.dirname,
            },
        },

        rules: {
            '@typescript-eslint/no-unsafe-enum-comparison': 'off',
            '@angular-eslint/directive-selector': [
                'error',
                {
                    type: 'attribute',
                    prefix: 'observer',
                    style: 'camelCase',
                },
            ],
            '@angular-eslint/component-selector': [
                'error',
                {
                    type: 'element',
                    prefix: 'observer',
                    style: 'kebab-case',
                },
            ],
        },
    },

    {
        name: 'training-recording-html',
        files: ['**/*.html'],
        rules: {},
    },
]);
