import {ChangeDetectionStrategy, Component, DestroyRef, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiButton, TuiCheckbox, TuiDropdownA11y, TuiDropdownManual, TuiInput, TuiRadio} from '@taiga-ui/core';
import {TuiComboBox, TuiDataListWrapper, TuiSelect, TuiSwitch} from '@taiga-ui/kit';

import {ObserverPanelComponent} from '../../shared/observer-panel/observer-panel.component';

@Component({
    selector: 'app-controls',
    imports: [ObserverPanelComponent, FormsModule, TuiButton, TuiCheckbox, TuiInput, TuiRadio, TuiSwitch, TuiSelect, TuiComboBox, TuiDataListWrapper, TuiDropdownA11y, TuiDropdownManual],
    templateUrl: './controls.component.html',
    styleUrl: './controls.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlsComponent {
    protected fullName = 'Алексей';
    protected notifications = true;
    protected delivery = 'email';
    protected autoSave = false;
    protected department: string | null = 'Разработка';
    protected employee: string | null = null;
    protected readonly departments = ['Разработка', 'Поддержка', 'Продажи'];
    protected readonly departmentDisabled = (department: string): boolean => department === 'Продажи';
    protected readonly employees = ['Анна Смирнова', 'Алексей Иванов', 'Мария Петрова'];
    protected readonly searchResults = signal(this.employees);
    protected readonly searching = signal(false);
    private searchTimer: ReturnType<typeof setTimeout> | undefined;
    protected readonly additionalField = signal(false);
    protected readonly showInspector = signal(true);
    protected readonly hintOpen = signal(false);
    protected readonly dialogOpen = signal(false);

    constructor() {
        inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
    }

    protected search(value: string): void {
        clearTimeout(this.searchTimer);
        this.searching.set(true);
        this.searchResults.set([]);
        // Demo of a delayed response. The observer has no access to these signals or this timer.
        this.searchTimer = setTimeout(() => {
            this.searchResults.set(this.employees.filter((item) => item.toLowerCase().includes(value.toLowerCase())));
            this.searching.set(false);
        }, 400);
    }
}
