import {expect, test} from '@playwright/test';

test('record, edit feedback, publish and learn with blur errors and a verified transition', async ({page}) => {
    await page.goto('/record');
    await page.getByRole('button', {name:'Начать запись',exact:true}).click();
    await page.locator('#surname').fill('Смирнова');
    await page.locator('#department').click();
    await page.getByRole('option',{name:'Поддержка',exact:true}).click();
    await page.getByRole('button',{name:'Далее',exact:true}).click();
    await expect(page.locator('#goal')).toBeVisible();
    await page.getByRole('button',{name:'Завершить запись',exact:true}).click();
    await page.getByText('Настроить тренировку',{exact:true}).click();
    await page.getByRole('button',{name:'Создать ожидания из записи',exact:true}).click();
    await page.getByRole('textbox',{name:'Ошибка: Фамилия',exact:true}).fill('Проверьте фамилию по заданию');
    await page.getByRole('button',{name:'Сохранить сценарий для ученика',exact:true}).click();
    await page.getByRole('link',{name:'Перейти к тренировке',exact:true}).click();
    await expect(page.locator('#surname')).toBeVisible();
    await page.locator('#surname').fill('Неверно');
    await page.waitForTimeout(600);
    await expect(page.locator('tui-notification-alert')).toHaveCount(0);
    await page.locator('#department').click();
    await expect(page.locator('tui-notification-alert')).toContainText('Проверьте фамилию по заданию');
    await page.getByRole('option',{name:'Поддержка',exact:true}).click();
    await page.locator('#surname').fill('Смирнова');
    await page.getByRole('button',{name:'Далее',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Тренировка завершена');
    await page.reload();
    await expect(page.locator('#surname')).toHaveValue('');
    await expect(page.getByText('Тренировка завершена',{exact:true})).toHaveCount(0);
});

test('typed ComboBox text records after blur and can be published', async ({page}) => {
    await page.goto('/record');
    await page.getByRole('button',{name:'Начать запись',exact:true}).click();
    await page.locator('#employee').fill('Анна Смирнова');
    await page.getByRole('button',{name:'Завершить запись',exact:true}).click();
    await page.getByText('Настроить тренировку',{exact:true}).click();
    await page.getByRole('button',{name:'Создать ожидания из записи',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Ожидание: Сотрудник',exact:true})).toHaveValue('Анна Смирнова');
    await expect(page.getByRole('button',{name:'Сохранить сценарий для ученика',exact:true})).toBeEnabled();
    await page.getByRole('textbox',{name:'Ошибка: Сотрудник',exact:true}).fill('Проверьте сотрудника');
    await page.getByRole('button',{name:'Сохранить сценарий для ученика',exact:true}).click();
    await page.getByRole('link',{name:'Перейти к тренировке',exact:true}).click();
    await page.locator('#employee').fill('Мария Петрова');
    await expect(page.locator('tui-notification-alert')).toHaveCount(0);
    await page.locator('#surname').click();
    await expect(page.locator('tui-notification-alert')).toContainText('Проверьте сотрудника');
    await page.locator('#employee').fill('Анна Смирнова');
    await expect(page.getByText('Тренировка завершена',{exact:true})).toHaveCount(0);
    await page.locator('#surname').click();
    await expect(page.getByRole('status')).toHaveText('Тренировка завершена');

});

test('wrong branch alerts once and returning to the expected screen allows completion', async ({page}) => {
    const scenario = {kind:'training-state-scenario',version:1,steps:[
        {key:'application-profile', task:'Укажите фамилию', transitionMessage:'Вернитесь в правильную ветку', fields:[{
            descriptor:{kind:'textbox',label:'Фамилия',id:'surname',tagName:'input',role:'textbox',context:[]},
            expected:'Смирнова',message:'Неверная фамилия',optional:false}]},
        {key:'application-details',task:'Готово',transitionMessage:'Неверный переход',fields:[]},
    ]};
    await page.addInitScript(value => localStorage.setItem('training-observer.scenario.v1', JSON.stringify(value)), scenario);
    await page.goto('/learn');
    await page.getByRole('button',{name:'Неправильный переход',exact:true}).click();
    const alerts = page.locator('tui-notification-alert');
    await expect(alerts).toContainText('Вернитесь в правильную ветку');
    await page.waitForTimeout(650);
    await expect(alerts).toHaveCount(1);
    await page.getByRole('button',{name:'Назад',exact:true}).click();
    await page.locator('#surname').fill('Смирнова');
    await page.getByRole('button',{name:'Далее',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Тренировка завершена');
});
