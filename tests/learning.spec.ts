import {expect, type Page, test} from '@playwright/test';

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

async function recordScenario(page: Page, isExternal = false): Promise<void> {
    await page.goto('/spike/record');
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
        .getByRole('button', {name: 'Выбрать признак завершения', exact: true})
        .click();
    await page.getByRole('heading', {name: 'Заявка принята', exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать черновик сценария', exact: true})
        .click();
    await page
        .getByRole('button', {name: 'Сохранить и открыть прохождение', exact: true})
        .click();
    await expect(page).toHaveURL(/\/spike\/learn$/);
}

async function startLearner(page: Page, profile: string): Promise<void> {
    await page.goto('/spike/learn');
    await select(page, 'Расположение полей', 'Другое расположение');
    await select(page, 'Поведение сервера', profile);
    await page.getByRole('button', {name: 'Начать обучение', exact: true}).click();
    await expect(
        page.getByRole('heading', {name: 'Нажмите «Новая процедура»', exact: true}),
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
        await identity(learner);
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
            learner.getByRole('heading', {name: 'Нажмите «Продолжить»', exact: true}),
        ).toBeVisible();
        release();

        if (profile === 'Потеря ответа после сохранения') {
            await expect(
                learner.getByRole('button', {name: 'Повторить', exact: true}),
            ).toBeVisible();
            await expect(
                learner.getByRole('heading', {name: 'Нажмите «Продолжить»', exact: true}),
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
    await expect(
        learner.getByText('Значение не соответствует заданию.', {exact: true}),
    ).toBeVisible();
    await expect(
        learner.getByRole('heading', {name: 'Заполните «Стоимость»', exact: true}),
    ).toBeVisible();
    await learner.getByRole('button', {name: 'Подсказка', exact: true}).click();
    await expect(
        learner.getByRole('complementary', {name: 'Панель обучения'}),
    ).toContainText('150');
    await learner.getByRole('textbox', {name: 'Стоимость', exact: true}).fill('150000');
    await learner
        .getByRole('textbox', {name: 'Дата начала', exact: true})
        .fill('15.02.2027');
    await learner.getByRole('textbox', {name: 'Обоснование', exact: true}).fill(reason);
    await expect(
        learner.getByRole('heading', {name: 'Нажмите «Продолжить»', exact: true}),
    ).toBeVisible();
    await learner.getByRole('textbox', {name: 'Обоснование', exact: true}).fill('');
    await next(learner);
    await expect(
        learner.getByText('Проверьте данные: сервер отклонил отправку.', {exact: true}),
    ).toBeVisible();
    await expect(
        learner.getByRole('heading', {name: 'Нажмите «Продолжить»', exact: true}),
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
    await learner.getByRole('button', {name: 'Начать заново', exact: true}).click();
    release();
    await delivery;
    await expect(
        learner.getByRole('combobox', {name: 'Курс', exact: true}),
    ).toBeVisible();
    await expect(
        learner.getByRole('heading', {name: 'Нажмите «Новая процедура»', exact: true}),
    ).toBeVisible();
    await expect(
        learner.getByRole('complementary', {name: 'Панель обучения'}),
    ).toContainText('Пройдено шагов: 0');
    await learner.getByRole('button', {name: 'Новая процедура', exact: true}).click();
    await expect(learner.getByRole('textbox', {name: 'ФИО', exact: true})).toHaveValue(
        '',
    );
    await expect(
        learner.getByRole('heading', {name: 'Заполните «ФИО»', exact: true}),
    ).toBeVisible();
});
