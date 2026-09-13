import {expect, test} from '@playwright/test';

import {SCENARIO_STORAGE_KEY} from '../projects/demo/src/pages/scenario-storage';

test('guide exposes only three destinations and the ready example works without JSON or a start button', async ({
    page,
}) => {
    await page.goto('/');
    await expect(
        page.getByRole('navigation', {name: 'Основная навигация'}).getByRole('link'),
    ).toHaveText(['Как пользоваться', 'Запись', 'Тренировка']);
    await expect(
        page.getByRole('heading', {name: 'Начните с готовой тренировки'}),
    ).toBeVisible();
    await page.screenshot({path: test.info().outputPath('guide.png'), fullPage: true});
    await page.evaluate(
        (key) => localStorage.setItem(key, 'keep-my-scenario'),
        SCENARIO_STORAGE_KEY,
    );
    await page
        .getByRole('link', {name: 'Попробовать готовый пример', exact: true})
        .click();
    const panel = page.getByRole('complementary', {name: 'Панель обучения'});

    await expect(
        panel.getByRole('heading', {name: 'Найдите процедуру', exact: true}),
    ).toBeVisible();

    const select = async (name: string, value: string): Promise<void> => {
        await page.getByRole('combobox', {name, exact: true}).click();
        await page.getByRole('option', {name: value, exact: true}).click();
    };

    await select('Поиск процедуры', 'Заявка на обучение');
    await expect(
        panel.getByRole('heading', {name: 'Заполните данные сотрудника', exact: true}),
    ).toBeVisible();
    await page
        .getByRole('textbox', {name: 'Рабочая почта', exact: true})
        .fill('anna@example.test');
    await select('Вид обучения', 'Внутренний курс');
    const name = page.getByRole('textbox', {name: 'ФИО', exact: true});

    await name.fill('Анна Смирнова');
    await name.press('Tab');
    const job = panel.getByRole('listitem', {name: 'Заполните «ФИО»', exact: true});

    await expect(job).toContainText('Выполнено');
    await name.fill('Ошибка');
    await name.press('Tab');
    await expect(job).toContainText('Значение не совпадает');
    await page.screenshot({
        path: test.info().outputPath('training-feedback.png'),
        fullPage: true,
    });
    await name.fill('Анна Смирнова');
    await name.press('Tab');
    await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
    await page.getByRole('switch', {name: 'Нужен наставник', exact: true}).check();
    await page.getByRole('radio', {name: 'Онлайн', exact: true}).check();
    await select('Курс', 'Angular');
    await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
    await page.getByRole('checkbox', {name: 'Данные проверены', exact: true}).check();
    await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
    await expect(
        panel.getByRole('heading', {name: 'Обучение завершено', exact: true}),
    ).toBeVisible();
    expect(
        await page.evaluate((key) => localStorage.getItem(key), SCENARIO_STORAGE_KEY),
    ).toBe('keep-my-scenario');
});

test('empty training offers a usable example and old research links lead to the guide', async ({
    page,
}) => {
    await page.goto('/spike/research');
    await expect(page).toHaveURL(/\/$/);
    await page
        .getByRole('navigation')
        .getByRole('link', {name: 'Тренировка', exact: true})
        .click();
    await expect(
        page.getByRole('heading', {name: 'Пока нет сценария для тренировки'}),
    ).toBeVisible();
    await page
        .getByRole('link', {name: 'Попробовать готовый пример', exact: true})
        .click();
    await expect(
        page
            .getByRole('complementary')
            .getByRole('heading', {name: 'Найдите процедуру', exact: true}),
    ).toBeVisible();
});

test('author chooses an earlier target action and edits expectations without JSON', async ({
    page,
}) => {
    await page.goto('/record');
    await page.getByRole('combobox', {name: 'Поиск процедуры', exact: true}).click();
    await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Анна');
    await page
        .getByRole('textbox', {name: 'Рабочая почта', exact: true})
        .fill('anna@example.test');
    await page.getByRole('textbox', {name: 'Рабочая почта', exact: true}).press('Tab');
    await page.getByRole('button', {name: 'Остановить запись', exact: true}).click();
    await page
        .getByRole('combobox', {name: 'Последнее действие сценария', exact: true})
        .click();
    await page.getByRole('option', {name: /№1 · Заполнить · ФИО/}).click();
    await expect(
        page.getByText('В сценарий войдут действия с 1 по 1.', {exact: false}),
    ).toBeVisible();
    await page
        .getByRole('button', {name: 'Выбрать результат в приложении', exact: true})
        .click();
    await page.getByRole('heading', {name: 'Данные сотрудника', exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать черновик сценария', exact: true})
        .click();
    const review = page.locator('scenario-review');

    await review
        .getByRole('textbox', {name: 'Название группы', exact: true})
        .fill('Проверка имени');
    await review
        .getByRole('textbox', {name: 'Текст задания 1', exact: true})
        .fill('Введите имя сотрудника');
    await review
        .getByRole('textbox', {name: 'Ожидаемое значение 1', exact: true})
        .fill('Борис');
    await review
        .getByRole('textbox', {name: 'Подсказка 1', exact: true})
        .fill('Введите Борис и нажмите Tab');
    await page.getByText('Дополнительно: JSON и сложные условия', {exact: true}).click();
    const source = page.getByRole('textbox', {name: 'JSON сценария', exact: true});

    await source.fill(
        (await source.inputValue()).replace(
            'Введите Борис и нажмите Tab',
            'Борис, затем Tab',
        ),
    );
    await expect(
        review.getByRole('textbox', {name: 'Подсказка 1', exact: true}),
    ).toHaveValue('Борис, затем Tab');
    await page.getByText('Дополнительно: JSON и сложные условия', {exact: true}).click();
    await expect(
        page.getByRole('list', {name: 'Записанные действия'}).getByRole('listitem'),
    ).toHaveCount(2);
    await page.screenshot({path: test.info().outputPath('editor.png'), fullPage: true});
    await page
        .getByRole('button', {name: 'Сохранить и открыть прохождение', exact: true})
        .click();
    await expect(page).toHaveURL(/\/learn$/);
    await page.getByRole('combobox', {name: 'Поиск процедуры', exact: true}).click();
    await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    await expect(
        page.getByRole('heading', {name: 'Проверка имени', exact: true}),
    ).toBeVisible();
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Борис');
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).press('Tab');
    await expect(
        page.getByRole('heading', {name: 'Обучение завершено', exact: true}),
    ).toBeVisible();
});
