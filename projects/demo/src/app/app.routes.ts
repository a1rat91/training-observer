import {type Routes} from '@angular/router';

export const routes: Routes = [
    {
        path: 'record',
        title: 'Training Observer · Процедура',
        data: {title: 'Процедура'},
        loadComponent: async () =>
            import('./pages/record/record-page.component').then(
                (module) => module.RecordPageComponent,
            ),
    },
    {path: '', pathMatch: 'full', redirectTo: 'record'},
    {
        path: 'controls',
        title: 'Training Observer · Контролы',
        data: {title: 'Контролы'},
        loadComponent: async () =>
            import('./pages/controls/controls-page.component').then(
                (module) => module.ControlsPageComponent,
            ),
    },
    {
        path: 'microfrontends',
        title: 'Training Observer · Микрофронты',
        data: {title: 'Микрофронты'},
        loadComponent: async () =>
            import('./fixtures/async-microfrontends/async-microfrontends.component').then(
                (module) => module.AsyncMicrofrontendsComponent,
            ),
    },
    {
        path: 'learn',
        title: 'Training Observer · Тренировка',
        data: {title: 'Тренировка'},
        loadComponent: async () =>
            import('./pages/learn/learn.component').then(
                (module) => module.LearnComponent,
            ),
    },
    {
        path: 'input-inspector',
        title: 'Training Observer · Разбор input',
        data: {title: 'Разбор input'},
        loadComponent: async () =>
            import('./pages/input-inspector/input-inspector.component').then(
                (module) => module.InputInspectorComponent,
            ),
    },
    {path: 'controls-example', redirectTo: 'controls?fixture=selectors'},
    {
        path: 'procedure-player-controls',
        loadComponent: async () =>
            import('./fixtures/procedure-player-controls/procedure-player-controls.component').then(
                (module) => module.ProcedurePlayerControlsComponent,
            ),
    },
    {
        path: 'taiga-values',
        loadComponent: async () =>
            import('./fixtures/taiga-values/taiga-values.component').then(
                (module) => module.TaigaValuesComponent,
            ),
    },
    {path: '**', redirectTo: 'record'},
];
