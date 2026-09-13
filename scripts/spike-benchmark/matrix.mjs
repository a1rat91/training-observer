// Oracle selectors belong only to the experiment, never to descriptors or resolver options.
export const targets = [
    ['text', 'input[name=employee]'],
    ['email', 'input[name=email]'],
    ['select', 'input[tuiSelect]'],
    ['number', 'input[name=budget]'],
    ['checkbox', 'input[name=consent]'],
    ['switch', 'input[name=mentor]'],
    ['textarea', 'textarea[name=comment]'],
    ['date', 'input[name=date]'],
    ['continue', 'form:first-of-type > button:first-of-type'],
    ['icon-button', 'button[aria-label="Открыть справку"]'],
    ['repeat-anna', 'fieldset:nth-of-type(1) button'],
    ['repeat-boris', 'fieldset:nth-of-type(2) button'],
    ['indistinguishable-a', 'section button:first-child'],
    ['indistinguishable-b', 'section button:last-child'],
    ['phone', 'input[name=phone]'],
    ['url', 'input[name=website]'],
    ['placeholder-search', 'input[type=search]'],
    ['aria-name', 'input[aria-label="Код подразделения"]'],
    ['quantity', 'input[name=quantity]'],
    ['radio-online', 'input[value=online]'],
    ['radio-office', 'input[value=office]'],
    ['readonly', 'input[readonly]'],
    ['disabled', 'input[disabled]'],
    ['link', 'a[href="/guide"]'],
    ['title-button', 'button[title]'],
    ['second-textarea', 'textarea[name=explanation]'],
    ['row-elena', 'tr:nth-child(1) button'],
    ['row-igor', 'tr:nth-child(2) button'],
].map(([id, selector], index) => ({id, selector, split: index < 14 ? 'development' : 'held-out'}));

export const variants = [
    'fresh-document',
    'wrappers',
    'reorder',
    'classes',
    'nesting',
    'button-content',
    'move-container',
    'regenerated-ids',
    'combined-17',
    'combined-83',
    'rename',
    'duplicate',
    'removed',
    'lost-context',
    'css-trap',
    'semantic-trap',
    'same-dom-new-entity',
];

export function expected(target, variant) {
    if (target.id.startsWith('indistinguishable')) return 'indistinguishable';
    if (target.id === 'disabled') return 'disabled';
    if (variant === 'duplicate') return 'duplicate';
    if (variant === 'removed') return 'removed';
    if (variant === 'lost-context' && /^(repeat-|row-)/.test(target.id)) return 'context-lost';
    if (['semantic-trap', 'same-dom-new-entity'].includes(variant) && target.id === 'continue')
        return 'replaced-entity';
    return 'eligible';
}

// Runs only in the experiment page. References are retained outside the resolver for identity assertions.
export function mutate({variant, elements}) {
    const root = document.querySelector('main');
    const wrap = (node, depth) => {
        for (let i = 0; i < depth; i++) {
            const wrapper = document.createElement(i % 2 ? 'div' : 'article');
            node.replaceWith(wrapper);
            wrapper.append(node);
        }
    };
    const regenerate = (container, prefix) => {
        const ids = new Map([...container.querySelectorAll('[id]')].map((node, i) => [node.id, `${prefix}-${i}`]));
        for (const node of container.querySelectorAll('*')) {
            if (node.id) node.id = ids.get(node.id);
            for (const attr of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls']) {
                if (node.hasAttribute(attr))
                    node.setAttribute(
                        attr,
                        node
                            .getAttribute(attr)
                            .split(' ')
                            .map((id) => ids.get(id) ?? id)
                            .join(' '),
                    );
            }
        }
    };
    const combined = variant.startsWith('combined-');
    const seed = variant === 'combined-83' ? 83 : 17;
    if (variant === 'wrappers' || variant === 'nesting' || combined) {
        elements.forEach((node, i) => wrap(node, variant === 'wrappers' ? 1 : 2 + ((i + seed) % 3)));
    }
    if (variant === 'reorder' || combined) {
        for (const parent of root.querySelectorAll('form,tbody,section')) {
            const children = [...parent.children];
            const order =
                combined && seed === 83 ? [...children.slice(3), ...children.slice(0, 3)] : children.reverse();
            order.forEach((child) => parent.append(child));
        }
    }
    if (variant === 'classes' || combined) {
        [...root.querySelectorAll('*')].forEach((node, i) => node.setAttribute('class', `layout-${(i * seed) % 11}`));
    }
    if (variant === 'button-content' || combined) {
        for (const button of root.querySelectorAll('button')) {
            const span = document.createElement('span');
            while (button.firstChild) span.append(button.firstChild);
            const icon = document.createElement('span');
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = '★';
            button.append(icon, span);
        }
    }
    if (variant === 'move-container' || combined) {
        for (const form of root.querySelectorAll('form')) {
            const destination = document.createElement('div');
            while (form.firstChild) destination.append(form.firstChild);
            form.append(destination);
        }
        const destination = document.createElement('div');
        root.append(destination);
        root.querySelectorAll('fieldset,table').forEach((node) => destination.append(node));
    }
    if (variant === 'regenerated-ids' || combined) regenerate(root, `session-${seed}`);
    if (variant === 'rename') elements[8].textContent = 'Продолжить оформление';
    if (variant === 'duplicate') {
        const copy = root.cloneNode(true);
        regenerate(copy, 'duplicate');
        root.append(...copy.childNodes);
    }
    if (variant === 'removed') elements.forEach((node) => node.remove());
    if (variant === 'lost-context')
        root.querySelectorAll('legend,th').forEach((node) => {
            node.textContent = 'Сотрудник';
        });
    if (['css-trap', 'semantic-trap', 'same-dom-new-entity'].includes(variant)) {
        const original = elements[8];
        const parent = original.parentElement;
        const decoy = original.cloneNode(true);
        if (variant !== 'same-dom-new-entity')
            decoy.textContent = variant === 'css-trap' ? 'Удалить заявку' : 'Продолжить удаление';
        original.replaceWith(decoy);
        if (variant === 'css-trap') {
            const container = document.createElement('div');
            parent.append(container);
            container.append(original);
        }
    }
}
