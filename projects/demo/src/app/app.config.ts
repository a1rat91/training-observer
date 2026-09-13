import {provideHttpClient, withFetch} from '@angular/common/http';
import {type ApplicationConfig} from '@angular/core';
import {provideAnimations} from '@angular/platform-browser/animations';
import {
    provideRouter,
    withEnabledBlockingInitialNavigation,
    withInMemoryScrolling,
} from '@angular/router';
import {provideEventPlugins} from '@taiga-ui/event-plugins';

import {appRoutes} from './app.routes';

export const appConfig: ApplicationConfig = {
    providers: [
        provideAnimations(),
        provideHttpClient(withFetch()),
        provideEventPlugins(),
        provideRouter(
            appRoutes,
            withEnabledBlockingInitialNavigation(),
            withInMemoryScrolling({scrollPositionRestoration: 'enabled'}),
        ),
    ],
};
