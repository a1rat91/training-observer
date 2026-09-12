import {type ElementDescriptor, readResolution} from '../src/contracts';
import {describe} from '../src/recording/dom';
import {ElementResolver} from '../src/resolution';

let root: HTMLElement;

function record(html: string, selector: string): ElementDescriptor {
    document.body.innerHTML = `<main>${html}</main>`;
    root = document.querySelector('main')!;

    return JSON.parse(
        JSON.stringify(describe(root.querySelector(selector)!, root, 'target')),
    );
}

function resolve(
    descriptor: ElementDescriptor,
    html: string,
): ReturnType<ElementResolver['resolve']> {
    root.innerHTML = html;
    const result = new ElementResolver().resolve(descriptor, root);

    expect(readResolution(JSON.parse(JSON.stringify(result.report)))).toEqual(
        result.report,
    );

    return result;
}

afterEach(() => {
    document.body.replaceChildren();
    history.replaceState({}, '', '/workflow');
});

for (const html of [
    '<section><div><label>Имя<input class="new"></label></div></section>',
    '<button>Другое</button><article><label><span>Имя</span><input></label></article>',
    '<div><div><div><label>Имя<input></label></div></div></div>',
]) {
    test(`finds a recreated labelled control despite wrappers/order/classes: ${html}`, () => {
        const descriptor = record('<label>Имя<input class="old"></label>', 'input');
        const old = root.querySelector('input');
        const result = resolve(descriptor, html);

        expect(result.report.status).toBe('resolved');
        expect(result.element).toBe(root.querySelector('input'));
        expect(result.element).not.toBe(old);
    });
}

test('button survives icon/span and movement to an unnamed container', () => {
    const descriptor = record('<button>Сохранить</button>', 'button');
    const result = resolve(
        descriptor,
        '<article><div><button><span aria-hidden="true">★</span><span>Сохранить</span></button></div></article>',
    );

    expect(result.report).toMatchObject({status: 'resolved', strategy: 'semantic'});
});

test('custom ARIA button replaces native button without any Taiga dependency', () => {
    const descriptor = record('<button>Сохранить</button>', 'button');
    const result = resolve(
        descriptor,
        '<div role="button" tabindex="0" aria-label="Сохранить"><span>★</span></div>',
    );

    expect(result.report.status).toBe('resolved');
    expect(result.element?.tagName).toBe('DIV');
});

test('identical visible buttons refuse to use CSS position as a tie breaker', () => {
    const descriptor = record('<button>Удалить</button>', 'button');
    const result = resolve(
        descriptor,
        '<button>Удалить</button><button>Удалить</button>',
    );

    expect(result.report).toMatchObject({status: 'ambiguous', reason: 'near-tie'});
    expect(result).not.toHaveProperty('element');
    expect(result.report).not.toHaveProperty('selectedCandidateId');
});

test('reordered repeated controls resolve by semantic context', () => {
    const descriptor = record(
        '<fieldset><legend>Анна</legend><button>Изменить</button></fieldset><fieldset><legend>Борис</legend><button>Изменить</button></fieldset>',
        'button',
    );

    expect(descriptor.contextRequired).toBe(true);
    const result = resolve(
        descriptor,
        '<fieldset><legend>Борис</legend><button>Изменить</button></fieldset><fieldset><legend>Анна</legend><div><button>Изменить</button></div></fieldset>',
    );

    expect(result.report.status).toBe('resolved');
    expect(
        result.element?.closest('fieldset')?.querySelector('legend')?.textContent,
    ).toBe('Анна');
});

test('duplicate named contexts are ambiguous, not first-match', () => {
    const descriptor = record(
        '<fieldset><legend>Анна</legend><button>Изменить</button></fieldset>',
        'button',
    );

    const result = resolve(
        descriptor,
        '<fieldset><legend>Анна</legend><button>Изменить</button></fieldset><fieldset><legend>Анна</legend><button>Изменить</button></fieldset>',
    );

    expect(result.report).toMatchObject({
        status: 'ambiguous',
        reason: 'duplicate-context',
    });
});

