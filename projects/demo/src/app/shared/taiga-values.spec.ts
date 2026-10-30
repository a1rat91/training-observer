/** Значения Taiga берутся из снимка DOM, обновляются мутациями и подтверждаются только на blur. */
import {TestBed} from '@angular/core/testing';
import {expect} from '@jest/globals';
import {readControlValue} from '@training-observer/contracts';
import {provideDomObservation, TrainingObserver} from '@training-observer/core';
import {type ControlSnapshot} from '@training-observer/core/models';
import {provideTaigaUiAdapter} from '@training-observer/taiga-ui';

const options = {batchDelayMs: 0, propertyCheckIntervalMs: 0};
const rangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
const rectangles = [
    {x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30},
];

async function settle(): Promise<void> {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
    });
}

function control(observer: TrainingObserver, id: string): ControlSnapshot {
    return observer.logicalControls().find((item) => item.locatorHints.id === id)!;
}

beforeEach(() => {
    TestBed.configureTestingModule({
        providers: [provideDomObservation(), provideTaigaUiAdapter()],
    });
    jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue(rectangles);
    Object.defineProperty(Range.prototype, 'getClientRects', {
        configurable: true,
        value: () => rectangles,
    });
    document.body.innerHTML = '';
});

afterEach(() => {
    TestBed.resetTestingModule();
    jest.restoreAllMocks();

    if (rangeRects) {
        Object.defineProperty(Range.prototype, 'getClientRects', rangeRects);
    } else {
        Reflect.deleteProperty(Range.prototype, 'getClientRects');
    }

    document.body.innerHTML = '';
});

test('capture preserves Taiga values and state while excluding the calendar subtree', async () => {
    document.body.innerHTML = `
        <tui-input-date><tui-primitive-textfield>
            <input id="date" readonly><span class="t-ghost">29.10.2026</span>
        </tui-primitive-textfield></tui-input-date>
        <tui-multi-select><tui-input-tag><div class="t-tags">
            <span class="t-text">First, with comma</span><span class="t-text">Second</span>
            <input id="multiple" role="combobox" disabled value="search">
        </div></tui-input-tag></tui-multi-select>
        <tui-input-date><input id="password" type="password" value="secret"><span class="t-ghost">secret</span></tui-input-date>
        <tui-calendar id="calendar"><button id="day">29</button></tui-calendar>
    `;
    const observer = TestBed.inject(TrainingObserver);

    observer.start(document.body, options);
    expect(control(observer, 'date').state).toMatchObject({
        value: '29.10.2026',
        readOnly: true,
    });
    expect(control(observer, 'multiple').state).toMatchObject({
        value: ['First, with comma', 'Second'],
        disabled: true,
    });
    expect(control(observer, 'multiple').pointerActionable).toBe(false);
    expect(control(observer, 'password').state).toMatchObject({
        value: undefined,
        redacted: true,
    });
    expect(observer.logicalControls().map((item) => item.locatorHints.id)).toEqual([
        'date',
        'multiple',
        'password',
    ]);
    const scans = observer.scanCount();

    document.querySelector('#day')!.textContent = '30';
    document.querySelector('#day')!.dispatchEvent(new Event('input', {bubbles: true}));
    await settle();
    expect(observer.scanCount()).toBe(scans);
});

test('a date ghost mutation refreshes the value without polling and blur confirms that displayed value', async () => {
    document.body.innerHTML = `
        <tui-input-date><tui-primitive-textfield>
            <input id="date"><span class="t-ghost">29.10.2026</span>
        </tui-primitive-textfield></tui-input-date><button id="outside">Outside</button>
    `;
    const observer = TestBed.inject(TrainingObserver);

    observer.start(document.body, options);
    const input = document.querySelector<HTMLInputElement>('#date')!;

    input.focus();
    document.querySelector('.t-ghost')!.textContent = '30.10.2026';
    await settle();
    const current = control(observer, 'date');

    expect(current.state.value).toBe('30.10.2026');
    expect(observer.confirmedControls()[current.id]).toBeUndefined();
    document.querySelector<HTMLButtonElement>('#outside')!.focus();
    await settle();
    expect(observer.confirmedControls()[current.id]?.state.value).toBe('30.10.2026');
});

test('multi-select tag mutations and clearing preserve arrays through blur confirmation', async () => {
    document.body.innerHTML = `
        <tui-multi-select><tui-input-tag><div class="t-tags">
            <span class="t-text">First</span><input id="multiple" role="combobox" value="search">
        </div></tui-input-tag></tui-multi-select><button id="outside">Outside</button>
    `;
    const observer = TestBed.inject(TrainingObserver);

    observer.start(document.body, options);
    const input = document.querySelector<HTMLInputElement>('#multiple')!;
    const outside = document.querySelector<HTMLButtonElement>('#outside')!;

    input.focus();
    const second = document.createElement('span');

    second.className = 't-text';
    second.textContent = 'Second';
    input.before(second);
    await settle();
    const current = control(observer, 'multiple');

    expect(readControlValue(current)).toEqual(['First', 'Second']);
    expect(observer.confirmedControls()[current.id]).toBeUndefined();
    outside.focus();
    await settle();
    expect(readControlValue(observer.confirmedControls()[current.id]!)).toEqual([
        'First',
        'Second',
    ]);
    input.focus();
    document.querySelectorAll('.t-text').forEach((tag) => tag.remove());
    await settle();
    expect(control(observer, 'multiple').state.value).toEqual([]);
    expect(observer.confirmedControls()[current.id]?.state.value).toEqual([
        'First',
        'Second',
    ]);
    outside.focus();
    await settle();
    expect(observer.confirmedControls()[current.id]?.state.value).toEqual([]);
});
