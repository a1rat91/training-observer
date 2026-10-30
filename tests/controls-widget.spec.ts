import {expect, test} from '@playwright/test';

test('floating widget shares live values, blur confirmations and block transitions with the session', async ({
    page,
}) => {
    await page.goto('/record');
    const widget = page.getByRole('region', {name: 'Текущие контролы', exact: true});
    const surname = widget.locator('[data-control-id="surname"]');

    await expect(widget.getByRole('heading', {level: 2})).toHaveText('Контролы · 6');
    await expect(widget).toBeVisible();
    expect(await widget.boundingBox()).toMatchObject({width: 200, height: 300});
    await page.locator('#surname').fill('Первое значение');
    await expect(surname).toContainText('Сейчас: Первое значение');
    await expect(surname).toContainText('Ожидает выхода из поля');
    await page.locator('#surname').press('Tab');
    await expect(surname).toContainText('После blur: Первое значение');
    await page.locator('#surname').fill('Второе значение');
    await expect(surname).toContainText('Сейчас: Второе значение');
    await expect(surname).toContainText('После blur: Первое значение');
    await page.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(widget.getByRole('heading', {level: 2})).toHaveText('Контролы · 9');
    await expect(surname).toHaveCount(0);
    await expect(widget.locator('[data-control-id="goal"]')).toContainText(
        'Цель обучения',
    );
});

test('TuiPan moves the widget by its header and the portal remains fixed during scrolling', async ({
    page,
}) => {
    await page.goto('/record');
    const widget = page.getByRole('region', {name: 'Текущие контролы', exact: true});
    const handle = widget.getByTitle('Перетащить виджет');

    await expect(handle).toBeVisible();
    const before = (await widget.boundingBox())!;
    const header = (await handle.boundingBox())!;
    const start = {x: header.x + header.width / 2, y: header.y + header.height / 2};

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - 220, start.y - 140, {steps: 15});
    await page.mouse.up();
    await expect
        .poll(async () => (await widget.boundingBox())!.x)
        .toBeLessThan(before.x - 150);
    const moved = (await widget.boundingBox())!;

    expect(moved.y).toBeLessThan(before.y - 90);
    await page.locator('#surname').focus();
    await page.locator('#surname').press('Escape');
    await expect(widget).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect
        .poll(async () => (await widget.boundingBox())!.y)
        .toBeCloseTo(moved.y, 0);
    expect(await widget.boundingBox()).toMatchObject({width: 200, height: 300});
});

test('widget is excluded from observation and is removed with its route owner', async ({
    page,
}) => {
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/record');
    const widget = page.getByRole('region', {name: 'Текущие контролы', exact: true});
    const inspector = page.getByRole('complementary', {name: 'Распознанный экран'});

    await expect(widget.getByRole('heading', {level: 2})).toHaveText('Контролы · 6');
    const snapshot = await inspector.locator('pre').textContent();

    expect(snapshot).not.toContain('Текущие контролы');
    expect(snapshot).not.toContain('tc-controls-widget');
    await page.getByRole('link', {name: 'Тренировка', exact: true}).click();
    await expect(widget).toHaveCount(0);
    await page.getByRole('link', {name: 'Запись', exact: true}).click();
    await expect(widget).toHaveCount(1);
    await expect(widget.getByRole('heading', {level: 2})).toHaveText('Контролы · 6');
    expect(errors).toEqual([]);
});

test('widget discovers late microfrontends and keeps group confirmations independent', async ({
    page,
}) => {
    await page.goto('/record');
    const widget = page.getByRole('region', {name: 'Текущие контролы', exact: true});

    await expect(widget.getByRole('heading', {level: 2})).toHaveText('Контролы · 6');
    await page.evaluate(() => {
        const boundary = document.createElement('microfrontend');

        boundary.id = 'widget-peer-boundary';
        boundary.innerHTML =
            '<peer-app><input id="peer-answer" aria-label="Ответ соседнего микрофронта" /></peer-app>';
        document
            .querySelector('procedure-player')!
            .closest('microfrontend')!
            .after(boundary);
    });
    const peer = widget
        .locator('.mf-group')
        .filter({has: page.getByRole('heading', {level: 3, name: /peer-app/})});

    await expect(widget.getByRole('heading', {level: 3})).toHaveCount(2);
    await expect(widget.getByRole('heading', {level: 2})).toHaveText('Контролы · 7');
    await page.locator('#peer-answer').fill('Соседний ответ');
    await expect(peer).toContainText('Сейчас: Соседний ответ');
    await page.locator('#surname').focus();
    await expect(peer).toContainText('После blur: Соседний ответ');
    await expect(widget.locator('[data-control-id="surname"]')).toContainText(
        'Ожидает выхода из поля',
    );
    await page.evaluate(() => document.querySelector('#widget-peer-boundary')!.remove());
    await expect(widget.getByRole('heading', {level: 3})).toHaveCount(1);
    await expect(widget.getByRole('heading', {level: 2})).toHaveText('Контролы · 6');
});