test('a deleted context is never replaced by the remaining same-named button', () => {
    const descriptor = record(
        '<fieldset><legend>Анна</legend><button>Изменить</button></fieldset><fieldset><legend>Борис</legend><button>Изменить</button></fieldset>',
        'button',
    );

    expect(
        resolve(
            descriptor,
            '<fieldset><legend>Борис</legend><button>Изменить</button></fieldset>',
        ).report,
    ).toMatchObject({status: 'broken', reason: 'scope-mismatch'});
});

test('a previously unique context remains a boundary even without contextRequired', () => {
    const descriptor = record(
        '<fieldset><legend>Анна</legend><button>Изменить</button></fieldset>',
        'button',
    );

    expect(descriptor.contextRequired).toBe(false);
    expect(
        resolve(
            descriptor,
            '<fieldset><legend>Борис</legend><button>Изменить</button></fieldset>',
        ).report.status,
    ).toBe('broken');
});

test('stale unique CSS pointing to a different control fails identity verification', () => {
    const descriptor = record('<button>Удалить</button>', 'button');

    descriptor.locators = [
        {id: 'css', selector: {kind: 'css', value: 'button'}, recordedMatches: 1},
    ];
    const result = resolve(descriptor, '<button>Сохранить</button>');

    expect(result.report.status).toBe('broken');
    expect(result.report.attempts[0]).toMatchObject({count: 1, outcome: 'rejected'});
});

test('CSS-only descriptor still requires fingerprint identity, then reports css-verified', () => {
    const descriptor = record('<button>Сохранить</button>', 'button');

    descriptor.locators = [
        {id: 'css', selector: {kind: 'css', value: 'button'}, recordedMatches: 1},
    ];
    expect(
        resolve(descriptor, '<div><button>Сохранить</button></div>').report,
    ).toMatchObject({status: 'resolved', strategy: 'css-verified'});
});

test('invalid CSS is rejected while semantic fallback can resolve', () => {
    const descriptor = record('<button>Сохранить</button>', 'button');

    descriptor.locators.unshift({
        id: 'bad',
        selector: {kind: 'css', value: '###'},
        recordedMatches: 1,
    });
    const result = resolve(descriptor, '<button>Сохранить</button>');

    expect(result.report.status).toBe('resolved');
    expect(
        result.report.attempts.find((attempt) => attempt.locatorId === 'bad')?.outcome,
    ).toBe('rejected');
});

test('minor naming change uses similarity only when old locators fail and context remains', () => {
    const descriptor = record(
        '<fieldset><legend>Обучение</legend><button>Сохранить заявку на внешний курс</button></fieldset>',
        'button',
    );

    descriptor.locators = descriptor.locators.filter(
        (locator) => locator.selector.kind === 'role',
    );
    const result = resolve(
        descriptor,
        '<fieldset><legend>Обучение</legend><button>Сохранить новую заявку на внешний курс</button></fieldset>',
    );

    expect(result.report).toMatchObject({status: 'resolved', strategy: 'similarity'});
});

test('two close fuzzy candidates refuse to guess', () => {
    const descriptor = record(
        '<button>Сохранить заявку на внешний курс</button>',
        'button',
    );

    const result = resolve(
        descriptor,
        '<button>Сохранить новую заявку на внешний курс</button><button>Сохранить готовую заявку на внешний курс</button>',
    );

    expect(result.report.status).toBe('ambiguous');
});

for (const replacement of [
    '<input type="password" aria-label="Имя">',
    '<button>Имя</button>',
]) {
    test(`role/type conflicts cannot be healed: ${replacement}`, () => {
        const descriptor = record('<input type="text" aria-label="Имя">', 'input');

        expect(resolve(descriptor, replacement).report).toMatchObject({
            status: 'broken',
            reason: 'identity-conflict',
        });
    });
}

test('conflicting independent name attribute vetoes the same accessible label', () => {
    const descriptor = record('<input name="employee" aria-label="Имя">', 'input');

    expect(
        resolve(descriptor, '<input name="approver" aria-label="Имя">').report,
    ).toMatchObject({status: 'broken', reason: 'identity-conflict'});
});

