import {expect, type Page, test} from '@playwright/test';
import {type StateRecording} from '@training-observer/contracts';
import {type ControlSnapshot, type DomSnapshot} from '@training-observer/core/models';

async function controls(page: Page): Promise<readonly ControlSnapshot[]> {
    return JSON.parse(
        (await page.getByTestId('procedure-table-controls').textContent()) ?? '[]',
    );
}

async function recording(page: Page): Promise<StateRecording | null> {
    return JSON.parse(
        (await page.getByTestId('procedure-table-recording').textContent()) ?? 'null',
    );
}

test.beforeEach(async ({page}) => {
    await page.goto('/procedure-player-controls');
    await expect(page.getByTestId('procedure-table-status')).toHaveText(
        'ready · table-A',
    );
});

test('a display-contents microfrontend host keeps its visible block and recording transitions', async ({
    page,
}) => {
    const before = (await controls(page)).map((control) => control.id);

    await page.getByRole('button', {name: 'Начать запись таблицы', exact: true}).click();
    await page.locator('player-procedure').evaluate((element) => {
        (element as HTMLElement).style.display = 'contents';
    });
    await expect
        .poll(async () => {
            const snapshot: DomSnapshot = JSON.parse(
                (await page.getByTestId('procedure-table-snapshot').textContent())!,
            );

            return Object.values(snapshot.nodes).find(
                (node) => node.kind === 'element' && node.tagName === 'player-procedure',
            )?.visible;
        })
        .toBe(false);
    await expect(page.getByTestId('procedure-table-status')).toHaveText(
        'ready · table-A',
    );
    expect((await controls(page)).map((control) => control.id)).toEqual(before);
    await page.getByRole('button', {name: 'Сменить блок таблицы', exact: true}).click();
    await expect(page.getByTestId('procedure-table-status')).toHaveText(
        'ready · table-B',
    );
    await page
        .getByRole('button', {name: 'Завершить запись таблицы', exact: true})
        .click();
    await expect
        .poll(async () =>
            (await recording(page))?.events
                .filter((event) => event.kind === 'screen')
                .map((event) => event.screenKey),
        )
        .toEqual(['table-A', 'table-B']);
});

test('real table rows expose business labels and table chrome stays outside the data controls', async ({
    page,
}) => {
    const errors: string[] = [];

    page.on('pageerror', (error) => {
        errors.push(error.message);
    });
    await expect
        .poll(async () =>
            (await controls(page)).map((control) => control.locatorHints.id),
        )
        .toEqual([
            'row-ivan',
            'row-anna',
            'row-oleg',
            'nested-choice',
            'native-note',
            'external-amount',
        ]);
    const current = await controls(page);
    const ivan = current.find((control) => control.locatorHints.id === 'row-ivan');
    const anna = current.find((control) => control.locatorHints.id === 'row-anna');
    const nested = current.find((control) => control.locatorHints.id === 'nested-choice');

    expect(ivan).toMatchObject({
        kind: 'radio',
        source: 'procedure-player',
        label: 'Иван Иванов Менеджер',
        state: {checked: true},
    });
    expect(anna).toMatchObject({
        kind: 'radio',
        source: 'procedure-player',
        label: 'Анна Смирнова Разработчик',
        state: {checked: false},
    });
    expect(nested).toMatchObject({
        kind: 'radio',
        source: 'procedure-player',
        label: 'Вложенная строка',
    });
    expect(
        current.find((control) => control.locatorHints.id === 'native-note'),
    ).toMatchObject({kind: 'textbox', source: 'native'});
    expect(
        current.find((control) => control.locatorHints.id === 'external-amount'),
    ).toMatchObject({kind: 'number', source: 'taiga-ui'});
    const saved: DomSnapshot = JSON.parse(
        (await page.getByTestId('procedure-table-snapshot').textContent()) ?? '{}',
    );

    expect(saved.nodes[ivan!.hostNodeId]).toMatchObject({kind: 'element', tagName: 'tr'});
    expect(errors).toEqual([]);
});

test('radio selection updates both rows while disabled rows and nested groups stay independent', async ({
    page,
}) => {
    const initial = (await controls(page)).find(
        (control) => control.locatorHints.id === 'row-anna',
    );

    await page.locator('#row-anna').check();
    await expect
        .poll(async () =>
            (await controls(page))
                .filter((control) => control.state.checked)
                .map((control) => control.locatorHints.id),
        )
        .toEqual(['row-anna']);
    await page.locator('#nested-choice').check();
    await expect
        .poll(async () =>
            (await controls(page))
                .filter((control) => control.state.checked)
                .map((control) => control.locatorHints.id),
        )
        .toEqual(['row-anna', 'nested-choice']);
    await expect(page.locator('#row-oleg')).toBeDisabled();
    expect(
        (await controls(page)).find((control) => control.locatorHints.id === 'row-oleg')
            ?.state.disabled,
    ).toBe(true);
    await page.locator('#table-search').fill('Анна');
    await page.locator('#table-sort').click();
    await page.locator('#table-next').click();
    expect(
        (await controls(page)).find((control) => control.locatorHints.id === 'row-anna')
            ?.id,
    ).toBe(initial?.id);
    expect(await controls(page)).toHaveLength(6);
    await expect(page.getByTestId('procedure-table-error')).toBeEmpty();
});

test('configless recording stores row choices and block transitions without table chrome', async ({
    page,
}) => {
    await page.getByRole('button', {name: 'Начать запись таблицы'}).click();
    await page.locator('#row-anna').check();
    await expect
        .poll(async () =>
            (await recording(page))?.events.some(
                (event) => event.field?.id === 'row-anna' && event.value === true,
            ),
        )
        .toBe(true);
    await page.locator('#table-search').fill('Поиск');
    await page.locator('#table-page-size').selectOption('20');
    await page.locator('#table-next').click();
    await page.getByRole('button', {name: 'Сменить блок таблицы'}).click();
    await expect(page.getByTestId('procedure-table-status')).toHaveText(
        'ready · table-B',
    );
    await page.getByRole('button', {name: 'Завершить запись таблицы'}).click();
    await expect(page.getByRole('button', {name: 'Начать запись таблицы'})).toBeEnabled();
    const saved = await recording(page);

    expect(saved?.complete).toBe(true);
    expect(
        saved?.events
            .filter((event) => event.kind === 'screen')
            .map((event) => event.screenKey),
    ).toEqual(['table-A', 'table-B']);
    expect(
        saved?.events.filter((event) => event.field?.id?.startsWith('table-')),
    ).toEqual([]);
    expect(
        saved?.events.find((event) => event.field?.id === 'row-anna')?.field?.label,
    ).toBe('Анна Смирнова Разработчик');
});
