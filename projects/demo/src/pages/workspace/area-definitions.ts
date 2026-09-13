import {type AreaDefinition} from '@training-observer/core';

export const DEMO_AREAS: readonly AreaDefinition[] = [
    {key: 'procedure-search', hostTag: 'procedure-search-mf', observe: true},
    {key: 'procedure-player', hostTag: 'procedure-mf', observe: true},
    {key: 'directory', hostTag: 'directory-mf', observe: false},
    {key: 'notifications', hostTag: 'notifications-mf', observe: false},
];
