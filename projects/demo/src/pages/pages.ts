import {DemoPath} from '@demo/constants';
import {type TuiDocRoutePages} from '@taiga-ui/addon-doc';

export const DEMO_PAGES: TuiDocRoutePages = [
    {section: 'Spike', title: 'Запись процедуры', route: DemoPath.Record},
    {section: 'Spike', title: 'Плеер процедур', route: DemoPath.Procedure},
    {section: 'Spike', title: 'Исследование locators', route: DemoPath.Research},
    {
        section: 'Examples',
        title: 'Controls example',
        route: DemoPath.ControlsExample,
    },
];
