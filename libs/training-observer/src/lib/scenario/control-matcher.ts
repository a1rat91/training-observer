/** Deterministic cross-document matching. Kind is mandatory, values/position/session IDs are ignored.
 * Score existing semantic evidence; weak or close candidates remain missing/ambiguous.
 */
import type {ControlLocatorHints, ControlSnapshot} from '../models/control-snapshot';
export type ControlMatch = {status: 'matched'; control: ControlSnapshot} | {status: 'missing' | 'ambiguous'};
const same = (a?: string, b?: string): boolean => !!a?.trim() && a.trim() === b?.trim();
const stableId = (id?: string): string | undefined => id && !/^(?:tui|ng|cdk|n\d|control:)/i.test(id) ? id : undefined;
export function matchControl(hint: ControlLocatorHints, controls: readonly ControlSnapshot[]): ControlMatch {
    const context = (h: ControlLocatorHints) => h.context.map(c => c.label.trim()).filter(Boolean).join('/');
    const candidates = controls.filter(c => c.visible && c.kind === hint.kind).map(control => {
        const h = control.locatorHints;
        const score = (same(stableId(hint.id), stableId(h.id)) ? 100 : 0) +
            (same(hint.label, h.label) ? 80 : 0) + (same(hint.name, h.name) ? 40 : 0) +
            (same(hint.placeholder, h.placeholder) ? 30 : 0) + (same(context(hint), context(h)) ? 20 : 0);
        return {control, score};
    }).sort((a, b) => b.score - a.score);
    if (!candidates[0] || candidates[0].score < 80) return {status: 'missing'};
    if (candidates[1] && candidates[0].score - candidates[1].score < 30) return {status: 'ambiguous'};
    return {status: 'matched', control: candidates[0].control};
}
