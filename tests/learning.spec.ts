import {readFile} from 'node:fs/promises';

import {expect, type Page, test} from '@playwright/test';

import {parseRecording, parseScenario} from '../libs/training-observer/src/contracts';

async function select(page: Page, name: string, option: string): Promise<void> {
    await page.getByRole('combobox', {name, exact: true}).click();
    await page.getByRole('option', {name: option, exact: true}).click();
}

async function next(page: Page): Promise<void> {
    await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
}

async function identity(page: Page, external = false): Promise<void> {
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Анна Смирнова');
    await page
        .getByRole('textbox', {name: 'Рабочая почта', exact: true})
        .fill('anna@example.test');
    await select(page, 'Вид обучения', external ? 'Внешний курс' : 'Внутренний курс');
}

const reason = 'Обучение необходимо для разработки внутренних приложений';

async function internal(page: Page): Promise<void> {
    await select(page, 'Курс', 'Angular');
    await page.getByRole('radio', {name: 'Онлайн', exact: true}).check();
    await page.getByRole('switch', {name: 'Нужен наставник', exact: true}).check();
}

async function external(page: Page): Promise<void> {
    await page
        .getByRole('textbox', {name: 'Организатор', exact: true})
        .fill('Учебный центр');
    await page.getByRole('textbox', {name: 'Стоимость', exact: true}).fill('150000');
    await page
        .getByRole('textbox', {name: 'Дата начала', exact: true})
        .fill('15.02.2027');
    await page.getByRole('textbox', {name: 'Обоснование', exact: true}).fill(reason);
}

async function complete(page: Page): Promise<void> {
    await page.getByRole('checkbox', {name: 'Данные проверены', exact: true}).check();
    await next(page);
    await expect(
        page.getByRole('heading', {name: 'Заявка принята', exact: true}),
    ).toBeVisible();
}

async function groupBoundaries(page: Page): Promise<void> {
    const diagnostics = page.getByText('Настройки записи и диагностика', {exact: true});

    if (
        !(await page
            .getByRole('button', {name: 'Скачать запись', exact: true})
            .isVisible())
    ) {
        await diagnostics.click();
    }

    const downloaded = page.waitForEvent('download');

    await page.getByRole('button', {name: 'Скачать запись', exact: true}).click();
    const recording = parseRecording(
        await readFile(await (await downloaded).path(), 'utf8'),
    );

    await expect(
        page.getByText('Экраны обучения и переходы', {exact: true}),
    ).toBeVisible();

    // These are explicit boundaries of this fixture, never a library heuristic.
    for (const action of recording.actions.filter((entry) => entry.kind === 'click')) {
        await page
            .getByRole('checkbox', {name: `Переход ${action.id}`, exact: true})
            .check();
    }

    // Exercise the result selector as an author; the first transition starts the form.
    const first = recording.actions.find((action) => action.kind === 'click')!;
    const result = page.getByRole('combobox', {
        name: `Результат действия ${first.sequence}`,
        exact: true,
    });

    const title = await result.inputValue();

    await result.click();
    await page.getByRole('option', {name: title, exact: true}).click();
    await expect(result).toHaveValue(title);
}

async function identityReverse(page: Page): Promise<void> {
    await select(page, 'Вид обучения', 'Внутренний курс');
    await page
        .getByRole('textbox', {name: 'Рабочая почта', exact: true})
        .fill('anna@example.test');
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Анна Смирнова');
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).press('Tab');
}

