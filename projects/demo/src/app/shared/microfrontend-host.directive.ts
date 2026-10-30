import {Directive} from '@angular/core';

/** Demo-обёртка внешнего контейнера. Имя микрофронта задаёт её дочерний компонент. */
@Directive({selector: 'microfrontend'})
export class MicrofrontendHostDirective {}
