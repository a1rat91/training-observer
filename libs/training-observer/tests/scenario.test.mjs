import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
// Node's strip-types does not resolve TypeScript's extensionless internal imports.
const hook = registerHooks({resolve(specifier, context, next) {
    try { return next(specifier, context); }
    catch (error) {
        if (specifier.startsWith('.') && context.parentURL?.includes('/src/lib/')) return next(specifier + '.ts', context);
        throw error;
    }
}});
const {matchControl} = await import('../src/lib/scenario/control-matcher.ts');
const {compileScenario} = await import('../src/lib/scenario/scenario.ts');
const {parseScenario} = await import('../src/lib/scenario/scenario-codec.ts');
const {StateRecorder} = await import('../src/lib/recording/state-recorder.ts');
const {ScenarioRuntime} = await import('../src/lib/scenario/scenario-runtime.ts');
hook.deregister();
const descriptor = (label, id) => ({kind:'textbox', label, id, role:'textbox', tagName:'input', context:[]});
const control = (id,label,value,extra={}) => ({id, visible:true, kind:'textbox', locatorHints:descriptor(label), state:{value}, ...extra});
const field = (label, expected) => ({descriptor:descriptor(label), expected, message:`Ошибка ${label}`, optional:false});
const screen = (key,controls=[]) => ({status:'ready',key,controls});
const scenario = {kind:'training-state-scenario',version:1,steps:[{key:'A',task:'Task',transitionMessage:'Неверный переход',fields:[field('Имя','Анна'),field('Город','Казань')]},{key:'B',task:'Done',transitionMessage:'Неверный переход',fields:[]}]};

test('matcher ignores DOM/session identity and layout; refuses near duplicates and incompatible kinds', () => {
    const a=control('new-node','Имя','value');
    assert.equal(matchControl(descriptor('Имя'), [a]).status,'matched');
    assert.equal(matchControl(descriptor('Имя'), [a,{...a,id:'duplicate'}]).status,'ambiguous');
    assert.equal(matchControl(descriptor('Имя'), [{...a,kind:'select'}]).status,'missing');
    assert.equal(matchControl(descriptor('Old label','stable-field'), [{...a,locatorHints:descriptor('New label','stable-field')}]).status,'matched');
    assert.equal(matchControl(descriptor('Old label','tui-123'), [{...a,locatorHints:descriptor('New label','tui-123')}]).status,'missing');
});
test('compile keeps last value per field; malformed/incomplete documents are rejected', () => {
    const recording={kind:'training-state-recording',version:1,complete:true,events:[{kind:'screen',visit:1,screenKey:'A'},
        {kind:'value',visit:1,screenKey:'A',field:descriptor('Имя'),value:'Old'},
        {kind:'value',visit:1,screenKey:'A',field:descriptor('Имя'),value:'Анна'}]};
    assert.equal(compileScenario(recording).steps[0].fields[0].expected,'Анна');
    assert.throws(()=>compileScenario({...recording,complete:false}));
    assert.deepEqual(parseScenario(JSON.stringify(scenario)),JSON.parse(JSON.stringify(scenario)));
    assert.throws(()=>parseScenario(JSON.stringify({...scenario,version:2})));
    assert.throws(()=>parseScenario(JSON.stringify({...scenario,steps:[]})));
});
test('learner accepts reverse field order, requires blur, deduplicates feedback and completes at the next screen', () => {
    const r=new ScenarioRuntime(scenario), a=control('a','Имя',''), b=control('b','Город','');
    r.update(screen('A',[a,b]),{});
    assert.equal(r.update(screen('A',[{...a,state:{value:'Анна'}},b]),{}).completedFields,0);
    const wrong={b:control('b','Город','Москва')};
    assert.deepEqual(r.update(screen('A',[a,b]),wrong).feedback,['Ошибка Город']);
    assert.deepEqual(r.update(screen('A',[a,b]),wrong).feedback,[]);
    const correct={b:control('b','Город','Казань'),a:control('a','Имя','Анна')};
    assert.equal(r.update(screen('A',[a,b]),correct).completedFields,2);
    assert.equal(r.update(screen('B'),correct).status,'complete');
});
test('wrong transition cannot bypass missing fields; return, correction and last blur at navigation work', () => {
    const r=new ScenarioRuntime(scenario), a=control('a','Имя',''), b=control('b','Город','');
    r.update(screen('A',[a,b]),{});
    assert.deepEqual(r.update(screen('B'),{}).feedback,['Неверный переход']);
    assert.equal(r.update(screen('B'),{}).step,1);
    r.update(screen('A',[a,b]),{});
    assert.equal(r.update(screen('B'),{a:control('a','Имя','Анна'),b:control('b','Город','Казань')}).status,'complete');
});
test('ambiguous, missing and unknown choice block assessment without blaming the learner', () => {
    const r=new ScenarioRuntime(scenario), a=control('a','Имя',''), b=control('b','Город','');
    const ambiguous=r.update(screen('A',[a,b,{...a,id:'dup'}]),{});
    assert.equal(ambiguous.status,'blocked');assert.deepEqual(ambiguous.feedback,[]);
    assert.equal(r.update({...screen('A'),status:'loading'},{}).status,'waiting');
    assert.equal(r.update(screen('A',[a,b]),{a:{...a,choice:{selection:{status:'unknown'}}}}).status,'blocked');
});
test('correct value changed to wrong is revoked; optional expectations do not block', () => {
    const s={...scenario,steps:[{...scenario.steps[0],fields:[field('Имя','Анна'),{...field('Нет поля',''),optional:true}]}]};
    const r=new ScenarioRuntime(s), a=control('a','Имя','');
    r.update(screen('A',[a]),{});
    assert.equal(r.update(screen('A',[a]),{a:control('a','Имя','Анна')}).status,'complete');
    assert.equal(r.update(screen('A',[a]),{a:control('a','Имя','Борис')}).status,'active');
});

