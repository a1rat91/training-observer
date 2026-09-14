# Руководство разработчика

## Окружение и команды

Используйте Node 22.19+ ветки 22. Версии Angular/Taiga фиксируются package-lock.json.
`npm ci` устанавливает зависимости, `npm start` открывает dev server 4200.
`npm run check` проверяет зависимости, форматирование, unit tests и production-сборку.
`npm test` запускает реальный Chrome и demo на 4301. Unit-набор лежит в `tests/unit`, browser-набор —
в `tests/*.spec.ts`; Playwright явно исключает unit.

Node unit runner использует `--experimental-transform-types`, поскольку string enum требует преобразования,
а не только удаления типов. `register-typescript.mjs` разрешает те же package aliases, что tsconfig.
Тесты чистых слоёв не создают Angular TestBed. Интеграционные тесты проверяют реальные Angular lifecycle и Taiga.

`npm run format` и `npm run format:check` используют одну зафиксированную версию Prettier.
`npm run lint` не допускает обратные зависимости core → обучение или recording ↔ runtime.
`npm run test:load` — отдельный benchmark; численные улучшения производительности этим рефакторингом не заявляются.

## Где внести изменение

- Новый DOM-тип или обёртка: `core/controls/control-adapters.ts`, затем projection и браузерные fixtures.
- Чтение свойства: `core/capture/dom-element-analyzer.ts`.
- Новая причина переснять DOM: `core/observation/dom-observation-session.ts`.
- Граница фокуса: `core/observation/blur-confirmation.ts`.
- Учебная трактовка уже прочитанного значения: `contracts/control-value.ts`.
- Формат сохраняемого документа: `contracts/*.models.ts` и соответствующий codec.
- Правило записи: `recording/state-recorder.ts`; преобразование журнала — `scenario-compiler.ts`.
- Сопоставление целей: `runtime/control-matcher.ts`; оценка полей — `field-evaluator.ts`.
- Переходы шагов: `runtime/scenario-runtime.ts`; повторные сообщения — `feedback-tracker.ts`.
- Текст/вид Taiga Alerts: `projects/demo/src/app/pages/learn`, не runtime/core.

## Подключение наблюдения к Angular

```ts
import {DOCUMENT} from '@angular/common';
import {afterNextRender, ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {TrainingObserver} from '@training-observer/core';

@Component({
    selector: 'app-observation-panel',
    standalone: true,
    template: `<p>Контролов: {{ observer.logicalControls().length }}</p>`,
    providers: [TrainingObserver],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObservationPanel {
    protected readonly observer = inject(TrainingObserver);
    private readonly document = inject(DOCUMENT);

    constructor() {
        afterNextRender(() => {
            // Use an existing application root. No marker is added to the target interface.
            const root = this.document.querySelector('main');
            if (root) this.observer.start(root);
        });
    }
}
```

Выберите фактический root приложения. В примере панель должна находиться вне `main`; если она попадает
в наблюдаемую область, исключите **собственный** UI через ignoreSelector. Не добавляйте локаторы целевым полям.
Один предоставленный экземпляр TrainingObserver соответствует одному сеансу. DestroyRef внутри сервиса
освобождает ресурсы; при замене root вызовите start заново. Не вызывайте capture в getter шаблона.

Опции можно передать вторым аргументом start, например `{maxNodes: 15000, batchDelayMs: 50}`.
Указывайте ignoreSelector для существующего собственного контейнера панели. Не повышайте лимиты автоматически
при truncated: сначала проверьте нужный scope. Password/file скрываются анализатором; политика произвольных
чувствительных полей пока не завершена, не считайте снимок универсально обезличенным.

### Чтение экрана

```ts
import {readScreenState} from '@training-observer/core';
import type {ScreenStateOptions} from '@training-observer/core/models';

const options: ScreenStateOptions = {
    root: {tagName: 'section', attribute: {name: 'aria-label', value: 'Анкета'}},
    identity: {kind: 'attribute', name: 'id'},
    loading: {name: 'aria-busy', value: 'true'},
};
const screen = readScreenState(observer.snapshot(), observer.logicalControls(), options);
```

Это пример конфигурации уже существующей разметки, не требование её добавить. Для ID в URL пока требуется
расширение reader. Не проверяйте ответы, пока backend ещё заполняет экран: согласуйте существующий признак
готовности. Значение, пришедшее в тот же input после первого ready-снимка, сейчас относится к последующему
изменению; для текстовых полей оно ожидает blur.

## Подключение административной логики

