import {describeElement, readElementDescriptor} from '../src';

it('validates a standalone authoring target without requiring a recording or scenario', () => {
    const root = document.createElement('main');

    root.innerHTML = '<button aria-label="Choose">Choose</button>';
    document.body.append(root);

    try {
        const descriptor = describeElement(root.querySelector('button')!, root, 'target');

        expect(readElementDescriptor(JSON.parse(JSON.stringify(descriptor)))).toEqual(
            descriptor,
        );
        expect(() => readElementDescriptor({...descriptor, unexpected: true})).toThrow();
        expect(() =>
            readElementDescriptor({
                ...descriptor,
                locators: [...descriptor.locators, descriptor.locators[0]],
            }),
        ).toThrow();
    } finally {
        root.remove();
    }
});
