/** Браузерное измерение: capture и проекция из demo, публичный matcher из runtime.
 * Живые ссылки служат независимым эталоном и никогда не участвуют в поиске.
 */
import {writeFile} from 'node:fs/promises';

import {expect, type Page, test} from '@playwright/test';
import {
    type ControlLocatorHints,
    type ControlSnapshot,
    type DomSnapshot,
} from '@training-observer/core/models';

import {matchControl} from '../libs/training-runtime/src/lib/control-matcher';
import {
    MATCHING_HTML,
    MatchingMutation,
    NATIVE_TARGETS,
    TAIGA_TARGETS,
} from './fixtures/matching-cases';

interface TestWindow extends Window {
    matchingTargets: Record<string, Element>;
}

interface Capture {
    controls: ControlSnapshot[];
    truth: Record<string, string>;
}

interface Measurement {
    mutation: MatchingMutation;
    correct: number;
    wrong: number;
    ambiguous: number;
    missing: number;
    cases: Array<{target: string; status: string; actual?: string}>;
}

async function mount(page: Page): Promise<void> {
    await page.goto('/controls');
    await page.getByRole('button', {name: 'Остановить', exact: true}).click();
    await page.getByTestId('observed-page').evaluate(
        (root, {html, targets}) => {
            root.querySelectorAll('details').forEach((details) => {
                details.open = true;
            });
            root.insertAdjacentHTML('beforeend', html);
            (window as unknown as TestWindow).matchingTargets = Object.fromEntries(
                targets.map((id) => {
                    const element = document.querySelector(`#${CSS.escape(id)}`);

                    if (!element) {
                        throw new Error(`Нет элемента ${id}`);
                    }

                    return [id, element];
                }),
            );
        },
        {html: MATCHING_HTML, targets: [...TAIGA_TARGETS, ...NATIVE_TARGETS]},
    );
}

async function capture(page: Page): Promise<Capture> {
    const output = page.getByTestId('snapshot-json');
    const previous = JSON.parse(await output.innerText()).capturedAt;

    await page.getByRole('button', {name: 'Снять снимок', exact: true}).click();
    await expect
        .poll(async () => JSON.parse(await output.innerText()).capturedAt)
        .not.toBe(previous);
    const snapshot: DomSnapshot = JSON.parse(await output.innerText());

    expect(snapshot.stats.truncated).toBe(false);
    const controls: ControlSnapshot[] = JSON.parse(
        (await page.getByTestId('controls-json').textContent()) ?? '[]',
    );
    // XPath используется только для проверки текущего снимка по живой ссылке.
    // Ни путь, ни эталонные ссылки не передаются в matcher и не сохраняются как locator.
    const truth = await page.evaluate(
        ({nodes, controls}) => {
            const targets = (window as unknown as TestWindow).matchingTargets;

            return Object.fromEntries(
                controls.flatMap((control) => {
                    const node = nodes[control.targetNodeId];

                    if (node?.kind !== 'element') {
                        return [];
                    }

                    const element = document.evaluate(
                        node.path,
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null,
                    ).singleNodeValue;

                    const entry = Object.entries(targets).find(
                        ([, target]) => target === element,
                    );

                    return entry ? [[control.id, entry[0]]] : [];
                }),
            );
        },
        {nodes: snapshot.nodes, controls},
    );

    return {controls, truth};
}

