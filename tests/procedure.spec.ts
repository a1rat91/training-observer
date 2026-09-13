import {expect, type Page, test} from '@playwright/test';

async function select(page: Page, label: string, option: string): Promise<void> {
    await page.getByRole('combobox', {name: label, exact: true}).click();
    await page.getByRole('option', {name: option, exact: true}).click();
}

async function start(
    page: Page,
    layout = 'Обычное расположение',
    profile = 'Обычный ответ',
): Promise<void> {
    await page.goto('/record');
    await select(page, 'Поиск процедуры', 'Заявка на обучение');
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toBeVisible();
    await page.getByText('Условия тестового прохождения', {exact: true}).click();
    await select(page, 'Расположение полей', layout);
    await select(page, 'Поведение сервера', profile);
    await page.getByRole('button', {name: 'Новая процедура', exact: true}).click();
    await expect(
        page.getByRole('form', {name: 'Данные сотрудника', exact: true}),
    ).toBeVisible();
}

async function identity(page: Page, kind = 'Внутренний курс'): Promise<void> {
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Анна Смирнова');
    await page
        .getByRole('textbox', {name: 'Рабочая почта', exact: true})
        .fill('anna@example.test');
    await select(page, 'Вид обучения', kind);
}

async function next(page: Page): Promise<void> {
    await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
}

for (const layout of ['Обычное расположение', 'Другое расположение']) {
    test(`internal procedure: real HTTP append/replace and completion (${layout})`, async ({
        page,
    }) => {
        const errors: string[] = [];

        page.on('pageerror', (error) => errors.push(error.message));
        await start(page, layout);
        await identity(page);
        const original = await page
            .getByRole('textbox', {name: 'ФИО', exact: true})
            .elementHandle();

        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });

        await page.route('**/api/procedures/*/actions', async (route) => {
            await gate;
            await route.continue();
        });
        const responsePromise = page.waitForResponse(
            (response) =>
                response.url().endsWith('/actions') && response.status() === 200,
        );

        await next(page);
        await expect(page.getByRole('status')).toHaveText('Ожидаем ответ сервера…');
        await expect(page.getByRole('combobox', {name: 'Курс', exact: true})).toHaveCount(
            0,
        );
        release();
        const response = await (await responsePromise).json();

        expect(response.render).toBe('append');
        expect(response.revision).toBe(2);
        await expect(
            page.getByRole('combobox', {name: 'Курс', exact: true}),
        ).toBeVisible();
        expect(await original.evaluate((element) => element.isConnected)).toBe(true);
        await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toHaveValue(
            'Анна Смирнова',
        );
        await expect(
            page.getByRole('textbox', {name: 'ФИО', exact: true}),
        ).toBeDisabled();
        await expect(
            page.getByRole('textbox', {name: 'Организатор', exact: true}),
        ).toHaveCount(0);
        await select(page, 'Курс', 'Angular');
        await page.getByRole('radio', {name: 'Онлайн', exact: true}).check();
        await page.getByRole('switch', {name: 'Нужен наставник', exact: true}).check();
        const reviewPromise = page.waitForResponse(
            (entry) => entry.url().endsWith('/actions') && entry.status() === 200,
        );

        await next(page);
        const review = await (await reviewPromise).json();

        expect(review.values.course).toBe('angular');
        expect(review.values.attendance).toBe('online');
        expect(review.values.mentor).toBe(true);
        expect(review.render).toBe('replace');
        await expect(
            page.getByRole('form', {name: 'Подтверждение заявки', exact: true}),
        ).toBeVisible();
        expect(await original.evaluate((element) => element.isConnected)).toBe(false);
        await next(page);
        await expect(page.getByRole('alert')).toContainText(
            'Заполните обязательное поле',
        );
        await expect(page.getByRole('heading', {name: 'Заявка принята'})).toHaveCount(0);
        await page.getByRole('checkbox', {name: 'Данные проверены', exact: true}).check();
        await next(page);
        await expect(
            page.getByRole('heading', {name: 'Заявка принята', exact: true}),
        ).toBeVisible();
        await expect(page.getByRole('form')).toHaveCount(0);
        expect(errors).toEqual([]);
    });
}

