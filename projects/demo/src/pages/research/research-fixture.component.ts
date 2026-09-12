import {ChangeDetectionStrategy, Component} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {type TuiDay} from '@taiga-ui/cdk';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {
    TuiCheckbox,
    TuiDataListWrapper,
    TuiInputDate,
    TuiInputNumber,
    TuiSelect,
    TuiSwitch,
    TuiTextarea,
} from '@taiga-ui/kit';

/** Ordinary Taiga form, intentionally independent of the research panel. */
@Component({
    standalone: true,
    selector: 'research-fixture',
    imports: [
        FormsModule,
        TuiButton,
        TuiCheckbox,
        TuiDataListWrapper,
        TuiInputDate,
        TuiInputNumber,
        TuiSelect,
        TuiSwitch,
        TuiTextarea,
        TuiTextfield,
    ],
    templateUrl: './research-fixture.component.html',
    styleUrl: './research-fixture.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResearchFixtureComponent {
    public employee = '';
    public email = '';
    public course: string | null = null;
    public budget = 20000;
    public consent = false;
    public mentor = true;
    public comment = '';
    public date: TuiDay | null = null;
    public readonly courses = ['Angular', 'TypeScript'];
}
