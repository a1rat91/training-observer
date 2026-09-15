/** Прохождение: принимает готовый сценарий и наблюдаемые состояния, возвращает прогресс и новые сообщения. */
export {type ControlMatch, matchControl} from './lib/control-matcher';
export {ScenarioRuntime} from './lib/scenario-runtime';
export {
    FeedbackKind,
    type TrainingFeedback,
    type TrainingProgress,
} from './lib/training-progress';
