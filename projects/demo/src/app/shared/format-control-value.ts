import {type ControlSnapshot} from '@training-observer/core/models';

export function formatControlValue(control: ControlSnapshot): string {
    if (control.state.redacted) {
        return 'Значение скрыто';
    }

    if (control.kind === 'button') {
        return '—';
    }

    if (control.kind === 'combobox' && control.choice) {
        return control.choice.displayValue || 'Пусто';
    }

    if (control.choice) {
        return control.choice.selection.status === 'observed'
            ? control.choice.selection.labels.join(', ') || 'Не выбран'
            : `Выбор не подтверждён${control.choice.displayValue ? `: ${control.choice.displayValue}` : ''}`;
    }

    if (control.state.indeterminate) {
        return 'Смешанное состояние';
    }

    if (typeof control.state.checked === 'boolean') {
        return control.state.checked ? 'Включён' : 'Выключен';
    }

    return control.state.value === undefined
        ? 'Недоступно'
        : String(control.state.value) || 'Пусто';
}