async function recordScenario(page: Page, isExternal = false): Promise<void> {
    await page.goto('/record');
    await page.getByText('Настройки записи и диагностика', {exact: true}).click();
    await select(page, 'Поиск процедуры', 'Заявка на обучение');
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toBeVisible();
    await page.getByText('Условия тестового прохождения', {exact: true}).click();
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await page.getByRole('button', {name: 'Новая процедура', exact: true}).click();
    await identity(page, isExternal);
    await next(page);

    if (isExternal) {
        await external(page);
    } else {
        await internal(page);
    }

    await next(page);
    await complete(page);
    await page.getByRole('button', {name: 'Остановить запись', exact: true}).click();
    await page
        .getByRole('button', {name: 'Выбрать результат в приложении', exact: true})
        .click();
    await page.getByRole('heading', {name: 'Заявка принята', exact: true}).click();
    await groupBoundaries(page);
    await page
        .getByRole('button', {name: 'Создать черновик сценария', exact: true})
        .click();
    await page
        .getByRole('button', {name: 'Сохранить и открыть прохождение', exact: true})
        .click();
    await expect(page).toHaveURL(/\/learn$/);
}

async function startLearner(page: Page, profile: string): Promise<void> {
    await page.goto('/learn');
    await page.getByText('Управление тренировкой', {exact: true}).click();
    await page.getByText('Импорт другого сценария', {exact: true}).click();
    await select(page, 'Поиск процедуры', 'Заявка на обучение');
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toBeVisible();
    await page.getByText('Условия тестового прохождения', {exact: true}).click();
    await select(page, 'Расположение полей', 'Другое расположение');
    await select(page, 'Поведение сервера', profile);
    await page.getByRole('button', {name: 'Применить JSON', exact: true}).click();
    await expect(
        page
            .getByRole('list', {name: 'Переходы группы'})
            .getByText(/Выполните переход: «Новая процедура»/),
    ).toBeVisible();
    await page.getByRole('button', {name: 'Новая процедура', exact: true}).click();
}

for (const profile of ['Медленный ответ', 'Потеря ответа после сохранения']) {
    test(`record → JSON → new document → learner with changed layout: ${profile}`, async ({
        page,
        context,
    }) => {
        test.setTimeout(60000);
        await recordScenario(page);
        const learner = await context.newPage();
        const errors: string[] = [];

        learner.on('pageerror', (error) => errors.push(error.message));
        await page.close();
        await startLearner(learner, profile);
        await identityReverse(learner);
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });

        await learner.route('**/api/procedures/*/actions', async (route) => {
            await gate;
            await route.continue();
        });
        await next(learner);
        await expect(
            learner.getByRole('heading', {name: 'Ожидаем подтверждение', exact: true}),
        ).toBeVisible();
        await expect(
            learner
                .getByRole('list', {name: 'Переходы группы'})
                .getByText(/Выполните переход: «Продолжить»/),
        ).toBeVisible();
        release();

        if (profile === 'Потеря ответа после сохранения') {
            await expect(
                learner.getByRole('button', {name: 'Повторить', exact: true}),
            ).toBeVisible();
            await expect(
                learner
                    .getByRole('list', {name: 'Переходы группы'})
                    .getByText(/Выполните переход: «Продолжить»/),
            ).toBeVisible();
            await learner.getByRole('button', {name: 'Повторить', exact: true}).click();
        }

        await expect(
            learner.getByRole('heading', {name: 'Заполните «Курс»', exact: true}),
        ).toBeVisible();
        await learner.screenshot({
            path: test.info().outputPath('learner.png'),
            fullPage: true,
        });
        await internal(learner);
        await next(learner);
        await complete(learner);
        await expect(
            learner.getByRole('heading', {name: 'Обучение завершено', exact: true}),
        ).toBeVisible();
        expect(errors).toEqual([]);
    });
}

