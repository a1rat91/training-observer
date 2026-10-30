/** Прохождение: принимает готовый сценарий и наблюдаемые состояния, возвращает прогресс и новые сообщения. */
export {type ControlMatch, matchControl} from './lib/control-matcher';
export {provideTrainingSession} from './lib/provide-training-session';
export {ScenarioRuntime} from './lib/scenario-runtime';
export {
    FeedbackKind,
    type TrainingFeedback,
    type TrainingProgress,
} from './lib/training-progress';
export {TrainingSession} from './lib/training-session.service';
