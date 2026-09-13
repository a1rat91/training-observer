import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {csv, summarize} from './metrics.mjs';
const source = 'dist/spike-benchmark';
const destination = 'docs/spike/benchmark';
const report = JSON.parse(await readFile(`${source}/report.json`, 'utf8'));
for (const [file, hash] of Object.entries(report.hashes)) {
    assert.equal(
        createHash('sha256')
            .update(await readFile(file))
            .digest('hex'),
        hash,
        `Measured source changed: ${file}`,
    );
}
const dynamic = (
    await Promise.all(
        ['internal', 'external'].map(async (branch) =>
            JSON.parse(await readFile(`${source}/dynamic-${branch}.json`, 'utf8')),
        ),
    )
).flat();
assert.ok(
    dynamic.length > 0 && dynamic.every((row) => row.outcome === (row.expected === 'eligible' ? 'correct' : 'broken')),
);
report.dynamic = {
    rows: dynamic,
    summary: summarize(dynamic),
    byVariant: Object.fromEntries(
        [...new Set(dynamic.map((row) => row.variant))].map((variant) => [
            variant,
            summarize(dynamic.filter((row) => row.variant === variant)),
        ]),
    ),
};
report.hashes['tests/benchmark.spec.ts'] = createHash('sha256')
    .update(await readFile('tests/benchmark.spec.ts'))
    .digest('hex');
await mkdir(destination, {recursive: true});
await writeFile(`${destination}/report.json`, JSON.stringify(report, null, 2) + '\n');
await writeFile(`${destination}/results.csv`, csv(report.rows));
await writeFile(`${destination}/dynamic.csv`, csv(dynamic.map((row) => ({...row, id: `${row.branch}:${row.id}`}))));
const {rows, recorded, ...summary} = report;
summary.dynamic = {summary: report.dynamic.summary, byVariant: report.dynamic.byVariant};
await writeFile(`${destination}/summary.json`, JSON.stringify(summary, null, 2) + '\n');
const percent = (value) => (value === null ? '—' : `${(value * 100).toFixed(2)}%`);
const table = [
    '| Метод | Correct | Wrong | Ambiguous | Broken | Recovery | Precision |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...Object.entries(report.summary).map(
        ([name, s]) =>
            `| ${name} | ${s.correct} | ${s.wrong} | ${s.ambiguous} | ${s.broken} | ${s.eligibleCorrect}/${s.eligible} (${percent(s.recovery)}) | ${s.correct}/${s.resolved} (${percent(s.precision)}) |`,
    ),
];
const variants = [
    '| Изменение | Correct | Wrong | Ambiguous | Broken |',
    '|---|---:|---:|---:|---:|',
    ...Object.entries(report.byVariant).map(([name, entries]) => {
        const s = entries['resolver-v2'];
        return `| ${name} | ${s.correct} | ${s.wrong} | ${s.ambiguous} | ${s.broken} |`;
    }),
];
await writeFile(
    `${destination}/RESULTS.md`,
    `# Фактические результаты benchmark\n\nСгенерировано ${report.generatedAt}. ${report.targets.length} целей × ${report.variants.length} вариантов × 5 методов = ${report.rows.length} проверок.\n\n${table.join('\n')}\n\n## Resolver по изменениям\n\n${variants.join('\n')}\n\n## Динамические переходы\n\n${Object.entries(
        report.dynamic.byVariant,
    )
        .map(
            ([variant, s]) =>
                `- ${variant}: ${s.correct} correct, ${s.wrong} wrong, ${s.ambiguous} ambiguous, ${s.broken} broken (${s.eligible} доступных, ${s.negative} отсутствующих).`,
        )
        .join(
            '\n',
        )}\n\nМетодика и интерпретация: [benchmark.md](../benchmark.md). Полные данные: [report.json](report.json), [results.csv](results.csv), [dynamic.csv](dynamic.csv).\n`,
);
console.info(`Published ${report.rows.length} static and ${dynamic.length} dynamic rows to ${destination}`);
