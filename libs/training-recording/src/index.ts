/** Административная логика: запись, безопасное редактирование и компиляция. Не содержит runtime ученика. */
export { StateRecorder } from './lib/state-recorder';
export { compileScenario } from './lib/scenario-compiler';
export { removeRecordedEvent, recordingProblem } from './lib/recording-edit';