test('widget tracks native and real Taiga selects in a peer microfrontend without block-id', async ({
    page,
}) => {
    await page.goto('/record');
    await page.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(page.locator('#course')).toBeVisible();
    await page.evaluate(() => {
        const boundary = document.createElement('microfrontend');
        const peer = document.createElement('customer-settings');

        peer.innerHTML = `<label for="peer-select">Тип клиента</label>
            <select id="peer-select"><option value="person">Физическое лицо</option>
            <option value="company">Организация</option></select>`;
        peer.append(document.querySelector('#course')!.closest('tui-textfield')!);
        boundary.append(peer);
        document
            .querySelector('procedure-player')!
            .closest('microfrontend')!
            .after(boundary);
    });
    const widget = page.getByRole('region', {name: 'Текущие контролы', exact: true});
    const peer = widget.locator('.mf-group').filter({
        has: page.getByRole('heading', {level: 3, name: /customer-settings/}),
    });

    const player = widget.locator('.mf-group').filter({
        has: page.getByRole('heading', {level: 3, name: /procedure-player/}),
    });

    await expect(widget.getByRole('heading', {level: 3})).toHaveCount(2);
    await expect(peer.locator('.control')).toHaveCount(2);
    await expect(peer.locator('[data-control-id="course"]')).toContainText('select');
    await expect(player.locator('[data-control-id="goal"]')).toBeVisible();
    await page.locator('#peer-select').selectOption('company');
    await expect(peer.locator('[data-control-id="peer-select"]')).toContainText(
        'Сейчас: Организация',
    );
    await page.locator('#course').click();
    await page.getByRole('option', {name: 'TypeScript', exact: true}).click();
    await expect(peer.locator('[data-control-id="course"]')).toContainText(
        'Сейчас: TypeScript',
    );
    await page.locator('#goal').fill('Ответ в плеере');
    await expect(peer.locator('[data-control-id="course"]')).toContainText(
        'После blur: TypeScript',
    );
    await expect(player.locator('[data-control-id="goal"]')).toContainText(
        'Сейчас: Ответ в плеере',
    );
});

test('production wrapper structure discovers search before the player and a nested widget owner', async ({
    page,
}) => {
    await page.goto('/record');
    const widget = page.getByRole('region', {name: 'Текущие контролы', exact: true});

    await expect(widget.getByRole('heading', {level: 2})).toHaveText('Контролы · 6');
    await page.evaluate(() => {
        const player = document.querySelector('procedure-player')!;
        const boundary = player.closest('microfrontend')!;
        const playerRoot = document.createElement('app-procedure');
        const search = document.createElement('tcs-procedure-search-select-mf');
        const sandbox = document.createElement('microfrontend-sandbox');

        boundary.append(playerRoot);
        playerRoot.append(player);
        // Sanitized structure from observed-page.html; no application credentials or URLs.
        search.innerHTML = `<microfrontend>
            <tcs-procedure-search-select>
                <div><tui-textfield>
                    <input id="production-search" role="combobox" tuitextfield=""
                        aria-expanded="false" aria-haspopup="listbox"
                        aria-controls="production-search-popup"
                        placeholder="Найти процедуру..." />
                    <span class="t-content">
                        <button type="button" tuiiconbutton="" class="t-clear">Очистить</button>
                    </span>
                </tui-textfield></div>
            </tcs-procedure-search-select>
        </microfrontend>`;
        sandbox.innerHTML = `<microfrontend-playground>
            <microfrontend-area-render>
                <microfrontend-strict class="microfrontend">
                    <microfrontend data-version="unknown_version">
                        <tc-mf-training-control><tc-training-control><tc-training-control-v2>
                        </tc-training-control-v2></tc-training-control></tc-mf-training-control>
                    </microfrontend>
                </microfrontend-strict>
            </microfrontend-area-render>
        </microfrontend-playground>`;
        boundary.before(search);
        boundary.after(sandbox);
        sandbox
            .querySelector('tc-training-control-v2')!
            .append(document.querySelector('tc-controls-widget')!);
    });
    const groups = widget.locator('.mf-group');

    await expect(groups.locator('h3')).toHaveText([
        /tcs-procedure-search-select/,
        /app-procedure/,
        /tc-mf-training-control/,
    ]);
    await expect(widget.getByRole('heading', {level: 2})).toHaveText('Контролы · 7');
    await expect(groups.nth(0).locator('.control')).toHaveCount(1);
    await expect(groups.nth(1).locator('.control')).toHaveCount(6);
    await expect(groups.nth(2).locator('.control')).toHaveCount(0);
    await page.locator('#production-search').fill('Поиск процедуры');
    await expect(groups.nth(0)).toContainText('Сейчас: Поиск процедуры');
    await page.locator('#surname').fill('Ответ в плеере');
    await expect(groups.nth(0)).toContainText('После blur: Поиск процедуры');
    await expect(groups.nth(1).locator('[data-control-id="surname"]')).toContainText(
        'Сейчас: Ответ в плеере',
    );
});
