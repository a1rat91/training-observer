import {expect, type Page, test} from '@playwright/test';

import {
    type ControlSnapshot,
    type MicrofrontendSnapshot,
} from '../libs/training-observer/src';

test.use({trace: 'off'});

async function controls(page: Page): Promise<ControlSnapshot[]> {
    return JSON.parse((await page.getByTestId('controls-json').textContent()) ?? '[]');
}

async function control(page: Page, id: string): Promise<ControlSnapshot | undefined> {
    return (await controls(page)).find((item) => item.locatorHints.id === id);
}

async function start(page: Page): Promise<void> {
    await page.goto('/controls');
    await expect
        .poll(async () => (await control(page, 'delivery-email'))?.state.checked)
        .toBe(true);
}

test('real Taiga Radio and Switch retain individual labels and native states', async ({
    page,
}) => {
    await start(page);
    expect(await control(page, 'delivery-email')).toMatchObject({
        kind: 'radio',
        source: 'taiga-ui',
        label: 'Электронная почта',
        state: {checked: true, value: 'email', required: true},
        locatorHints: {
            role: 'radio',
            name: 'delivery',
            context: expect.arrayContaining([
                {tagName: 'fieldset', id: 'delivery-group', label: 'Способ доставки'},
            ]),
        },
    });
    expect(await control(page, 'delivery-sms')).toMatchObject({
        kind: 'radio',
        label: 'SMS',
        state: {checked: false, value: 'sms'},
    });
    expect(await control(page, 'delivery-paper')).toMatchObject({
        kind: 'radio',
        label: 'Бумажное письмо',
        state: {disabled: true, checked: false},
        pointerActionable: false,
    });
    expect(await control(page, 'auto-save')).toMatchObject({
        kind: 'switch',
        source: 'taiga-ui',
        label: 'Автосохранение',
        state: {checked: false},
        locatorHints: {role: 'switch'},
    });
    expect((await control(page, 'auto-save'))?.state.value).toBeUndefined();
    expect((await control(page, 'auto-save'))?.state.indeterminate).toBeUndefined();
});

test('radio mouse and keyboard selection updates both options; switch supports Space', async ({
    page,
}) => {
    await start(page);
    await page.getByText('Radio и Switch', {exact: true}).click();
    await page.getByLabel('SMS', {exact: true}).check();
    await expect
        .poll(async () => (await control(page, 'delivery-email'))?.state.checked)
        .toBe(false);
    await expect
        .poll(async () => (await control(page, 'delivery-sms'))?.state.checked)
        .toBe(true);
    await page.locator('#delivery-sms').press('ArrowLeft');
    await expect
        .poll(async () => (await control(page, 'delivery-email'))?.state.checked)
        .toBe(true);
    await page.locator('#auto-save').press('Space');
    await expect
        .poll(async () => (await control(page, 'auto-save'))?.state.checked)
        .toBe(true);
});

test('silent radio and switch property writes are reconciled', async ({page}) => {
    await start(page);
    await page.evaluate(() => {
        document.querySelector('#delivery-sms')!.checked = true;
        document.querySelector('#auto-save')!.checked = true;
    });
    await expect
        .poll(async () => (await control(page, 'delivery-sms'))?.state.checked)
        .toBe(true);
    await expect
        .poll(async () => (await control(page, 'delivery-email'))?.state.checked)
        .toBe(false);
    await expect
        .poll(async () => (await control(page, 'auto-save'))?.state.checked)
        .toBe(true);
});

test('radio and switch labels resolve for, wrapping labels and ARIA without using the group legend', async ({
    page,
}) => {
    await start(page);
    await page.getByTestId('observed-page').evaluate((root) =>
        root.insertAdjacentHTML(
            'beforeend',
            `
        <fieldset><legend>Название группы</legend>
            <label for="radio-for">Первый вариант</label><input id="radio-for" type="radio" name="labels" value="first">
            <input id="radio-aria" type="radio" name="labels" value="second" aria-label="Второй вариант">
            <span id="switch-label">Переключатель с ARIA</span>
            <input id="switch-aria" type="checkbox" role="switch" aria-labelledby="switch-label">
            <label><input id="switch-wrapped" type="checkbox" switch>Переключатель с label</label>
        </fieldset>`,
        ),
    );
    await expect
        .poll(async () => (await control(page, 'radio-for'))?.label)
        .toBe('Первый вариант');
    expect((await control(page, 'radio-aria'))?.label).toBe('Второй вариант');
    expect(await control(page, 'switch-aria')).toMatchObject({
        kind: 'switch',
        source: 'native',
        label: 'Переключатель с ARIA',
    });
    expect((await control(page, 'switch-wrapped'))?.label).toBe('Переключатель с label');
    await page.locator('#switch-label').evaluate((node) => {
        node.textContent = 'Обновлённая подпись';
    });
    await expect
        .poll(async () => (await control(page, 'switch-aria'))?.label)
        .toBe('Обновлённая подпись');
});

