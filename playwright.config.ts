import {defineConfig} from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    testIgnore: '**/unit/**',
    fullyParallel: false,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:4301',
        channel: 'chrome',
        headless: true,
        viewport: {width: 1440, height: 1100},
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'npx nx serve demo --port=4301',
        url: 'http://127.0.0.1:4301',
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
        env: {NX_DAEMON: 'false', NX_ISOLATE_PLUGINS: 'false'},
    },
});
