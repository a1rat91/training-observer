import {type Routes} from '@angular/router';

import {HomeComponent} from './home/home.component';

export const routes: Routes = [
    {path: 'microfrontends', loadComponent: () => import('./microfrontends/microfrontends.component').then((module) => module.MicrofrontendsComponent)},
    {path: '', component: HomeComponent},
    {path: '**', redirectTo: ''},
];
