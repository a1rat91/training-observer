import {expect, test} from '@playwright/test';

test('single input logs its DOM, projection, changes and blur confirmation', async ({
    page,
}) => {
    const messages: string[] = [];

    page.on('console', (message) => {
        if (
            message.type() === 'warning' &&
            message.text().startsWith('[Input inspector]')
        ) {
            messages.push(message.text());
        }
    });
    await page.goto('/input-inspector');
    const input = page.getByRole('textbox', {name: 'Имя', exact: true});

    await expect(input).toBeVisible();
    await expect.poll(() => messages.length).toBe(2);
    const snapshot = JSON.parse(messages[0]!.split('\n').slice(1).join('\n'));
    const logical = JSON.parse(messages[1]!.split('\n').slice(1).join('\n'));

    expect(snapshot.stats.nodeCount).toBeLessThan(50);
    expect(snapshot.nodes[logical.targetNodeId].tagName).toBe('input');
    expect(logical.kind).toBe('textbox');
    expect(logical.source).toBe('taiga-ui');
    await input.fill('Анна');
    await expect
        .poll(() =>
            messages.some(
                (message) => message.includes('3. Изменение') && message.includes('Анна'),
            ),
        )
        .toBe(true);
    expect(messages.some((message) => message.includes('4. Значение'))).toBe(false);
    await input.press('Tab');
    await expect
        .poll(() =>
            messages.some(
                (message) => message.includes('4. Значение') && message.includes('Анна'),
            ),
        )
        .toBe(true);
    await page.getByRole('link', {name: 'Контролы', exact: true}).click();
    const count = messages.length;

    await page.locator('#full-name').fill('Другое поле');
    await page.locator('#full-name').press('Tab');
    expect(messages).toHaveLength(count);
});
