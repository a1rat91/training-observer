/** Словарь DOM-наблюдения. Строковые значения — часть JSON-контракта, их нельзя переименовывать вместе с членами enum. */
export enum ControlType {
    Textbox = 'textbox',
    Number = 'number',
    Button = 'button',
    Checkbox = 'checkbox',
    Radio = 'radio',
    Switch = 'switch',
    Select = 'select',
    ComboBox = 'combobox',
}

export enum ScreenStatus {
    Ready = 'ready',
    Loading = 'loading',
    Unavailable = 'unavailable',
    Ambiguous = 'ambiguous',
}

export enum ScreenIdentityKind {
    Attribute = 'attribute',
    Text = 'text',
}
