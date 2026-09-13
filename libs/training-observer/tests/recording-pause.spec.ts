import {AreaRegistry, ElementRecorder} from '../src';

let root: HTMLElement;
let recorder: ElementRecorder;
let areas: AreaRegistry;

function type(value: string, blur = true): void {
    const input = root.querySelector('input')!;

    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));

    if (blur) {
        input.dispatchEvent(new Event('blur'));
    }

    jest.advanceTimersByTime(0);
}

beforeEach(() => {
    jest.useFakeTimers();
    root = document.createElement('main');
    root.innerHTML =
        '<test-area><input aria-label="Name"><button>Next</button></test-area>';
    document.body.append(root);
    areas = new AreaRegistry([{key: 'test', hostTag: 'test-area', observe: true}]);
    areas.start(root);
    recorder = new ElementRecorder(root, {
        areas,
        acceptUntrustedEvents: true,
        valuePolicy: {mode: 'capture', sensitive: 'redact', normalizers: []},
    });
    recorder.start();
});
afterEach(() => {
    recorder.stop();
    areas.stop();
    root.remove();
    history.replaceState(null, '', '/');
    jest.useRealTimers();
});

it('resumes the same log, IDs and input target without observing paused events or replaying navigation', () => {
    type('First');
    const before = recorder.snapshot();
    const pathname = location.pathname;

    recorder.pause();
    recorder.pause();
    expect(recorder.paused).toBe(true);
    expect(recorder.running).toBe(false);
    type('During pause');
    root.querySelector('button')!.click();
    history.pushState(null, '', '/selection');
    jest.advanceTimersByTime(200);
    expect(recorder.snapshot().actions).toEqual(before.actions);
    history.replaceState(null, '', pathname);
    recorder.resume();
    recorder.resume();
    type('After');
    const after = recorder.snapshot();

    expect(after.id).toBe(before.id);
    expect(after.actions.map((action) => action.id)).toEqual(['action-1', 'action-2']);
    expect(
        after.actions.map((action) => 'targetId' in action && action.targetId),
    ).toEqual([
        before.actions[0]!.kind === 'input' && before.actions[0]!.targetId,
        before.actions[0]!.kind === 'input' && before.actions[0]!.targetId,
    ]);
    expect(after.descriptors).toHaveLength(before.descriptors.length);
});

it('cancels pending input including queued blur, ignores restoration blur and requires fresh input', () => {
    type('Draft', false);
    root.querySelector('input')!.dispatchEvent(new Event('blur'));
    recorder.pause(); // pause before the blur microtask can confirm a value
    recorder.resume();
    jest.advanceTimersByTime(0);
    expect(recorder.hasUncommittedInput).toBe(false);
    expect(recorder.snapshot().actions).toEqual([]);
    root.querySelector('input')!.dispatchEvent(new Event('blur'));
    jest.advanceTimersByTime(200);
    expect(recorder.snapshot().actions).toEqual([]);
    type('Fresh edit');
    expect(recorder.snapshot().actions).toHaveLength(1);
});

it('reconciles replaced fields on resume and never revives a stopped paused session', () => {
    type('Old');
    recorder.pause();
    const host = root.querySelector('test-area')!;

    host.replaceWith(host.cloneNode(true));
    jest.advanceTimersByTime(0);
    recorder.resume();
    type('New');
    expect(recorder.snapshot().actions).toHaveLength(2);
    recorder.pause();
    recorder.stop();
    recorder.resume();
    type('Ignored');
    expect(recorder.paused).toBe(false);
    expect(recorder.running).toBe(false);
    expect(recorder.snapshot().actions).toHaveLength(2);
});

it('discards a pending popup choice instead of confirming its late value after resume', () => {
    root.querySelector('test-area')!.innerHTML =
        '<input role="combobox" aria-label="Choice" aria-controls="options"><div id="options" role="listbox"><button role="option">Alpha</button></div>';
    const input = root.querySelector('input')!;

    root.querySelector('[role="option"]')!.dispatchEvent(
        new MouseEvent('click', {bubbles: true}),
    );
    recorder.pause();
    input.value = 'Alpha';
    recorder.resume();
    jest.advanceTimersByTime(500);
    expect(recorder.snapshot().actions).toEqual([]);
});

it('refreshes identity before the first new edit after navigation or relabeling during pause', () => {
    const id = recorder.snapshot().id;

    recorder.pause();
    history.pushState(null, '', '/updated');
    root.querySelector('input')!.setAttribute('aria-label', 'Updated name');
    recorder.resume();
    expect(recorder.snapshot().actions).toEqual([]);
    type('First new edit');
    const result = recorder.snapshot();

    expect(result.id).toBe(id);
    expect(result.actions).toHaveLength(1);
    const action = result.actions[0]!;

    expect(action.kind).toBe('input');
    expect(
        'targetId' in action &&
            result.descriptors.find((entry) => entry.id === action.targetId)?.scope
                .pathname,
    ).toBe('/updated');
});
