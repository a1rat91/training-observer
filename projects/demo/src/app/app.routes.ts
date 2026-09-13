import {type Routes} from '@angular/router';

export const appRoutes: Routes = [
    {
        path: '',
        pathMatch: 'full',
        loadComponent: async () => import('../pages/home/home-page.component'),
        title: 'Как пользоваться · Training Observer',
    },
    {
        path: 'record',
        loadComponent: async () => import('../pages/record/record-page.component'),
        title: 'Запись · Training Observer',
    },
    {
        path: 'learn',
        loadComponent: async () => import('../pages/learn/learn-page.component'),
        title: 'Тренировка · Training Observer',
    },
    {path: 'spike/record', redirectTo: 'record', pathMatch: 'full'},
    {path: 'spike/learn', redirectTo: 'learn', pathMatch: 'full'},
    {path: '**', redirectTo: ''},
];
