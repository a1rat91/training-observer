/** Единые правила значения для записи и проверки. Blur задаётся вызывающим кодом; функция читает только переданный снимок. */
import {type ControlSnapshot, ControlType} from '@training-observer/core/models';

export type RecordedValue = boolean | string | readonly string[];

export function requiresBlur(control: ControlSnapshot): boolean {
    switch (control.kind) {
        case ControlType.ComboBox:
        case ControlType.Number:
        case ControlType.Select:
        case ControlType.Textbox:
            return true;
        default:
            return false;
    }
}

export function recordsInitialState(control: ControlSnapshot): boolean {
    return control.kind === ControlType.Checkbox || control.kind === ControlType.Radio;
}

export function readControlValue(control: ControlSnapshot): RecordedValue | undefined {
    if (control.state.redacted || control.state.indeterminate) {
        return undefined;
    }

    if (control.kind === ControlType.ComboBox && control.choice) {
        return control.choice.displayValue ? [control.choice.displayValue] : [];
    }

    if (control.choice) {
        return control.choice.selection.status === 'observed'
            ? control.choice.selection.labels
            : undefined;
    }

    return control.state.checked ?? control.state.value;
}

/** Точное сравнение сохраняет false, пустую строку, формат числа и порядок вариантов. */
export function valueFingerprint(value: RecordedValue): string {
    return JSON.stringify(value);
}
