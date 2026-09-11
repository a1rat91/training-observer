// Tools for the research runner; this API has no oracle or fixture identity information.
import {finder} from '@medv/finder';
import {createSelectorGenerator, PLAYWRIGHT_HASH, PLAYWRIGHT_VERSION, toLocator} from '@mizchi/selector-generator';
import {computeAccessibleName, getRole} from 'dom-accessibility-api';
import {generateInternalSelector, generateLocators} from 'dom-to-locator';
import {driver} from 'driver.js';
import {record} from 'rrweb';

let mizchi;
const generators = {
    'dom-to-locator': (element) => ({selector: generateInternalSelector(element), variants: generateLocators(element)}),
    mizchi: (element) => {
        mizchi ??= createSelectorGenerator(window);
        const result = mizchi(element, {testIdAttributeName: 'data-testid', multiple: true});

        return {selector: result.selector, variants: result.selectors.map((selector) => toLocator(selector))};
    },
    'finder-default': (element) => ({selector: finder(element, {timeoutMs: 100}), variants: []}),
    'finder-filtered': (element) => ({
        selector: finder(element, {
            timeoutMs: 100,
            idName: () => false,
            className: () => false,
            attr: (name) => ['alt', 'href', 'name', 'placeholder', 'title', 'type'].includes(name),
        }),
        variants: [],
    }),
};

window.researchLibraries = {
    generate(name, element) {
        const started = performance.now();

        try {
            return {...generators[name](element), durationMs: performance.now() - started};
        } catch (error) {
            return {error: String(error), durationMs: performance.now() - started};
        }
    },
    fingerprint(element) {
        return {role: getRole(element), name: computeAccessibleName(element)};
    },
    provenance: {mizchiPlaywrightVersion: PLAYWRIGHT_VERSION, mizchiPlaywrightHash: PLAYWRIGHT_HASH},
    startReplay() {
        const events = [];
        const stop = record({
            emit: (event) => events.push(event),
            maskAllInputs: true,
            sampling: {mousemove: false, scroll: 200},
        });

        return {events, stop};
    },
    mirrorId: (element) => record.mirror.getId(element),
    driver,
};
