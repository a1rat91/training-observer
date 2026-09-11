import {type Routes} from '@angular/router';
import {DemoPath} from '@demo/constants';

export const appRoutes: Routes = [
    {
        path: DemoPath.Research,
        loadComponent: async () => import('../pages/research/research-page.component'),
        data: {title: 'Исследование locators'},
    },
    // Examples
    {
        path: DemoPath.ControlsExample,
        loadComponent: async () =>
            import('../pages/examples/controls-example/controls-example.component'),
        data: {title: 'Controls example'},
    },
    {
        path: '**',
        redirectTo: DemoPath.Research,
    },
];
