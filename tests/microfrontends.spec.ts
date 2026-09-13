import {expect, test} from '@playwright/test';

for (const route of ['/record', '/learn']) {
    test(`search mounts an independent HTTP player on ${route}`, async ({page}) => {
        const errors: string[] = [];

        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(route);
        await page
            .getByText('Соседние приложения — для проверки изоляции', {exact: true})
            .click();
        const player = page.locator('microfrontend > procedure-mf');
        const search = page.getByRole('combobox', {name: 'Поиск процедуры', exact: true});

        await expect(player).toHaveCount(0);
        await search.fill('несуществующая');
        await expect(page.getByRole('option')).toHaveCount(0);
        await expect(player).toHaveCount(0);
        await search.fill('Заявка на обучение');
        await expect(player).toHaveCount(0);
        await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
        await expect(
            player.getByRole('textbox', {name: 'ФИО', exact: true}),
        ).toBeVisible();
        await player.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Анна');
        const old = await player.elementHandle();

        await page.getByRole('textbox', {name: 'Поиск', exact: true}).fill('Борис');
        await page.getByRole('button', {name: 'Открыть карточку'}).click();
        await page.getByText('Эксперименты с микрофронтами', {exact: true}).click();
        await page.getByRole('button', {name: 'Переставить соседей'}).click();
        await expect(player.getByRole('textbox', {name: 'ФИО', exact: true})).toHaveValue(
            'Анна',
        );
        await expect(page.locator('directory-mf')).toContainText(
            'Карточка сотрудника: Борис Иванов',
        );
        await page.getByRole('button', {name: 'Пересоздать плеер'}).click();
        await expect(player.getByRole('textbox', {name: 'ФИО', exact: true})).toHaveValue(
            '',
        );
        expect(await old.evaluate((element) => element.isConnected)).toBe(false);
        await page.getByRole('button', {name: 'Скрыть плеер'}).click();
        await expect(player).toHaveCount(0);
        await page.getByRole('button', {name: 'Показать плеер'}).click();
        await expect(
            player.getByRole('textbox', {name: 'ФИО', exact: true}),
        ).toBeVisible();
        await page
            .locator('procedure-search-mf')
            .getByRole('button', {name: 'Clear'})
            .click();
        await expect(player).toHaveCount(0);
        expect(errors).toEqual([]);
    });
}

test('switching procedure cancels the old player and ignores its late response', async ({
    page,
}) => {
    await page.goto('/record');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });

    let entered!: () => void;
    const received = new Promise<void>((resolve) => {
        entered = resolve;
    });

    let delivered!: () => void;
    const delivery = new Promise<void>((resolve) => {
        delivered = resolve;
    });

    let requests = 0;

    await page.route('**/api/procedures', async (route) => {
        requests++;

        if (requests === 1) {
            const response = await route.fetch();

            entered();
            await gate;
            await route.fulfill({response}).catch(() => {});
            delivered();
        } else {
            await route.continue();
        }
    });
    const search = page.getByRole('combobox', {name: 'Поиск процедуры', exact: true});

    await search.click();
    await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    await received;
    await expect(page.getByRole('option')).toHaveCount(0);
    await search.fill('медленный');
    await page
        .getByRole('option', {name: 'Заявка на обучение — медленный сервер', exact: true})
        .click();
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toBeVisible();
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Новый сеанс');
    release();
    await delivery;
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toHaveValue(
        'Новый сеанс',
    );
    await expect(page.locator('microfrontend > procedure-mf')).toHaveCount(1);
});
