import nx from '@nx/eslint-plugin';
import taiga from '@taiga-ui/eslint-plugin-experience-next';

// Nx проверяет направления зависимостей между проектами по их layer-тегам.
const pureLayerConstraints = ['contracts', 'recording', 'runtime'].map((layer) => ({
    sourceTag: `layer:${layer}`,
    onlyDependOnLibsWithTags:
        layer === 'contracts' ? ['layer:core'] : ['layer:core', 'layer:contracts'],
    bannedExternalImports: ['@angular/*', '@taiga-ui/*', 'rxjs', 'rxjs/*'],
}));

export default [
    ...taiga.configs.recommended,
    {
        // Эти API подключены в demo/polyfills.ts; интеграция библиотеки обязана предоставить их.
        settings: {
            polyfills: [
                'structuredClone',
                'Object.hasOwn',
                'String.prototype.replaceAll',
                'String.replaceAll',
            ],
        },
    },
    {
        files: ['libs/**/*.ts'],
        // JSON-контракты принимают строковые литералы и enum с теми же значениями.
        rules: {'@typescript-eslint/no-unsafe-enum-comparison': 'off'},
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
                        ...pureLayerConstraints,
                        {
                            sourceTag: 'layer:app',
                            onlyDependOnLibsWithTags: [
                                'layer:core',
                                'layer:contracts',
                                'layer:recording',
                                'layer:runtime',
                            ],
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['libs/training-{contracts,recording,runtime}/**/*.ts'],
        rules: {
            // Core и core/models — один Nx-проект: уточняем допустимую точку входа обычным правилом ESLint.
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            regex: '^@training-observer/core(?:$|/(?!models$))',
                            message:
                                'Используйте чистые модели @training-observer/core/models.',
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
