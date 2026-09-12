import {TestBed} from '@angular/core/testing';

import {AreaRegistryService, RecordingSessionService} from '../src/angular';

let root: HTMLElement;
const policy = {mode: 'capture', sensitive: 'redact', normalizers: []} as const;

beforeEach(() => {
    TestBed.configureTestingModule({
        providers: [AreaRegistryService, RecordingSessionService],
    });
    root = document.createElement('main');
    root.innerHTML = '<player-mf><input aria-label="Name" /></player-mf>';
    document.body.append(root);
    TestBed.inject(AreaRegistryService).connect(root, [
        {key: 'player', hostTag: 'player-mf', observe: true},
    ]);
});
afterEach(() => {
    TestBed.resetTestingModule();
    root.remove();
});

it('owns recording state, applies policy without restart and tears down with injector', () => {
    const service = TestBed.inject(RecordingSessionService);
    const areas = TestBed.inject(AreaRegistryService);

    service.start(root, {...policy, normalizers: []});
    expect(service.running()).toBe(true);
    const descriptor = service.recording()!.descriptors[0]!;

    expect(service.resolve(descriptor).status).toBe('resolved');
    areas.setObserved('player', false);
    expect(service.running()).toBe(true);
    expect(service.resolve(descriptor).status).toBe('broken');
    TestBed.resetTestingModule();
    expect(service.running()).toBe(false);
});

it('starting another recording resets the journal and stopping preserves the last snapshot', () => {
    const service = TestBed.inject(RecordingSessionService);

    service.start(root, {...policy, normalizers: []});
    const id = service.recording()!.id;

    service.start(root, {...policy, normalizers: []});
    expect(service.recording()!.id).not.toBe(id);
    service.stop();
    expect(service.running()).toBe(false);
    expect(service.recording()!.descriptors).toHaveLength(1);
});
