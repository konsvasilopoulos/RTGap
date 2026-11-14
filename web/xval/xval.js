const RT = require('../engine.js'); const fs = require('fs');
RT.setSites(JSON.parse(fs.readFileSync(__dirname + '/../sites.json', 'utf8')));
const ref = JSON.parse(fs.readFileSync(__dirname + '/ref.json', 'utf8'));
let bad = 0, checked = 0, nopts = 0; const TOL = 1e-6;
const close = (a, b) => Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a), Math.abs(b));
function fail(i, msg) { bad++; if (bad < 25) console.log('case', i, msg); }
const opt = (o) => ({ key: o.key, family: o.family, d: o.d, n: o.nNew, end: RT.iso(o.end), ext: o.ext, T: o.T, tumour: o.tumour.eqd2, levels: o.levels.map(r => r.eqd2), oars: o.oars.map(r => r.eqd2), nrej: o.rejected.length, nwarn: o.warnings.length, wk: o.weeklyPeak,
  slots: o.newFx.map(f => [RT.iso(f.day), f.slot, f.phase, Math.round(f.dose * 1e6) / 1e6]) });
function cmpOpts(i, tag, A, B) {
  if (A.length !== B.length) return fail(i, tag + ' count ' + A.length + ' vs ' + B.length + ' : ' + A.map(o => o.key) + ' | ' + B.map(o => o.key));
  A.forEach((a, j) => { const b = B[j]; nopts++;
    for (const k of ['key', 'family', 'n', 'end', 'ext', 'T', 'nrej', 'nwarn']) if (a[k] !== b[k]) fail(i, `${tag}[${j}] ${a.key} ${k}: js ${a[k]} py ${b[k]}`);
    for (const k of ['d', 'tumour', 'wk']) if (!close(a[k], b[k])) fail(i, `${tag}[${j}] ${a.key} ${k}: js ${a[k]} py ${b[k]}`);
    for (const k of ['levels', 'oars']) a[k].forEach((v, q) => { if (!close(v, b[k][q])) fail(i, `${tag}[${j}] ${k}[${q}]`); });
    if (JSON.stringify(a.slots.map(s => s.slice(0, 3))) !== JSON.stringify(b.slots.map(s => s.slice(0, 3)))) fail(i, `${tag}[${j}] ${a.key} slots differ`);
    a.slots.forEach((s, q) => { if (b.slots[q] && !close(s[3], b.slots[q][3])) fail(i, `${tag}[${j}] dose`); });
  });
}
ref.forEach((r, i) => {
  let p;
  try { p = RT.plannerFromCase(r.case, r.protocol); } catch (e) { if (!r.result.error) fail(i, 'js error: ' + (e.errors ? JSON.stringify(e.errors) : e.stack)); return; }
  if (r.result.error) return fail(i, 'py error but js ok');
  checked++;
  const dec = RT.decide(p), R = r.result;
  if (dec.status !== R.status) fail(i, `status js ${dec.status} py ${R.status}`);
  if ((dec.recommended ? dec.recommended.key : null) !== R.rec) fail(i, `rec js ${dec.recommended && dec.recommended.key} py ${R.rec}`);
  if (JSON.stringify(dec.candidates.map(o => o.key)) !== JSON.stringify(R.cands)) fail(i, 'cands');
  if (dec.trace.length !== R.ntrace) fail(i, `trace len js ${dec.trace.length} py ${R.ntrace}`);
  if (p.inputWarnings.length !== R.nwarn - 2) fail(i, `warn count js ${p.inputWarnings.length} py ${R.nwarn}`);
  p.plannedLevels.forEach((v, q) => { if (!close(v, R.planned[0][q])) fail(i, 'planned level'); });
  p.plannedOars.forEach((v, q) => { if (!close(v, R.planned[1][q])) fail(i, 'planned oar'); });
  for (const o of dec.feasible) for (const t of [p.tumour].concat(p.oars)) { if (!RT.worksheet(p, o.course, t)) { fail(i, 'worksheet mismatch ' + o.key + ' ' + t.name); break; } }
  cmpOpts(i, 'feasible', dec.feasible.map(opt), R.feasible); cmpOpts(i, 'rejected', dec.rejected.map(opt), R.rejected);
  if (R.sens) { const s = RT.sensitivity(p, dec);
    if (s.n !== R.sens.n || !close(s.sameFraction, R.sens.same) || !close(s.tumourRange[0], R.sens.t[0]) || !close(s.tumourRange[1], R.sens.t[1])) fail(i, 'sens ' + JSON.stringify([s.n, s.sameFraction, s.tumourRange]) + ' py ' + JSON.stringify(R.sens));
    for (const k of Object.keys(R.sens.oar)) if (!close(s.oarPctRanges[k][0], R.sens.oar[k][0]) || !close(s.oarPctRanges[k][1], R.sens.oar[k][1])) fail(i, 'sens oar'); }
  if (R.scen) { const os = RT.currentOutageStart(p); const rows = RT.resumeScenarios(p, os, RT.candidateResumeDates(p, os, 10));
    if (rows.length !== R.scen.length) fail(i, 'scen len');
    rows.forEach((x, q) => { const y = R.scen[q]; if (!y) return; if (RT.iso(x.resume) !== y.r || x.nMissed !== y.n || x.baseExt !== y.ext || !close(x.baseDelta, y.d) || x.status !== y.status || (x.option ? x.option.key : null) !== y.rec) fail(i, 'scen row ' + q); }); }
});
if (RT.iso(RT.orthodoxEaster(2026)) !== '2026-04-12' || RT.iso(RT.orthodoxEaster(2027)) !== '2027-05-02' || RT.iso(RT.orthodoxEaster(2024)) !== '2024-05-05') fail(-1, 'easter');
if (RT.sha256('abc') !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') fail(-1, 'sha256');
const st = RT.selfTest(); st.forEach((s) => { if (!s.ok) fail(-1, 'selftest ' + s.id + ' got ' + s.got); }); console.log('self-test', st.filter((s) => s.ok).length + '/' + st.length);
const j = RT.joiner(70, 2, 8, 4); if (Math.abs(j.d - 1.7419) > 1e-3 || j.n !== 36 || j.practical !== 1.72) fail(-1, 'joiner');
console.log(`cases ${ref.length}, compared ${checked}, options compared ${nopts}, mismatches ${bad}`);
process.exit(bad ? 1 : 0);
