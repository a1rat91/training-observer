import {DOCUMENT} from '@angular/common';
import {TestBed} from '@angular/core/testing';

import {AreaRegistryService} from '../src/areas/area-registry.service';

const definitions = [{key: 'player', hostTag: 'player-mf', observe: true}] as const;
let scope: HTMLElement;

beforeEach(() => {
    TestBed.configureTestingModule({providers: [AreaRegistryService]});
    scope = TestBed.inject(DOCUMENT).createElement('main');
    document.body.append(scope);
});
afterEach(() => {
    TestBed.resetTestingModule();
    scope.remove();
});

it('publishes asynchronous discovery and clears the adapter on injector destruction', async () => {
    const service = TestBed.inject(AreaRegistryService);
    const registry = service.connect(scope, definitions);

    expect(service.areas()[0]!.status).toBe('missing');
    scope.innerHTML = '<player-mf><input /></player-mf>';
    await Promise.resolve();
    expect(service.areas()[0]!.status).toBe('resolved');
    TestBed.resetTestingModule();
    expect(service.areas()).toEqual([]);
    expect(registry.root('player')).toBeNull();
    scope.innerHTML = '<player-mf />';
    await Promise.resolve();
    expect(service.areas()).toEqual([]);
});

it('reconnect releases the old root and keeps only the new session', async () => {
    const service = TestBed.inject(AreaRegistryService);
    const old = service.connect(scope, definitions);
    const other = document.createElement('section');

    scope.append(other);
    service.connect(other, definitions);
    expect(old.root('player')).toBeNull();
    scope.insertAdjacentHTML('afterbegin', '<player-mf />');
    await Promise.resolve();
    expect(service.areas()[0]!.status).toBe('missing');
    other.innerHTML = '<player-mf />';
    await Promise.resolve();
    expect(service.areas()[0]!.status).toBe('resolved');
});
