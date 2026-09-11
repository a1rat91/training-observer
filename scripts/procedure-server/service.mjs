const option = (value, label) => ({value, label});
const field = (key, kind, label, extra = {}) => ({key, kind, label, ...extra});
const identity = () => ({
    key: 'identity',
    title: 'Данные сотрудника',
    fields: [
        field('employee', 'text', 'ФИО', {required: true}),
        field('email', 'email', 'Рабочая почта', {required: true}),
        field('trainingKind', 'select', 'Вид обучения', {
            required: true,
            options: [option('internal', 'Внутренний курс'), option('external', 'Внешний курс')],
        }),
    ],
});
const details = (branch) =>
    branch === 'internal'
        ? {
              key: 'internal-details',
              title: 'Внутренний курс',
              fields: [
                  field('course', 'select', 'Курс', {
                      required: true,
                      options: [option('angular', 'Angular'), option('typescript', 'TypeScript')],
                  }),
                  field('attendance', 'radio', 'Формат участия', {
                      required: true,
                      options: [option('online', 'Онлайн'), option('onsite', 'Очно')],
                  }),
                  field('mentor', 'switch', 'Нужен наставник', {default: false}),
                  field('comment', 'textarea', 'Комментарий'),
              ],
          }
        : {
              key: 'external-details',
              title: 'Внешний курс',
              fields: [
                  field('provider', 'text', 'Организатор', {required: true}),
                  field('cost', 'number', 'Стоимость', {required: true, min: 1}),
                  field('startDate', 'date', 'Дата начала', {required: true}),
                  field('justification', 'textarea', 'Обоснование'),
              ],
          };
const dateValid = (value) =>
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
const fail = (status, code, message, fieldErrors = []) => ({status, body: {error: {code, message, fieldErrors}}});

