/* Vehicle Registration Number Validator — DFA engine + UI.
   Part 1 (engine) has no DOM dependency and is testable in Node. */
'use strict';

const STATE_CODES = ['AN','AP','AR','AS','BR','CG','CH','DD','DL','DN','GA','GJ','HP','HR','JH','JK','KA','KL','LA','LD','MH','ML','MN','MP','MZ','NL','OD','PB','PY','RJ','SK','TN','TR','TS','UK','UP','WB'];
const FIRST_LETTERS = new Set(STATE_CODES.map(c => c[0]));
// Standard form is [0-9]{2}; extended form 1–9 + letter (e.g. Delhi "8C") is also accepted.
const REGEX = /^([A-Z]{2})(0[1-9]|[1-9][0-9]|[1-9][A-Z])([A-Z]{2})([0-9]{1,4})$/;

const isL = c => c >= 'A' && c <= 'Z';
const isD = c => c >= '0' && c <= '9';
const nodeId = s => s.split(':')[0];
const label = s => (s.includes(':') ? s.replace(':', '[') + ']' : s);
const ACCEPTING = new Set(['q7','q8','q9','q10']);
const NEXT_DIGIT = { q6:['q7','q7z'], q7:['q8'], q7z:['q8','q8z'], q8:['q9'], q8z:['q9','q9z'], q9:['q10'], q9z:['q10','q10z'] };

/* DFA transition function δ(state, char). Every pair yields exactly one state. */
function delta(state, ch) {
  const D = 'qD';
  if (state === 'q0') return isL(ch) && FIRST_LETTERS.has(ch) ? 'q1:' + ch : D;
  if (state.startsWith('q1:')) return isL(ch) && STATE_CODES.includes(state[3] + ch) ? 'q2' : D;
  switch (state) {
    case 'q2':  return isD(ch) ? (ch === '0' ? 'q3z' : 'q3') : D;
    case 'q3z': return isD(ch) && ch !== '0' ? 'q4' : D;       // RTO 00 / 0x rejected
    case 'q3':  return isD(ch) || isL(ch) ? 'q4' : D;           // 2nd RTO digit, or suffix letter
    case 'q4':  return isL(ch) ? 'q5' : D;
    case 'q5':  return isL(ch) ? 'q6' : D;
    case 'q6': case 'q7': case 'q7z': case 'q8': case 'q8z': case 'q9': case 'q9z': {
      if (!isD(ch)) return D;
      const [nz, z] = NEXT_DIGIT[state];
      return ch === '0' && z ? z : nz;   // "z" states = only zeros so far (value still 0)
    }
    default: return D; // q10, q10z (5th digit) and qD (absorbing)
  }
}

function runDFA(s) {
  let state = 'q0'; const steps = [];
  for (let i = 0; i < s.length; i++) {
    const next = delta(state, s[i]);
    steps.push({ i, ch: s[i], type: isL(s[i]) ? 'Letter' : 'Digit', from: state, to: next });
    state = next;
  }
  return { steps, final: state, accepted: ACCEPTING.has(state) };
}

function normalize(raw) {
  const s = raw.toUpperCase().replace(/[ -]/g, '');
  const bad = [...new Set(s.match(/[^A-Z0-9]/g) || [])];
  return { s, bad };
}

function explain(r) {
  const dead = r.steps.find(x => x.to === 'qD');
  if (!dead) {
    if (/z$/.test(r.final) && /^q(7|8|9|10)z$/.test(r.final)) return 'Vehicle number value is 0. It must be between 1 and 9999.';
    return `Input ended early (stopped in state ${label(r.final)}); the pattern is incomplete.`;
  }
  const { ch, from } = dead, pos = dead.i + 1;
  if (from === 'q0') return isD(ch) ? `Position ${pos}: state code must start with a letter, got a digit.` : `Position ${pos}: no state/UT code begins with "${ch}".`;
  if (from.startsWith('q1:')) return isD(ch) ? `Position ${pos}: state code needs a second letter, got a digit.` : `"${from[3] + ch}" is not a recognised state/UT code.`;
  if (from === 'q2') return `Position ${pos}: RTO code must start with a digit, got "${ch}".`;
  if (from === 'q3z') return 'RTO code cannot be 00 (or start with 0 followed by a letter).';
  if (from === 'q4' || from === 'q5') return `Position ${pos}: series must be two letters A–Z, got "${ch}".`;
  if (from === 'q10' || from === 'q10z') return isD(ch) ? 'Vehicle number has more than 4 digits.' : `Position ${pos}: vehicle number must contain digits only.`;
  return `Position ${pos}: vehicle number must contain digits only, got "${ch}".`;
}

