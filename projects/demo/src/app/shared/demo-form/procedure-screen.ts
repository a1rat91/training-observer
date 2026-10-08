import {type ScreenStateOptions} from '@training-observer/core/models';

export const PROCEDURE_SCREEN: ScreenStateOptions = {
    root: {
        tagName: 'section',
        attribute: {name: 'aria-label', value: 'Экран процедуры'},
    },
    identity: {kind: 'attribute', name: 'id'},
    loading: {name: 'aria-busy', value: 'true'},
};
