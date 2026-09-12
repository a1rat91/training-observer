import {DemoPath} from '@demo/constants';
import {type TuiDocRoutePages} from '@taiga-ui/addon-doc';

export const DEMO_PAGES: TuiDocRoutePages = [
    {
        section: 'Training Observer',
        title: 'Benchmark восстановления',
        route: DemoPath.Benchmark,
    },
    {section: 'Training Observer', title: 'Прохождение обучения', route: DemoPath.Learn},
    {section: 'Training Observer', title: 'Запись процедуры', route: DemoPath.Record},
    {section: 'Training Observer', title: 'Плеер процедур', route: DemoPath.Procedure},
    {
        section: 'Training Observer',
        title: 'Исследование locators',
        route: DemoPath.Research,
    },
    {
        section: 'Examples',
        title: 'Controls example',
        route: DemoPath.ControlsExample,
    },
];