test('radio and switch inherit availability; a switch never becomes tri-state', async ({
    page,
}) => {
    await start(page);
    await page.getByTestId('observed-page').evaluate((root) =>
        root.insertAdjacentHTML(
            'beforeend',
            `
        <fieldset disabled><legend>Недоступные настройки</legend>
            <label><input id="disabled-radio" type="radio" name="disabled">Недоступный вариант</label>
            <label><input id="disabled-switch" type="checkbox" role="switch">Недоступный переключатель</label>
        </fieldset>
        <div inert><label><input id="inert-switch" type="checkbox" role="switch">Инертный переключатель</label></div>`,
        ),
    );
    await expect
        .poll(async () => (await control(page, 'disabled-radio'))?.state.disabled)
        .toBe(true);
    expect((await control(page, 'disabled-switch'))?.pointerActionable).toBe(false);
    expect((await control(page, 'inert-switch'))?.state.inert).toBe(true);
    await page.locator('#disabled-switch').evaluate((input: HTMLInputElement) => {
        input.indeterminate = true;
    });
    await page.waitForTimeout(650);
    expect((await control(page, 'disabled-switch'))?.state.indeterminate).toBeUndefined();
});

test('a radio group split across microfrontends updates peers and resets through an external form without polling', async ({
    page,
}) => {
    await page.goto('/controls?fixture=microfrontends');
    await page.getByLabel('Сверка свойств, мс').fill('0');
    await page.getByRole('button', {name: 'Применить интервал', exact: true}).click();
    await page.evaluate(() => {
        document.body.insertAdjacentHTML(
            'beforeend',
            '<form id="shared-form"></form><form id="other-form"></form>',
        );
        document
            .querySelector('#mf-profile')!
            .insertAdjacentHTML(
                'beforeend',
                '<label><input id="peer-a" type="radio" name="plan" form="shared-form" value="basic" checked required>Базовый</label>',
            );
        document
            .querySelector('#mf-employment')!
            .insertAdjacentHTML(
                'beforeend',
                '<label><input id="peer-b" type="radio" name="plan" form="shared-form" value="pro" required>Расширенный</label>',
            );
        document
            .querySelector('#mf-address')!
            .insertAdjacentHTML(
                'beforeend',
                '<label><input id="peer-other" type="radio" name="plan" form="other-form" checked>Другая форма</label>',
            );
    });
    const areas = async (): Promise<MicrofrontendSnapshot[]> =>
        JSON.parse((await page.getByTestId('mf-json').textContent()) ?? '[]');

    const field = async (
        id: string,
    ): Promise<import('@training-observer/core/models').ControlSnapshot | undefined> =>
        (await areas())
            .flatMap((area) => area.logicalControls)
            .find((item) => item.locatorHints.id === id);

    await expect.poll(async () => (await field('peer-a'))?.state.checked).toBe(true);
    await page.waitForTimeout(800);
    const other = (await areas()).find((area) => area.name === 'address')!;

    await page.locator('#peer-b').check();
    await expect.poll(async () => (await field('peer-b'))?.state.checked).toBe(true);
    await expect.poll(async () => (await field('peer-a'))?.state.checked).toBe(false);
    expect((await field('peer-other'))?.state.checked).toBe(true);
    expect((await areas()).find((area) => area.id === other.id)?.scanCount).toBe(
        other.scanCount,
    );

    await page.locator('#shared-form').evaluate((form: HTMLFormElement) => form.reset());
    await expect.poll(async () => (await field('peer-a'))?.state.checked).toBe(true);
    await expect.poll(async () => (await field('peer-b'))?.state.checked).toBe(false);
    expect((await areas()).find((area) => area.id === other.id)?.scanCount).toBe(
        other.scanCount,
    );
});
