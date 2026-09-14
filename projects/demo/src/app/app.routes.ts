import {type Routes} from '@angular/router';

export const routes: Routes = [
    {
        path: 'record', title: 'Training Observer · Процедура',
        loadComponent: () => import('./pages/procedure/procedure.component').then((module) => module.ProcedureComponent),
    },
    {path: '', pathMatch: 'full', redirectTo: 'controls'},
    {
        path: 'controls', title: 'Training Observer · Контролы',
        loadComponent: () => import('./pages/controls/controls.component').then((module) => module.ControlsComponent),
    },
    {
        path: 'microfrontends', title: 'Training Observer · Микрофронты',
        loadComponent: () => import('./pages/microfrontends/microfrontends.component').then((module) => module.MicrofrontendsComponent),
    },
    {
        path: 'load', title: 'Training Observer · Нагрузка',
        loadComponent: () => import('./pages/load/load.component').then((module) => module.LoadComponent),
    },
    {path: '**', redirectTo: 'controls'},
];
