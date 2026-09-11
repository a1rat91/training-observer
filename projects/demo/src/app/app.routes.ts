import {type Routes} from '@angular/router';
import {DemoPath} from '@demo/constants';

export const appRoutes: Routes = [
    // Examples
    {
        path: DemoPath.SimpleExample,
        loadComponent: async () =>
            import('../pages/examples/simple-example/simple-example.component'),
        data: {title: 'Simple example'},
    },
    {
        path: '**',
        redirectTo: DemoPath.SimpleExample,
    },
];
