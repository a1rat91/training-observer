import {AreaRegistry, describeElement, ElementRecorder, ElementResolver} from '../src';
import {DocumentEventHub} from '../src/observation/event-hub';

const valuePolicy = {mode: 'capture', sensitive: 'redact', normalizers: []} as const;
let root: HTMLElement;
let areas: AreaRegistry;
let recorder: ElementRecorder;

function input(selector: string, value: string, type = 'input'): void {
    const element = root.querySelector<HTMLInputElement>(selector)!;

    element.value = value;
    element.dispatchEvent(new Event(type, {bubbles: true}));
}

beforeEach(() => {
    document.body.innerHTML =
        '<main><alpha-mf><input aria-label="Name" /></alpha-mf><beta-mf><input aria-label="Name" /></beta-mf></main>';
    root = document.querySelector('main')!;
    areas = new AreaRegistry([
        {key: 'a', hostTag: 'alpha-mf', observe: true},
        {key: 'b', hostTag: 'beta-mf', observe: false},
    ]);
    areas.start(root);
    recorder = new ElementRecorder(root, {
        areas,
        valuePolicy: {...valuePolicy, normalizers: []},
        acceptUntrustedEvents: true,
    });
});

afterEach(() => {
    recorder.stop();
    areas.stop();
    jest.useRealTimers();
});

it('does not read disabled area values during inventory, events or polling', () => {
    jest.useFakeTimers();
    const field = root.querySelector('beta-mf input')!;
    const get = jest.fn(() => 'secret');

    Object.defineProperty(field, 'value', {get});
    recorder.start();
    field.dispatchEvent(new Event('input', {bubbles: true}));
    jest.advanceTimersByTime(500);
    recorder.stop();
    expect(get).not.toHaveBeenCalled();
    expect(recorder.snapshot().descriptors).toHaveLength(1);
    expect(recorder.snapshot().actions).toHaveLength(0);
});

it('disabling an area cancels its pending input without committing it', () => {
    recorder.start();
    input('alpha-mf input', 'draft');
    areas.setObserved('a', false);
    recorder.stop();
    expect(recorder.snapshot().actions).toHaveLength(0);
    expect(recorder.snapshot().diagnostics).toEqual(
        expect.arrayContaining([
            expect.objectContaining({message: expect.stringContaining('отменено')}),
        ]),
    );
});

it('enabling starts a baseline and preserves the other area pending action and global order', async () => {
    recorder.start();
    input('alpha-mf input', 'A');
    input('beta-mf input', 'previous');
    areas.setObserved('b', true);
    input('beta-mf input', 'B', 'change');
    await Promise.resolve();
    recorder.stop();
    const report = recorder.snapshot();

    expect(report.actions.map((action) => action.kind)).toEqual(['input', 'input']);
    expect(report.actions.map((action) => action.sequence)).toEqual([1, 2]);
    expect(
        report.actions.map((action) =>
            'targetId' in action ? recorder.areaForTarget(action.targetId) : null,
        ),
    ).toEqual(['a', 'b']);
    expect(
        report.actions.map((action) =>
            'value' in action && action.value.status === 'captured'
                ? action.value.raw
                : null,
        ),
    ).toEqual(['A', 'B']);
});

it('remount cancels pending input and an unchanged baseline creates no action', () => {
    recorder.start();
    input('alpha-mf input', 'draft');
    root.querySelector('alpha-mf')!.outerHTML =
        '<alpha-mf><input aria-label="Name" value="server" /></alpha-mf>';
    areas.snapshots();
    root.querySelector('alpha-mf input')!.dispatchEvent(new Event('blur'));
    recorder.stop();
    expect(recorder.snapshot().actions).toHaveLength(0);
});

it('late mount is discovered and navigation is emitted once across areas', async () => {
    root.querySelector('alpha-mf')!.remove();
    recorder.start();
    root.insertAdjacentHTML(
        'beforeend',
        '<alpha-mf><input aria-label="Name" /></alpha-mf>',
    );
    await Promise.resolve();
    input('alpha-mf input', 'late', 'change');
    await Promise.resolve();
    history.replaceState({}, '', '/other');
    recorder.stop();
    expect(recorder.snapshot().actions.map((action) => action.kind)).toEqual([
        'input',
        'navigation',
    ]);
    history.replaceState({}, '', '/workflow');
});

it('disabled nested MF cannot bubble into an observed parent button', () => {
    root.innerHTML =
        '<alpha-mf><div role="button"><beta-mf><span>Click</span></beta-mf></div></alpha-mf>';
    recorder.start();
    root.querySelector('span')!.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    recorder.stop();
    expect(recorder.snapshot().actions).toHaveLength(0);
});

it('does not select a portal with competing ownership in an unobserved MF', () => {
    root.innerHTML =
        '<alpha-mf><input role="combobox" aria-label="Name" aria-controls="popup" /></alpha-mf><beta-mf><input role="combobox" aria-label="Name" aria-controls="popup" /></beta-mf>';
    document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="popup"><button role="option">Option</button></div>',
    );
    recorder.start();
    document
        .querySelector('[role="option"]')!
        .dispatchEvent(new MouseEvent('click', {bubbles: true}));
    recorder.stop();
    expect(recorder.snapshot().actions).toHaveLength(0);
    expect(recorder.snapshot().diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({code: 'ambiguous-owner'})]),
    );
});

it('resolver filters area membership before scoring equally named peers', () => {
    const descriptor = describeElement(
        root.querySelector('alpha-mf input')!,
        root.querySelector('alpha-mf')!,
        'target',
    );

    const resolver = new ElementResolver({
        accepts: (element) => areas.accepts('a', element),
    });

    expect(resolver.resolve(descriptor, root).report.status).toBe('resolved');
    root.querySelector('alpha-mf')!.remove();
    expect(resolver.resolve(descriptor, root).report.status).toBe('broken');
});

it('event hub shares one listener set and the final unsubscribe releases it', () => {
    const add = jest.spyOn(document, 'addEventListener');
    const remove = jest.spyOn(document, 'removeEventListener');
    const hub = DocumentEventHub.forDocument(document);
    const first = hub.subscribe(() => {});
    const second = hub.subscribe(() => {});

    expect(add).toHaveBeenCalledTimes(7);
    first();
    expect(remove).not.toHaveBeenCalled();
    second();
    second();
    expect(remove).toHaveBeenCalledTimes(7);
    add.mockRestore();
    remove.mockRestore();
});

it('a failing event subscriber does not prevent delivery to other sessions', () => {
    const scheduled = jest
        .spyOn(globalThis, 'queueMicrotask')
        .mockImplementation(() => {});

    const hub = DocumentEventHub.forDocument(document);
    const stopFirst = hub.subscribe(() => {
        throw new Error('subscriber failed');
    });

    const next = jest.fn();
    const stopNext = hub.subscribe(next);

    document.dispatchEvent(new Event('input'));
    expect(next).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveBeenCalledWith(expect.any(Function));
    stopFirst();
    stopNext();
    scheduled.mockRestore();
});
