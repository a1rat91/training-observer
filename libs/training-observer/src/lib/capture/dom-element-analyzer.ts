/* eslint-disable unicorn/prefer-query-selector -- Нужен точный поиск HTML ID, включая пустые строки и специальные символы CSS. */
/** Адаптер живого DOM в наблюдаемые свойства. Читает native/ARIA состояния и подписи, применяет скрытие чувствительных значений. */
import {Injectable} from '@angular/core';
import {
    type DomControlState,
    type InteractionReason,
} from '@training-observer/core/models';

import {type DomGeometry} from './dom-geometry';

const INTERACTIVE_ROLES = new Set([
    'button',
    'checkbox',
    'combobox',
    'link',
    'listbox',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'radio',
    'scrollbar',
    'searchbox',
    'slider',
    'spinbutton',
    'switch',
    'tab',
    'textbox',
    'treeitem',
]);

@Injectable({providedIn: 'root'})
export class DomElementAnalyzer {
    public interactionReasons(
        element: Element,
        geometry: DomGeometry,
        cursorHeuristics: boolean,
    ): InteractionReason[] {
        const reasons: InteractionReason[] = [];

        if (
            element.matches(
                'button,input:not([type="hidden"]),select,textarea,a[href],area[href],summary,label',
            )
        ) {
            reasons.push('native');
        }

        if (INTERACTIVE_ROLES.has(element.getAttribute('role') ?? '')) {
            reasons.push('role');
        }

        if (this.editable(element)) {
            reasons.push('editable');
        }

        if (
            element.hasAttribute('tabindex') &&
            Number(element.getAttribute('tabindex')) >= 0
        ) {
            reasons.push('tabindex');
        }

        if (
            element.hasAttribute('onclick') ||
            typeof (element as HTMLElement).onclick === 'function'
        ) {
            reasons.push('inline-handler');
        }

        // Необязательный слабый признак. Унаследованный курсор не делает каждого потомка новым контролом.
        if (
            cursorHeuristics &&
            geometry.style(element).cursor === 'pointer' &&
            (!element.parentElement ||
                geometry.style(element.parentElement).cursor !== 'pointer')
        ) {
            reasons.push('cursor');
        }

        return reasons;
    }

    public attributes(element: Element): Record<string, string> {
        const result: Record<string, string> = {};
        const redacted = element.matches('input[type="password"],input[type="file"]');

        for (const name of element.getAttributeNames()) {
            // Отладочные Angular-атрибуты и исходники обработчиков событий не являются состоянием страницы.
            if (/^(?:_ng|ng-reflect-|on)/.test(name) || (redacted && name === 'value')) {
                continue;
            }

            result[name] = element.getAttribute(name) ?? '';
        }

        return result;
    }

    public label(element: Element): string {
        const labelledBy = element
            .getAttribute('aria-labelledby')
            ?.trim()
            .split(/\s+/)
            .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
            .join(' ');

        const labels = (element as HTMLInputElement).labels;
        const associatedLabel = labels
            ? Array.from(labels)
                  .map((label) => label.textContent ?? '')
                  .join(' ')
            : '';

        const actionText = element.matches(
            'button,a,summary,[role="button"],[role="option"]',
        )
            ? element.textContent
            : '';

        const text =
            element.localName === 'option'
                ? (element as HTMLOptionElement).label
                : actionText;

        return this.normalize(
            labelledBy ||
                element.getAttribute('aria-label') ||
                associatedLabel ||
                text ||
                element.getAttribute('title') ||
                element.getAttribute('placeholder') ||
                '',
        );
    }

    public state(element: Element): DomControlState {
        const control = element as HTMLInputElement;
        const redacted = element.matches('input[type="password"],input[type="file"]');
        const state: DomControlState = {
            disabled:
                element.matches(':disabled') ||
                element.getAttribute('aria-disabled') === 'true',
            readOnly:
                ('readOnly' in element && control.readOnly) ||
                element.getAttribute('aria-readonly') === 'true',
            inert: Boolean(element.closest('[inert]')),
            required:
                ('required' in element && control.required) ||
                element.getAttribute('aria-required') === 'true',
            invalid:
                element.matches(':invalid') ||
                element.getAttribute('aria-invalid') === 'true',
            redacted,
        };

        let value: string | readonly string[] | undefined;

        if (!redacted) {
            if (element.matches('select[multiple]')) {
                value = Array.from((element as HTMLSelectElement).selectedOptions).map(
                    (option) => option.value,
                );
            } else if (element.matches('input,textarea,select')) {
                value = control.value;
            } else if (this.editable(element)) {
                value = element.textContent ?? '';
            } else if (element.hasAttribute('aria-valuenow')) {
                value = element.getAttribute('aria-valuenow') ?? undefined;
            }
        }

        const checked = element.matches('input[type="checkbox"],input[type="radio"]')
            ? control.checked
            : this.ariaBoolean(element, 'aria-checked');

        const ariaIndeterminate =
            element.getAttribute('aria-checked') === 'mixed' ? true : undefined;

        const indeterminate = element.matches('input[type="checkbox"]')
            ? control.indeterminate
            : ariaIndeterminate;

        const selected = element.matches('option')
            ? (element as HTMLOptionElement).selected
            : this.ariaBoolean(element, 'aria-selected');

        const expanded = element.matches('details')
            ? (element as HTMLDetailsElement).open
            : this.ariaBoolean(element, 'aria-expanded');

        return {...state, value, checked, indeterminate, selected, expanded};
    }

    private ariaBoolean(element: Element, name: string): boolean | undefined {
        const value = element.getAttribute(name);

        if (value === 'true') {
            return true;
        }

        return value === 'false' ? false : undefined;
    }

    private editable(element: Element): boolean {
        // Контролом является editing host, а не каждый форматированный потомок.
        return (
            'isContentEditable' in element &&
            (element as HTMLElement).isContentEditable &&
            !element.parentElement?.isContentEditable
        );
    }

    private normalize(value: string): string {
        return value.replaceAll(/\s+/g, ' ').trim();
    }
}