test('ComboBox compares displayed text only after confirmation, including clearing and correction', () => {
    const combo = text => control('c','Сотрудник',text,{kind:'combobox',
        locatorHints:{...descriptor('Сотрудник'),kind:'combobox'},
        choice:{displayValue:text,selection:{status:'unknown',labels:[]}}});
    const c=combo('Анна');
    const r=new ScenarioRuntime({...scenario,steps:[{...scenario.steps[0],fields:[{
        ...field('Сотрудник',['Анна']),descriptor:c.locatorHints}]}]});
    assert.equal(r.update(screen('A',[combo('')]),{}).status,'active');
    assert.equal(r.update(screen('A',[c]),{c:combo('Анна')}).status,'complete');
    const wrong=r.update(screen('A',[c]),{c:combo('')});
    assert.equal(wrong.status,'active');assert.deepEqual(wrong.feedback,['Ошибка Сотрудник']);
    assert.equal(r.update(screen('A',[c]),{c:combo('Анна')}).status,'complete');
    assert.equal(r.update(screen('A',[c]),{c:{...combo('Анна'),state:{redacted:true}}}).status,'blocked');
});

test('new screen checkbox defaults stay quiet; changes report errors and unmet fields still block transition', () => {
    const box = (id, checked) => control(id,'Согласие','',{kind:'checkbox',
        locatorHints:{...descriptor('Согласие'),kind:'checkbox'},state:{checked}});
    const c=box('c',false);
    const s={...scenario,steps:[{...scenario.steps[0],fields:[]},
        {key:'B',task:'',transitionMessage:'Заполните поля',fields:[{...field('Согласие',true),descriptor:c.locatorHints}]},
        {key:'C',task:'',transitionMessage:'',fields:[]}]};
    const r=new ScenarioRuntime(s);
    r.update(screen('A'),{});
    const entered=r.update(screen('B',[c]),{});
    assert.deepEqual(entered.feedback,[]);assert.equal(entered.completedFields,0);
    assert.deepEqual(r.update(screen('B',[box('c',false)]),{}).feedback,[]);
    assert.equal(r.update(screen('C'),{}).step,2);
    r.update(screen('B',[box('c',true)]),{});
    assert.deepEqual(r.update(screen('B',[box('c',false)]),{}).feedback,['Ошибка Согласие']);
    assert.deepEqual(r.update(screen('B',[box('c',false)]),{}).feedback,[]);
    assert.deepEqual(r.update(screen('B',[box('remounted',false)]),{}).feedback,[]);
    r.update(screen('B',[box('remounted',true)]),{});
    assert.equal(r.update(screen('C'),{}).status,'complete');
});
test('late appearing immediate controls get a quiet baseline without accepting wrong defaults', () => {
    const c=control('c','Согласие','',{kind:'checkbox',locatorHints:{...descriptor('Согласие'),kind:'checkbox'},state:{checked:false}});
    const r=new ScenarioRuntime({...scenario,steps:[{...scenario.steps[0],fields:[{...field('Согласие',true),descriptor:c.locatorHints}]}]});
    assert.equal(r.update(screen('A'),{}).status,'blocked');
    const first=r.update(screen('A',[c]),{});
    assert.equal(first.status,'active');assert.equal(first.completedFields,0);assert.deepEqual(first.feedback,[]);
});

