import {expect, test} from '@playwright/test';

for (const mode of ['record', 'learn']) {
    test(`a competing owner in an unobserved MF prevents Taiga option credit in ${mode}`, async ({
        page,
    }) => {
        await page.goto(mode === 'record' ? '/record' : '/learn?example=1');

        if (mode === 'record') {
            await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
        } else {
            await expect(
                page.getByRole('heading', {name: 'Найдите процедуру', exact: true}),
            ).toBeVisible();
        }

        const search = page.getByRole('combobox', {name: 'Поиск процедуры', exact: true});

        await search.click();
        await expect(
            page.getByRole('option', {name: 'Заявка на обучение', exact: true}),
        ).toBeVisible();
        const controls = await search.getAttribute('aria-controls');

        expect(controls).toBeTruthy();
        // Fault injection only: a disabled neighbor claims the real Taiga popup's existing ID.
        await page
            .locator('directory-mf input')
            .evaluate(
                (element, id) => element.setAttribute('aria-controls', id!),
                controls,
            );
        await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
        await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toBeVisible();

        if (mode === 'record') {
            await page
                .getByRole('button', {name: 'Остановить запись', exact: true})
                .click();
            await expect(
                page.getByRole('list', {name: 'Записанные действия'}),
            ).not.toContainText('Выбор ·');
            await expect(page.getByRole('alert')).toContainText(
                'единственного доказанного владельца',
            );
        } else {
            await expect(
                page.getByRole('heading', {name: 'Найдите процедуру', exact: true}),
            ).toBeVisible();
            await expect(
                page.getByRole('heading', {
                    name: 'Заполните данные сотрудника',
                    exact: true,
                }),
            ).toHaveCount(0);
        }

        // The app itself is not blocked. Clearing the competing relation permits a fresh choice.
        await page
            .locator('directory-mf input')
            .evaluate((element) => element.removeAttribute('aria-controls'));

        if (mode === 'record') {
            await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
        }

        await page
            .locator('procedure-search-mf')
            .getByRole('button', {name: 'Clear', exact: true})
            .click();
        await expect(search).toHaveValue('');
        await search.press('Escape');
        await expect(page.getByRole('option')).toHaveCount(0);
        await search.click();
        await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();

        if (mode === 'record') {
            await expect(
                page.getByRole('list', {name: 'Записанные действия'}),
            ).toContainText('Выбор ·');
        } else {
            await expect(
                page.getByRole('heading', {
                    name: 'Заполните данные сотрудника',
                    exact: true,
                }),
            ).toBeVisible();
        }
    });
}
