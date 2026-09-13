import {expect, type Page, test} from '@playwright/test';

async function prepare(page: Page, recordSearch = false): Promise<void> {
    await page.goto('/record');

    if (recordSearch) {
        await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    }

    await page.getByRole('combobox', {name: 'Поиск процедуры', exact: true}).click();
    await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    const name = page.getByRole('textbox', {name: 'ФИО', exact: true});

    await expect(name).toBeVisible();

    if (!recordSearch) {
        await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    }

    await name.fill('Первое имя');
    await name.press('Tab');
    await name.fill('Последнее имя');
    await name.press('Tab');
    const email = page.getByRole('textbox', {name: 'Рабочая почта', exact: true});

    await email.fill('anna@example.test');
    await email.press('Tab');
    await page.getByRole('button', {name: 'Остановить запись', exact: true}).click();
    await page
        .getByRole('button', {name: 'Выбрать результат в приложении', exact: true})
        .click();
    await page.getByRole('heading', {name: 'Данные сотрудника', exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать черновик сценария', exact: true})
        .click();
}

test('deletion and undo rebuild final values without losing authored text; the learner accepts the edited recording', async ({
    page,
}) => {
    await prepare(page);
    const review = page.locator('scenario-review');
    const instruction = review.getByRole('textbox', {
        name: 'Текст задания 1',
        exact: true,
    });

    const expected = review.getByRole('textbox', {
        name: 'Ожидаемое значение 1',
        exact: true,
    });

    const rebuild = page.getByRole('button', {
        name: 'Создать черновик сценария',
        exact: true,
    });

    const save = page.getByRole('button', {
        name: 'Сохранить и открыть прохождение',
        exact: true,
    });

    await instruction.fill('Введите первое имя');
    await page.getByRole('button', {name: 'Удалить действие 2', exact: true}).click();
    await expect(save).toBeDisabled();
    await rebuild.click();
    await expect(instruction).toHaveValue('Введите первое имя');
    await expect(expected).toHaveValue('Первое имя');
    await page.getByRole('button', {name: 'Отменить удаление', exact: true}).click();
    await rebuild.click();
    await expect(expected).toHaveValue('Последнее имя');
    await expect(instruction).toHaveValue('Введите первое имя');
    await page.getByRole('button', {name: 'Удалить действие 2', exact: true}).click();
    await rebuild.click();
    await save.click();
    await expect(page).toHaveURL(/\/learn$/);
    await page.getByRole('combobox', {name: 'Поиск процедуры', exact: true}).click();
    await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    await page
        .getByRole('textbox', {name: 'Рабочая почта', exact: true})
        .fill('anna@example.test');
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Первое имя');
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).press('Tab');
    await expect(
        page.getByRole('heading', {name: 'Обучение завершено', exact: true}),
    ).toBeVisible();
});

test('deleting the selected end and all actions requires an explicit repair and keeps undo available', async ({
    page,
}) => {
    await prepare(page);
    const save = page.getByRole('button', {
        name: 'Сохранить и открыть прохождение',
        exact: true,
    });

    const rebuild = page.getByRole('button', {
        name: 'Создать черновик сценария',
        exact: true,
    });

    await page.getByRole('button', {name: 'Удалить действие 3', exact: true}).click();
    await expect(
        page.getByText('Последнее действие отсутствует.', {exact: false}),
    ).toBeVisible();
    await expect(save).toBeDisabled();
    await expect(rebuild).toBeDisabled();
    await page.getByRole('button', {name: 'Удалить действие 2', exact: true}).click();
    await page.getByRole('button', {name: 'Удалить действие 1', exact: true}).click();
    await expect(save).toBeDisabled();

    for (let index = 0; index < 3; index++) {
        await page.getByRole('button', {name: 'Отменить удаление', exact: true}).click();
    }

    await expect(
        page
            .getByRole('list', {name: 'Записанные действия'})
            .getByRole('button', {name: /Удалить действие/}),
    ).toHaveCount(3);
    await expect(save).toBeEnabled();
});

test('conflicting expected values require an explicit decision without losing unrelated hints', async ({
    page,
}) => {
    await prepare(page);
    const review = page.locator('scenario-review');

    await review
        .getByRole('textbox', {name: 'Ожидаемое значение 1', exact: true})
        .fill('Авторское имя');
    await review
        .getByRole('textbox', {name: 'Подсказка 2', exact: true})
        .fill('Подсказка для почты');
    await page.getByRole('button', {name: 'Удалить действие 2', exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать черновик сценария', exact: true})
        .click();
    await expect(
        page.getByRole('button', {name: 'Сохранить и открыть прохождение', exact: true}),
    ).toBeDisabled();
    await page
        .getByRole('button', {
            name: 'Использовать новую запись для конфликтов',
            exact: true,
        })
        .click();
    await expect(
        review.getByRole('textbox', {name: 'Ожидаемое значение 1', exact: true}),
    ).toHaveValue('Первое имя');
    await expect(
        review.getByRole('textbox', {name: 'Подсказка 2', exact: true}),
    ).toHaveValue('Подсказка для почты');
});

test('deleting an explicit boundary requires removal of that boundary before rebuilding', async ({
    page,
}) => {
    await prepare(page, true);
    await page
        .getByRole('checkbox', {name: /^Переход /})
        .first()
        .check();
    const rebuild = page.getByRole('button', {
        name: 'Создать черновик сценария',
        exact: true,
    });

    await rebuild.click();
    await expect(page.locator('scenario-review section')).toHaveCount(2);
    await page.getByRole('button', {name: 'Удалить действие 1', exact: true}).click();
    await expect(rebuild).toBeDisabled();
    await page.getByRole('button', {name: /^Убрать удалённую границу /}).click();
    await rebuild.click();
    await expect(page.locator('scenario-review section')).toHaveCount(1);
    await expect(
        page.getByRole('button', {name: 'Сохранить и открыть прохождение', exact: true}),
    ).toBeEnabled();
});

test('deleting a required expectation blocks rebuilding until its dependency is repaired', async ({
    page,
}) => {
    await prepare(page);
    const review = page.locator('scenario-review');

    await review
        .getByText('Выполнить после другого задания', {exact: true})
        .nth(1)
        .click();
    const dependency = review.getByRole('checkbox', {
        name: 'Заполните «ФИО»',
        exact: true,
    });

    await dependency.check();
    await page.getByRole('button', {name: 'Удалить действие 1', exact: true}).click();
    await page.getByRole('button', {name: 'Удалить действие 2', exact: true}).click();
    const rebuild = page.getByRole('button', {
        name: 'Создать черновик сценария',
        exact: true,
    });

    const save = page.getByRole('button', {
        name: 'Сохранить и открыть прохождение',
        exact: true,
    });

    await rebuild.click();
    await expect(save).toBeDisabled();
    await dependency.uncheck();
    await rebuild.click();
    await expect(review.getByRole('textbox', {name: /^Текст задания /})).toHaveCount(1);
    await expect(save).toBeEnabled();
});