/** Synthetic domain service. No observer, DOM identifiers or training state. */
export function createProcedureService() {
    const sessions = new Map();
    let serial = 0;
    const schema = (session) => {
        const first = identity();
        if (session.state.startsWith('details-')) {
            first.fields = first.fields.map((item) => ({...item, readonly: true}));
            return {title: 'Заявка на обучение', sections: [first, details(session.branch)]};
        }
        if (session.state === 'review') {
            const fields = [...identity().fields, ...details(session.branch).fields];
            return {
                title: 'Подтверждение заявки',
                summary: fields.map((item) => {
                    const value = session.values[item.key] ?? '';
                    return {
                        label: item.label,
                        value:
                            item.options?.find((entry) => entry.value === value)?.label ??
                            (typeof value === 'boolean' ? (value ? 'Да' : 'Нет') : String(value)),
                    };
                }),
                sections: [
                    {
                        key: 'confirmation',
                        title: 'Проверка данных',
                        fields: [field('confirmed', 'checkbox', 'Данные проверены', {required: true})],
                    },
                ],
            };
        }
        return {title: 'Данные сотрудника', sections: [first]};
    };
    const response = (session, render) => {
        const common = {
            procedureId: session.id,
            revision: session.revision,
            state: session.state,
            render,
            values: {...session.values},
        };
        if (session.state === 'completed')
            return {...common, completion: {title: 'Заявка принята', applicationNumber: session.number}};
        return {
            ...common,
            screen: {
                ...schema(session),
                actions: [
                    ...(session.state !== 'identity' ? [{action: 'back', label: 'Назад'}] : []),
                    {action: 'next', label: 'Продолжить'},
                ],
            },
        };
    };
    const validate = (fields, values) =>
        fields.flatMap((item) => {
            const value = values[item.key];
            let message = '';
            if (
                item.required &&
                (value == null ||
                    (typeof value === 'string' && !value.trim()) ||
                    (item.kind === 'checkbox' && value !== true))
            )
                message = 'Заполните обязательное поле';
            else if (value != null && value !== '') {
                if (
                    item.kind === 'number' &&
                    (typeof value !== 'number' || !Number.isFinite(value) || value < item.min)
                )
                    message = `Минимальное значение: ${item.min}`;
                else if (
                    item.kind === 'email' &&
                    (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
                )
                    message = 'Укажите корректную почту';
                else if (item.kind === 'date' && !dateValid(value)) message = 'Укажите корректную дату';
                else if (item.options && !item.options.some((entry) => entry.value === value))
                    message = 'Выберите значение из списка';
                else if (['checkbox', 'switch'].includes(item.kind) && typeof value !== 'boolean')
                    message = 'Ожидается логическое значение';
                else if (['text', 'textarea'].includes(item.kind) && typeof value !== 'string')
                    message = 'Ожидается текст';
            }
            return message ? [{key: item.key, message}] : [];
        });
    return {
        create(profile = 'normal') {
            if (!['normal', 'slow', 'fail-once', 'lost-response'].includes(profile))
                return fail(400, 'BAD_PROFILE', 'Неизвестный профиль');
            if (sessions.size >= 1000) return fail(503, 'CAPACITY', 'Перезапустите тестовый сервер');
            const id = `p-${++serial}`;
            const session = {
                id,
                number: `EDU-${String(serial).padStart(4, '0')}`,
                revision: 1,
                state: 'identity',
                values: {},
                profile,
                faultUsed: false,
                cache: new Map(),
            };
            sessions.set(id, session);
            return {status: 201, body: response(session, 'replace')};
        },
        delay(id) {
            return sessions.get(id)?.profile === 'slow' ? 1500 : 250;
        },
        action(id, request) {
            const session = sessions.get(id);
            if (!session) return fail(404, 'NOT_FOUND', 'Процедура не найдена');
            if (
                !request ||
                typeof request.requestId !== 'string' ||
                !request.requestId ||
                !['next', 'back'].includes(request.action) ||
                !Number.isInteger(request.expectedRevision) ||
                !request.values ||
                typeof request.values !== 'object' ||
                Array.isArray(request.values)
            )
                return fail(400, 'BAD_REQUEST', 'Некорректное действие');
            // Canonical fingerprint: JSON object key order is not part of request identity.
            const fingerprint = JSON.stringify([
                request.expectedRevision,
                request.action,
                Object.entries(request.values).sort(([a], [b]) => a.localeCompare(b)),
            ]);
            const cached = session.cache.get(request.requestId);
            if (cached)
                return cached.fingerprint === fingerprint
                    ? structuredClone(cached.result)
                    : fail(409, 'REQUEST_ID_REUSED', 'requestId уже использован с другими данными');
            if (request.expectedRevision !== session.revision)
                return fail(409, 'REVISION_CONFLICT', 'Состояние изменилось. Начните новую процедуру.');
            if (session.state === 'completed') return fail(409, 'COMPLETED', 'Процедура завершена');
            if (session.profile === 'fail-once' && !session.faultUsed && request.action === 'next') {
                session.faultUsed = true;
                return fail(503, 'TEMPORARY', 'Тестовый сбой до выполнения действия');
            }
            let render = 'replace';
            if (request.action === 'back') {
                if (session.state === 'identity') return fail(409, 'NO_PREVIOUS', 'Это первый экран');
                session.state = session.state === 'review' ? `details-${session.branch}` : 'identity';
                delete session.values.confirmed;
            } else {
                const fields = schema(session)
                    .sections.flatMap((section) => section.fields)
                    .filter((item) => !item.readonly);
                const values = Object.fromEntries(
                    fields.map((item) => [item.key, request.values[item.key] ?? item.default ?? null]),
                );
                const errors = validate(fields, values);
                if (
                    session.state === 'details-external' &&
                    values.cost > 100000 &&
                    (typeof values.justification !== 'string' || values.justification.replace(/\s/g, '').length < 20)
                )
                    errors.push({
                        key: 'justification',
                        message: 'Для стоимости свыше 100 000 ₽ укажите обоснование не короче 20 символов',
                    });
                if (errors.length) {
                    const result = {
                        status: 422,
                        body: {
                            procedureId: id,
                            revision: session.revision,
                            state: session.state,
                            error: {code: 'VALIDATION_FAILED', fieldErrors: errors},
                        },
                    };
                    session.cache.set(request.requestId, {fingerprint, result: structuredClone(result)});
                    return result;
                }
                if (session.state === 'identity') {
                    if (session.branch !== values.trainingKind) session.values = {};
                    session.branch = values.trainingKind;
                    Object.assign(session.values, values);
                    for (const item of details(session.branch).fields)
                        if (!(item.key in session.values)) session.values[item.key] = item.default ?? null;
                    session.state = `details-${session.branch}`;
                    render = 'append';
                } else {
                    Object.assign(session.values, values);
                    session.state = session.state === 'review' ? 'completed' : 'review';
                }
            }
            session.revision++;
            const result = {status: 200, body: response(session, render)};
            session.cache.set(request.requestId, {fingerprint, result: structuredClone(result)});
            if (session.profile === 'lost-response' && !session.faultUsed && request.action === 'next') {
                session.faultUsed = true;
                return fail(503, 'RESPONSE_LOST', 'Тестовый сбой доставки после выполнения действия');
            }
            return result;
        },
    };
}
