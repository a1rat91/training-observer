/** Имена областей по общему селектору не требуют реестра или дополнительных DOM-маркеров. */
import {TestBed} from '@angular/core/testing';
import {expect} from '@jest/globals';
import {MicrofrontendObserver, provideDomObservation} from '@training-observer/core';

const options = {batchDelayMs: 0, propertyCheckIntervalMs: 0};

beforeEach(() => {
    TestBed.configureTestingModule({providers: [provideDomObservation()]});
    document.body.innerHTML = '';
});

afterEach(() => {
    TestBed.resetTestingModule();
    document.body.innerHTML = '';
});

async function settle(): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
    });
}

test('one wrapper selector discovers distinct and repeated component names', () => {
    document.body.innerHTML = `
        <microfrontend><employee-search></employee-search></microfrontend>
        <microfrontend><employee-card></employee-card></microfrontend>
        <microfrontend><employee-search></employee-search></microfrontend>
    `;
    const observer = TestBed.inject(MicrofrontendObserver);

    observer.start(document.body, options);
    const areas = observer.areas();

    expect(areas.map((area) => area.name)).toEqual([
        'employee-search',
        'employee-card',
        'employee-search',
    ]);
    expect(new Set(areas.map((area) => area.id)).size).toBe(3);
});

test.each([
    'data-microfrontend-name="custom" data-mf="legacy"',
    'data-mf="legacy"',
    'data-microfrontend-name="" data-mf="legacy"',
    'data-mf=""',
])('PoC attributes do not override the component name: %s', (attributes) => {
    document.body.innerHTML = `<microfrontend><employee-search ${attributes}></employee-search></microfrontend>`;
    const observer = TestBed.inject(MicrofrontendObserver);

    observer.observe('microfrontend > *', options);
    expect(observer.areas()[0]?.name).toBe('employee-search');
});

test('PoC attributes alone do not register areas with the default selector', () => {
    document.body.innerHTML =
        '<employee-search data-mf="legacy"></employee-search><employee-card data-microfrontend data-microfrontend-name="custom"></employee-card>';
    const observer = TestBed.inject(MicrofrontendObserver);

    observer.start(document.body, options);
    expect(observer.areas()).toEqual([]);
});

test('nested wrappers register their own component and exclude its fields from the parent snapshot', () => {
    document.body.innerHTML = `
        <microfrontend>
            <employee-profile>
                <input id="profile-field">
                <microfrontend>
                    <employee-address><input id="address-field"></employee-address>
                </microfrontend>
            </employee-profile>
        </microfrontend>
    `;
    const observer = TestBed.inject(MicrofrontendObserver);

    observer.start(document.body, options);
    const [parent, child] = observer.areas();

    expect(parent?.name).toBe('employee-profile');
    expect(child).toEqual(
        expect.objectContaining({name: 'employee-address', parentId: parent?.id}),
    );
    expect(JSON.stringify(parent?.snapshot)).toContain('profile-field');
    expect(JSON.stringify(parent?.snapshot)).not.toContain('address-field');
    expect(JSON.stringify(child?.snapshot)).toContain('address-field');
});

test('late mounting and replacement derive names while attribute changes preserve identity', async () => {
    document.body.innerHTML = '<microfrontend></microfrontend>';
    const observer = TestBed.inject(MicrofrontendObserver);

    observer.observe('microfrontend > *', options);
    expect(observer.areas()).toEqual([]);
    const wrapper = document.querySelector('microfrontend')!;
    const root = document.createElement('employee-search');

    wrapper.append(root);
    await settle();
    const id = observer.areas()[0]?.id;

    expect(observer.areas()[0]?.name).toBe('employee-search');
    root.setAttribute('data-microfrontend-name', 'custom');
    await settle();
    expect(observer.areas()[0]).toEqual(
        expect.objectContaining({id, name: 'employee-search'}),
    );
    root.removeAttribute('data-microfrontend-name');
    await settle();
    expect(observer.areas()[0]).toEqual(
        expect.objectContaining({id, name: 'employee-search'}),
    );
    root.replaceWith(document.createElement('employee-card'));
    await settle();
    expect(observer.areas()[0]?.name).toBe('employee-card');
    expect(observer.areas()[0]?.id).not.toBe(id);
    wrapper.replaceChildren();
    await settle();
    expect(observer.areas()).toEqual([]);
});
