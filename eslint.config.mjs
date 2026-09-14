import nx from '@nx/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

// Nx проверяет направления зависимостей между проектами по их layer-тегам.
const pureLayerConstraints = ['contracts', 'recording', 'runtime'].map((layer) => ({
    sourceTag: `layer:${layer}`,
    onlyDependOnLibsWithTags: layer === 'contracts' ? ['layer:core'] : ['layer:core', 'layer:contracts'],
    bannedExternalImports: ['@angular/*', '@taiga-ui/*', 'rxjs', 'rxjs/*'],
}));

export default [
    { ignores: ['**/node_modules/**', '**/dist/**', '**/.nx/**', '**/test-results/**'] },
    {
        files: ['libs/**/*.ts', 'projects/**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { '@nx': nx },
        rules: {
            '@nx/enforce-module-boundaries': [
                'error',
                {
                    enforceBuildableLibDependency: true,
                    depConstraints: [
                        { sourceTag: 'layer:core', onlyDependOnLibsWithTags: ['layer:core'] },
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
                            message: 'Используйте чистые модели @training-observer/core/models.',
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
                { patterns: [{ regex: '^[^.]', message: 'Модели содержат только локальные типы и enum.' }] },
            ],
        },
    },
];
