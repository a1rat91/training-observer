import {expect, test} from '@playwright/test';

test('admin records blur and transitions, Stop includes the last edit and reload keeps the journal', async ({
    page,
}) => {
    await page.goto('/record');
    const field = page.locator('#surname');
    const journal = page.getByRole('region', {name: 'Журнал записи'});

    await field.fill('До записи');
    await field.press('Tab');
    await expect(journal).toHaveCount(0);
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await field.fill('Смирнова');
    await expect(journal).not.toContainText('Смирнова');
    await field.press('Tab');
    await expect(journal).toContainText('Фамилия — Смирнова');
    await page.locator('#department').click();
    await page.getByRole('option', {name: 'Поддержка', exact: true}).click();
    await expect(journal).not.toContainText('Подразделение — Поддержка');
    await page.locator('#employee').fill('Анна');
    await expect(journal).toContainText('Подразделение — Поддержка');
    await page.getByRole('option', {name: 'Анна Смирнова', exact: true}).click();
    await expect(journal).not.toContainText('Сотрудник — Анна Смирнова');
    await page.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(journal).toContainText('application-details');
    // Training records displayed ComboBox text after blur, without requiring selection evidence.
    await expect(journal).toContainText('Сотрудник — Анна Смирнова');
    await expect(journal).not.toContainText('В записи есть пропуски наблюдения');
    await page.locator('#goal').fill('Последний ответ');
    await page.getByRole('button', {name: 'Завершить запись', exact: true}).click();
    await expect(page.getByText('Запись завершена', {exact: true})).toBeVisible();
    await expect(journal).toContainText('Цель обучения — Последний ответ');
    await expect(journal).not.toContainText('До записи');
    await journal.getByText('JSON записи', {exact: true}).click();
    const saved = await page.getByRole('textbox', {name: 'JSON записи'}).inputValue();

    await page.reload();
    await expect(journal).toContainText('Последний ответ');
    await journal.getByText('JSON записи', {exact: true}).click();
    await expect(page.getByRole('textbox', {name: 'JSON записи'})).toHaveValue(saved);
    await page.getByRole('link', {name: 'Тренировка', exact: true}).click();
    await expect(
        page.getByText('Сначала создайте и сохраните сценарий в админке.'),
    ).toBeVisible();
});

test('damaged storage is reported without crashing and a new recording replaces it', async ({
    page,
}) => {
    await page.addInitScript(() =>
        localStorage.setItem('training-observer.state-recording.v1', '{"broken":true}'),
    );
    await page.goto('/record');
    await expect(page.getByRole('alert')).toContainText('Не удалось прочитать');
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await page.getByRole('button', {name: 'Завершить запись', exact: true}).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
});
