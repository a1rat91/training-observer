import {type Routes} from '@angular/router';
import {DemoPath} from '@demo/constants';

export const appRoutes: Routes = [
    // Examples
    {
        path: DemoPath.ControlsExample,
        loadComponent: async () =>
            import('../pages/examples/controls-example/controls-example.component'),
        data: {title: 'Controls example'},
    },
    {
        path: '**',
        redirectTo: DemoPath.ControlsExample,
    },
];
