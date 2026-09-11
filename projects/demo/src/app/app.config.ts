import {HttpClient, provideHttpClient, withFetch} from '@angular/common/http';
import {
    type ApplicationConfig,
    importProvidersFrom,
    SecurityContext,
} from '@angular/core';
import {
    BrowserAnimationsModule,
    provideAnimations,
} from '@angular/platform-browser/animations';
import {
    provideRouter,
    withEnabledBlockingInitialNavigation,
    withInMemoryScrolling,
} from '@angular/router';
import {provideEventPlugins} from '@taiga-ui/event-plugins';
import {MarkdownModule} from 'ngx-markdown';

import {APP_PROVIDERS} from './app.providers';
import {appRoutes} from './app.routes';

export const appConfig: ApplicationConfig = {
    providers: [
        provideAnimations(),
        provideRouter(
            appRoutes,
            withEnabledBlockingInitialNavigation(),
            withInMemoryScrolling({scrollPositionRestoration: 'enabled'}),
        ),
        provideHttpClient(withFetch()),
        importProvidersFrom(
            BrowserAnimationsModule,
            MarkdownModule.forRoot({
                loader: HttpClient,
                sanitize: SecurityContext.NONE,
            }),
        ),
        ...APP_PROVIDERS,
        provideEventPlugins(),
        provideEventPlugins(),
        provideAnimations(),
        provideEventPlugins(),
    ],
};
