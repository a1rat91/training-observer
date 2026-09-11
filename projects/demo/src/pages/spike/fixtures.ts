/** Oracle lives in the experiment only; none of these keys/selectors are passed to the resolver. */
export const FIXTURE_CASES = [
    ['native-button', '.actions button:first-child'],
    ['icon-button', 'button[aria-label]'],
    ['link', 'a[href]'],
    ['text-input', 'input[name="surname"]'],
    ['email-input', 'input[type="email"]'],
    ['placeholder-search', 'input[type="search"]'],
    ['textarea', 'textarea'],
    ['native-checkbox', 'input[type="checkbox"]:not([tuiCheckbox],[tuiSwitch])'],
    ['native-radio', 'input[type="radio"]'],
    ['native-select', 'select:not([multiple])'],
    ['multiselect', 'select[multiple]'],
    ['number', 'input[type="number"]'],
    ['date', 'input[type="date"]'],
    ['range', 'input[type="range"]'],
    ['password', 'input[type="password"]'],
    ['contenteditable', '[contenteditable="true"]'],
    ['summary', 'summary'],
    ['aria-button', 'div[role="button"]'],
    ['aria-switch', 'div[role="switch"]'],
    ['aria-tab', '[role="tab"]'],
    ['row-anna', 'tr:first-child button'],
    ['row-boris', 'tr:last-child button'],
    ['taiga-button', 'button[tuiButton]'],
    ['taiga-textfield', 'input[tuiTextfield]'],
    ['taiga-checkbox', 'input[tuiCheckbox]'],
    ['taiga-switch', 'input[tuiSwitch]'],
    ['taiga-number', 'input[tuiInputNumber]'],
    ['taiga-select', 'input[tuiSelect]'],
] as const;

export const MUTATIONS = [
    'baseline',
    'wrappers',
    'reorder',
    'classes',
    'nesting',
    'button-content',
    'move-container',
    'combined',
    'rename',
    'duplicate',
    'removed',
    'lost-context',
    'css-trap',
] as const;
export type Mutation = (typeof MUTATIONS)[number];

export function fixtureTargets(root: Element): Element[] {
    return FIXTURE_CASES.map(([key, selector]) => {
        const matches = root.querySelectorAll(selector);

        if (matches.length !== 1) {
            throw new Error(`Fixture ${key}: expected one target, got ${matches.length}`);
        }

        return matches[0]!;
    });
}

export function mutateFixture(root: Element, targets: Element[], kind: Mutation): void {
    const doc = root.ownerDocument;

    if (kind === 'combined') {
        for (const mutation of [
            'wrappers',
            'reorder',
            'classes',
            'nesting',
            'button-content',
            'move-container',
        ] as const) {
            mutateFixture(root, targets, mutation);
        }

        return;
    }

    if (kind === 'wrappers' || kind === 'nesting') {
        for (const target of targets) {
            for (let i = 0; i < (kind === 'nesting' ? 3 : 1); i++) {
                const wrapper = doc.createElement(i % 2 ? 'section' : 'div');

                target.replaceWith(wrapper);
                wrapper.append(target);
            }
        }
    }

    if (kind === 'reorder') {
        const parents = new Set(targets.map((target) => target.parentElement!));

        // Reverse sibling blocks and rows, not just text nodes inside controls.
        for (const parent of [...parents, ...root.querySelectorAll('.fields,tbody')]) {
            [...parent.children].reverse().forEach((child) => parent.append(child));
        }
    }

    if (kind === 'classes') {
        [...root.querySelectorAll('*')].forEach((el, i) =>
            el.setAttribute('class', `refactored-${i % 7}`),
        );
    }

    if (kind === 'button-content') {
        targets
            .filter((el) => el.matches('button,[role="button"]'))
            .forEach((button) => {
                const span = doc.createElement('span');

                while (button.firstChild) {
                    span.append(button.firstChild);
                }

                const icon = doc.createElement('span');

                icon.setAttribute('aria-hidden', 'true');
                icon.textContent = '★';
                button.append(icon, span);
            });
    }

    if (kind === 'move-container') {
        // Move coherent controls with their labels/rows into unrelated layout containers.
        for (const section of root.querySelectorAll(':scope > section')) {
            const destination = doc.createElement('div');

            for (const child of section.children) {
                if (!child.matches('h2')) {
                    destination.append(child);
                }
            }

            section.append(destination);
        }

        // One individual uniquely named button also loses its semantic ancestor.
        root.append(targets[0]!);
    }

    if (kind === 'rename') {
        targets[0]!.textContent = 'Сохранить новый черновик';
    }

    if (kind === 'duplicate') {
        for (const target of targets) {
            const row = target.closest('tr');
            const block = row ?? target.closest('label,tui-textfield') ?? target;

            block.parentElement!.append(block.cloneNode(true));
        }
    }

    if (kind === 'removed') {
        targets.forEach((target) => target.remove());
    }

    if (kind === 'lost-context') {
        root.querySelectorAll('th').forEach((th) => {
            th.textContent = 'Сотрудник';
        });
    }

    if (kind === 'css-trap') {
        const target = targets[0]!;
        const decoy = target.cloneNode(true) as Element;

        decoy.textContent = 'Удалить черновик';
        target.replaceWith(decoy);
        root.append(target);
    }
}
