import {type Routes} from '@angular/router';
import {DemoPath} from '@demo/constants';

export const appRoutes: Routes = [
    {
        path: DemoPath.Learn,
        loadComponent: async () => import('../pages/learn/learn-page.component'),
        data: {title: 'Прохождение обучения'},
    },
    {
        path: DemoPath.Record,
        loadComponent: async () => import('../pages/record/record-page.component'),
        data: {title: 'Запись процедуры'},
    },
    {
        path: DemoPath.Procedure,
        loadComponent: async () => import('../pages/procedure/procedure-page.component'),
        data: {title: 'Плеер процедур'},
    },
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