test('correlated label/name/text cannot outweigh a complete identity change', () => {
    const descriptor = record(
        '<label>ФИО сотрудника<input title="Обязательное поле"></label>',
        'input',
    );

    expect(
        resolve(descriptor, '<label>ФИО клиента<input title="Обязательное поле"></label>')
            .report.status,
    ).toBe('broken');
});

test('placeholder can be identity, but anonymous CSS-only and type-only controls cannot', () => {
    const placeholder = record('<input placeholder="Рабочая почта">', 'input');

    expect(
        resolve(placeholder, '<div><input placeholder="Рабочая почта"></div>').report
            .status,
    ).toBe('resolved');
    const anonymous = record('<button>?</button>', 'button');

    expect(resolve(anonymous, '<button>?</button>').report.status).toBe('broken');
});

test('disabled duplicate does not make another same-named control unique', () => {
    const descriptor = record('<button>Сохранить</button>', 'button');

    expect(
        resolve(
            descriptor,
            '<button disabled>Сохранить</button><button>Сохранить</button>',
        ).report.status,
    ).toBe('ambiguous');
    expect(resolve(descriptor, '<button disabled>Сохранить</button>').report.status).toBe(
        'broken',
    );
});

for (const markup of [
    '<button hidden>Сохранить</button>',
    '<div inert><button>Сохранить</button></div>',
    '<details><summary>Настройки</summary><button>Сохранить</button></details>',
    '',
]) {
    test(`unavailable target is not silently replaced: ${markup}`, () => {
        const descriptor = record('<button>Сохранить</button>', 'button');

        expect(resolve(descriptor, markup).report.status).toBe('broken');
    });
}

test('pathname mismatch requires an explicit directional route pair', () => {
    const descriptor = record('<button>Сохранить</button>', 'button');

    history.replaceState({}, '', '/learn');
    expect(new ElementResolver().resolve(descriptor, root).report).toMatchObject({
        status: 'broken',
        reason: 'scope-mismatch',
    });
    const resolver = new ElementResolver({
        routePairs: [{recorded: '/workflow', current: '/learn'}],
    });

    expect(resolver.resolve(descriptor, root).report.status).toBe('resolved');
    history.replaceState({}, '', '/other');
    expect(resolver.resolve(descriptor, root).report.status).toBe('broken');
});

test('candidate limit produces refusal instead of selecting from a truncated pool', () => {
    const descriptor = record(
        '<button>Сохранить</button><button>Удалить</button>',
        'button',
    );

    expect(
        new ElementResolver({maxCandidates: 1}).resolve(descriptor, root).report,
    ).toMatchObject({status: 'broken', reason: 'unsupported'});
});

test('repeated resolutions are deterministic and reports contain no live references', () => {
    const descriptor = record(
        '<button>Сохранить</button><button>Удалить</button>',
        'button',
    );

    const resolver = new ElementResolver();
    const first = resolver.resolve(descriptor, root);

    expect(resolver.resolve(descriptor, root).report).toEqual(first.report);
    expect(() => readResolution(first.report)).not.toThrow();
    expect(JSON.stringify(first.report)).not.toContain('outerHTML');
});

for (const changed of [
    'Перевести средства со счета Б на счет А',
    'Не перевести средства со счета А на счет Б',
]) {
    test(`word bags and explicit negation do not prove identity: ${changed}`, () => {
        const descriptor = record(
            '<button>Перевести средства со счета А на счет Б</button>',
            'button',
        );

        expect(resolve(descriptor, `<button>${changed}</button>`).report.status).toBe(
            'broken',
        );
    });
}

test('changing numeric identity is not a minor naming repair', () => {
    const descriptor = record(
        '<button>Открыть подробную информацию о заявке сотрудника номер 123</button>',
        'button',
    );

    expect(
        resolve(
            descriptor,
            '<button>Открыть подробную информацию о заявке сотрудника номер 456</button>',
        ).report.status,
    ).toBe('broken');
});
