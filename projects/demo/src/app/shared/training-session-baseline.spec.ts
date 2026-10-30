/** Новая попытка получает один свежий снимок и не запускает отменённые поколения. */
import {Component, inject, signal} from '@angular/core';
import {
    type ComponentFixture,
    fakeAsync,
    flushMicrotasks,
    TestBed,
} from '@angular/core/testing';
import {expect} from '@jest/globals';
import {type TrainingScenario} from '@training-observer/contracts';
import {DomSnapshotBuilder} from '@training-observer/core';
import {provideTrainingSession, TrainingSession} from '@training-observer/runtime';

const scenario: TrainingScenario = {
    kind: 'training-state-scenario',
    version: 1,
    steps: [
        {key: 'A', task: 'Откройте экран', transitionMessage: 'Вернитесь', fields: []},
    ],
};

@Component({
    template: `
        @if (mounted()) {
            <section
                id="baseline-procedure"
                data-screen-key="A"
            >
                <input aria-label="Ответ" />
            </section>
        }
    `,
    providers: [
        provideTrainingSession({
            root: '#baseline-procedure',
            screen: {
                root: {attribute: {name: 'id', value: 'baseline-procedure'}},
                identity: {kind: 'attribute', name: 'data-screen-key'},
            },
            observation: {batchDelayMs: 0, propertyCheckIntervalMs: 0},
        }),
    ],
})
class BaselineOwner {
    public readonly mounted = signal(true);
    public readonly training = inject(TrainingSession);
}

const fixtures = new Set<ComponentFixture<BaselineOwner>>();

function owner(): ComponentFixture<BaselineOwner> {
    const fixture = TestBed.createComponent(BaselineOwner);

    fixtures.add(fixture);

    return fixture;
}

async function settle(fixture: ComponentFixture<BaselineOwner>): Promise<void> {
    await fixture.whenStable();

    for (let turn = 0; turn < 2; turn++) {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
    }
}

beforeEach(() => {
    TestBed.configureTestingModule({});
    jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue([
        {x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30},
    ]);
});

afterEach(() => {
    for (const fixture of fixtures) {
        fixture.destroy();
    }

    fixtures.clear();
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
});

test('each training attempt evaluates one fresh capture, including start before first render', fakeAsync(() => {
    const capture = jest.spyOn(DomSnapshotBuilder.prototype, 'build');
    const fixture = owner();
    const {training} = fixture.componentInstance;

    training.start(scenario);
    fixture.detectChanges();
    flushMicrotasks();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(training.progress()?.status).toBe('complete');
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.value = 'Свежий ответ';
    capture.mockClear();
    training.start(scenario);
    fixture.detectChanges();
    flushMicrotasks();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(training.screen().controls[0]?.state.value).toBe('Свежий ответ');
    expect(training.progress()?.status).toBe('complete');
}));

test('a newer start or stop cancels queued startup without extra captures', fakeAsync(() => {
    const fixture = owner();

    fixture.detectChanges();
    flushMicrotasks();
    const capture = jest.spyOn(DomSnapshotBuilder.prototype, 'build');
    const {training} = fixture.componentInstance;
    const previous: TrainingScenario = {
        ...scenario,
        steps: [{...scenario.steps[0]!, key: 'Previous'}],
    };

    training.start(previous);
    training.start(scenario);
    fixture.detectChanges();
    flushMicrotasks();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(training.progress()?.status).toBe('complete');
    capture.mockClear();
    training.start(scenario);
    training.stop();
    fixture.detectChanges();
    flushMicrotasks();
    expect(capture).not.toHaveBeenCalled();
    expect(training.progress()).toBeNull();
}));

test('a missing startup root publishes blocked progress and begins once when mounted', async () => {
    const capture = jest.spyOn(DomSnapshotBuilder.prototype, 'build');
    const fixture = owner();
    const {training, mounted} = fixture.componentInstance;

    mounted.set(false);
    training.start(scenario);
    fixture.detectChanges();
    await settle(fixture);
    expect(capture).not.toHaveBeenCalled();
    expect(training.screen().reason).toBe('no-snapshot');
    expect(training.progress()?.status).toBe('blocked');
    mounted.set(true);
    fixture.detectChanges();
    await settle(fixture);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(training.screen().key).toBe('A');
    expect(training.progress()?.status).toBe('complete');
});