test('wrong value and server 422 cannot advance the learner; correction completes external branch', async ({
    page,
    context,
}) => {
    test.setTimeout(60000);
    await recordScenario(page, true);
    const learner = await context.newPage();

    await page.close();
    await startLearner(learner, 'Обычный ответ');
    await identity(learner, true);
    await next(learner);
    await learner
        .getByRole('textbox', {name: 'Организатор', exact: true})
        .fill('Учебный центр');
    await learner.getByRole('textbox', {name: 'Стоимость', exact: true}).fill('50000');
    await learner.getByRole('textbox', {name: 'Стоимость', exact: true}).press('Tab');
    await expect(
        learner.getByText('Значение не соответствует заданию.', {exact: true}),
    ).toBeVisible();
    await expect(
        learner.getByRole('heading', {name: 'Заполните «Стоимость»', exact: true}),
    ).toBeVisible();
    await learner
        .getByRole('listitem', {name: 'Заполните «Стоимость»', exact: true})
        .getByText('Подсказка', {exact: true})
        .click();
    await expect(
        learner.getByRole('complementary', {name: 'Панель обучения'}),
    ).toContainText('150');
    await learner.getByRole('textbox', {name: 'Стоимость', exact: true}).fill('150000');
    await learner
        .getByRole('textbox', {name: 'Дата начала', exact: true})
        .fill('15.02.2027');
    await learner.getByRole('textbox', {name: 'Обоснование', exact: true}).fill(reason);
    await learner.getByRole('textbox', {name: 'Обоснование', exact: true}).press('Tab');
    await expect(
        learner
            .getByRole('list', {name: 'Переходы группы'})
            .getByText(/Выполните переход: «Продолжить»/),
    ).toBeVisible();
    await learner.getByRole('textbox', {name: 'Обоснование', exact: true}).fill('');
    await next(learner);
    await expect(
        learner.getByText('Проверьте данные: сервер отклонил отправку.', {exact: true}),
    ).toBeVisible();
    await expect(
        learner
            .getByRole('list', {name: 'Переходы группы'})
            .getByText(/Выполните переход: «Продолжить»/),
    ).toBeVisible();
    await learner.getByRole('textbox', {name: 'Обоснование', exact: true}).fill(reason);
    await next(learner);
    await complete(learner);
    await expect(
        learner.getByRole('heading', {name: 'Обучение завершено', exact: true}),
    ).toBeVisible();
});

test('late response after stop cannot advance a freshly started learner', async ({
    page,
    context,
}) => {
    test.setTimeout(60000);
    await recordScenario(page);
    const learner = await context.newPage();

    await page.close();
    await startLearner(learner, 'Обычный ответ');
    await identity(learner);
    let release!: () => void;
    let observed!: () => void;
    let delivered!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });

    const received = new Promise<void>((resolve) => {
        observed = resolve;
    });

    const delivery = new Promise<void>((resolve) => {
        delivered = resolve;
    });

    await learner.route('**/api/procedures/*/actions', async (route) => {
        const response = await route.fetch();

        observed();
        await gate;
        await route.fulfill({response});
        delivered();
    });
    await next(learner);
    await received;
    await learner.getByRole('button', {name: 'Остановить обучение', exact: true}).click();
    await expect(
        learner.getByRole('heading', {name: 'Обучение остановлено', exact: true}),
    ).toBeVisible();
    await learner.getByRole('button', {name: 'Применить JSON', exact: true}).click();
    release();
    await delivery;
    await expect(
        learner.getByRole('combobox', {name: 'Курс', exact: true}),
    ).toBeVisible();
    await expect(
        learner
            .getByRole('list', {name: 'Переходы группы'})
            .getByText(/Выполните переход: «Новая процедура»/),
    ).toBeVisible();
    await expect(
        learner.getByRole('complementary', {name: 'Панель обучения'}),
    ).toContainText('Выполнено заданий: 0');
    await learner.getByRole('button', {name: 'Новая процедура', exact: true}).click();
    await expect(learner.getByRole('textbox', {name: 'ФИО', exact: true})).toHaveValue(
        '',
    );
    await expect(
        learner.getByRole('heading', {name: 'Заполните «ФИО»', exact: true}),
    ).toBeVisible();
});

