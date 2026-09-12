import {DecimalPipe, PercentPipe} from '@angular/common';
import {ChangeDetectionStrategy, Component} from '@angular/core';
import {TuiButton} from '@taiga-ui/core';

import report from '../../../../../docs/spike/benchmark/summary.json';

@Component({
    standalone: true,
    selector: 'benchmark-page',
    imports: [DecimalPipe, PercentPipe, TuiButton],
    templateUrl: './benchmark-page.component.html',
    styles: `
        :host {
            display: block;
            padding: 1.5rem;
            max-width: 80rem;
            margin: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0 2rem;
        }
        th,
        td {
            padding: 0.65rem;
            text-align: start;
            border-bottom: 1px solid var(--tui-border-normal);
        }
        .scroll {
            overflow: auto;
        }
        nav {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin: 1rem 0;
        }
        p {
            max-width: 65rem;
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class BenchmarkPageComponent {
    public readonly report = report;
    public readonly methods = Object.entries(report.summary).map(([name, counts]) => ({
        name,
        ...counts,
    }));

    public readonly variants = Object.entries(report.byVariant).map(
        ([name, methods]) => ({name, ...methods['resolver-v2']}),
    );

    public readonly dynamic = Object.entries(report.dynamic.byVariant).map(
        ([name, counts]) => ({name, ...counts}),
    );
}
