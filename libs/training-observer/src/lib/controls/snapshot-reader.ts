/** Навигация по сериализованному графу: родители, потомки, текст и подписи. Не обращается к живому DOM или Angular DI. */
import {
    type DomElementSnapshot,
    type DomNodeId,
    type DomSnapshot,
} from '@training-observer/core/models';

export function normalizeText(value: string): string {
    return value.replaceAll(/\s+/g, ' ').trim();
}

/** Чтение одного сохранённого графа. Ссылки не разрешаются через живой document. */
export class SnapshotReader {
    private readonly lastElementByHtmlId = new Map<string, DomElementSnapshot>();

    public readonly elements: readonly DomElementSnapshot[];
    public readonly labels: readonly DomElementSnapshot[];

    constructor(public readonly snapshot: DomSnapshot) {
        this.elements = Object.values(snapshot.nodes).filter(
            (node): node is DomElementSnapshot => node.kind === 'element',
        );
        this.labels = this.elements.filter((node) => node.tagName === 'label');

        for (const element of this.elements) {
            const htmlId = element.attributes['id'];

            if (htmlId) {
                this.lastElementByHtmlId.set(htmlId, element);
            }
        }
    }

    public ancestors(node: DomElementSnapshot): DomElementSnapshot[] {
        const result: DomElementSnapshot[] = [];
        let parent = node.parentId ? this.snapshot.nodes[node.parentId] : undefined;

        while (parent?.kind === 'element') {
            result.push(parent);
            parent = parent.parentId ? this.snapshot.nodes[parent.parentId] : undefined;
        }

        return result;
    }

    public text(id: DomNodeId): string {
        const node = this.snapshot.nodes[id];

        if (node?.kind === 'text') {
            return node.text;
        }

        return node?.kind === 'element'
            ? node.children.map((child) => this.text(child)).join(' ')
            : '';
    }

    /** Сохраняет существующее правило контекстной подписи: последний дубликат HTML id побеждает. */
    public referencedText(ids: string): string {
        return ids
            .trim()
            .split(/\s+/)
            .map((id) => this.lastElementByHtmlId.get(id))
            .filter((node): node is DomElementSnapshot => !!node)
            .map((node) => this.text(node.id))
            .join(' ');
    }

    public legendText(fieldset: DomElementSnapshot): string {
        const legend = fieldset.children
            .map((id) => this.snapshot.nodes[id])
            .find((node) => node?.kind === 'element' && node.tagName === 'legend');

        return legend ? this.text(legend.id) : '';
    }

    public relatedLabels(
        target: DomElementSnapshot,
        ancestors: readonly DomElementSnapshot[],
    ): readonly DomElementSnapshot[] {
        return this.labels.filter(
            (label) =>
                (target.attributes['id'] &&
                    label.attributes['for'] === target.attributes['id']) ||
                ancestors.some((parent) => parent.id === label.id),
        );
    }

    /** Сохраняет порядок обхода и останавливается на другом контроле вместе с его потомками. */
    public members(
        roots: readonly DomNodeId[],
        targetId: DomNodeId,
        controlTargets: ReadonlySet<DomNodeId>,
    ): Set<DomNodeId> {
        const members = new Set<DomNodeId>();
        const visit = (id: DomNodeId): void => {
            if (id !== targetId && controlTargets.has(id)) {
                return;
            }

            const node = this.snapshot.nodes[id];

            if (!node) {
                return;
            }

            members.add(id);

            if (node.kind === 'element') {
                node.children.forEach(visit);
            }
        };

        roots.forEach(visit);

        return members;
    }
}
