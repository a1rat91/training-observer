import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {
    TuiButton,
    TuiDropdown,
    TuiDropdownManual,
    TuiNumberFormat,
    TuiTextfield,
} from '@taiga-ui/core';
import {
    TuiCheckbox,
    TuiComboBox,
    TuiDataListWrapper,
    TuiInputNumber,
    TuiRadio,
    TuiSelect,
    TuiSwitch,
} from '@taiga-ui/kit';

import {ObserverPanelComponent} from '../../shared/observer-panel/observer-panel.component';

@Component({
    selector: 'app-controls',
    imports: [
        FormsModule,
        ObserverPanelComponent,
        TuiButton,
        TuiCheckbox,
        TuiComboBox,
        TuiDataListWrapper,
        TuiDropdown,
        TuiDropdownManual,
        TuiInputNumber,
        TuiNumberFormat,
        TuiRadio,
        TuiSelect,
        TuiSwitch,
        TuiTextfield,
    ],
    templateUrl: './controls.component.html',
    styleUrl: './controls.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlsComponent {
    private searchTimer: ReturnType<typeof setTimeout> | undefined;

    protected fullName = 'Алексей';
    protected notifications = true;
    protected delivery = 'email';
    protected autoSave = false;
    protected amount: number | null = 1250.5;
    protected internationalAmount: number | null = -1234.5;
    // Taiga UI 4 InputNumber принимает number; точность больших целых проверяется на native input.
    protected readonly largeNumber = '900719925474099312345';
    protected department: string | null = 'Разработка';
    protected employee: string | null = null;
    protected readonly departments = ['Разработка', 'Поддержка', 'Продажи'];
    protected readonly employees = ['Анна Смирнова', 'Алексей Иванов', 'Мария Петрова'];
    protected readonly searchResults = signal(this.employees);
    protected readonly searching = signal(false);
    protected readonly additionalField = signal(false);
    protected readonly showInspector = signal(true);
    protected readonly hintOpen = signal(false);
    protected readonly dialogOpen = signal(false);

    constructor() {
        inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
    }

    protected readonly departmentDisabled = (department: string): boolean =>
        department === 'Продажи';

    protected search(value: string): void {
        clearTimeout(this.searchTimer);
        this.searching.set(true);
        this.searchResults.set([]);
        // Пример отложенного ответа. Наблюдатель не имеет доступа к этим signals или таймеру.
        this.searchTimer = setTimeout(() => {
            this.searchResults.set(
                this.employees.filter((item) =>
                    item.toLowerCase().includes(value.toLowerCase()),
                ),
            );
            this.searching.set(false);
        }, 400);
    }
}
