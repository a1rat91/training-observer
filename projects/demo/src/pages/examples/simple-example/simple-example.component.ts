import {ChangeDetectionStrategy, Component} from '@angular/core';
import {TuiAddonDoc, type TuiRawLoaderContent} from '@taiga-ui/addon-doc';

@Component({
    standalone: true,
    selector: 'simple-example',
    imports: [TuiAddonDoc],
    templateUrl: './simple-example.component.html',
    styleUrl: './simple-example.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [],
})
export default class SimpleExampleComponent {
    public readonly gettingStartedExample: Record<string, TuiRawLoaderContent> = {
        TypeScript: import('./examples/component.ts?raw'),
        Styles: import('./examples/styles.less?raw'),
        Template: import('./examples/template.html?raw'),
    };
}