/* Full validation: normalise → regex parse → independent component checks → DFA. */
function validate(raw) {
  const { s, bad } = normalize(raw);
  const out = { raw, s, accepted: false, steps: [], final: 'q0', components: null, reason: '', consistent: true };
  if (!s && !bad.length) { out.reason = 'Input is empty.'; return out; }
  if (bad.length) { out.reason = `Unsupported character(s): ${bad.join(' ')}. Only A–Z, 0–9, spaces and hyphens are allowed.`; return out; }
  const dfa = runDFA(s);
  Object.assign(out, { steps: dfa.steps, final: dfa.final });

  const m = REGEX.exec(s); let componentsOk = false;
  if (m) {
    const [, state, rto, series, num] = m, value = parseInt(num, 10);
    out.components = { state, rto, series, num, value };
    componentsOk = STATE_CODES.includes(state) && /^(0[1-9]|[1-9][0-9]|[1-9][A-Z])$/.test(rto) && value >= 1 && value <= 9999;
  }
  out.consistent = componentsOk === dfa.accepted;       // regex-side checks must agree with the DFA
  out.accepted = dfa.accepted && componentsOk;
  out.reason = out.accepted ? 'Every character matched the expected position; final state is accepting.' : explain(dfa);
  return out;
}

const TESTS = [
  ['MH12AB1', true], ['MH12AB12', true], ['MH12AB123', true], ['MH12AB1234', true],
  ['MH12AB0001', true], ['MH12AB0012', true], ['MH12AB0123', true], ['DL8CAF1', true],
  ['KA03MN9999', true], ['mh 12-ab-1234', true],
  ['MH12AB0', false], ['MH12AB0000', false], ['MH12AB12345', false], ['XX12AB1234', false],
  ['MH00AB1234', false], ['MH12A1234', false], ['MH12AB12A', false], ['', false], ['MH12AB12#4', false],
];

if (typeof module !== 'undefined') module.exports = { validate, TESTS, delta, STATE_CODES };

