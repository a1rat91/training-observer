/** Административная логика: запись, безопасное редактирование и компиляция. Не содержит runtime ученика. */
export {provideRecordingSession} from './lib/provide-recording-session';
export {recordingProblem, removeRecordedEvent} from './lib/recording-edit';
export {RecordingSession} from './lib/recording-session.service';
export {compileScenario} from './lib/scenario-compiler';
export {StateRecorder} from './lib/state-recorder';