test('recording JSON pasted into learner can be prepared without recording actions again', async ({
    page,
}) => {
    await page.goto('/record');
    await page.getByText('Настройки записи и диагностика', {exact: true}).click();
    await select(page, 'Поиск процедуры', 'Заявка на обучение');
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toBeVisible();
    await page.getByText('Условия тестового прохождения', {exact: true}).click();
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await page.getByRole('button', {name: 'Новая процедура', exact: true}).click();
    await identity(page);
    await next(page);
    await internal(page);
    await next(page);
    await complete(page);
    await page.getByRole('button', {name: 'Остановить запись', exact: true}).click();
    const pending = page.waitForEvent('download');

    await page.getByRole('button', {name: 'Скачать запись', exact: true}).click();
    const recording = parseRecording(
        await readFile(await (await pending).path(), 'utf8'),
    );

    await page.goto('/learn');
    await page.getByText('Управление тренировкой', {exact: true}).click();
    await page.getByText('Импорт другого сценария', {exact: true}).click();
    await select(page, 'Поиск процедуры', 'Заявка на обучение');
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toBeVisible();
    await page.getByText('Условия тестового прохождения', {exact: true}).click();
    await page
        .getByRole('textbox', {name: 'JSON сценария', exact: true})
        .fill(JSON.stringify(recording));
    await page.getByRole('button', {name: 'Применить JSON', exact: true}).click();
    await expect(page.getByRole('alert')).toContainText(
        'Это запись действий, а не учебный сценарий',
    );
    await expect(
        page.getByRole('button', {name: 'Остановить обучение', exact: true}),
    ).toBeDisabled();
    await page
        .getByRole('button', {name: 'Подготовить сценарий из записи', exact: true})
        .click();
    await expect(page).toHaveURL(/\/record$/);
    await expect(
        page.getByRole('status').filter({hasText: 'Запись импортирована'}),
    ).toBeVisible();
    await expect(
        page.getByRole('list', {name: 'Записанные действия'}).getByRole('listitem'),
    ).toHaveCount(recording.actions.length);
    // Recreate only the visible success evidence; the imported action log remains untouched.
    await select(page, 'Поиск процедуры', 'Заявка на обучение');
    await page.getByRole('button', {name: 'Новая процедура', exact: true}).click();
    await identity(page);
    await next(page);
    await internal(page);
    await next(page);
    await complete(page);
    await expect(
        page.getByRole('list', {name: 'Записанные действия'}).getByRole('listitem'),
    ).toHaveCount(recording.actions.length);
    await page
        .getByRole('button', {name: 'Выбрать результат в приложении', exact: true})
        .click();
    await page.getByRole('heading', {name: 'Заявка принята', exact: true}).click();
    await groupBoundaries(page);
    await page
        .getByRole('button', {name: 'Создать черновик сценария', exact: true})
        .click();
    const firstBoundary = page.getByRole('checkbox', {
        name: `Переход ${recording.actions.find((action) => action.kind === 'click')!.id}`,
        exact: true,
    });

    await firstBoundary.uncheck();
    await expect(
        page.getByRole('button', {name: 'Сохранить и открыть прохождение', exact: true}),
    ).toBeDisabled();
    await firstBoundary.check();
    await page
        .getByRole('button', {name: 'Создать черновик сценария', exact: true})
        .click();
    const download = page.waitForEvent('download');

    await page.getByRole('button', {name: 'Скачать сценарий', exact: true}).click();
    const scenario = parseScenario(await readFile(await (await download).path(), 'utf8'));

    expect(scenario.kind).toBe('training-scenario');
    expect(scenario.version).toBe(4);

    if (scenario.version !== 4) {
        throw new Error('Expected grouped scenario');
    }

    expect(scenario.groups).toHaveLength(4);
    expect(
        scenario.groups.flatMap((group) => [...group.expectations, ...group.transitions]),
    ).toHaveLength(recording.actions.length);
    await page
        .getByRole('button', {name: 'Сохранить и открыть прохождение', exact: true})
        .click();
    await select(page, 'Поиск процедуры', 'Заявка на обучение');
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toBeVisible();

    await expect(
        page.getByRole('heading', {name: 'Выполните задание', exact: true}),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
});
