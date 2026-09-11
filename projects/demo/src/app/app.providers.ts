import {isPlatformBrowser, LocationStrategy, PathLocationStrategy} from '@angular/common';
import {inject, PLATFORM_ID, type Provider} from '@angular/core';
import {
    TUI_DOC_DEFAULT_TABS,
    TUI_DOC_LOGO,
    TUI_DOC_PAGES,
    TUI_DOC_TITLE,
} from '@taiga-ui/addon-doc';
import {HIGHLIGHT_OPTIONS} from 'ngx-highlightjs';

import {DEMO_PAGES} from '../pages/pages';

export const APP_PROVIDERS: Provider[] = [
    {
        provide: TUI_DOC_TITLE,
        useValue: 'Training Observer | ',
    },
    {
        provide: TUI_DOC_LOGO,
        useValue: '',
    },
    {
        provide: TUI_DOC_DEFAULT_TABS,
        useValue: ['Description and examples', 'API'],
    },
    {
        provide: LocationStrategy,
        useClass: PathLocationStrategy,
    },
    {
        provide: TUI_DOC_PAGES,
        useValue: DEMO_PAGES,
    },
    {
        provide: HIGHLIGHT_OPTIONS,
        useFactory: () => {
            const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

            return {
                coreLibraryLoader: async () => import('highlight.js/lib/core'),
                lineNumbersLoader: async () =>
                    // SSR ReferenceError: window is not defined
                    isBrowser
                        ? import('ngx-highlightjs/line-numbers')
                        : Promise.resolve(),
                languages: {
                    typescript: async () =>
                        import('highlight.js/lib/languages/typescript'),
                    less: async () => import('highlight.js/lib/languages/less'),
                    xml: async () => import('highlight.js/lib/languages/xml'),
                },
            };
        },
    },
];
