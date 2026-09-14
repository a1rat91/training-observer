import {expect, test} from '@playwright/test';

test('selection observed in a reopened popup survives closing and blur into the recording', async ({page}) => {
    await page.goto('/record');
    await page.getByRole('button',{name:'Начать запись',exact:true}).click();
    await page.locator('#employee').fill('Анна');
    await page.getByRole('option',{name:'Анна Смирнова',exact:true}).click();
    await page.locator('#employee').click();
    // Wait for evidence in the library snapshot, not just the rendered option.
    const inspector = page.getByRole('complementary',{name:'Распознанный экран'});
    await expect.poll(async () => {
        const state = JSON.parse(await inspector.locator('pre').textContent() ?? '{}');
        return state.controls?.find((c: any) => c.kind === 'combobox')?.choice.selection.status;
    }).toBe('observed');
    await page.locator('#employee').press('Escape');
    await page.getByRole('button',{name:'Завершить запись',exact:true}).click();
    const journal = page.getByRole('region',{name:'Журнал записи'});
    await expect(journal).toContainText('Сотрудник — Анна Смирнова');
    await expect(journal).not.toContainText('В записи есть пропуски');
});

test('retyping invalidates selection evidence but displayed text is still recorded after blur', async ({page}) => {
    await page.goto('/record');
    await page.getByRole('button',{name:'Начать запись',exact:true}).click();
    await page.locator('#employee').fill('Анна');
    await page.getByRole('option',{name:'Анна Смирнова',exact:true}).click();
    await page.locator('#employee').click();
    const inspector=page.getByRole('complementary',{name:'Распознанный экран'});
    await expect.poll(async()=>JSON.parse(await inspector.locator('pre').textContent()??'{}').controls?.find((c:any)=>c.kind==='combobox')?.choice.selection.status).toBe('observed');
    await page.locator('#employee').press('Escape');
    // Exercise the library's edit boundary without asking the widget to commit a new option.
    await page.locator('#employee').evaluate(input => input.dispatchEvent(new Event('input',{bubbles:true})));
    await page.getByRole('button',{name:'Завершить запись',exact:true}).click();
    await expect(page.getByRole('region',{name:'Журнал записи'})).toContainText('Сотрудник — Анна Смирнова');
});
