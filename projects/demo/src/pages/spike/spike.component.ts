import {ChangeDetectionStrategy, Component} from '@angular/core';
import {RouterLink} from '@angular/router';

import {SpikePanelComponent} from './panel.component';
import {SpikeTargetComponent} from './target.component';

@Component({
    standalone: true,
    imports: [RouterLink, SpikePanelComponent, SpikeTargetComponent],
    template: `
        <main>
            <header>
                <span>TRAINING OBSERVER · TECHNICAL SPIKE</span>
                <h1>Устойчивость к изменениям DOM</h1>
                <p>28 контролов · semantic locators · проверяемый отказ</p>
                <a routerLink="/spike/procedure">Открыть динамический плеер процедур →</a>
            </header>
            <div class="workspace">
                <spike-target />
                <spike-panel />
            </div>
        </main>
    `,
    styles: `
        main {
            padding: 28px;
            background: #f3f6fa;
            min-height: 100vh;
        }
        header {
            margin-bottom: 28px;
        }
        header span {
            font-size: 11px;
            letter-spacing: 2px;
            color: #557393;
        }
        h1 {
            font-size: 30px;
            margin: 12px 0;
        }
        header p {
            color: #526780;
        }
        .workspace {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 370px;
            gap: 24px;
            align-items: start;
        }
        @media (max-width: 1000px) {
            .workspace {
                grid-template-columns: 1fr;
            }
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SpikeComponent {}