```ts
import {StateRecorder, compileScenario} from '@training-observer/recording';
import {parseStateRecording} from '@training-observer/contracts';

const recorder = new StateRecorder();
recorder.start(screen, observer.confirmedControls());
// On subsequent state publications:
recorder.observe(nextScreen, observer.confirmedControls());
// After Stop handlers/rendering settle, flush and deliver one last observation before stop:
observer.flush();
recorder.observe(latestScreen, observer.confirmedControls());
const recording = recorder.stop();
const validated = parseStateRecording(JSON.stringify(recording));
const scenario = compileScenario(validated);
```

`latestScreen` нужно заново получить из snapshot после flush. В Angular Stop demo делает это в
`afterNextRender`, чтобы обработчики поля успели завершиться. Start тоже делает flush до начала новой записи.
Вызовы observe выполняются из эффекта интеграции; `StateRecorder` не запускает subscriptions самостоятельно.

Компиляция не публикует сценарий. Отредактируйте копию ожиданий и сохраните явным действием. Хранилище можно
заменить серверным API, не меняя core/recording/runtime. Не сохраняйте живые DOM references или полный
диагностический граф вместо учебного документа.

## Подключение прохождения

```ts
import {parseScenario} from '@training-observer/contracts';
import {ScenarioRuntime} from '@training-observer/runtime';

const scenario = parseScenario(savedJson);
const runtime = new ScenarioRuntime(scenario);
const progress = runtime.update(screen, observer.confirmedControls());
for (const message of progress.feedback) {
    // UI integration displays message through its notification service.
}
```

Для новой попытки создавайте новый runtime и новый сеанс наблюдения. Не переиспользуйте старые confirmedControls.
Вызывайте update на изменениях ScreenState и confirmedControls. `progress.feedback` — только новые сообщения;
не повторяйте последнюю порцию на каждом рендере. Обработка `waiting/blocked` относится к состоянию наблюдения,
а не к ошибке ученика. Пример реальной интеграции — `pages/learn/learn.component.ts`.

## Контракты, совместимость, enum

В core используются enum ControlType и ScreenStatus, в contracts — RecordingEventKind, TrainingStatus,
MatchStatus. Все значения строковые и совпадают с JSON v1. Не используйте числовые enum для сохраняемых типов.
Не меняйте wire-значение ради переименования TypeScript-member. Конфигурации могут продолжать передавать строковые
литералы — типы на JSON-границе это явно допускают.

Старые импорты `StateRecorder`, `ScenarioRuntime`, `compileScenario`, `parseScenario` из core удалены намеренно:
совместимый re-export создал бы запрещённую зависимость. Сами документы и ключи localStorage не менялись.
Сценарии старой ветки `new` не принимаются как записи состояний автоматически.

## Добавление теста

1. Для правила значений, compiler, matching или runtime добавьте unit в `tests/unit`.
2. Для capture, фокуса, popup, Angular rendering или remount нужен Playwright тест реальной страницы.
3. Ожидайте наблюдаемое состояние, а не произвольную задержку. Наличие формы ещё не означает, что runtime
   успел получить ready-снимок. Перед переходом проверяйте готовность наблюдения.
4. При быстром true → false убедитесь, что промежуточное состояние было опубликовано: снимки не обещают
   восстановить состояние, существовавшее целиком между двумя capture.
5. Если меняется контракт, проверьте корректный и повреждённый JSON, false/пустое значение и отсутствие поля.
6. После изменения границ выполните lint и production build: dev server не проверяет упаковку пакетов.

## Отладка по симптомам

| Симптом | Что проверить |
| --- | --- |
| Поле видно, но нет в controls | scope, visibility, unsupported adapter, truncated snapshot |
| Input ещё не засчитан | logical focus, pending blur, confirmedControls |
| ComboBox отображает другое значение | текст после blur; виджет мог очистить недопустимый запрос |
| Верный ответ не совпал | точная строка/формат числа, выбранная подпись, descriptor match |
| Переход отклонён | ready-снимок прошлого экрана, обязательные поля, ID следующего экрана |
| Ошибки на первом рендере | runtime должен использовать исходное состояние без negative feedback |
| После возврата теряется ответ | новый DOM-id должен получить исходное значение remount |
| Невозможно опубликовать | пропуски журнала, удалённая граница, устаревшая связь journal/scenario |

Не исправляйте ambiguous выбором первого кандидата. При новой разметке улучшайте наблюдаемый descriptor
или требуйте явную конфигурацию, сохраняя отказ для неразличимых целей.
