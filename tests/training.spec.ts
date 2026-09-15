import {expect, test} from '@playwright/test';

test('record, edit feedback, publish and learn with blur errors and a verified transition', async ({
    page,
}) => {
    await page.goto('/record');
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await page.locator('#surname').fill('Смирнова');
    await page.locator('#department').click();
    await page.getByRole('option', {name: 'Поддержка', exact: true}).click();
    await page.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(page.locator('#goal')).toBeVisible();
    await page.getByRole('button', {name: 'Завершить запись', exact: true}).click();
    await page.getByText('Настроить тренировку', {exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать ожидания из записи', exact: true})
        .click();
    await page
        .getByRole('textbox', {name: 'Ошибка: Фамилия', exact: true})
        .fill('Проверьте фамилию по заданию');
    await page
        .getByRole('button', {name: 'Сохранить сценарий для ученика', exact: true})
        .click();
    await page.getByRole('link', {name: 'Перейти к тренировке', exact: true}).click();
    await expect(page.locator('#surname')).toBeVisible();
    await page.locator('#surname').fill('Неверно');
    await page.waitForTimeout(600);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.locator('#department').click();
    await expect(page.getByRole('alert')).toContainText('Проверьте фамилию по заданию');
    await page.getByRole('option', {name: 'Поддержка', exact: true}).click();
    await page.locator('#surname').fill('Смирнова');
    await page.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(page.getByRole('status')).toHaveText('Тренировка завершена');
    await page.reload();
    await expect(page.locator('#surname')).toHaveValue('');
    await expect(page.getByText('Тренировка завершена', {exact: true})).toHaveCount(0);
});

test('typed ComboBox text records after blur and can be published', async ({page}) => {
    await page.goto('/record');
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await page.locator('#employee').fill('Анна Смирнова');
    await page.getByRole('button', {name: 'Завершить запись', exact: true}).click();
    await page.getByText('Настроить тренировку', {exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать ожидания из записи', exact: true})
        .click();
    await expect(
        page.getByRole('textbox', {name: 'Ожидание: Сотрудник', exact: true}),
    ).toHaveValue('Анна Смирнова');
    await expect(
        page.getByRole('button', {name: 'Сохранить сценарий для ученика', exact: true}),
    ).toBeEnabled();
    await page
        .getByRole('textbox', {name: 'Ошибка: Сотрудник', exact: true})
        .fill('Проверьте сотрудника');
    await page
        .getByRole('button', {name: 'Сохранить сценарий для ученика', exact: true})
        .click();
    await page.getByRole('link', {name: 'Перейти к тренировке', exact: true}).click();
    await expect(
        page.getByText('Экран 1 из 1. Выполнено полей: 0 из 1.', {exact: true}),
    ).toBeVisible();
    await page.locator('#employee').fill('Мария Петрова');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.locator('#surname').click();
    await expect(page.getByRole('alert')).toContainText('Проверьте сотрудника');
    await page.locator('#employee').fill('Анна Смирнова');
    await expect(page.getByText('Тренировка завершена', {exact: true})).toHaveCount(0);
    await page.locator('#surname').click();
    await expect(page.getByRole('status')).toHaveText('Тренировка завершена');
});

test('wrong branch alerts once and returning to the expected screen allows completion', async ({
    page,
}) => {
    const scenario = {
        kind: 'training-state-scenario',
        version: 1,
        steps: [
            {
                key: 'application-profile',
                task: 'Укажите фамилию',
                transitionMessage: 'Вернитесь в правильную ветку',
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
                        message: 'Неверная фамилия',
                        optional: false,
                    },
                ],
            },
            {
                key: 'application-details',
                task: 'Готово',
                transitionMessage: 'Неверный переход',
                fields: [],
            },
        ],
    };

    await page.addInitScript(
        (value) =>
            localStorage.setItem('training-observer.scenario.v1', JSON.stringify(value)),
        scenario,
    );
    await page.goto('/learn');
    await page.locator('#surname').fill('Смирнова');
    await page.getByRole('button', {name: 'Неправильный переход', exact: true}).click();
    const alerts = page.getByRole('alert');

    await expect(alerts).toContainText('Вернитесь в правильную ветку');
    await page.waitForTimeout(650);
    await expect(alerts).toHaveCount(1);
    await page.getByRole('button', {name: 'Назад', exact: true}).click();
    await expect(page.locator('#surname')).toHaveValue('Смирнова');
    await expect(
        page.getByText('Экран 1 из 2. Выполнено полей: 1 из 1.', {exact: true}),
    ).toBeVisible();
    await alerts.getByRole('button').click();
    await page.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(page.getByRole('status')).toHaveText('Тренировка завершена');
    await expect(alerts).toHaveCount(0);
});

test('entering a screen does not alert on untouched checkboxes; changing an answer still alerts', async ({
    page,
}) => {
    const fields = [
        {id: 'reviewed', label: 'Данные проверены'},
        {id: 'terms', label: 'Условия согласованы'},
    ].map(({id, label}) => ({
        descriptor: {
            kind: 'checkbox',
            label,
            id,
            tagName: 'input',
            role: 'checkbox',
            context: [],
        },
        expected: true,
        message: `Проверьте ${label}`,
        optional: false,
    }));

    const scenario = {
        kind: 'training-state-scenario',
        version: 1,
        steps: [
            {
                key: 'application-profile',
                task: '',
                transitionMessage: 'Неверный переход',
                fields: [],
            },
            {
                key: 'application-details',
                task: '',
                transitionMessage: 'Неверный переход',
                fields: [],
            },
            {
                key: 'application-review',
                task: 'Поставьте отметки',
                transitionMessage: 'Заполните поля',
                fields,
            },
        ],
    };

    await page.addInitScript(
        (value) =>
            localStorage.setItem('training-observer.scenario.v1', JSON.stringify(value)),
        scenario,
    );
    await page.goto('/learn');
    // Проверяем checkbox на вошедшем экране; быстрые переходы до первого снимка — отдельный сценарий.
    await expect(
        page.getByText('Экран 1 из 3. Выполнено полей: 0 из 0.', {exact: true}),
    ).toBeVisible();
    await expect(page.getByText('Ожидаем доступный экран.', {exact: true})).toHaveCount(
        0,
    );
    await page.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(page.locator('#goal')).toBeVisible();
    await expect(
        page.getByText('Экран 2 из 3. Выполнено полей: 0 из 0.', {exact: true}),
    ).toBeVisible();
    await page.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(page.locator('#reviewed')).toBeVisible();
    await page.waitForTimeout(650);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText('Тренировка завершена', {exact: true})).toHaveCount(0);
    await page.locator('#reviewed').check();
    await expect(
        page.getByText('Экран 3 из 3. Выполнено полей: 1 из 2.', {exact: true}),
    ).toBeVisible();
    await page.locator('#reviewed').uncheck();
    await expect(page.getByRole('alert')).toContainText('Проверьте Данные проверены');
    await page.locator('#reviewed').check();
    await page.locator('#terms').check();
    await expect(page.getByRole('status')).toHaveText('Тренировка завершена');
});

test('admin records initial choices and final radio state; learner must also preserve unchecked fields', async ({
    page,
}) => {
    await page.goto('/record');
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await page.getByRole('button', {name: 'Далее', exact: true}).click();
    const journal = page.getByRole('region', {name: 'Журнал записи'});

    await expect(journal).toContainText('Нужна практика');
    await page.getByRole('radio', {name: 'Электронный', exact: true}).check();
    await page.getByRole('button', {name: 'Завершить запись', exact: true}).click();
    await page.getByText('Настроить тренировку', {exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать ожидания из записи', exact: true})
        .click();
    await page
        .getByRole('textbox', {name: 'Ошибка: Нужна практика', exact: true})
        .fill('Практику включать не нужно');
    await page
        .getByRole('button', {name: 'Сохранить сценарий для ученика', exact: true})
        .click();
    await page.getByRole('link', {name: 'Перейти к тренировке', exact: true}).click();
    await expect(
        page.getByText('Экран 1 из 2. Выполнено полей: 0 из 0.', {exact: true}),
    ).toBeVisible();
    await expect(page.getByText('Ожидаем доступный экран.', {exact: true})).toHaveCount(
        0,
    );
    await page.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(
        page.getByText('Экран 2 из 2. Выполнено полей: 2 из 3.', {exact: true}),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('checkbox', {name: 'Нужна практика', exact: true}).check();
    await expect(page.getByRole('alert')).toContainText('Практику включать не нужно');
    await page.getByRole('checkbox', {name: 'Нужна практика', exact: true}).uncheck();
    await page.getByRole('radio', {name: 'Электронный', exact: true}).check();
    await expect(page.getByRole('status')).toHaveText('Тренировка завершена');
});
