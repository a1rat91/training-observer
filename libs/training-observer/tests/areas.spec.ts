import {type AreaDefinition, AreaRegistry} from '../src/areas';

let scope: HTMLElement;
let registry: AreaRegistry;
const definitions: readonly AreaDefinition[] = [
    {key: 'search', hostTag: 'search-mf', observe: true},
    {key: 'player', hostTag: 'player-mf', observe: true},
];

beforeEach(() => {
    document.body.innerHTML =
        '<main><microfrontend><search-mf><input /></search-mf></microfrontend></main>';
    scope = document.querySelector('main')!;
    registry = new AreaRegistry(definitions);
    registry.start(scope);
});
afterEach(() => registry.stop());

it('discovers late hosts synchronously before the observer callback and replaces identity', () => {
    expect(registry.snapshots().find((area) => area.key === 'player')?.status).toBe(
        'missing',
    );
    scope.insertAdjacentHTML('beforeend', '<player-mf><input /></player-mf>');
    const original = registry.root('player')!;
    const generation = registry.snapshots()[1]!.generation;

    original.outerHTML = '<player-mf><input /></player-mf>';
    expect(registry.root('player')).not.toBe(original);
    expect(registry.snapshots()[1]!.generation).toBeGreaterThan(generation);
    expect(registry.owner(original)).toEqual({status: 'outside'});
});

it('does not read control values during discovery and ignores ordinary field mutations', async () => {
    const input = scope.querySelector('input')!;

    Object.defineProperty(input, 'value', {
        get: () => {
            throw new Error('value read');
        },
    });
    const updates = jest.fn();

    registry.subscribe(updates);
    input.className = 'changed';
    input.insertAdjacentHTML('afterend', '<span>New label</span>');
    await Promise.resolve();
    expect(registry.root('search')).toBe(input.parentElement);
    expect(updates).not.toHaveBeenCalled();
});

it('keeps the logical key on a move but invalidates a removed/reinserted mount generation', () => {
    const root = registry.root('search')!;
    const generation = registry.snapshots()[0]!.generation;

    scope.append(root.parentElement!);
    expect(registry.root('search')).toBe(root);
    expect(registry.snapshots()[0]!.key).toBe('search');
    expect(registry.snapshots()[0]!.generation).toBeGreaterThan(generation);
});

it('refuses duplicate hosts and recovers when the duplicate disappears', () => {
    scope.insertAdjacentHTML('beforeend', '<search-mf><input /></search-mf>');
    expect(registry.root('search')).toBeNull();
    expect(registry.snapshots()[0]!.status).toBe('ambiguous');

    for (const input of scope.querySelectorAll('input')) {
        expect(registry.owner(input).status).toBe('ambiguous');
    }

    scope.lastElementChild!.remove();
    expect(registry.snapshots()[0]!.status).toBe('resolved');
});

it('never gives a disabled nested host to the observed parent', () => {
    scope.querySelector('search-mf')!.innerHTML =
        '<player-mf><input /></player-mf><button>Next</button>';
    registry.setObserved('player', false);
    const input = scope.querySelector('input')!;

    expect(registry.owner(input)).toMatchObject({
        status: 'excluded',
        area: {key: 'player'},
    });
    expect(registry.accepts('search', input)).toBe(false);
    expect(registry.accepts('search', scope.querySelector('button')!)).toBe(true);
    const generation = registry.snapshots()[1]!.generation;

    registry.setObserved('player', true);
    expect(registry.accepts('player', input)).toBe(true);
    expect(registry.snapshots()[1]!.generation).toBeGreaterThan(generation);
});

it('ambiguous nested hosts also block the parent', () => {
    scope.querySelector('search-mf')!.innerHTML =
        '<player-mf><input /></player-mf><player-mf><input /></player-mf>';
    expect(registry.owner(scope.querySelector('input')!).status).toBe('ambiguous');
    expect(registry.accepts('search', scope.querySelector('input')!)).toBe(false);
});

it('detects overlapping definitions regardless of definition order', () => {
    registry.stop();

    for (const list of [
        [...definitions, {...definitions[0]!, key: 'duplicate'}],
        [{...definitions[0]!, key: 'duplicate'}, ...definitions],
    ]) {
        registry = new AreaRegistry(list);
        registry.start(scope);
        expect(registry.root('search')).toBeNull();
        expect(registry.owner(scope.querySelector('input')!).status).toBe('ambiguous');
        expect(
            registry.snapshots().filter((area) => area.status === 'conflict'),
        ).toHaveLength(2);
        registry.stop();
    }
});

it('uses existing ancestor attributes and invalidates them without reading outside scope', () => {
    registry.stop();
    scope.innerHTML =
        '<section aria-label="A"><search-mf><input /></search-mf></section><section aria-label="B"><search-mf /></section>';
    registry = new AreaRegistry([
        {
            key: 'search',
            hostTag: 'search-mf',
            observe: true,
            context: {ancestorTag: 'section', attributes: {'aria-label': 'A'}},
        },
    ]);
    registry.start(scope);
    expect(registry.root('search')).toBe(scope.querySelector('search-mf'));
    scope.querySelector('section')!.setAttribute('aria-label', 'B');
    expect(registry.root('search')).toBeNull();
    expect(registry.snapshots()[0]!.status).toBe('missing');
});

it('does not claim portals, other scopes or removed nodes', () => {
    document.body.insertAdjacentHTML('beforeend', '<search-mf><button /></search-mf>');
    expect(registry.owner(document.body.lastElementChild!.firstChild!).status).toBe(
        'outside',
    );
    const input = scope.querySelector('input')!;

    input.remove();
    expect(registry.owner(input).status).toBe('outside');
});

it('stop releases roots and observers; restarting uses a fresh generation', async () => {
    const generation = registry.snapshots()[0]!.generation;

    registry.stop();
    const updates = jest.fn();

    registry.subscribe(updates);
    scope.innerHTML = '<player-mf />';
    await Promise.resolve();
    expect(updates).not.toHaveBeenCalled();
    expect(registry.root('search')).toBeNull();
    expect(registry.owner(scope.firstChild!).status).toBe('outside');
    registry.start(scope);
    expect(registry.snapshots()[0]!.generation).toBeGreaterThan(generation);
    expect(registry.root('player')).toBe(scope.firstChild);
});

it('rejects duplicate keys and CSS expressions as host names', () => {
    expect(() => new AreaRegistry([definitions[0]!, definitions[0]!])).toThrow(
        /Duplicate/,
    );
    expect(
        () => new AreaRegistry([{...definitions[0]!, hostTag: 'search-mf:first-child'}]),
    ).toThrow(/tag name/);
});
