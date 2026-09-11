export const percentile = (values, p) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null;
};
export function summarize(rows) {
    const count = (outcome) => rows.filter((row) => row.outcome === outcome).length;
    const eligible = rows.filter((row) => row.expected === 'eligible');
    const negative = rows.filter((row) => row.expected !== 'eligible');
    const resolved = count('correct') + count('wrong');
    return {
        total: rows.length,
        correct: count('correct'),
        wrong: count('wrong'),
        ambiguous: count('ambiguous'),
        broken: count('broken'),
        generationErrors: count('generation-error'),
        queryErrors: count('query-error'),
        eligible: eligible.length,
        eligibleCorrect: eligible.filter((row) => row.outcome === 'correct').length,
        recovery: eligible.length ? eligible.filter((row) => row.outcome === 'correct').length / eligible.length : null,
        resolved,
        precision: resolved ? count('correct') / resolved : null,
        refused: count('ambiguous') + count('broken'),
        refusalRate: rows.length ? (count('ambiguous') + count('broken')) / rows.length : null,
        negative: negative.length,
        falseAccepts: negative.filter((row) => ['correct', 'wrong'].includes(row.outcome)).length,
        resolveMedianMs: percentile(
            rows.map((row) => row.durationMs),
            0.5,
        ),
        resolveP95Ms: percentile(
            rows.map((row) => row.durationMs),
            0.95,
        ),
    };
}
export function classify({count, same, eligible}) {
    if (count === 0) return 'broken';
    if (count > 1) return 'ambiguous';
    return same && eligible ? 'correct' : 'wrong';
}
export function csv(rows) {
    const columns = [
        'variant',
        'id',
        'split',
        'library',
        'expected',
        'outcome',
        'durationMs',
        'count',
        'queriedControlCount',
        'strategy',
        'reason',
        'error',
    ];
    const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    return [columns.join(','), ...rows.map((row) => columns.map((key) => quote(row[key])).join(','))].join('\n') + '\n';
}
