import {readFile} from 'node:fs/promises';

import {expect, test} from '@playwright/test';

const scenario = {
    kind: 'training-state-scenario',
    version: 1,
    steps: [
        {
            key: 'application-profile',
            task: 'Введите фамилию',
            transitionMessage: 'Останьтесь на этом экране',
            fields: [
                {
                    descriptor: {
                        kind: 'textbox',
                        label: 'Фамилия',
                        id: 'surname',
                        tagName: 'input',
                        role: 'textbox',
                        context: [],
                    },
                    expected: 'Смирнова',
                    message: 'Проверьте фамилию',
                    successMessage: 'Ответ верный',
                    optional: false,
                },
            ],
        },
    ],
};

const upload = (value: unknown): {name: string; mimeType: string; buffer: Buffer} => ({
    name: 'scenario.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
});

test('import without a recording supports preview, editing, export and training in a fresh browser', async ({
    page,
    browser,
}) => {
    await page.goto('/record');
    await page.getByText('Настроить тренировку', {exact: true}).click();
    await expect(
        page.getByRole('button', {name: 'Скачать сценарий', exact: true}),
    ).toBeDisabled();
    await page.getByLabel('Файл сценария', {exact: true}).setInputFiles(upload(scenario));
    await expect(
        page.getByText('application-profile — ожиданий: 1', {exact: true}),
    ).toBeVisible();
    expect(
        await page.evaluate(() => localStorage.getItem('training-observer.scenario.v1')),
    ).toBeNull();
    await page
        .getByRole('button', {name: 'Импортировать и заменить сценарий', exact: true})
        .click();
    await expect(
        page.getByRole('textbox', {name: 'Ожидание: Фамилия', exact: true}),
    ).toHaveValue('Смирнова');
    await page
        .getByRole('textbox', {name: 'Ожидание: Фамилия', exact: true})
        .fill('Петрова');
    // Экспорт использует публикацию, пока черновик не сохранён.
    const firstDownload = page.waitForEvent('download');

    await page.getByRole('button', {name: 'Скачать сценарий', exact: true}).click();
    const original = await firstDownload;

    expect(JSON.parse(await readFile(await original.path(), 'utf8'))).toEqual(scenario);
    await page
        .getByRole('button', {name: 'Сохранить сценарий для ученика', exact: true})
        .click();
    const secondDownload = page.waitForEvent('download');

    await page.getByRole('button', {name: 'Скачать сценарий', exact: true}).click();
    const downloaded = await secondDownload;

    expect(downloaded.suggestedFilename()).toBe('training-scenario.json');
    const path = await downloaded.path();
    const context = await browser.newContext();

    try {
        const fresh = await context.newPage();

        await fresh.goto(new URL('/record', page.url()).href);
        await fresh.getByText('Настроить тренировку', {exact: true}).click();
        await fresh.getByLabel('Файл сценария', {exact: true}).setInputFiles({
            name: downloaded.suggestedFilename(),
            mimeType: 'application/json',
            buffer: await readFile(path),
        });
        await fresh
            .getByRole('button', {name: 'Импортировать и заменить сценарий', exact: true})
            .click();
        await fresh.reload();
        await fresh.getByText('Настроить тренировку', {exact: true}).click();
        await expect(
            fresh.getByRole('textbox', {name: 'Ожидание: Фамилия', exact: true}),
        ).toHaveValue('Петрова');
        await fresh.goto(new URL('/learn', page.url()).href);
        await fresh.locator('#surname').fill('Петрова');
        await fresh.locator('#employee').click();
        await expect(fresh.getByRole('status')).toHaveText('Тренировка завершена');
        await expect(fresh.getByRole('alert')).toContainText('Ответ верный');
    } finally {
        await context.close();
    }
});