/* ===================== Part 2: UI ===================== */
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const input = $('vehicle-input'), HKEY = 'fafl_vehicle_history';
  const esc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  /* format guide */
  const CELLS = ['L','L','D','D','L','L','D','D?','D?','D?'];
  $('format-cells').innerHTML = CELLS.map((t, i) => `<span class="format-cell type-${t[0]}${t.length > 1 ? ' optional' : ''}" data-i="${i}">${t[0]}</span>`).join('');
  function updateGuide() {
    const { s } = normalize(input.value);
    $('char-counter').textContent = `${s.length} / 10 (min 7)`;
    document.querySelectorAll('.format-cell').forEach((c, i) => {
      c.classList.remove('filled-ok', 'filled-bad');
      if (i >= s.length) return;
      const ok = (CELLS[i][0] === 'L' ? isL(s[i]) : isD(s[i])) || (i === 3 && isL(s[i]) && /[1-9]/.test(s[2]));
      c.classList.add(ok ? 'filled-ok' : 'filled-bad');
    });
  }
  input.addEventListener('input', updateGuide);

  /* transition table */
  const ROWS = [
    ['q0','q1[X] if X starts a state code','qD','Start; reading 1st letter of state code'],
    ['q1[X]','q2 if XY is a state code, else qD','qD','1st letter X read; one q1[X] per code initial (18 states)'],
    ['q2','qD','q3z on 0, else q3','State code done; reading 1st RTO digit'],
    ['q3z','qD','q4 on 1–9, qD on 0','RTO began with 0, so 00 is forbidden'],
    ['q3','q4 (RTO suffix letter, e.g. 8C)','q4','RTO begins with 1–9; 2nd RTO char'],
    ['q4','q5','qD','RTO done; 1st series letter'],
    ['q5','q6','qD','2nd series letter'],
    ['q6','qD','q7z on 0, else q7','Series done; 1st vehicle digit'],
    ['q7','qD','q8','1 digit, value ≥ 1 — ACCEPT'],
    ['q7z','qD','q8z on 0, else q8','1 digit, all zeros so far — reject'],
    ['q8','qD','q9','2 digits, value ≥ 1 — ACCEPT'],
    ['q8z','qD','q9z on 0, else q9','2 digits, all zeros — reject'],
    ['q9','qD','q10','3 digits, value ≥ 1 — ACCEPT'],
    ['q9z','qD','q10z on 0, else q10','3 digits, all zeros — reject'],
    ['q10','qD','qD','4 digits, value ≥ 1 — ACCEPT; a 5th digit dies'],
    ['q10z','qD','qD','0000 — reject'],
    ['qD','qD','qD','Dead state: absorbing, never accepting'],
  ];
  $('transition-table-body').innerHTML = ROWS.map(r => {
    const cls = /^q(7|8|9|10)$/.test(r[0]) ? 'accept-state' : r[0] === 'qD' ? 'dead-state' : '';
    return `<tr><td class="${cls}">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`;
  }).join('');

  /* DFA graph (cytoscape) */
  let cy = null;
  if (window.cytoscape) {
    const P = { q0:[40,40], q1:[130,40], q2:[220,40], q3:[310,40], q3z:[310,130], q4:[400,40], q5:[490,40], q6:[580,40],
      q7:[580,220], q8:[490,220], q9:[400,220], q10:[310,220], q7z:[580,320], q8z:[490,320], q9z:[400,320], q10z:[310,320], qD:[90,270] };
    const E = [['q0','q1','letter'],['q1','q2','letter (valid code)'],['q2','q3','1–9'],['q2','q3z','0'],['q3z','q4','1–9'],['q3','q4','0–9, A–Z'],
      ['q4','q5','A–Z'],['q5','q6','A–Z'],['q6','q7','1–9'],['q6','q7z','0'],['q7','q8','0–9'],['q7z','q8','1–9'],['q7z','q8z','0'],
      ['q8','q9','0–9'],['q8z','q9','1–9'],['q8z','q9z','0'],['q9','q10','0–9'],['q9z','q10','1–9'],['q9z','q10z','0'],
      ['q10','qD','any',1],['q10z','qD','any',1]];
    const els = Object.entries(P).map(([id, p]) => ({ group:'nodes', data:{ id, label:id, kind: id==='qD'?'dead':ACCEPTING.has(id)?'accept':id==='q0'?'start':'' }, position:{x:p[0],y:p[1]} }))
      .concat(E.map(e => ({ group:'edges', data:{ id:e[0]+'>'+e[1], source:e[0], target:e[1], label:e[2], dashed:e[3]?1:0 } })));
    cy = cytoscape({ container:$('dfa-graph'), elements:els, layout:{ name:'preset', fit:true, padding:24 }, userZoomingEnabled:false, boxSelectionEnabled:false,
      style:[
        { selector:'node', style:{ label:'data(label)', 'text-valign':'center', color:'#1C2230', 'font-family':'JetBrains Mono, monospace', 'font-size':12, width:40, height:40, 'background-color':'#fff', 'border-width':2, 'border-color':'#2F4B6B' } },
        { selector:'node[kind="accept"]', style:{ 'background-color':'#E4F0E8', 'border-color':'#3E7A57', 'border-width':4, 'border-style':'double' } },
        { selector:'node[kind="dead"]', style:{ 'background-color':'#F6E7E3', 'border-color':'#A8402F' } },
        { selector:'node.active', style:{ 'background-color':'#B08A3E', 'border-color':'#B08A3E', color:'#fff' } },
        { selector:'edge', style:{ label:'data(label)', width:1.5, 'line-color':'#A9BFD4', 'target-arrow-color':'#A9BFD4', 'target-arrow-shape':'triangle', 'curve-style':'bezier', 'font-size':10, 'font-family':'JetBrains Mono, monospace', color:'#4A5266', 'text-background-color':'#fff', 'text-background-opacity':1, 'text-background-padding':2, 'edge-text-rotation':'none' } },
        { selector:'edge[dashed = 1]', style:{ 'line-style':'dashed', 'line-color':'#A8402F', 'target-arrow-color':'#A8402F' } },
        { selector:'edge.active', style:{ 'line-color':'#B08A3E', 'target-arrow-color':'#B08A3E', width:3.5 } },
      ] });
  }
  function highlight(step) {
    if (!cy) return;
    cy.elements().removeClass('active');
    if (!step) return;
    cy.getElementById(nodeId(step.to)).addClass('active');
    cy.getElementById(nodeId(step.from) + '>' + nodeId(step.to)).addClass('active');
  }

  /* result card + path table */
  function stepRow(st, last) {
    const res = st.to === 'qD' ? 'Dead state — reject' : ACCEPTING.has(st.to) && last ? 'Accepting' : 'Continue';
    return `<tr class="${st.to === 'qD' ? 'row-invalid' : ACCEPTING.has(st.to) ? 'row-valid' : ''}"><td>${st.i + 1}</td><td class="char-cell">${st.ch}</td><td class="type-cell">${st.type}</td><td class="state-cell">${label(st.from)}</td><td class="next-cell">${label(st.to)}</td><td class="result-cell">${res}</td></tr>`;
  }
  function showResult(r) {
    $('result-section').hidden = false;
    const c = r.components, cls = r.accepted ? 'accepted' : 'rejected';
    const path = r.steps.length ? ['q0', ...r.steps.map(x => x.to)].map(label).join(' → ') : '—';
    const d = (k, v) => `<div class="result-detail"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`;
    $('result-card').className = 'result-card ' + cls;
    $('result-card').innerHTML = `<div class="result-verdict ${cls}">${r.accepted ? 'ACCEPT' : 'REJECT'}</div>
      <div class="result-number">${esc(r.raw.trim() || '(empty)')}${r.s && r.s !== r.raw.trim() ? ' → ' + esc(r.s) : ''}</div>
      <div class="result-explain"><strong>${r.accepted ? 'Why accepted:' : 'Why rejected:'}</strong> ${esc(r.reason)}${r.consistent ? '' : ' (Warning: regex and DFA disagree.)'}</div>
      <div class="result-detail-grid">${d('State code', c ? c.state : '—')}${d('RTO code', c ? c.rto : '—')}${d('Series', c ? c.series : '—')}${d('Vehicle number', c ? `${c.num} (${c.num.length} digit${c.num.length > 1 ? 's' : ''}, value ${c.value})` : '—')}${d('Final state', label(r.final))}</div>
      <div class="result-detail-grid">${d('State path', path)}</div>`;
    $('sim-table-body').innerHTML = r.steps.length ? r.steps.map((st, i) => stepRow(st, i === r.steps.length - 1)).join('') : '<tr class="empty-row"><td colspan="6">No characters were read.</td></tr>';
    highlight(r.steps[r.steps.length - 1]);
  }

  /* history */
  const loadH = () => { try { return JSON.parse(localStorage.getItem(HKEY)) || []; } catch (e) { return []; } };
  function renderH() {
    const h = loadH();
    $('history-body').innerHTML = h.length ? h.map(x => `<tr><td><button class="link-btn" data-v="${esc(x.input)}">${esc(x.input || '(empty)')}</button></td><td class="${x.ok ? 'pass' : 'fail'}">${x.ok ? 'ACCEPT' : 'REJECT'}</td><td>${esc(x.time)}</td></tr>`).join('')
      : '<tr class="empty-row"><td colspan="3">No validations yet.</td></tr>';
  }
  function saveH(r) {
    try { localStorage.setItem(HKEY, JSON.stringify([{ input: r.raw.trim(), ok: r.accepted, time: new Date().toLocaleTimeString() }, ...loadH()].slice(0, 15))); } catch (e) { /* storage unavailable */ }
    renderH();
  }
  $('history-body').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { input.value = b.dataset.v; updateGuide(); doValidate(); } });
  $('btn-clear-history').addEventListener('click', () => { try { localStorage.removeItem(HKEY); } catch (e) {} renderH(); });

  /* validate / clear / examples */
  function doValidate() { stopSim(); const r = validate(input.value); showResult(r); saveH(r); return r; }
  $('btn-validate').addEventListener('click', doValidate);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doValidate(); });
  $('btn-reset').textContent = 'Clear';
  $('btn-reset').addEventListener('click', () => { input.value = ''; updateGuide(); stopSim(); $('result-section').hidden = true; $('sim-status').textContent = 'Enter a number and press “Start simulation.”';
    $('sim-table-body').innerHTML = '<tr class="empty-row"><td colspan="6">Simulation steps will appear here.</td></tr>'; highlight(null); input.focus(); });
  const idx = { valid: 0, invalid: 0 };
  document.querySelectorAll('[data-example-group]').forEach(b => b.addEventListener('click', () => {
    const g = b.dataset.exampleGroup, list = TESTS.filter(t => t[1] === (g === 'valid') && t[0]);
    input.value = list[idx[g]++ % list.length][0]; updateGuide(); doValidate();
  }));

  /* step-by-step simulation (runs the real δ one character at a time) */
  let sim = null, timer = null;
  const speeds = [1600, 1100, 700, 400, 200];
  function stopSim() { clearInterval(timer); timer = null; }
  function prepSim() {
    const r = validate(input.value);
    if (!r.steps.length) { showResult(r); $('sim-status').textContent = r.reason; return null; }
    sim = { r, k: 0 }; $('sim-table-body').innerHTML = ''; $('sim-status').textContent = 'State q0 — ready to read the first character.'; highlight(null);
    return sim;
  }
  function stepSim() {
    if (!sim) if (!prepSim()) return;
    const { r } = sim;
    if (sim.k >= r.steps.length) { stopSim(); return; }
    const st = r.steps[sim.k++], last = sim.k === r.steps.length;
    document.querySelectorAll('#sim-table-body tr').forEach(t => t.classList.remove('row-active'));
    $('sim-table-body').insertAdjacentHTML('beforeend', stepRow(st, last));
    $('sim-table-body').lastElementChild.classList.add('row-active');
    highlight(st);
    $('sim-status').textContent = `Read “${st.ch}” (${st.type.toLowerCase()}): ${label(st.from)} → ${label(st.to)}.`;
    if (last) { stopSim(); showResult(r); highlight(st); $('sim-status').textContent += r.accepted ? ' Input consumed in an accepting state: ACCEPT.' : ' Reject: ' + r.reason; sim = null; }
  }
  $('sim-start').addEventListener('click', () => { stopSim(); sim = null; if (!prepSim()) return; stepSim(); timer = setInterval(stepSim, speeds[$('speed-slider').value - 1]); });
  $('btn-simulate').addEventListener('click', () => { $('sim-start').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('sim-start').click(); });
  $('sim-step').addEventListener('click', () => { stopSim(); stepSim(); });
  $('sim-pause').addEventListener('click', stopSim);
  $('sim-reset').addEventListener('click', () => { stopSim(); sim = null; $('sim-table-body').innerHTML = '<tr class="empty-row"><td colspan="6">Simulation steps will appear here.</td></tr>'; $('sim-status').textContent = 'Simulation reset.'; highlight(null); });
  $('speed-slider').addEventListener('input', () => { if (timer) { stopSim(); timer = setInterval(stepSim, speeds[$('speed-slider').value - 1]); } });

  /* formal definition toggle */
  $('formal-toggle').addEventListener('click', () => { const open = $('formal-toggle').getAttribute('aria-expanded') === 'true'; $('formal-toggle').setAttribute('aria-expanded', String(!open)); $('formal-body').hidden = open; });

  /* test lists + suite */
  [['valid-test-list', true], ['invalid-test-list', false]].forEach(([id, ok]) => {
    $(id).innerHTML = TESTS.filter(t => t[1] === ok && t[0]).map(t => `<li><button data-t="${esc(t[0])}">${esc(t[0])}</button></li>`).join('');
    $(id).addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { input.value = b.dataset.t; updateGuide(); doValidate(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  });
  function runSuite() {
    let pass = 0;
    $('suite-body').innerHTML = TESTS.map(([inp, exp]) => {
      const act = validate(inp).accepted, ok = act === exp; pass += ok;
      return `<tr><td class="char-cell">${esc(inp) || '(empty)'}</td><td>${exp ? 'ACCEPT' : 'REJECT'}</td><td>${act ? 'ACCEPT' : 'REJECT'}</td><td class="${ok ? 'pass' : 'fail'}">${ok ? 'PASS' : 'FAIL'}</td></tr>`;
    }).join('');
    $('suite-summary').textContent = `${pass} / ${TESTS.length} tests passed`;
  }
  $('btn-run-tests').addEventListener('click', runSuite);

  updateGuide(); renderH(); runSuite();
});
