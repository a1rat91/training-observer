# Angular: запись и прохождение

Angular-фасады записи и прохождения: `@training-observer/angular`.

## Подключение

```ts
import {Component, inject} from '@angular/core';
import {provideRecordingSession, RecordingSession} from '@training-observer/angular';

@Component({
  selector: 'app-recorder',
  template: `
    <button
      [disabled]="session.screen().status !== 'ready'"
      (click)="session.start()"
    >
      Запись
    </button>
    <button
      [disabled]="!session.recording() || session.stopping()"
      (click)="save()"
    >
      Остановить
    </button>
  `,
  providers: [
    provideRecordingSession({
      root: 'main',
      screen: {
        root: {tagName: 'section', attribute: {name: 'aria-label', value: 'Анкета'}},
        identity: {kind: 'attribute', name: 'id'},
        loading: {name: 'aria-busy', value: 'true'},
      },
    }),
  ],
})
export class Recorder {
  readonly session = inject(RecordingSession);

  async save() {
    const document = await this.session.stop();
    // Сохраните document в хранилище приложения.
  }
}
```

Правила `screen` описывают существующий интерфейс. `root` — область обхода DOM, по умолчанию `document.body`.
CSS-селектор отслеживает позднее появление, удаление и замену корня. `screen.root` описывает логический экран внутри
области, включая саму область как возможный корень. Панель редактора размещайте вне области либо исключайте через
`observation.ignoreSelector`. Остальные настройки capture и частоты передаются в `observation`.

Замена физического корня продолжает текущую запись или попытку: уже подтверждённые ответы и последний focusout уходящей
области сохраняются, даже если старый DOM удалён. Промежуток без корня остаётся недоступным экраном и отмечает пропуск в
записи. Удаление поля без focusout не подтверждает его значение; явный новый `start` прохождения отменяет подтверждения
прежней попытки.

Provider сам подключает core-сервисы, запускает наблюдение после рендера, доставляет атомарные обновления в движок и
освобождает observers, listeners, таймеры и подсветку через DestroyRef. На сервере render-callback не запускает
наблюдение. Подписываться на слепки или вручную вызывать `observe` не требуется. Angular 19.2 и RxJS 7.8 предоставляет
приложение; Taiga, localStorage и HTTP не нужны. Модели остаются в `@training-observer/core/models`.

## Запись

`start()` требует готовый экран, очищает документ и запоминает baseline подтверждений. `stop()` возвращает Promise
документа после следующего рендера и финального flush: уход фокуса на кнопку сохраняет последнее поле. Остановка сама не
создаёт blur для активного поля. Повторный вызов во время остановки ждёт ту же операцию; уничтожение владельца отменяет
ожидающую остановку с ошибкой. После stop наблюдение продолжает обновлять инспектор и позволяет начать новую запись.

Readonly signals: `screen`, `visit`, `draft`, `recording`, `stopping`, `error`, `snapshot`, `controls`,
`confirmedControls`, `scanCount`, `revision`. `highlight(nodeId | null)` включает подсветку. Редактирование, undo,
компиляция и хранение документа принадлежат UI приложения.

## Прохождение

```ts
import {provideTrainingSession, TrainingSession} from '@training-observer/angular';

// providers: [provideTrainingSession({root: 'main', screen: screenOptions})]
const session = inject(TrainingSession);
session.feedback$.subscribe((feedback) => showMessage(feedback.message, feedback.kind));
session.start(validatedScenario);
// UI читает session.progress(), session.screen(), session.error().
// session.stop() отменяет попытку и останавливает наблюдение.
```

`start(scenario)` создаёт новую попытку, сбрасывает старые blur-подтверждения и получает начальное состояние после
рендера. `feedback$` отдаёт каждое новое сообщение один раз и завершается по DestroyRef. `progress.feedback` служит
диагностикой текущего обновления: повторно показывать его на каждом рендере не нужно. Завершение сценария сохраняет
наблюдение: последующие неверные правки снимают выполненность по прежним правилам. Внешний сценарий сначала проверяйте
через `parseScenario` из contracts.

Запись и прохождение в одном компоненте имеют независимых наблюдателей. Локальный provider освобождает ресурсы при уходе
компонента; root-provider живёт до уничтожения приложения.

## Проверка

`npx nx build training-angular --configuration=production`; lifecycle-тесты в
`projects/demo/src/app/shared/training-sessions.spec.ts`; browser tests в `tests/recording*.spec.ts` и
`tests/training.spec.ts`. После production-сборок `node scripts/verify-packages.mjs` проверяет независимый Angular CLI
consumer и чистый Node ESM consumer без Angular.
