module.exports = {
    rootDir: '../..',
    roots: ['<rootDir>/libs/element-spike'],
    testMatch: ['<rootDir>/libs/element-spike/tests/**/*.spec.ts'],
    testEnvironment: 'jsdom',
    testEnvironmentOptions: {url: 'http://localhost/workflow'},
    transform: {
        '^.+\\.[tj]s$': ['ts-jest', {tsconfig: '<rootDir>/libs/element-spike/tsconfig.json', diagnostics: true}],
    },
    transformIgnorePatterns: ['/node_modules/(?!@medv/finder/)'],
};
