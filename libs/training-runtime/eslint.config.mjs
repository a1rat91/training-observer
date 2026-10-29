import {defineConfig} from 'eslint/config';

import baseConfig from '../../eslint.config.ts';

export default defineConfig([
    ...baseConfig,

    {
        name: 'training-runtime-typescript',

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
        name: 'training-runtime-html',
        files: ['**/*.html'],
        rules: {},
    },
]);