test('prefilled answers are accepted on entry and after returning from a wrong screen', () => {
    const r=new ScenarioRuntime(scenario), a=control('a','Имя','Анна'),b=control('b','Город','Казань');
    const first=r.update(screen('A',[a,b]),{});
    assert.equal(first.completedFields,2);assert.deepEqual(first.feedback,[]);
    assert.deepEqual(r.update(screen('WRONG'),{}).feedback,['Неверный переход']);
    const returned=r.update(screen('A',[control('new-a','Имя','Анна'),control('new-b','Город','Казань')]),{});
    assert.equal(returned.completedFields,2);assert.deepEqual(returned.feedback,[]);
    const next=r.update(screen('B'),{});
    assert.equal(next.status,'complete');assert.deepEqual(next.feedback,[]);
});
test('wrong prefilled text stays quiet and cannot advance; later edits require blur', () => {
    const r=new ScenarioRuntime({...scenario,steps:[{...scenario.steps[0],fields:[field('Имя','Анна')]},scenario.steps[1]]});
    const a=control('a','Имя','Борис');
    const first=r.update(screen('A',[a]),{});
    assert.equal(first.completedFields,0);assert.deepEqual(first.feedback,[]);
    assert.equal(r.update(screen('B'),{}).step,1);
    const correct=control('new','Имя','Анна');
    assert.equal(r.update(screen('A',[correct]),{}).completedFields,1);
    const edited=control('new','Имя','Борис');
    assert.equal(r.update(screen('A',[edited]),{}).completedFields,1);
    const blurred=r.update(screen('A',[edited]),{new:edited});
    assert.equal(blurred.completedFields,0);assert.deepEqual(blurred.feedback,['Ошибка Имя']);
    assert.equal(r.update(screen('B'),{new:edited}).step,1);
});

test('a prefilled amount on a later screen is evaluated immediately; edits wait for blur', () => {
    const amount = value => control('amount','Сумма',value,{kind:'number',
        locatorHints:{...descriptor('Сумма'),kind:'number'}});
    const s={...scenario,steps:[{...scenario.steps[0],fields:[]},{key:'B',task:'',transitionMessage:'',
        fields:[{...field('Сумма','1500'),descriptor:amount('').locatorHints}]}]};
    for (const value of ['1500','2000']) {
        const r=new ScenarioRuntime(s);
        r.update(screen('A'),{});
        const first=r.update(screen('B',[amount(value)]),{});
        assert.equal(first.status,value === '1500' ? 'complete' : 'active');
        assert.deepEqual(first.feedback,[]);
        // Merely changing the DOM property does not commit the edited amount.
        assert.equal(r.update(screen('B',[amount('3000')]),{}).completedFields,value === '1500' ? 1 : 0);
        const committed=r.update(screen('B',[amount('3000')]),{amount:amount('3000')});
        assert.equal(committed.completedFields,0);assert.deepEqual(committed.feedback,['Ошибка Сумма']);
    }
});

test('recorded checkbox/radio picture compiles last states and false remains a required answer', () => {
    const choice=(id,kind,checked)=>control(id,id,'',{kind,state:{checked},locatorHints:{...descriptor(id),kind}});
    const start=[choice('check','checkbox',false),choice('one','radio',false),choice('two','radio',false)];
    const final=[start[0],choice('one','radio',true),start[2]];
    const recorder=new StateRecorder();recorder.start(screen('A',start),{});
    recorder.observe(screen('A',final),{});
    const model=compileScenario(recorder.stop());
    assert.deepEqual(model.steps[0].fields.map(f=>f.expected),[false,true,false]);
    const r=new ScenarioRuntime(model);
    assert.equal(r.update(screen('A',final),{}).status,'complete');
    const wrong=r.update(screen('A',[choice('check','checkbox',true),...final.slice(1)]),{});
    assert.equal(wrong.completedFields,2);assert.equal(wrong.feedback.length,1);
});
