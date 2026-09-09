import {Injectable} from '@angular/core';

import {type ControlKind, type ControlSnapshot} from '../models/control-snapshot';
import {type DomElementSnapshot} from '../models/dom-snapshot';

export interface ControlMatch {
    readonly kind: ControlKind;
    readonly source: ControlSnapshot['source'];
    readonly host: DomElementSnapshot;
}

export interface ControlAdapter {
    match(node: DomElementSnapshot, ancestors: readonly DomElementSnapshot[]): ControlMatch | null;
}

function nativeKind(node: DomElementSnapshot): ControlKind | null {
    const type = (node.attributes['type'] ?? 'text').toLowerCase();
    const role = node.attributes['role'];

    if (node.tagName === 'select') return 'select';

    if (node.tagName === 'button' ||
        (node.tagName === 'input' && ['button', 'submit', 'reset'].includes(type))) {
        return !role || role === 'button' ? 'button' : null;
    }

    if (node.tagName === 'input' && type === 'checkbox') {
        return !role || role === 'checkbox' ? 'checkbox' : null;
    }

    if ((node.tagName === 'textarea' ||
        (node.tagName === 'input' && ['text', 'search', 'email', 'tel', 'url', 'password'].includes(type))) &&
        (!role || role === 'textbox' || role === 'searchbox') && !('tuiselectlike' in node.attributes)) {
        return 'textbox';
    }

    return null;
}

@Injectable({providedIn: 'root'})
export class NativeControlAdapter implements ControlAdapter {
    match(node: DomElementSnapshot): ControlMatch | null {
        const kind = nativeKind(node);

        return kind ? {kind, source: 'native', host: node} : null;
    }
}

/** DOM signatures verified against Taiga UI 5.15. No Angular instances/private fields. */
@Injectable({providedIn: 'root'})
export class TaigaControlAdapter implements ControlAdapter {
    match(node: DomElementSnapshot, ancestors: readonly DomElementSnapshot[]): ControlMatch | null {
        const kind = nativeKind(node);
        const field = ancestors.find((ancestor) => ancestor.tagName === 'tui-textfield');
        const attributes = node.attributes;

        if ((node.tagName === 'input' || node.tagName === 'select') && 'tuiselect' in attributes) {
            return {kind: 'select', source: 'taiga-ui', host: field ?? node};
        }
        if (node.tagName === 'input' && 'tuicombobox' in attributes) {
            return {kind: 'combobox', source: 'taiga-ui', host: field ?? node};
        }

        if (kind === 'textbox' && (field || 'tuiinput' in attributes || 'tuitextfield' in attributes)) {
            return {kind, source: 'taiga-ui', host: field ?? node};
        }

        if ((kind === 'button' && ('tuibutton' in attributes || 'tuiiconbutton' in attributes)) ||
            (kind === 'checkbox' && 'tuicheckbox' in attributes)) {
            return {kind, source: 'taiga-ui', host: node};
        }

        return null;
    }
}
