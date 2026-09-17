/** Диагностика одного Taiga input через публичный API библиотеки.
 * После рендера наблюдает только контейнер поля. Сначала выводит DOM-граф и логический контрол,
 * затем изменения их значений и отдельное подтверждение после blur. JSON фиксирует данные на момент вывода.
 */
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    effect,
    type ElementRef,
    inject,
    viewChild,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiTextfield} from '@taiga-ui/core';
import {provideDomObservation, TrainingObserver} from '@training-observer/core';
import {type ControlSnapshot, type DomControlState} from '@training-observer/core/models';

@Component({
    selector: 'app-input-inspector',
    imports: [FormsModule, TuiTextfield],
    templateUrl: './input-inspector.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [provideDomObservation()],
})
export class InputInspectorComponent {
    private readonly observer = inject(TrainingObserver);
    private readonly root = viewChild.required<ElementRef<HTMLElement>>('observed');
    private previous: {dom: DomControlState; logical: ControlSnapshot} | null = null;
    private confirmation = '';

    protected value = '';

    constructor() {
        afterNextRender(() => {
            this.observer.start(this.root().nativeElement);
        });
        effect(() => {
            const snapshot = this.observer.snapshot();
            const logical = this.observer
                .logicalControls()
                .find((control) => control.kind === 'textbox');

            if (!snapshot || !logical) {
                return;
            }

            const target = snapshot.nodes[logical.targetNodeId];

            if (target?.kind !== 'element') {
                return;
            }

            if (!this.previous) {
                this.log('1. DOM-разбор поля', snapshot);
                this.log('2. Логический контрол', logical);
            } else if (
                JSON.stringify(this.previous.dom) !== JSON.stringify(target.state) ||
                JSON.stringify(this.previous.logical.state) !==
                    JSON.stringify(logical.state)
            ) {
                this.log('3. Изменение контрола', {
                    dom: {before: this.previous.dom, after: target.state},
                    logical: {before: this.previous.logical, after: logical},
                });
            }

            this.previous = {dom: target.state, logical};
        });
        effect(() => {
            const confirmed = Object.values(this.observer.confirmedControls());
            const fingerprint = JSON.stringify(confirmed);

            if (confirmed.length && fingerprint !== this.confirmation) {
                this.log('4. Значение подтверждено после blur', confirmed);
            }

            this.confirmation = fingerprint;
        });
    }

    private log(stage: string, value: unknown): void {
        // Строка JSON не изменится при последующем раскрытии сообщения в DevTools.
        console.warn(`[Input inspector] ${stage}\n${JSON.stringify(value, null, 2)}`);
    }
}
