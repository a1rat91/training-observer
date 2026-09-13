import {PortalOwnership, type PortalProof} from '../src/observation/portal-ownership';

let index: PortalOwnership;
let release: () => void;

function proof(selector = '[role="option"]'): PortalProof {
    const result = index.resolveOption(document.querySelector(selector)!);

    expect(result.status).toBe('resolved');

    if (result.status !== 'resolved') {
        throw new Error('Expected owner');
    }

    return result.proof;
}

beforeEach(() => {
    document.body.innerHTML =
        '<main><input role="combobox" aria-controls="popup"></main><aside><input role="combobox"></aside><div id="popup"><button role="option">A</button></div>';
    index = PortalOwnership.forDocument(document);
    release = index.acquire();
});

afterEach(() => release());

it('shares an index, deduplicates controls/owns and never reads competing values', () => {
    const owner = document.querySelector('main input')!;

    owner.setAttribute('aria-owns', 'popup popup');
    const get = jest.fn(() => {
        throw new Error('Value must not be read');
    });

    Object.defineProperty(document.querySelector('aside input')!, 'value', {get});
    expect(PortalOwnership.forDocument(document)).toBe(index);
    expect(proof().owner).toBe(owner);
    document.querySelector('aside input')!.setAttribute('aria-controls', 'popup');
    expect(index.resolveOption(document.querySelector('[role="option"]')!).status).toBe(
        'ambiguous',
    );
    expect(get).not.toHaveBeenCalled();
});

it('refuses duplicate IDs even when only one owner claims the ID', () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="popup"></div>');
    expect(index.resolveOption(document.querySelector('[role="option"]')!).status).toBe(
        'ambiguous',
    );
    expect(index.byId('popup')).toBeNull();
});

it('does not assign a shared overlay containing independent dropdowns', () => {
    document.querySelector('#popup')!.innerHTML =
        '<div role="listbox"><button role="option">A</button></div><div role="listbox"><button role="option">B</button></div>';
    expect(index.resolveOption(document.querySelector('[role="option"]')!).status).toBe(
        'ambiguous',
    );
});

it('resolves separate popup subtrees under the same overlay independently', () => {
    document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="other"><button role="option">B</button></div>',
    );
    document.querySelector('aside input')!.setAttribute('aria-owns', 'other');
    expect(proof().owner).toBe(document.querySelector('main input'));
    expect(proof('#other [role="option"]').owner).toBe(
        document.querySelector('aside input'),
    );
});

it('does not infer an unlinked dialog owner from focus', () => {
    document.querySelector('main input')!.removeAttribute('aria-controls');
    document.querySelector<HTMLElement>('main input')!.focus();
    expect(index.resolveOption(document.querySelector('[role="option"]')!).status).toBe(
        'unsupported',
    );
});

it('allows normal close but rejects reuse of its ID for a new popup before commit', () => {
    const pending = proof();

    pending.popup.remove();
    pending.owner.removeAttribute('aria-controls');
    expect(index.valid(pending)).toBe(true);
    document.body.insertAdjacentHTML('beforeend', '<div id="popup"></div>');
    expect(index.valid(pending)).toBe(false);
});

it('rejects remount of the same popup node before commit', () => {
    const pending = proof();

    pending.popup.remove();
    document.body.append(pending.popup);
    expect(index.valid(pending)).toBe(false);
});

it('rejects removal and reinsertion of the same owner before commit', () => {
    const pending = proof();

    pending.owner.remove();
    document.querySelector('main')!.append(pending.owner);
    expect(index.valid(pending)).toBe(false);
});

it('detects a competing claim added by an application handler in the same stack', () => {
    const pending = proof();

    document.querySelector('aside input')!.setAttribute('aria-controls', 'popup');
    expect(index.valid(pending)).toBe(false);
});

it('releases resources only after the last user and rebuilds on reacquire', () => {
    const pending = proof();
    const second = index.acquire();
    const disconnect = jest.spyOn(MutationObserver.prototype, 'disconnect');

    release();
    release();
    expect(disconnect).not.toHaveBeenCalled();
    expect(proof().owner).toBe(pending.owner);
    second();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(index.byId('popup')).toBeNull();
    expect(index.valid(pending)).toBe(false);
    document.body.innerHTML =
        '<input aria-owns="next"><div id="next"><button role="option">B</button></div>';
    release = index.acquire();
    expect(proof().popup.id).toBe('next');
    disconnect.mockRestore();
});
