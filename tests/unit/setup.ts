import {deserialize, serialize} from 'node:v8';

import {setupZoneTestEnv} from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv();

// JSDOM omits Node's structuredClone. These unit fixtures contain serializable data;
// v8 copying preserves their undefined properties and isolates nested arrays/objects.
if (!globalThis.structuredClone) {
    Object.defineProperty(globalThis, 'structuredClone', {
        configurable: true,
        writable: true,
        value: <T>(value: T): T => deserialize(serialize(value)) as T,
    });
}
