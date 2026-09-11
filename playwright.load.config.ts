import {defineConfig} from '@playwright/test';

export default defineConfig({
    testDir: './benchmarks',
    workers: 1,
    timeout: 120_000,
    reporter: [
        ['list'],
        ['html', {outputFolder: 'playwright-report/load', open: 'never'}],
    ],
    outputDir: 'test-results/load',
    use: {
        baseURL: 'http://127.0.0.1:4302',
        channel: 'chrome',
        headless: true,
        viewport: {width: 1440, height: 1100},
        trace: 'off',
    },
    // Never silently benchmark a development server left by another command.
    webServer: {
        command:
            'npx nx serve demo --configuration=production --hmr=false --live-reload=false --port=4302',
        url: 'http://127.0.0.1:4302',
        reuseExistingServer: false,
        timeout: 120_000,
        env: {NX_DAEMON: 'false', NX_ISOLATE_PLUGINS: 'false'},
    },
});
