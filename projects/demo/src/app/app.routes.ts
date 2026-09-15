import {type Routes} from '@angular/router';

export const routes: Routes = [
    {
        path: 'record',
        title: 'Training Observer · Процедура',
        loadComponent: async () =>
            import('./pages/record/record-page.component').then(
                (module) => module.RecordPageComponent,
            ),
    },
    {path: '', pathMatch: 'full', redirectTo: 'record'},
    {
        path: 'controls',
        title: 'Training Observer · Контролы',
        loadComponent: async () =>
            import('./pages/controls/controls-page.component').then(
                (module) => module.ControlsPageComponent,
            ),
    },
    {
        path: 'learn',
        title: 'Training Observer · Тренировка',
        loadComponent: async () =>
            import('./pages/learn/learn.component').then(
                (module) => module.LearnComponent,
            ),
    },
    {path: 'controls-example', redirectTo: 'controls?fixture=selectors'},
    {path: '**', redirectTo: 'record'},
];
