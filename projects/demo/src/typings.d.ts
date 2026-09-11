/* Import file's content as string.
To understand how it works, see `projects/demo/webpack.config.ts`.
*/
declare module '*?raw' {
    const result: string;

    export default result;
}

// This package exposes types only via package exports. The legacy webpack/ts-node
// config uses node resolution; reference the installed declarations instead of duplicating its API.
declare module '@mizchi/selector-generator' {
    export const createSelectorGenerator: typeof import('../../../node_modules/@mizchi/selector-generator/types/index').createSelectorGenerator;
    export const toLocator: typeof import('../../../node_modules/@mizchi/selector-generator/types/index').toLocator;
}
