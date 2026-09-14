/** Адаптеры native/ARIA и Taiga DOM. Выбирают логическую цель и host, не читают внутреннюю Angular-модель компонентов. */
import { type ControlKind, type ControlSnapshot } from '@training-observer/core/models';
import { type DomElementSnapshot, type DomNodeId } from '@training-observer/core/models';
import { normalizeText, type SnapshotReader } from './snapshot-reader';

interface ControlMatch {
    readonly kind: ControlKind;
    readonly source: ControlSnapshot['source'];
    readonly host: DomElementSnapshot;
}

export interface ControlCandidate extends ControlMatch {
    readonly target: DomElementSnapshot;
    readonly ancestors: readonly DomElementSnapshot[];
}

const TAIGA_FIELD_KINDS: readonly ControlKind[] = ['textbox', 'number', 'select', 'combobox'];

/** Правила Taiga имеют приоритет перед native fallback, включая намеренные исключения. */
export function findControlCandidates(reader: SnapshotReader): readonly ControlCandidate[] {
    const candidates: ControlCandidate[] = [];

    for (const target of reader.elements) {
        const ancestors = reader.ancestors(target);
        const field = ancestors.find((parent) => parent.tagName === 'tui-textfield');
        // Содержимое option описывает выбор, а не отдельные контролы.
        if (ancestors.some((parent) => parent.attributes['role'] === 'option')) continue;
        if (field && isTaigaFiller(target)) continue;

        let native = nativeKind(target);
        // Редактор выбора не должен ошибочно распознаваться как обычный textbox.
        if (native === 'textbox' && 'tuiselectlike' in target.attributes) native = null;
        const match =
            matchTaigaControl(target, field, native) ??
            (native ? { kind: native, source: 'native' as const, host: target } : null);
        if (!match) continue;
        // Для полей с несколькими значениями требуется отдельный адаптер.
        if (field && 'multi' in field.attributes && (match.kind === 'textbox' || match.kind === 'number'))
            continue;

        candidates.push({ ...match, target, ancestors });
    }

    const fieldHosts = new Set(candidates.filter(isTaigaField).map((candidate) => candidate.host.id));

    // Объединяем только известные кнопки очистки поддержанных полей; независимые кнопки остаются контролами.
    return candidates.filter(
        ({ target, ancestors }) =>
            !('tuibuttonx' in target.attributes && ancestors.some((parent) => fieldHosts.has(parent.id))),
    );
}

export function taigaFloatingLabel(
    reader: SnapshotReader,
    control: ControlCandidate,
    members: ReadonlySet<DomNodeId>,
): string {
    if (!isTaigaField(control)) return '';
    const labels = reader.labels.filter((label) => members.has(label.id) && 'tuilabel' in label.attributes);

    // Не выбираем наугад между несколькими несвязанными плавающими подписями.
    return labels.length === 1 ? normalizeText(reader.text(labels[0].id)) : '';
}

export function hasTaigaInputPopup(control: ControlCandidate): boolean {
    return (
        control.source === 'taiga-ui' &&
        (control.kind === 'textbox' || control.kind === 'number') &&
        control.target.attributes['role'] === 'combobox'
    );
}

function isTaigaField(control: ControlMatch): boolean {
    return control.source === 'taiga-ui' && TAIGA_FIELD_KINDS.includes(control.kind);
}

function isTaigaFiller(node: DomElementSnapshot): boolean {
    return (
        node.tagName === 'input' &&
        node.state.disabled &&
        node.attributes['aria-hidden'] === 'true' &&
        (node.attributes['class'] ?? '').split(/\s+/).includes('t-filler')
    );
}

function nativeKind(node: DomElementSnapshot): ControlKind | null {
    const type = (node.attributes['type'] ?? 'text').toLowerCase();
    const role = node.attributes['role'];

    if (node.tagName === 'select') return 'select';
    if (
        node.tagName === 'button' ||
        (node.tagName === 'input' && ['button', 'submit', 'reset'].includes(type))
    ) {
        return !role || role === 'button' ? 'button' : null;
    }

    if (node.tagName === 'input' && type === 'checkbox') {
        if (role === 'switch' || (!role && 'switch' in node.attributes)) return 'switch';
        return !role || role === 'checkbox' ? 'checkbox' : null;
    }
    if (node.tagName === 'input' && type === 'radio') {
        return !role || role === 'radio' ? 'radio' : null;
    }
    if (node.tagName === 'input' && type === 'number') {
        return !role || role === 'spinbutton' ? 'number' : null;
    }

    const textInput =
        node.tagName === 'input' && ['text', 'search', 'email', 'tel', 'url', 'password'].includes(type);
    if ((node.tagName === 'textarea' || textInput) && (!role || role === 'textbox' || role === 'searchbox')) {
        return 'textbox';
    }

    return null;
}

/** DOM-признаки проверены на Taiga UI 5.15. Экземпляры Angular и private-поля не читаются. */
function matchTaigaControl(
    node: DomElementSnapshot,
    field: DomElementSnapshot | undefined,
    native: ControlKind | null,
): ControlMatch | null {
    const attributes = node.attributes;

    if ((node.tagName === 'input' || node.tagName === 'select') && 'tuiselect' in attributes) {
        return { kind: 'select', source: 'taiga-ui', host: field ?? node };
    }
    if (node.tagName === 'input' && 'tuicombobox' in attributes) {
        return { kind: 'combobox', source: 'taiga-ui', host: field ?? node };
    }

    // Один inputmode не отличает число от телефона или идентификатора счёта.
    if (
        node.tagName === 'input' &&
        'tuiinputnumber' in attributes &&
        ['text', 'number'].includes((attributes['type'] ?? 'text').toLowerCase()) &&
        (!attributes['role'] || ['textbox', 'spinbutton', 'combobox'].includes(attributes['role']))
    ) {
        return { kind: 'number', source: 'taiga-ui', host: field ?? node };
    }

    // Произвольный dropdown не означает семантику выбора.
    if (
        node.tagName === 'input' &&
        'tuiinput' in attributes &&
        attributes['role'] === 'combobox' &&
        !('tuiselectlike' in attributes)
    ) {
        return { kind: 'textbox', source: 'taiga-ui', host: field ?? node };
    }
    if (native === 'textbox' && (field || 'tuiinput' in attributes || 'tuitextfield' in attributes)) {
        return { kind: native, source: 'taiga-ui', host: field ?? node };
    }

    if (
        (native === 'button' && ('tuibutton' in attributes || 'tuiiconbutton' in attributes)) ||
        (native === 'checkbox' && 'tuicheckbox' in attributes) ||
        (native === 'radio' && 'tuiradio' in attributes) ||
        (native === 'switch' && 'tuiswitch' in attributes)
    ) {
        return { kind: native, source: 'taiga-ui', host: node };
    }

    return null;
}
