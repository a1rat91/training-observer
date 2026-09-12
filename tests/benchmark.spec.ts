import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {expect, type Page, test} from '@playwright/test';
import {build} from 'esbuild';

import {
    type ElementDescriptor,
    type LiveResolution,
} from '../libs/training-observer/src/contracts';

declare global {
    interface Window {
        benchmark: {
            describe(
                element: Element,
                root: Element,
            ): {descriptor: ElementDescriptor; durationMs: number; bytes: number};
            resolve(
                descriptor: ElementDescriptor,
                root: Element,
            ): LiveResolution & {durationMs: number; queriedControlCount: number};
        };
    }
}

type Role = 'button' | 'checkbox' | 'combobox' | 'radio' | 'switch' | 'textbox';

interface Target {
    name: string;
    role: Role;
    descriptor: ElementDescriptor;
}
const directory = resolve('dist/spike-benchmark');
const bundle = resolve(directory, 'dynamic-browser.js');

async function select(page: Page, name: string, option: string): Promise<void> {
    await page.getByRole('combobox', {name, exact: true}).click();
    await page.getByRole('option', {name: option, exact: true}).click();
}

async function next(page: Page): Promise<void> {
    await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
}

async function identity(page: Page, external: boolean): Promise<void> {
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Анна Смирнова');
    await page
        .getByRole('textbox', {name: 'Рабочая почта', exact: true})
        .fill('anna@example.test');
    await select(page, 'Вид обучения', external ? 'Внешний курс' : 'Внутренний курс');
}

async function details(page: Page, external: boolean): Promise<void> {
    if (external) {
        await page
            .getByRole('textbox', {name: 'Организатор', exact: true})
            .fill('Учебный центр');
        await page.getByRole('textbox', {name: 'Стоимость', exact: true}).fill('150000');
        await page
            .getByRole('textbox', {name: 'Дата начала', exact: true})
            .fill('15.02.2027');
        await page
            .getByRole('textbox', {name: 'Обоснование', exact: true})
            .fill('Необходимо для разработки внутренних приложений');
    } else {
        await select(page, 'Курс', 'Angular');
        await page.getByRole('radio', {name: 'Онлайн', exact: true}).check();
    }
}

async function capture(page: Page, cases: Array<[Role, string]>): Promise<Target[]> {
    const targets: Target[] = [];

    for (const [role, name] of cases) {
        const locator = page.getByRole(role, {name, exact: true});

        await expect(locator).toBeVisible();
        const generated = await locator.evaluate((element) =>
            window.benchmark.describe(element, document.querySelector('procedure-page')),
        );

        targets.push({name, role, descriptor: generated.descriptor});
    }

    return JSON.parse(JSON.stringify(targets)) as Target[];
}

test.beforeAll(async () => {
    await mkdir(directory, {recursive: true});
    await build({
        entryPoints: ['scripts/spike-benchmark/browser.mjs'],
        bundle: true,
        format: 'iife',
        outfile: bundle,
        logLevel: 'warning',
    });
});

