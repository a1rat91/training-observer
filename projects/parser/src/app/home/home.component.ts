import {ChangeDetectionStrategy, Component, DestroyRef, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiButton, TuiCheckbox, TuiInput} from '@taiga-ui/core';
import {TuiComboBox, TuiDataListWrapper, TuiSelect} from '@taiga-ui/kit';

import {ObserverPanelComponent} from '../observer-panel/observer-panel.component';

@Component({
    selector: 'app-home',
    imports: [ObserverPanelComponent, FormsModule, TuiButton, TuiCheckbox, TuiInput, TuiSelect, TuiComboBox, TuiDataListWrapper],
    templateUrl: './home.component.html',
    styleUrl: './home.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
    protected fullName = 'Алексей';
    protected notifications = true;
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
