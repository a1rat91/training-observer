import nx from '@nx/eslint-plugin';
import taiga from '@taiga-ui/eslint-plugin-experience-next';

// Nx проверяет направления зависимостей между проектами по их layer-тегам.
const featureLayerConstraints = ['contracts', 'recording', 'runtime'].map((layer) => ({
    sourceTag: `layer:${layer}`,
    onlyDependOnLibsWithTags:
        layer === 'contracts' ? ['layer:core'] : ['layer:core', 'layer:contracts'],
    bannedExternalImports:
        layer === 'contracts'
            ? ['@angular/*', '@taiga-ui/*', 'rxjs', 'rxjs/*']
            : ['@taiga-ui/*'],
}));

export default [
    ...taiga.configs.recommended,
    {
        files: ['libs/**/*.ts'],
        // JSON-контракты принимают строковые литералы и enum с теми же значениями.
        rules: {'@typescript-eslint/no-unsafe-enum-comparison': 'off'},
    },
    {
        files: ['libs/training-observer/**/*.ts', 'tests/number-controls.spec.ts'],
        // Глобальные RegExp с replace сохраняют поддержку браузеров без внешнего replaceAll-полифилла.
        rules: {'unicorn/prefer-string-replace-all': 'off'},
    },

    {
        files: ['libs/**/*.ts', 'projects/**/*.ts'],

        plugins: {'@nx': nx},
        rules: {
            '@nx/enforce-module-boundaries': [
                'error',
                {
                    enforceBuildableLibDependency: true,
                    depConstraints: [
                        {
                            sourceTag: 'layer:core',
                            onlyDependOnLibsWithTags: ['layer:core'],
                        },
                        ...featureLayerConstraints,
                        {
                            sourceTag: 'layer:taiga-ui',
                            onlyDependOnLibsWithTags: ['layer:core'],
                            bannedExternalImports: ['@taiga-ui/*'],
                        },
                        {
                            sourceTag: 'layer:procedure-player',
                            onlyDependOnLibsWithTags: ['layer:core'],
                            bannedExternalImports: ['@taiga-ui/*'],
                        },
                        {
                            sourceTag: 'layer:app',
                            onlyDependOnLibsWithTags: [
                                'layer:core',
                                'layer:contracts',
                                'layer:recording',
                                'layer:runtime',
                                'layer:taiga-ui',
                                'layer:procedure-player',
                            ],
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['libs/training-contracts/**/*.ts'],
        rules: {
            // Чистые пакеты используют только модели, не Angular API core.
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            regex: '^@training-observer/core(?:$|/(?!models$))',
                            message:
                                'Используйте чистую точку входа @training-observer/core/models.',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['libs/training-observer/adapters/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            regex: '^(?!@training-observer/core/models$)[^.]',
                            message:
                                'Чистый SDK использует только core/models и локальные файлы.',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: [
            'libs/training-taiga-ui/src/lib/taiga-ui-adapter.ts',
            'libs/training-procedure-player/src/lib/procedure-player-adapter.ts',
            'libs/training-procedure-player/src/lib/procedure-player-screen-adapter.ts',
            'libs/training-procedure-player/src/lib/procedure-player-block-tracker.ts',
        ],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            regex: '^(?!@training-observer/core/(?:models|adapters)$)[^.]',
                            message:
                                'Адаптер использует только чистые core/models, core/adapters и локальные файлы.',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['libs/training-observer/models/**/*.ts'],
        rules: {
            // Модели не должны загружать Angular-фасад или внешние библиотеки.
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            regex: '^[^.]',
                            message: 'Модели содержат только локальные типы и enum.',
                        },
                    ],
                },
            ],
        },
    },

    {
        files: ['**/legacy/**/*.ts'],
        rules: {'@angular-eslint/prefer-standalone': 'off'},
    },
    {
        files: ['projects/demo/server.ts'],
        rules: {'@typescript-eslint/strict-void-return': 'off'},
    },
    {
        files: ['**/*.ts'],
        rules: {
            'import/no-cycle': 'off',
            '@typescript-eslint/no-unnecessary-condition': 'off',
            '@typescript-eslint/no-unused-private-class-members': 'off',
            'unicorn/no-array-method-this-argument': 'off',
            'no-restricted-syntax': 'off',
            '@typescript-eslint/max-params': ['error', {countVoidThis: true, max: 5}],
            '@angular-eslint/prefer-signals': 'off',
        },
    },
    {
        ignores: [
            '**/*.html',
            '**/*.js',
            '**/*.mjs',
            '.nessy/**',
            '.nx/**',
            'dist/**',
            'coverage/**',
            'test-results/**',
            'playwright-report/**',
        ],
    },
];