test('invalid file, version and recording leave publication and editor intact', async ({
    page,
}) => {
    await page.goto('/record');
    await page.getByText('Настроить тренировку', {exact: true}).click();
    const input = page.getByLabel('Файл сценария', {exact: true});

    await input.setInputFiles(upload(scenario));
    await page
        .getByRole('button', {name: 'Импортировать и заменить сценарий', exact: true})
        .click();
    await page
        .getByRole('textbox', {name: 'Ожидание: Фамилия', exact: true})
        .fill('Черновик');
    const before = await page.evaluate(() =>
        localStorage.getItem('training-observer.scenario.v1'),
    );

    for (const file of [
        {name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{')},
        upload({...scenario, version: 99}),
        upload({
            kind: 'training-state-recording',
            version: 1,
            complete: true,
            events: [],
        }),
        upload({
            ...scenario,
            steps: [
                {
                    ...scenario.steps[0],
                    fields: [{...scenario.steps[0]!.fields[0], successMessage: 42}],
                },
            ],
        }),
    ]) {
        await input.setInputFiles(file);
        await expect(
            page.getByRole('region', {name: 'Перенос сценария'}).getByRole('alert'),
        ).toBeVisible();
        await expect(
            page.getByRole('button', {
                name: 'Импортировать и заменить сценарий',
                exact: true,
            }),
        ).toHaveCount(0);
        expect(
            await page.evaluate(() =>
                localStorage.getItem('training-observer.scenario.v1'),
            ),
        ).toBe(before);
        await expect(
            page.getByRole('textbox', {name: 'Ожидание: Фамилия', exact: true}),
        ).toHaveValue('Черновик');
    }
});

test('storage failure does not replace the draft or report a successful import', async ({
    page,
}) => {
    await page.goto('/record');
    await page.getByText('Настроить тренировку', {exact: true}).click();
    await page.getByLabel('Файл сценария', {exact: true}).setInputFiles(upload(scenario));
    await page.evaluate(() => {
        Storage.prototype.setItem = () => {
            throw new DOMException('Full', 'QuotaExceededError');
        };
    });
    await page
        .getByRole('button', {name: 'Импортировать и заменить сценарий', exact: true})
        .click();
    await expect(page.getByRole('alert')).toHaveText('Не удалось сохранить сценарий.');
    await expect(page.getByText('Сценарий импортирован.', {exact: false})).toHaveCount(0);
    await expect(
        page.getByRole('button', {name: 'Скачать сценарий', exact: true}),
    ).toBeDisabled();
});

test('import clears local source linkage, preserves the journal and rejects oversized files', async ({
    page,
}) => {
    await page.goto('/record');
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await page.locator('#surname').fill('Местная запись');
    await page.getByRole('button', {name: 'Завершить запись', exact: true}).click();
    const journal = await page.evaluate(() =>
        localStorage.getItem('training-observer.state-recording.v1'),
    );

    await page.getByText('Настроить тренировку', {exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать ожидания из записи', exact: true})
        .click();
    await page
        .getByRole('button', {name: 'Сохранить сценарий для ученика', exact: true})
        .click();
    const input = page.getByLabel('Файл сценария', {exact: true});

    await input.setInputFiles({
        name: 'large.json',
        mimeType: 'application/json',
        buffer: Buffer.alloc(4_000_001, ' '),
    });
    await expect(
        page.getByRole('region', {name: 'Перенос сценария'}).getByRole('alert'),
    ).toContainText('4 МБ');
    await input.setInputFiles(upload(scenario));
    await page
        .getByRole('button', {name: 'Импортировать и заменить сценарий', exact: true})
        .click();
    expect(
        await page.evaluate(() =>
            localStorage.getItem('training-observer.state-recording.v1'),
        ),
    ).toBe(journal);
    await page.reload();
    await page.getByText('Настроить тренировку', {exact: true}).click();
    await expect(
        page.getByRole('textbox', {name: 'Ожидание: Фамилия', exact: true}),
    ).toHaveValue('Смирнова');
    await expect(
        page.getByRole('button', {name: 'Сохранить сценарий для ученика', exact: true}),
    ).toBeEnabled();
});