for (const external of [false, true]) {
    test(`benchmark dynamic identity: ${external ? 'external' : 'internal'}`, async ({
        page,
        context,
    }) => {
        test.setTimeout(90000);
        const identityCases: Array<[Role, string]> = [
            ['textbox', 'ФИО'],
            ['textbox', 'Рабочая почта'],
            ['combobox', 'Вид обучения'],
            ['button', 'Продолжить'],
        ];

        const detailCases: Array<[Role, string]> = external
            ? [
                  ['textbox', 'Организатор'],
                  ['textbox', 'Стоимость'],
                  ['textbox', 'Дата начала'],
                  ['textbox', 'Обоснование'],
                  ['button', 'Продолжить'],
              ]
            : [
                  ['combobox', 'Курс'],
                  ['radio', 'Онлайн'],
                  ['switch', 'Нужен наставник'],
                  ['textbox', 'Комментарий'],
                  ['button', 'Продолжить'],
              ];

        await page.goto('/spike/record');
        await page.addScriptTag({path: bundle});
        await page.getByRole('button', {name: 'Новая процедура', exact: true}).click();
        const first = await capture(page, identityCases);

        await identity(page, external);
        await next(page);
        // Expensive external course appends an additional justification field after input.
        await details(page, external);
        const second = await capture(page, detailCases);

        await next(page);
        const third = await capture(page, [
            ['checkbox', 'Данные проверены'],
            ['button', 'Продолжить'],
        ]);

        await writeFile(
            resolve(directory, `dynamic-recorded-${external}.json`),
            JSON.stringify({first, second, third}, null, 2),
        );
        const pupil = await context.newPage();

        await page.close();
        await pupil.goto('/spike/record');
        await pupil.addScriptTag({path: bundle});
        await select(pupil, 'Расположение полей', 'Другое расположение');
        await pupil.getByRole('button', {name: 'Новая процедура', exact: true}).click();
        await expect(
            pupil.getByRole('textbox', {name: 'ФИО', exact: true}),
        ).toBeVisible();
        const rows: Array<Record<string, unknown>> = [];
        const check = async (
            variant: string,
            targets: Target[],
            present = true,
        ): Promise<void> => {
            for (const target of targets) {
                const locator = pupil.getByRole(target.role, {
                    name: target.name,
                    exact: true,
                });

                if (present) {
                    await expect(locator).toBeVisible();
                }

                const oracle = present ? await locator.elementHandle() : null;
                const result = await pupil.evaluate(
                    ({descriptor, oracle}) => {
                        const result = window.benchmark.resolve(
                            descriptor,
                            document.querySelector('procedure-page')!,
                        );

                        return {
                            report: result.report,
                            same: !!oracle && result.element === oracle,
                            durationMs: result.durationMs,
                            queriedControlCount: result.queriedControlCount,
                        };
                    },
                    {descriptor: target.descriptor, oracle},
                );

                const resolvedOutcome = result.same ? 'correct' : 'wrong';
                const outcome =
                    result.report.status === 'resolved'
                        ? resolvedOutcome
                        : result.report.status;

                rows.push({
                    variant,
                    id: target.name,
                    branch: external ? 'external' : 'internal',
                    library: 'resolver-v2',
                    expected: present ? 'eligible' : 'absent',
                    outcome,
                    ...result,
                });
                expect(outcome).toBe(present ? 'correct' : 'broken');
            }
        };

        await check('new-document-layout', first);
        await check('before-append', [second[0]!], false);
        await identity(pupil, external);
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });

        await pupil.route(
            '**/api/procedures/*/actions',
            async (route) => {
                const response = await route.fetch();

                await gate;
                await route.fulfill({response});
            },
            {times: 1},
        );
        await next(pupil);
        await expect(pupil.getByRole('status')).toContainText('Ожидаем ответ сервера');
        await check('pending-http', [second[0]!], false);
        release();
        await details(pupil, external);
        await check('after-append', second);

        if (external) {
            await pupil.getByRole('textbox', {name: 'Обоснование', exact: true}).fill('');
            await next(pupil);
            await expect(
                pupil.getByText('Проверьте данные: сервер отклонил отправку.'),
            ).toBeVisible();
            await check('validation-422', second);
            await pupil
                .getByRole('textbox', {name: 'Обоснование', exact: true})
                .fill('Необходимо для разработки внутренних приложений');
        } else {
            await expect(
                pupil.getByRole('option', {name: 'TypeScript', exact: true}),
            ).toHaveCount(0);
            await pupil.getByRole('combobox', {name: 'Курс', exact: true}).click();
            await expect(
                pupil.getByRole('option', {name: 'TypeScript', exact: true}),
            ).toBeVisible();
            await check('portal-open-owner', [second[0]!]);
            await pupil.getByRole('option', {name: 'TypeScript', exact: true}).click();
            await expect(
                pupil.getByRole('option', {name: 'TypeScript', exact: true}),
            ).toHaveCount(0);
            await check('portal-closed-owner', [second[0]!]);
        }

        await next(pupil);
        await check('after-replace', third);
        await check('removed-after-replace', [second[0]!], false);
        await pupil.getByRole('button', {name: 'Сбросить', exact: true}).click();
        await check('reset', [first[0]!, second[0]!, third[0]!], false);
        await writeFile(
            resolve(directory, `dynamic-${external ? 'external' : 'internal'}.json`),
            `${JSON.stringify(rows, null, 2)}
`,
        );
        await pupil.close();
    });
}
