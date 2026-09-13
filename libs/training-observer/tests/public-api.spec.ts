import {describeElement, isObservableElement} from '../src';

it('describes a completion heading through the public API without exposing selectors', () => {
    document.body.innerHTML =
        '<main><h2>Заявка принята</h2></main><button>Outside</button>';
    const root = document.querySelector('main')!;
    const heading = root.querySelector('h2')!;

    expect(isObservableElement(heading, root)).toBe(true);
    expect(
        describeElement(heading, root, 'finish', {includeStatic: true}).fingerprint
            .features.role,
    ).toBe('heading');
    expect(() => describeElement(heading, root, 'finish')).toThrow();
    expect(() =>
        describeElement(document.querySelector('button')!, root, 'outside'),
    ).toThrow();
});
