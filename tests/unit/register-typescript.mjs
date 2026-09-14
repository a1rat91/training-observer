// Resolve the same public package aliases as TypeScript; execute pure modules without Angular bootstrap.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const paths = JSON.parse(readFileSync('tsconfig.base.json', 'utf8')).compilerOptions.paths;
registerHooks({
    resolve(specifier, context, next) {
        if (paths[specifier]) return next(pathToFileURL(resolve(paths[specifier][0])).href, context);
        try {
            return next(specifier, context);
        } catch (error) {
            if (specifier.startsWith('.') && context.parentURL?.includes('/libs/'))
                return next(specifier + '.ts', context);
            throw error;
        }
    },
});
