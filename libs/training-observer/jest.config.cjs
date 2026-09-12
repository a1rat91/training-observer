module.exports = {
    rootDir: '../..',
    roots: ['<rootDir>/libs/training-observer'],
    testMatch: ['<rootDir>/libs/training-observer/tests/**/*.spec.ts'],
    testEnvironment: 'jsdom',
    testEnvironmentOptions: {url: 'http://localhost/workflow'},
    transform: {
        '^.+\\.[tj]s$': ['ts-jest', {tsconfig: '<rootDir>/libs/training-observer/tsconfig.json', diagnostics: true}],
    },
    transformIgnorePatterns: ['/node_modules/(?!@medv/finder/)'],
};