async function mutate(page: Page, mutation: MatchingMutation): Promise<void> {
    await page.getByTestId('observed-page').evaluate((root, mode: string) => {
        const targets = (window as unknown as TestWindow).matchingTargets;
        const all = Object.values(targets);
        const units = [
            ...new Set(
                all.map(
                    (element) =>
                        element.closest('tui-textfield') ??
                        element.closest('label') ??
                        element,
                ),
            ),
        ];

        const combined = mode === 'combined' || mode === 'combined-new-ids';

        if (mode === 'wrappers' || mode === 'nesting' || combined) {
            for (const unit of units) {
                const wrapper = document.createElement('div');

                unit.before(wrapper);
                wrapper.append(unit);

                if (mode === 'nesting' || combined) {
                    const nested = document.createElement('section');

                    wrapper.before(nested);
                    nested.append(wrapper);
                }
            }
        }

        if (mode === 'classes' || combined) {
            root.querySelectorAll('[class]').forEach((element, index) => {
                element.setAttribute('class', `layout-${index}`);
            });
        }

        if (mode === 'icons' || combined) {
            for (const id of ['submit', 'help']) {
                const button = targets[id]!;
                const text = document.createElement('span');

                text.textContent = button.textContent;
                const icon = document.createElement('span');

                icon.setAttribute('aria-hidden', 'true');
                icon.textContent = '★';
                // Декоративная иконка не изменяет доступное имя.
                button.replaceChildren(icon, text);
            }
        }

        if (mode === 'reorder') {
            const parents = new Set(units.map((unit) => unit.parentElement!));

            for (const parent of parents) {
                for (const unit of units
                    .filter((item) => item.parentElement === parent)
                    .reverse()) {
                    parent.append(unit);
                }
            }
        }

        if (mode === 'move' || combined) {
            const container = document.createElement('div');

            root.append(container);

            for (const unit of [...units].reverse()) {
                container.append(unit);
            }
        }

        if (mode === 'new-ids' || mode === 'combined-new-ids') {
            for (const element of all) {
                const old = element.id;
                const next = `session-${old}`;

                root.querySelectorAll('label').forEach((label) => {
                    if (label.htmlFor === old) {
                        label.htmlFor = next;
                    }
                });
                element.id = next;
            }
        }

        if (mode === 'removed') {
            targets['mail']!.remove();
        }

        if (mode === 'duplicate') {
            const copy = targets['mail']!.parentElement!.cloneNode(true);

            root.append(copy);
        }

        if (mode === 'lost-semantics') {
            const element = targets['aria']!;

            element.removeAttribute('aria-label');
            element.removeAttribute('id');
        }

        if (mode === 'reused-id') {
            const previous = targets['aria']!;

            previous.remove();
            const replacement = document.createElement('input');

            replacement.id = 'aria';
            replacement.setAttribute('aria-label', 'Другое назначение');
            root.append(replacement);
        }
    }, mutation);
}

test('measure descriptor matching across new documents and adversarial DOM changes', async ({
    page,
}) => {
    test.setTimeout(120_000);
    await mount(page);
    const baseline = await capture(page);
    const hints = new Map<string, ControlLocatorHints>();

    for (const control of baseline.controls) {
        const target = baseline.truth[control.id];

        if (target) {
            hints.set(target, control.locatorHints);
        }
    }

    const unrecognized = [...TAIGA_TARGETS, ...NATIVE_TARGETS].filter(
        (target) => !hints.has(target),
    );

    console.info(JSON.stringify({unrecognized}));
    expect(unrecognized).toEqual(['date', 'time', 'month', 'week']);
    expect(hints.size).toBe(26);
    const measurements: Measurement[] = [];

    for (const mutation of Object.values(MatchingMutation)) {
        // Новый document исключает случайное совпадение по сохранённой ссылке или сессионному ID.
        await mount(page);
        await mutate(page, mutation);
        const current = await capture(page);
        const result: Measurement = {
            mutation,
            correct: 0,
            wrong: 0,
            ambiguous: 0,
            missing: 0,
            cases: [],
        };

        for (const [target, hint] of hints) {
            const match = matchControl(hint, current.controls);

            if (match.status === 'matched') {
                const actual = current.truth[match.control.id] ?? 'unrelated-control';
                const status = target === actual ? 'correct' : 'wrong';

                result[status]++;
                result.cases.push({target, status, actual});
            } else {
                result[match.status]++;
                result.cases.push({target, status: match.status});
            }
        }

        measurements.push(result);
    }

    const path = test.info().outputPath('matching-resilience.json');

    await writeFile(
        path,
        JSON.stringify(
            {
                targets: [...TAIGA_TARGETS, ...NATIVE_TARGETS],
                recognized: [...hints.keys()],
                unrecognized,
                measurements,
            },
            null,
            2,
        ),
    );
    await test
        .info()
        .attach('matching-resilience', {path, contentType: 'application/json'});

    for (const result of measurements) {
        console.info(
            JSON.stringify({
                mutation: result.mutation,
                correct: result.correct,
                wrong: result.wrong,
                ambiguous: result.ambiguous,
                missing: result.missing,
            }),
        );
    }

    for (const result of measurements) {
        expect(result.wrong, result.mutation).toBe(0);
    }

    const adversarial = new Set<MatchingMutation>([
        MatchingMutation.Duplicate,
        MatchingMutation.LostSemantics,
        MatchingMutation.Missing,
        MatchingMutation.ReusedId,
    ]);

    for (const result of measurements) {
        expect(result.correct, result.mutation).toBe(
            adversarial.has(result.mutation) ? 25 : 26,
        );
    }

    expect(
        measurements.find((item) => item.mutation === MatchingMutation.Duplicate)
            ?.ambiguous,
    ).toBe(1);
    expect(
        measurements.find((item) => item.mutation === MatchingMutation.ReusedId)?.missing,
    ).toBe(1);
});
