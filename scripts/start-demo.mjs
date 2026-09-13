import {spawn} from 'node:child_process';

// One command starts both local services and tears them down together.
const children = [];
let stopping = false;
function stop(code) {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill('SIGTERM');
    process.exitCode = code;
}
const apiPort = Number(process.env.PROCEDURE_API_PORT ?? 4310);
let existingBackend = false;
try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/health`, {signal: AbortSignal.timeout(1000)});
    existingBackend = response.ok && (await response.json()).service === 'procedure-spike';
} catch {
    // No running fixture: start our own process below.
}
if (existingBackend) console.log(`Using existing procedure backend on port ${apiPort}`);
const commands = [
    ...(!existingBackend ? [['scripts/procedure-server/server.mjs']] : []),
    ['node_modules/nx/bin/nx.js', 'serve', 'demo', ...process.argv.slice(2)],
];
for (const args of commands) {
    const child = spawn(process.execPath, args, {
        stdio: 'inherit',
        env: {...process.env, NX_DAEMON: 'false', NX_ISOLATE_PLUGINS: 'false'},
    });
    children.push(child);
    child.on('error', (error) => {
        console.error(error.message);
        stop(1);
    });
    child.on('exit', (code) => stop(code ?? 1));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
