import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createProcedureService} from './service.mjs';

export function createProcedureServer() {
    const service = createProcedureService();
    return createServer(async (request, response) => {
        const origin = request.headers.origin;
        if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
            response.writeHead(403).end();
            return;
        }
        response.setHeader('Access-Control-Allow-Origin', origin ?? 'http://localhost:4200');
        response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        if (request.method === 'OPTIONS') {
            response.writeHead(204).end();
            return;
        }
        if (request.url === '/health' && request.method === 'GET') {
            response.end('{"service":"procedure-spike"}');
            return;
        }
        const match = /^\/api\/procedures(?:\/([^/]+)\/actions)?$/.exec(request.url ?? '');
        if (!match || request.method !== 'POST') {
            response.writeHead(404).end('{}');
            return;
        }
        try {
            const chunks = [];
            let size = 0;
            for await (const chunk of request) {
                chunks.push(chunk);
                size += chunk.length;
                if (size > 65536) {
                    response.writeHead(413).end('{}');
                    return;
                }
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
            await delay(match[1] ? service.delay(match[1]) : 200);
            const result = match[1] ? service.action(match[1], body) : service.create(body.profile);
            response.writeHead(result.status).end(JSON.stringify(result.body));
        } catch {
            if (!response.headersSent) response.writeHead(400).end('{"error":{"message":"Некорректный JSON"}}');
        }
    });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const port = Number(process.env.PROCEDURE_API_PORT ?? 4310);
    const server = createProcedureServer();
    server.listen(port, '127.0.0.1', () => console.log(`Procedure fixture HTTP: http://127.0.0.1:${port}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
