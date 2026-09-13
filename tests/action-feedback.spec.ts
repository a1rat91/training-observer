import {expect, test} from '@playwright/test';

test('admin configures messages and a shielded alternative, rebuilds the scenario and sees text alerts in training', async ({
    page,
}) => {
    await page.goto('/record');
    await page.getByRole('combobox', {name: 'Поиск процедуры', exact: true}).click();
    await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    const name = page.getByRole('textbox', {name: 'ФИО', exact: true});

    await expect(name).toBeVisible();
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await name.fill('Анна');
    await name.press('Tab');
    await name.fill('Анна Смирнова');
    await name.press('Tab');
    await page
        .getByRole('textbox', {name: 'Рабочая почта', exact: true})
        .fill('anna@example.test');
    await page.getByRole('textbox', {name: 'Рабочая почта', exact: true}).press('Tab');
    await page.getByRole('button', {name: 'Остановить запись', exact: true}).click();
    await page
        .getByRole('button', {name: 'Выбрать результат в приложении', exact: true})
        .click();
    await page.getByRole('heading', {name: 'Данные сотрудника', exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать черновик сценария', exact: true})
        .click();

    await page.getByText('Группы вариантов', {exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать группу вариантов', exact: true})
        .click();
    await page
        .getByRole('textbox', {name: 'Название группы вариантов', exact: true})
        .fill('Навигация');
    const alternative = page.getByRole('button', {name: 'Продолжить', exact: true});

    await alternative.evaluate((element) => element.scrollIntoView({block: 'center'}));
    const box = await alternative.boundingBox();

    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.getByRole('button', {name: 'Готово', exact: true}).click();
    await expect(name).toHaveValue('Анна Смирнова');

    const jobs = page.locator('scenario-review .job');
    const first = jobs.nth(0);

    await first.getByText('Обратная связь и варианты', {exact: true}).click();
    await first
        .getByRole('textbox', {name: 'Сообщение об успехе', exact: true})
        .fill('<b>Имя принято</b>');
    await first
        .getByRole('textbox', {name: 'Сообщение при неверном значении', exact: true})
        .fill('Проверьте имя');
    await first.getByRole('button', {name: 'Привязать Навигация', exact: true}).click();
    await first
        .getByRole('checkbox', {name: 'Считать ошибочным вариантом', exact: true})
        .check();
    await first
        .getByRole('textbox', {name: 'Сообщение варианта', exact: true})
        .fill('Сначала заполните поля');
    const second = jobs.nth(1);

    await second.getByText('Обратная связь и варианты', {exact: true}).click();
    await second
        .getByRole('textbox', {name: 'Сообщение об успехе', exact: true})
        .fill('Почта принята');

    await page.getByRole('button', {name: 'Удалить действие 2', exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать черновик сценария', exact: true})
        .click();
    await expect(
        first.getByRole('textbox', {name: 'Сообщение об успехе', exact: true}),
    ).toHaveValue('<b>Имя принято</b>');
    await expect(
        first.getByRole('checkbox', {name: 'Считать ошибочным вариантом', exact: true}),
    ).toBeChecked();
    await page.screenshot({
        path: test.info().outputPath('configured-feedback.png'),
        fullPage: true,
    });
    await page
        .getByRole('button', {name: 'Сохранить и открыть прохождение', exact: true})
        .click();
    await expect(page).toHaveURL(/\/learn$/);
    await page.reload(); // saved v5 scenario, no in-memory draft dependency
    await page.getByRole('combobox', {name: 'Поиск процедуры', exact: true}).click();
    await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    await alternative.click();
    await expect(
        page.locator('tui-alert').filter({hasText: 'Сначала заполните поля'}),
    ).toHaveCount(1);
    await name.fill('Неверное имя');
    await expect(
        page.locator('tui-alert').filter({hasText: 'Проверьте имя'}),
    ).toHaveCount(0);
    await name.press('Tab');
    await expect(
        page.locator('tui-alert').filter({hasText: 'Проверьте имя'}),
    ).toHaveCount(1);
    await page
        .getByRole('textbox', {name: 'Рабочая почта', exact: true})
        .fill('anna@example.test');
    await page.getByRole('textbox', {name: 'Рабочая почта', exact: true}).press('Tab');
    await expect(
        page.locator('tui-alert').filter({hasText: 'Почта принята'}),
    ).toHaveCount(1);
    await name.fill('Анна');
    await name.press('Tab');
    const success = page.locator('tui-alert').filter({hasText: '<b>Имя принято</b>'});

    await expect(success).toHaveCount(1);
    await expect(success.locator('b')).toHaveCount(0); // author text never interpreted as HTML
    await expect(
        page.getByRole('heading', {name: 'Обучение завершено', exact: true}),
    ).toBeVisible();
    await page.screenshot({
        path: test.info().outputPath('learner-feedback.png'),
        fullPage: true,
    });
    await page.goto('/record');
    await expect(page.locator('tui-alert')).toHaveCount(0);
});
