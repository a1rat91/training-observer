/** Поиск поля по смысловым признакам. Оценка не использует текущий ответ, координаты или сессионные ID.
 * Слабое совпадение или малый отрыв от второго кандидата дают отказ вместо выбора первого элемента.
 */
import type { ControlLocatorHints, ControlSnapshot } from '@training-observer/core/models';
import { MatchStatus } from '@training-observer/contracts';

export type ControlMatch =
    | { status: `${MatchStatus.Matched}`; control: ControlSnapshot }
    | { status: `${MatchStatus.Missing}` | `${MatchStatus.Ambiguous}` };

const MIN_SCORE = 80;
const MIN_MARGIN = 30;
const WEIGHT = { id: 100, label: 80, name: 40, placeholder: 30, context: 20 } as const;

export function matchControl(hint: ControlLocatorHints, controls: readonly ControlSnapshot[]): ControlMatch {
    const candidates = controls
        .filter((control) => control.visible && control.kind === hint.kind)
        .map((control) => ({ control, score: scoreDescriptor(hint, control.locatorHints) }))
        .sort((left, right) => right.score - left.score);
    const [best, second] = candidates;
    if (!best || best.score < MIN_SCORE) return { status: MatchStatus.Missing };
    if (second && best.score - second.score < MIN_MARGIN) return { status: MatchStatus.Ambiguous };
    return { status: MatchStatus.Matched, control: best.control };
}

function scoreDescriptor(expected: ControlLocatorHints, candidate: ControlLocatorHints): number {
    return (
        (same(stableId(expected.id), stableId(candidate.id)) ? WEIGHT.id : 0) +
        (same(expected.label, candidate.label) ? WEIGHT.label : 0) +
        (same(expected.name, candidate.name) ? WEIGHT.name : 0) +
        (same(expected.placeholder, candidate.placeholder) ? WEIGHT.placeholder : 0) +
        (same(context(expected), context(candidate)) ? WEIGHT.context : 0)
    );
}
function same(left?: string, right?: string): boolean {
    return !!left?.trim() && left.trim() === right?.trim();
}
function stableId(id?: string): string | undefined {
    return id && !/^(?:tui|ng|cdk|n\d|control:)/i.test(id) ? id : undefined;
}
function context(hint: ControlLocatorHints): string {
    return hint.context
        .map((item) => item.label.trim())
        .filter(Boolean)
        .join('/');
}
