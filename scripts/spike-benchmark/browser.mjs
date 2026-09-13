import {describe} from '../../libs/training-observer/src/recording/dom';
import {CONTROLS} from '../../libs/training-observer/src/dom/identity';
import {ElementResolver} from '../../libs/training-observer/src/resolution/resolver';

let sequence = 0;

// No fixture/oracle import. Same descriptor and resolver as the application.
globalThis.benchmark = {
    describe(element, root) {
        const start = performance.now();
        const descriptor = describe(element, root, `recorded-target-${++sequence}`);
        return {
            descriptor,
            durationMs: performance.now() - start,
            bytes: new TextEncoder().encode(JSON.stringify(descriptor)).length,
        };
    },
    resolve(descriptor, root) {
        const start = performance.now();
        const result = new ElementResolver().resolve(descriptor, root);
        const durationMs = performance.now() - start;
        return {
            ...result,
            durationMs,
            queriedControlCount: root.querySelectorAll(CONTROLS).length,
        };
    },
};
