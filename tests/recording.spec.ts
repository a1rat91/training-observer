import {expect, test} from '@playwright/test';
import {type StateRecording} from '@training-observer/contracts';

for (const eventName of ['blur', 'focusout'] as const) {
    test(`a ${eventName} handler reusing the input cannot replace the departing block answer`, async ({
        page,
    }) => {
        await page.goto('/record');
        await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
        const field = page.locator('#surname');

        await field.fill('Ответ старого блока');
        await field.evaluate((element, name) => {
            const input = element as HTMLInputElement;

            input.addEventListener(
                name,
                () => {
                    input
                        .closest('[block-id]')!
                        .setAttribute('block-id', 'reused-input-block');
                    input.value = 'Предзаполнение нового блока';
                },
                {once: true},
            );
        }, eventName);
        await page.locator('#employee').focus();
        await expect(page.getByRole('region', {name: 'Журнал записи'})).toContainText(
            'reused-input-block',
        );
        await page.getByRole('button', {name: 'Завершить запись', exact: true}).click();
        await page.getByText('JSON записи', {exact: true}).click();
        const saved: StateRecording = JSON.parse(
            await page.getByRole('textbox', {name: 'JSON записи'}).inputValue(),
        );

        expect(
            saved.events.find(
                (event) => event.kind === 'value' && event.field.id === 'surname',
            ),
        ).toMatchObject({
            screenKey: 'application-profile',
            value: 'Ответ старого блока',
        });
    });
}

test('autofocus into the reused input on the next block preserves the departing answer', async ({
    page,
}) => {
    await page.goto('/record');
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await page.locator('#surname').fill('Сохранённый ответ');
    await page.evaluate(() => {
        const target = document.createElement('button');

        target.type = 'button';
        target.textContent = 'Внешняя цель фокуса';
        target.addEventListener(
            'focus',
            () => {
                const input = document.querySelector<HTMLInputElement>('#surname')!;

                input.closest('[block-id]')!.setAttribute('block-id', 'autofocus-block');
                input.value = 'Новое предзаполнение';
                input.focus();
            },
            {once: true},
        );
        document.querySelector('main > header')!.append(target);
        target.focus();
    });
    await expect(page.locator('#surname')).toBeFocused();
    await expect(page.getByRole('region', {name: 'Журнал записи'})).toContainText(
        'Фамилия — Сохранённый ответ',
    );
});

test('refocusing and typing before the batch capture does not confirm the resumed edit', async ({
    page,
}) => {
    await page.goto('/record');
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    const field = page.locator('#surname');
    const journal = page.getByRole('region', {name: 'Журнал записи'});

    await field.fill('Подтверждённый ответ');
    await field.evaluate(async (element) => {
        const input = element as HTMLInputElement;

        input.blur();
        await Promise.resolve();
        input.focus();
        input.value = 'Редактирование без нового blur';
        input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await expect(journal).toContainText('Фамилия — Подтверждённый ответ');
    await expect(journal).not.toContainText('Редактирование без нового blur');
    await page.locator('#employee').focus();
    await expect(journal).toContainText('Фамилия — Редактирование без нового blur');
});

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