test('external: number/date wire values, 422, correction, back and branch reset', async ({
    page,
}) => {
    await start(page);
    await identity(page, 'Внешний курс');
    await next(page);
    await page
        .getByRole('textbox', {name: 'Организатор', exact: true})
        .fill('Учебный центр');
    await page.getByRole('textbox', {name: 'Стоимость', exact: true}).fill('150000');
    await page
        .getByRole('textbox', {name: 'Дата начала', exact: true})
        .fill('15.02.2027');
    const failedPromise = page.waitForResponse(
        (entry) => entry.url().endsWith('/actions') && entry.status() === 422,
    );

    await next(page);
    const failed = await failedPromise;

    expect(failed.request().postDataJSON().values.cost).toBe(150000);
    expect(failed.request().postDataJSON().values.startDate).toBe('2027-02-15');
    expect((await failed.json()).revision).toBe(2);
    await expect(
        page.getByText(
            'Для стоимости свыше 100 000 ₽ укажите обоснование не короче 20 символов',
        ),
    ).toBeVisible();
    await expect(
        page.getByRole('textbox', {name: 'Организатор', exact: true}),
    ).toHaveValue('Учебный центр');
    await expect(
        page.getByRole('checkbox', {name: 'Данные проверены', exact: true}),
    ).toHaveCount(0);
    await page
        .getByRole('textbox', {name: 'Обоснование', exact: true})
        .fill('Обучение необходимо для разработки внутренних приложений');
    await next(page);
    await expect(
        page.getByRole('form', {name: 'Подтверждение заявки', exact: true}),
    ).toBeVisible();
    await page.getByRole('button', {name: 'Назад', exact: true}).click();
    await expect(
        page.getByRole('textbox', {name: 'Организатор', exact: true}),
    ).toHaveValue('Учебный центр');
    await page.getByRole('button', {name: 'Назад', exact: true}).click();
    await expect(
        page.getByRole('form', {name: 'Данные сотрудника', exact: true}),
    ).toBeVisible();
    await select(page, 'Вид обучения', 'Внутренний курс');
    await next(page);
    await expect(page.getByRole('combobox', {name: 'Курс', exact: true})).toBeVisible();
    await expect(
        page.getByRole('textbox', {name: 'Организатор', exact: true}),
    ).toHaveCount(0);
});

for (const profile of ['Сбой перед сохранением', 'Потеря ответа после сохранения']) {
    test(`retry keeps requestId and applies one transition: ${profile}`, async ({
        page,
    }) => {
        await start(page, 'Обычное расположение', profile);
        await identity(page);
        const failedPromise = page.waitForResponse(
            (entry) => entry.url().endsWith('/actions') && entry.status() === 503,
        );

        await next(page);
        const failed = await failedPromise;

        await expect(
            page.getByRole('button', {name: 'Повторить', exact: true}),
        ).toBeVisible();
        await expect(page.getByRole('combobox', {name: 'Курс', exact: true})).toHaveCount(
            0,
        );
        const successPromise = page.waitForResponse(
            (entry) => entry.url().endsWith('/actions') && entry.status() === 200,
        );

        await page.getByRole('button', {name: 'Повторить', exact: true}).click();
        const success = await successPromise;

        expect(success.request().postDataJSON()).toEqual(failed.request().postDataJSON());
        expect((await success.json()).revision).toBe(2);
        await expect(
            page.getByRole('combobox', {name: 'Курс', exact: true}),
        ).toBeVisible();
    });
}

test('reset cancels delayed response; new session does not inherit stale fields', async ({
    page,
}) => {
    await start(page, 'Обычное расположение', 'Медленный ответ');
    await identity(page, 'Внешний курс');
    let release!: () => void;
    let observed!: () => void;
    let delivered!: () => void;
    const delivery = new Promise<void>((resolve) => {
        delivered = resolve;
    });

    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });

    const received = new Promise<void>((resolve) => {
        observed = resolve;
    });

    await page.route('**/api/procedures/*/actions', async (route) => {
        const response = await route.fetch();

        observed();
        await gate;
        await route.fulfill({response});
        delivered();
    });
    await next(page);
    await received;
    await page.getByRole('button', {name: 'Сбросить', exact: true}).click();
    await page.getByRole('button', {name: 'Новая процедура', exact: true}).click();
    await expect(
        page.getByRole('form', {name: 'Данные сотрудника', exact: true}),
    ).toBeVisible();
    release();
    await delivery;
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toHaveValue('');
    await expect(
        page.getByRole('textbox', {name: 'Организатор', exact: true}),
    ).toHaveCount(0);
});

test('external course completes in the alternate layout', async ({page}) => {
    await start(page, 'Другое расположение');
    await identity(page, 'Внешний курс');
    await next(page);
    await page
        .getByRole('textbox', {name: 'Организатор', exact: true})
        .fill('Учебный центр');
    await page.getByRole('textbox', {name: 'Стоимость', exact: true}).fill('50000');
    await page
        .getByRole('textbox', {name: 'Дата начала', exact: true})
        .fill('15.02.2027');
    await next(page);
    await expect(
        page.getByRole('form', {name: 'Подтверждение заявки', exact: true}),
    ).toBeVisible();
    await page.getByRole('checkbox', {name: 'Данные проверены', exact: true}).check();
    const completion = page.waitForResponse(
        (response) => response.url().endsWith('/actions') && response.status() === 200,
    );

    await next(page);
    expect((await (await completion).json()).state).toBe('completed');
    await expect(
        page.getByRole('heading', {name: 'Заявка принята', exact: true}),
    ).toBeVisible();
});
