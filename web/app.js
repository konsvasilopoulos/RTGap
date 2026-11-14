/* rtgap web application: state, inputs, results. */
(function () {
  'use strict';
  const RT = window.RT, I = window.I18N;
  RT.setSites(window.RTGAP_SITES);
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { if (v === '' || v == null) return null; const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };

  // ------------------------------------------------------------------ state
  function siteDefaults(id) {
    const s = RT.SITES[id] || RT.SITES.generic, t = s.tumour || {};
    return {
      tumour: { ab: t.alpha_beta == null ? 10 : t.alpha_beta, mode: t.dprolif_eqd2_per_day != null ? 'dp' : 'k',
        rate: t.k_bed_per_day != null ? t.k_bed_per_day : (t.dprolif_eqd2_per_day != null ? t.dprolif_eqd2_per_day : 0), tk: t.kickoff_days == null ? null : t.kickoff_days },
      oars: (s.oars || [{ name: 'Late (α/β 3)', alpha_beta: 3 }]).map((o) => ({ name: o.name, ab: o.alpha_beta, ratio: o.dose_ratio == null ? 1 : o.dose_ratio, limit: o.max_eqd2 == null ? null : o.max_eqd2, repair: 4.4, bt: 1 })),
    };
  }
  const C0 = () => Object.assign({}, RT.CONSTRAINT_DEFAULTS, { chemo_dates: [] });
  function baseState(over) {
    const s = Object.assign({ v: 3, lang: 'el', pdfLang: null, title: '', caseRef: '', calcBy: '', checkedBy: '', site: 'hn_scc', category: 'auto',
      start: '2026-10-05', multi: false, n: 35, d: 2, phases: [{ name: 'SIB', n: 35, levels: [{ name: 'PTV70', d: 2 }, { name: 'PTV63', d: 1.8 }, { name: 'PTV56', d: 1.6 }] }], primary: '',
      weekdays: [0, 1, 2, 3, 4], holidays: true, closed: [], missed: [], unavailable: [], resume: '', cause: '', brachy: { on: false, fx: [] }, given: { on: false, n: null, d: null, sat: false, sun: false, bid: 0, dates: null, bidDates: null }, scen: false, scenDays: 10, mark: 'missed', c: C0(), sel: null }, over || {});
    const d = siteDefaults(s.site);
    if (!s.tumour) s.tumour = d.tumour;
    if (!s.oars) s.oars = d.oars;
    return s;
  }
  const EXAMPLES = {
    hn_sib: () => baseState({ site: 'hn_scc', multi: true, start: '2026-10-05', missed: ['2026-11-04', '2026-11-05', '2026-11-06'], resume: '2026-11-09', scen: true, cause: 'machine',
      oars: [{ name: 'Late (α/β 3)', ab: 3, ratio: 1, limit: null }, { name: 'Spinal cord', ab: 2, ratio: 0.65, limit: 50 }] }),
    hn_70: () => baseState({ site: 'hn_scc', n: 35, d: 2, start: '2026-10-05', missed: ['2026-11-04', '2026-11-05', '2026-11-06'],
      c: Object.assign(C0(), { allow_saturday: false, allow_sunday: false, allow_bid: false, max_tumour_deficit_pct: 1, max_late_increase_pct: 3 }) }),
    rectum: () => baseState({ site: 'rectum', n: 5, d: 5, start: '2026-11-09', missed: ['2026-11-11'], holidays: false,
      oars: [{ name: 'Bowel (late)', ab: 4, ratio: 1, limit: null }, { name: 'Fibrosis', ab: 1.7, ratio: 1, limit: null }], c: Object.assign(C0(), { dose_rounding: 0.1 }) }),
    cervix: () => baseState({ site: 'cervix_scc_brachy', n: 25, d: 1.8, start: '2026-09-07', missed: ['2026-09-21', '2026-09-22', '2026-09-23'], cause: 'machine',
      brachy: { on: true, fx: [{ date: '2026-10-06', dose: 7 }, { date: '2026-10-13', dose: 7 }, { date: '2026-10-20', dose: 7 }, { date: '2026-10-27', dose: 7 }] },
      oars: [{ name: 'Rectum', ab: 3, ratio: 1, limit: 75, repair: 4.4, bt: 0.65 }, { name: 'Bladder', ab: 3, ratio: 1, limit: 90, repair: 4.4, bt: 0.75 }] }),
    nsclc: () => baseState({ site: 'nsclc', n: 20, d: 2.75, start: '2026-10-12', missed: ['2026-10-26', '2026-10-27', '2026-10-29'], c: Object.assign(C0(), { allow_saturday: false, allow_sunday: false }) }),
    prostate: () => baseState({ site: 'prostate', n: 20, d: 3, start: '2026-10-05', missed: ['2026-10-19', '2026-10-20'] }),
    breast: () => baseState({ site: 'breast', n: 15, d: 2.67, start: '2026-10-05', missed: ['2026-10-12', '2026-10-13', '2026-10-14'], c: Object.assign(C0(), { allow_saturday: false, allow_sunday: false, allow_bid: false }) }),
    palliative: () => baseState({ site: 'palliative', n: 10, d: 3, start: '2026-10-05', missed: ['2026-10-07', '2026-10-08', '2026-10-09'] }),
  };
  const EX_NAMES = { el: { hn_sib: 'Κεφαλή-τράχηλος SIB 70/63/56, βλάβη με άγνωστη επισκευή', hn_70: 'Κεφαλή-τράχηλος 70/35, τμήμα μόνο καθημερινές', rectum: 'Ορθό 5 × 5 Gy, χάθηκε η Τετάρτη (βιβλίο, Παράδ. 5)', cervix: 'Τράχηλος μήτρας 45/25 + βραχυθεραπεία 4 × 7 Gy', nsclc: 'NSCLC 55/20, χωρίς Σαββατοκύριακα', prostate: 'Προστάτης 60/20', breast: 'Μαστός 40/15', palliative: 'Παρηγορική 30/10' },
    en: { hn_sib: 'Head & neck SIB 70/63/56, outage with unknown repair date', hn_70: 'Head & neck 70/35, weekdays-only department', rectum: 'Rectum 5 × 5 Gy, Wednesday missed (textbook Ex. 5)', cervix: 'Cervix 45/25 + brachytherapy 4 × 7 Gy', nsclc: 'NSCLC 55/20, no weekends', prostate: 'Prostate 60/20', breast: 'Breast 40/15', palliative: 'Palliative 30/10' } };

  const parseRatio = (v) => { if (typeof v === 'number') return v; const parts = String(v == null ? '' : v).split('/').map((x) => num(x)).filter((x) => x != null); return parts.length > 1 ? parts : (parts.length ? parts[0] : 1); };
  const fixOar = (o) => { if (o.repair === undefined) o.repair = 4.4; if (o.bt == null) o.bt = 1; return o; };
  let state = EXAMPLES.hn_sib();
  try { const raw = localStorage.getItem('rtgap.state'); if (raw) { const s = JSON.parse(raw); if (s && s.v === 3) { state = Object.assign(baseState(), s); state.oars.forEach(fixOar); if (!state.given) state.given = baseState().given; if (!state.brachy) state.brachy = { on: false, fx: [] }; } } } catch (e) { /* storage unavailable */ }
  let tr = I.make(state.lang), model = null;
  const persist = () => { try { localStorage.setItem('rtgap.state', JSON.stringify(state)); } catch (e) { /* ignore */ } };

  // ------------------------------------------------------------------ state → case (same schema as the Python package)
  function toCase(s) {
    const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const rx = { start: s.start, treatment_weekdays: s.weekdays.map((i) => wd[i]) };
    if (s.holidays) rx.holidays = 'GR';
    if (s.closed.length) rx.closed_dates = s.closed.slice().sort();
    if (s.multi) {
      rx.phases = s.phases.map((ph, i) => {
        const levels = {};
        ph.levels.forEach((lv, j) => { let nm = (lv.name || ('L' + (j + 1))).trim(); while (nm in levels) nm += "'"; levels[nm] = lv.d == null ? 0 : lv.d; });
        return { name: ph.name || '', n_fractions: ph.n, levels };
      });
      if (s.primary) rx.primary_level = s.primary;
    } else { rx.n_fractions = s.n; rx.dose_per_fraction = s.d; }
    const t = { alpha_beta: s.tumour.ab, kickoff_days: s.tumour.tk };
    if (s.tumour.mode === 'dp') t.dprolif_eqd2_per_day = s.tumour.rate || 0; else t.k_bed_per_day = s.tumour.rate || 0;
    const c = {};
    for (const k of Object.keys(RT.CONSTRAINT_DEFAULTS)) {
      const v = s.c[k], d0 = RT.CONSTRAINT_DEFAULTS[k];
      if (k === 'chemo_dates') { if (v && v.length) c[k] = v.slice().sort(); } else if (v !== d0 && v !== undefined) c[k] = v;
    }
    const out = { title: s.title || '', site: s.site, prescription: rx, tumour: t,
      oars: s.oars.map((o) => { fixOar(o); const r = { name: o.name || 'OAR', alpha_beta: o.ab, dose_ratio: parseRatio(o.ratio), repair_half_time_h: o.repair || null }; if (o.limit != null) r.max_eqd2 = o.limit; if (s.brachy.on) r.brachy_ratio = o.bt; return r; }),
      gap: { missed_dates: s.missed.slice().sort() }, constraints: c };
    if (s.brachy.on && s.brachy.fx.length) out.brachy = { fractions: s.brachy.fx.filter((f) => f.date && f.dose > 0).map((f) => ({ date: f.date, dose: f.dose })) };
    if (s.given && s.given.on && s.given._dates && s.given._dates.length) out.custom_options = [{ name: 'given', strategy: 'dose', dose: s.given.d, dates: s.given._dates, bid_dates: s.given._bid || [] }];
    if (s.resume) out.gap.resume_date = s.resume;
    if (s.cause) out.gap.cause = s.cause;
    if (s.unavailable.length) out.gap.unavailable_dates = s.unavailable.slice().sort();
    if (s.category !== 'auto') out.rules = { category: s.category === 'none' ? null : +s.category };
    if (s.scen && s.missed.length) out.scenarios = { outage_start: s.missed.slice().sort()[0], days: s.scenDays || 10 };
    return out;
  }
  function fromCase(cfg) {
    if (!cfg || !cfg.prescription) throw new Error('not a case');
    const rx = cfg.prescription, wd = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const s = baseState({ lang: state.lang, site: cfg.site && RT.SITES[cfg.site] ? cfg.site : 'generic', title: cfg.title || '' });
    s.start = String(rx.start).slice(0, 10);
    s.holidays = !!rx.holidays; s.closed = (rx.closed_dates || []).map((d) => String(d).slice(0, 10));
    if (rx.treatment_weekdays) s.weekdays = rx.treatment_weekdays.map((v) => (typeof v === 'number' ? v : wd.indexOf(String(v).toLowerCase().slice(0, 3)))).filter((i) => i >= 0);
    if (rx.phases && rx.phases.length) { s.multi = true; s.phases = rx.phases.map((p) => ({ name: p.name || '', n: p.n_fractions, levels: Object.keys(p.levels).map((k) => ({ name: k, d: p.levels[k] })) })); s.primary = rx.primary_level || ''; }
    else { s.multi = false; s.n = rx.n_fractions; s.d = rx.dose_per_fraction; }
    const t = cfg.tumour || {};
    if (t.alpha_beta != null) s.tumour.ab = t.alpha_beta;
    if (t.dprolif_eqd2_per_day != null) { s.tumour.mode = 'dp'; s.tumour.rate = t.dprolif_eqd2_per_day; } else if (t.k_bed_per_day != null) { s.tumour.mode = 'k'; s.tumour.rate = t.k_bed_per_day; }
    if ('kickoff_days' in t) s.tumour.tk = t.kickoff_days;
    if (cfg.oars && cfg.oars.length) s.oars = cfg.oars.map((o) => ({ name: o.name, ab: o.alpha_beta, ratio: Array.isArray(o.dose_ratio) ? o.dose_ratio.join('/') : (o.dose_ratio == null ? 1 : o.dose_ratio), limit: o.max_eqd2 == null ? null : o.max_eqd2, repair: ('repair_half_time_h' in o) ? o.repair_half_time_h : 4.4, bt: o.brachy_ratio == null ? 1 : o.brachy_ratio }));
    if (cfg.brachy && cfg.brachy.fractions && cfg.brachy.fractions.length) s.brachy = { on: true, fx: cfg.brachy.fractions.map((f) => ({ date: String(f.date).slice(0, 10), dose: f.dose })) };
    const g = cfg.gap || {};
    s.missed = (g.missed_dates || []).map((d) => String(d).slice(0, 10)); s.resume = g.resume_date ? String(g.resume_date).slice(0, 10) : '';
    s.cause = g.cause || '';
    s.unavailable = (g.unavailable_dates || []).map((d) => String(d).slice(0, 10));
    if (g.outage_start && s.resume) { const os = RT.parseDate(g.outage_start), r = RT.parseDate(s.resume); for (let d = os; d < r; d++) if (RT.weekday(d) < 5 && !s.missed.includes(RT.iso(d))) s.missed.push(RT.iso(d)); }
    const c = cfg.constraints || cfg.options || {};
    for (const k of Object.keys(c)) if (k in RT.CONSTRAINT_DEFAULTS) s.c[k] = k === 'chemo_dates' ? c[k].map((d) => String(d).slice(0, 10)) : c[k];
    const cat = cfg.rules && 'category' in cfg.rules ? cfg.rules.category : ('category' in cfg ? cfg.category : undefined);
    if (cat !== undefined) s.category = cat == null ? 'none' : String(cat);
    const co = (cfg.custom_options || [])[0];
    if (co && co.dates && co.dates.length && co.dose) s.given = { on: true, n: co.dates.length + (co.bid_dates || []).length, d: co.dose, sat: false, sun: false, bid: 0, dates: co.dates.map((d) => String(d).slice(0, 10)), bidDates: (co.bid_dates || []).map((d) => String(d).slice(0, 10)) };
    if (cfg.scenarios && cfg.scenarios.outage_start) { s.scen = true; s.scenDays = cfg.scenarios.days || 10; }
    return s;
  }

  // ------------------------------------------------------------------ compute
  function compute() {
    const cfg = toCase(state), m = { cfg, error: null };
    try {
      if (!state.start) throw { validation: true, errors: [{ code: 'e_generic', p: { msg: 'start date' } }] };
      m.p = RT.plannerFromCase(cfg, {});
      let opts = RT.options(m.p); m.given = null;
      const gv = state.given;
      if (gv && gv.on && m.p.remaining && (gv.d > 0) && (gv.dates || gv.n > 0)) {
        const slots = gv.dates ? gv.dates.map((d) => ({ day: RT.parseDate(d), slot: 0 })).concat((gv.bidDates || []).map((d) => ({ day: RT.parseDate(d), slot: 1 }))) : RT.customSlots(m.p, Math.round(gv.n), gv.sat, gv.sun, Math.round(gv.bid || 0));
        if (slots.length) { m.given = RT.customOption(m.p, slots, gv.d); opts = opts.concat([m.given]); gv._dates = slots.filter((x) => !x.slot).map((x) => RT.iso(x.day)); gv._bid = slots.filter((x) => x.slot).map((x) => RT.iso(x.day)); m.cfg = toCase(state); }
      }
      m.dec = RT.decide(m.p, opts);
      m.rec0 = RT.recoverable(m.p, m.dec, 0.5); m.rec5 = RT.recoverable(m.p, m.dec, 5);
      m.sens = m.p.remaining ? RT.sensitivity(m.p, m.dec) : null;
      m.scen = null;
      if (cfg.scenarios && m.p.missed.length) {
        const os = m.p.missed[0];
        m.outage = os; m.scen = RT.resumeScenarios(m.p, os, RT.candidateResumeDates(m.p, os, cfg.scenarios.days));
      }
      const all = m.dec.feasible.concat(m.dec.rejected);
      m.base = all.find((o) => o.family === 'baseline') || null;
      const want = all.find((o) => o.key === state.sel && !o.rejected.length);
      m.sel = want || m.dec.recommended || m.dec.candidates[0] || m.dec.feasible[0] || null;
      m.checksum = RT.checksum({ case: m.cfg, engine: RT.VERSION });
    } catch (e) {
      m.error = e.validation ? e.errors : [{ code: 'e_generic', p: { msg: e.message || String(e) } }];
    }
    model = m; window.__rtgapModel = m;
    return m;
  }

  // ------------------------------------------------------------------ small render helpers
  const refs = (ids) => (ids || []).map((id) => I.REF_NUM[id] ? `<button type="button" class="ref" data-ref="${id}" aria-label="${esc(tr.t('refs'))} ${I.REF_NUM[id]}">[${I.REF_NUM[id]}]</button>` : '').join('');
  const dcell = (x, goodPos) => { const z = Math.abs(x) < 0.05; return `<td class="n ${z ? 'zero' : ((x > 0) === goodPos ? 'pos' : 'neg')}">${tr.sg(x)}</td>`; };
  const fld = (label, bind, val, attrs) => `<label class="f"><span>${esc(label)}</span><input data-bind="${bind}" id="i-${bind.replace(/\W+/g, '-')}" value="${esc(val == null ? '' : val)}" ${attrs || 'type="number" step="any" inputmode="decimal"'}></label>`;
  const chk = (label, bind, val, extra) => `<label class="chk"><input type="checkbox" data-bind="${bind}" id="i-${bind.replace(/\W+/g, '-')}" ${val ? 'checked' : ''}><span>${esc(label)}${extra || ''}</span></label>`;

  function calendarHtml(p, opt, interactive) {
    const s = state, first0 = Math.min(p.rx.start, p.missed.length ? p.missed[0] : p.rx.start);
    let last0 = p.plannedEnd;
    if (model && model.dec) for (const o of model.dec.feasible) if (o.end > last0) last0 = o.end;
    if (opt && opt.end > last0) last0 = opt.end;
    if (interactive) last0 += 7;
    let first = first0 - RT.weekday(first0);
    if (!interactive && opt) { const fe = (p.missed.length ? p.missed[0] : p.resume); const f2 = fe - RT.weekday(fe) - 7; if (f2 > first) first = f2; }
    const last = last0 + (6 - RT.weekday(last0));
    const delivered = new Set(p.delivered.map((f) => f.day)), missed = new Set(p.missed), planned = new Set(p.planned.map((f) => f.day));
    const bt = new Map(p.fixed.map((f) => [f.day, f.dose]));
    const nw = opt ? RT.groupByDay(opt.newFx) : new Map(), chemo = new Set(p.c.chemo_dates), unav = new Set((s.unavailable || []).map(RT.parseDate));
    let h = '<div class="cal" role="grid"><div class="wl"></div>' + tr.wd2.map((w) => `<div class="hd">${w}</div>`).join('');
    for (let mon = first; mon <= last; mon += 7) {
      const q = RT.ymd(mon);
      h += `<div class="wl">${q.d}/${q.m}</div>`;
      for (let d = mon; d < mon + 7; d++) {
        const cls = ['c']; let txt = String(RT.ymd(d).d), title = tr.date(d);
        if (RT.weekday(d) >= 5) cls.push('wk');
        if (bt.has(d)) { cls.push('bt'); txt = 'BT'; title += ' · ' + tr.t('lg_bt') + ' ' + bt.get(d) + ' Gy'; }
        else if (p.rx.closed.has(d)) { cls.push('closed'); const hn = p.rx.holidayNames.get(d); if (hn) title += ' · ' + tr.hol(hn); }
        if (unav.has(d)) cls.push('unavail');
        if (chemo.has(d)) cls.push('chemo');
        if (missed.has(d)) cls.push('missed');
        else if (delivered.has(d)) cls.push('delivered');
        else if (!opt && planned.has(d)) cls.push('planned');
        if (nw.has(d)) { const n = nw.get(d).length; cls.push(n > 1 ? 'bid' : 'new'); if (n > 1) txt += '<small>×2</small>'; }
        if (d === p.plannedEnd) cls.push('endmark');
        if (d < p.rx.start) cls.push('out');
        h += interactive ? `<button type="button" class="${cls.join(' ')}" data-day="${RT.iso(d)}" title="${esc(title)}" aria-label="${esc(title)}">${txt}</button>` : `<div class="${cls.join(' ')}" title="${esc(title)}">${txt}</div>`;
      }
    }
    return h + '</div>';
  }
  const legend = (keys) => '<div class="legend">' + keys.map((k) => {
    const st = { delivered: 'background:#33415f', missed: 'border:2px solid var(--bad)', planned: 'background:var(--accent-soft)', new: 'background:var(--accent)', bid: 'background:#0d3a99',
      holiday: 'background:repeating-linear-gradient(45deg,var(--panel),var(--panel) 3px,var(--line) 3px,var(--line) 5px)', bt: 'background:var(--bt)', unavail: 'border:2px dashed var(--warn)', chemo: 'background:var(--warn);border-radius:50%', end: 'box-shadow:0 0 0 2px var(--ink)' }[k];
    return `<span><i style="${st}"></i>${esc(tr.t('lg_' + k))}</span>`; }).join('') + '</div>';

  // ------------------------------------------------------------------ inputs
  function renderInputs() {
    const s = state, L = tr.t, site = RT.SITES[s.site] || {}, el = $('#inputs');
    const groups = { 1: [], 2: [], 3: [], x: [] };
    for (const id of Object.keys(RT.SITES)) (groups[RT.SITES[id].category] || groups.x).push(id);
    const og = (label, ids) => `<optgroup label="${esc(label)}">${ids.map((id) => `<option value="${id}" ${id === s.site ? 'selected' : ''}>${esc(tr.siteName(id, RT.SITES[id]))}</option>`).join('')}</optgroup>`;
    const p = model && model.p, rules = p ? p.rules : null;
    const catPill = rules ? (rules.category ? `<span class="pill c${rules.category}">${esc(L('cat'))} ${rules.category}</span>` : `<span class="pill plain">${esc(L('cat'))}: ${esc(L('cat_none'))}</span>`) : '';
    const allow = rules && rules.max != null ? `<span class="pill plain">${esc(L('allowance'))}: ${esc(L('ideal'))} ≤ ${rules.ideal} · ${esc(L('max'))} ≤ ${rules.max} ${esc(L('days'))}</span>` : '';
    const ott = rules && rules.maxOTT ? `<span class="pill plain">${esc(L('ott_cap'))} ≤ ${rules.maxOTT} ${esc(L('days'))}</span>` : '';
    const noacc = rules && rules.noAccel ? `<span class="pill c2">${esc(L('no_accel'))}</span>` : '';
    const srcMap = { RCR19: 'RCR19', RCR5d: 'RCR5d', START: 'START', VB20: 'VB20' };
    const srcRefs = refs((site.sources || []).map((x) => srcMap[x]).filter(Boolean));
    const notes = tr.siteNotes(s.site, site);

    let rxHtml;
    if (!s.multi) {
      rxHtml = `<div class="fields">${fld(L('fractions'), 'n', s.n, 'type="number" min="1" step="1" inputmode="numeric"')}${fld(L('dpf'), 'd', s.d)}
        <div class="f"><span>${esc(L('total'))}</span><div class="inp num" id="rx-total">${((s.n || 0) * (s.d || 0)).toFixed(2)} Gy</div></div></div>`;
    } else {
      const names = [];
      s.phases.forEach((ph) => ph.levels.forEach((lv) => { if (lv.name && !names.includes(lv.name)) names.push(lv.name); }));
      rxHtml = s.phases.map((ph, i) => `<div class="phase"><div class="fields">${fld(L('phase') + ' ' + (i + 1) + ' · ' + L('phase_name'), `phases.${i}.name`, ph.name, 'type="text"')}${fld(L('fractions'), `phases.${i}.n`, ph.n, 'type="number" min="1" step="1" inputmode="numeric"')}</div>
        ${ph.levels.map((lv, j) => `<div class="lvl">${fld(L('level'), `phases.${i}.levels.${j}.name`, lv.name, 'type="text"')}${fld(L('dpf'), `phases.${i}.levels.${j}.d`, lv.d)}<button type="button" class="btn x" data-act="rm-level" data-i="${i}" data-j="${j}" aria-label="${esc(L('remove'))}" ${ph.levels.length < 2 ? 'disabled' : ''}>✕</button></div>`).join('')}
        <div class="rowbtn" style="margin-top:0"><button type="button" class="btn sm" data-act="add-level" data-i="${i}">+ ${esc(L('add_level'))}</button>${s.phases.length > 1 ? `<button type="button" class="btn sm" data-act="rm-phase" data-i="${i}">${esc(L('remove'))}</button>` : ''}</div></div>`).join('') +
        `<div class="rowbtn" style="margin-top:0"><button type="button" class="btn sm" data-act="add-phase">+ ${esc(L('add_phase'))}</button></div>
        <label class="f" style="margin-top:10px"><span>${esc(L('primary'))}</span><select data-bind="primary" id="i-primary"><option value="">auto</option>${names.map((n) => `<option ${n === s.primary ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    }
    const c = s.c;
    el.innerHTML = `
    <div class="card"><h2><span class="step">1</span>${esc(L('s_site'))}</h2><p class="hint">${esc(L('s_site_hint'))}</p>
      <label class="f"><span>${esc(L('s_site'))}</span><select data-bind="site" id="i-site" data-struct="1">${og('RCR ' + L('cat') + ' 1', groups[1])}${og('RCR ' + L('cat') + ' 2', groups[2])}${og('RCR ' + L('cat') + ' 3', groups[3])}${og('—', groups.x)}</select></label>
      <div class="meta" id="site-meta">${catPill}${allow}${ott}${noacc}${srcRefs}</div>
      ${notes.length ? `<ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <label class="f" style="margin-top:10px"><span>${esc(L('cat'))}</span><select data-bind="category" id="i-category" data-struct="1">${[['auto', L('cat_auto')], ['1', L('cat1')], ['2', L('cat2')], ['3', L('cat3')], ['none', L('cat_none')]].map(([v, t2]) => `<option value="${v}" ${s.category === v ? 'selected' : ''}>${esc(t2)}</option>`).join('')}</select></label>
    </div>
    <div class="card"><h2><span class="step">2</span>${esc(L('s_rx'))}</h2>
      <div class="fields" style="margin-bottom:10px">${fld(L('start'), 'start', s.start, 'type="date"')}</div>
      ${chk(L('levels_mode'), 'multi', s.multi)}
      <div style="margin-top:8px">${rxHtml}</div>
      <div class="f" style="margin-top:10px"><span>${esc(L('treat_days'))}</span><div class="wdays">${tr.wd2.map((w, i) => `<button type="button" data-act="wd" data-i="${i}" aria-pressed="${s.weekdays.includes(i)}">${w}</button>`).join('')}</div></div>
      <div style="margin-top:8px">${chk(L('gr_holidays'), 'holidays', s.holidays)}</div>
      <div style="margin-top:4px">${chk(L('brachy'), 'brachy.on', s.brachy.on)}</div>
      ${s.brachy.on ? `<p class="hint" style="margin-top:6px">${esc(L('brachy_hint'))}</p>${s.brachy.fx.map((f, i) => `<div class="lvl">${fld(L('bt_date'), `brachy.fx.${i}.date`, f.date, 'type="date"')}${fld(L('bt_dose'), `brachy.fx.${i}.dose`, f.dose)}<button type="button" class="btn x" data-act="rm-bt" data-i="${i}" aria-label="${esc(L('remove'))}">✕</button></div>`).join('')}<div class="rowbtn" style="margin-top:6px"><button type="button" class="btn sm" data-act="add-bt">+ ${esc(L('add_bt'))}</button></div>` : ''}
    </div>
    <div class="card"><h2><span class="step">3</span>${esc(L('s_gap'))}</h2><p class="hint">${esc(L('gap_hint'))}</p>
      <div class="seg" role="group">${['missed', 'unavail', 'chemo', 'closed'].map((m) => `<button type="button" data-act="mark" data-m="${m}" aria-pressed="${s.mark === m}">${esc(L('m_' + m))}</button>`).join('')}</div>
      <div id="gapcal"></div>
      <div class="fields">${fld(L('resume'), 'resume', s.resume, 'type="date"')}
        <label class="f"><span>${esc(L('cause'))}</span><select data-bind="cause" id="i-cause">${['', 'machine', 'holiday', 'toxicity', 'patient', 'other'].map((v) => `<option value="${v}" ${s.cause === v ? 'selected' : ''}>${esc(L('cause_' + v))}</option>`).join('')}</select></label></div>
      <p class="small" style="margin:4px 0 8px">${esc(L('resume_auto'))}</p>
      ${chk(L('scen'), 'scen', s.scen)}
    </div>
    <div class="card"><h2><span class="step">4</span>${esc(L('s_bio'))}</h2>
      <div class="fields">${fld(L('tumour') + ' ' + L('ab'), 'tumour.ab', s.tumour.ab)}
        <label class="f"><span>${esc(L('rate'))}</span><select data-bind="tumour.mode" id="i-tumour-mode"><option value="k" ${s.tumour.mode === 'k' ? 'selected' : ''}>${esc(L('rate_k'))}</option><option value="dp" ${s.tumour.mode === 'dp' ? 'selected' : ''}>${esc(L('rate_dp'))}</option></select></label>
        ${fld(L('rate'), 'tumour.rate', s.tumour.rate)}${fld(L('tk'), 'tumour.tk', s.tumour.tk)}</div>
      <p class="small" style="margin:6px 0 12px" id="bio-note"></p>
      ${site.time_factor_option ? `<div class="rowbtn" style="margin:-4px 0 12px"><button type="button" class="btn sm" data-act="tf">${esc(L('tf_apply'))}: ${site.time_factor_option.dprolif_eqd2_per_day} Gy/${state.lang === 'el' ? 'ημέρα' : 'day'}</button>${refs([site.time_factor_option.source])}</div><p class="small" style="margin:-6px 0 12px">${esc(L('tf_note'))}</p>` : ''}
      <h3 style="font:600 0.95rem var(--f-body);margin-bottom:4px">${esc(L('oars'))}</h3><p class="hint">${esc(L('oar_hint'))}</p>
      ${s.oars.map((o, i) => `<div class="phase"><div class="lvl" style="grid-template-columns:minmax(0,1fr) auto">${fld(L('name'), `oars.${i}.name`, o.name, 'type="text"')}<button type="button" class="btn x" data-act="rm-oar" data-i="${i}" aria-label="${esc(L('remove'))}" ${s.oars.length < 2 ? 'disabled' : ''}>✕</button></div>
        <div class="fields" style="grid-template-columns:repeat(auto-fit,minmax(96px,1fr))">${fld(L('ab'), `oars.${i}.ab`, o.ab)}${fld(L('ratio'), `oars.${i}.ratio`, o.ratio, 'type="text" inputmode="decimal"')}${s.brachy.on ? fld(L('bt_ratio'), `oars.${i}.bt`, o.bt) : ''}${fld(L('repair'), `oars.${i}.repair`, o.repair, `type="number" step="any" inputmode="decimal" placeholder="∞"`)}${fld(L('limit'), `oars.${i}.limit`, o.limit)}</div></div>`).join('')}
      <p class="small" style="margin:0 0 4px">${esc(L('ratio_hint'))} ${refs(['BENTZEN99', 'THAMES'])}</p>
      <div class="rowbtn"><button type="button" class="btn sm" data-act="add-oar">+ ${esc(L('add_oar'))}</button><button type="button" class="btn sm" data-act="site-defaults">${esc(L('site_defaults'))}</button></div>
    </div>
    <div class="card"><h2><span class="step">5</span>${esc(L('s_dept'))}</h2><p class="hint">${esc(L('dept_hint'))}</p>
      <div class="sw">${chk(L('c_sat'), 'c.allow_saturday', c.allow_saturday)}${chk(L('c_sun'), 'c.allow_sunday', c.allow_sunday)}${chk(L('c_bid'), 'c.allow_bid', c.allow_bid, refs(['RCR19']))}${chk(L('c_consec'), 'c.allow_consecutive_bid', c.allow_consecutive_bid)}${chk(L('c_dose'), 'c.allow_dose_change', c.allow_dose_change)}${chk(L('c_extra'), 'c.allow_extra_fractions', c.allow_extra_fractions)}${chk(L('c_chemo_daily'), 'c.chemo_daily', c.chemo_daily, refs(['RCR5d']))}</div>
      <div class="fields">${fld(L('c_bid_h'), 'c.bid_interval_h', c.bid_interval_h)}${fld(L('c_bid_max'), 'c.bid_max_dose', c.bid_max_dose)}${fld(L('c_maxd'), 'c.max_dose_per_fraction', c.max_dose_per_fraction, `type="number" step="any" inputmode="decimal" placeholder="${esc(L('none_opt'))}"`)}${fld(L('c_week'), 'c.max_fractions_per_week', c.max_fractions_per_week, `type="number" step="1" inputmode="numeric" placeholder="${esc(L('none_opt'))}"`)}${fld(L('c_round'), 'c.dose_rounding', c.dose_rounding)}${fld(L('c_weekly'), 'c.max_weekly_increase_pct', c.max_weekly_increase_pct, `type="number" step="any" inputmode="decimal" placeholder="${esc(L('none_opt'))}"`)}</div>
      <div class="fields" style="margin-top:12px">${fld(L('c_tolT'), 'c.max_tumour_deficit_pct', c.max_tumour_deficit_pct, `type="number" step="any" inputmode="decimal" placeholder="${esc(L('not_set'))}"`)}${fld(L('c_tolL'), 'c.max_late_increase_pct', c.max_late_increase_pct, `type="number" step="any" inputmode="decimal" placeholder="${esc(L('not_set'))}"`)}</div>
      <p class="small" style="margin:6px 0 0">${esc(L('tol_hint'))}</p>
    </div>
    <div class="card"><h2><span class="step">6</span>${esc(L('given'))}</h2><p class="hint">${esc(L('given_hint'))}</p>
      ${chk(L('given'), 'given.on', s.given.on)}
      ${s.given.on ? (s.given.dates ? `<p class="small">${s.given.dates.length + (s.given.bidDates || []).length} × ${s.given.d} Gy · ${esc(s.given.dates.map((d) => tr.dshort(RT.parseDate(d))).join(', '))}</p><div class="rowbtn"><button type="button" class="btn sm" data-act="given-reset">${esc(L('remove'))}</button></div>`
        : `<div class="fields" style="margin-top:8px">${fld(L('given_n'), 'given.n', s.given.n, 'type="number" min="1" step="1" inputmode="numeric"')}${fld(L('given_d'), 'given.d', s.given.d)}${fld(L('given_bid'), 'given.bid', s.given.bid, 'type="number" min="0" step="1" inputmode="numeric"')}</div><div class="sw" style="margin-top:8px">${chk(L('given_sat'), 'given.sat', s.given.sat)}${chk(L('given_sun'), 'given.sun', s.given.sun)}</div>`) : ''}
    </div>`;
    renderGapCal(); renderBioNote();
  }
  function renderGapCal() {
    const box = $('#gapcal'); if (!box) return;
    if (!model || !model.p) { box.innerHTML = ''; return; }
    box.innerHTML = calendarHtml(model.p, null, true) + legend(['delivered', 'missed', 'planned', 'holiday', 'unavail', 'chemo', 'end'].concat(model.p.fixed.length ? ['bt'] : []));
  }
  function renderBioNote() {
    const n = $('#bio-note'); if (!n || !model || !model.p) return;
    const t = model.p.tumour;
    const gen = model.p.site && model.p.site.category === 1 && model.p.siteId !== 'hn_scc' && RT.hasTime(t) && Math.abs(RT.kFromDprolif(t.dprolif, t.ab) - 0.9) < 1e-6 && t.tk === 28 ? '<br>' + esc(tr.t('generic_note')) : '';
    n.innerHTML = (RT.hasTime(t) ? `K = ${RT.kFromDprolif(t.dprolif, t.ab).toFixed(2)} Gy<sub>${t.ab}</sub>/${state.lang === 'el' ? 'ημέρα' : 'day'} ≡ D<sub>prolif</sub> = ${t.dprolif.toFixed(2)} Gy EQD2/${state.lang === 'el' ? 'ημέρα' : 'day'}, T<sub>k</sub> = ${t.tk} ${refs(['RCR19', 'DALE', 'BCR'])}` : (state.lang === 'el' ? 'Χωρίς παράγοντα χρόνου: η παράταση δεν μειώνει τη δόση του όγκου στο μοντέλο.' : 'No time factor: prolongation does not reduce the tumour dose in the model.')) + gen;
  }

  // ------------------------------------------------------------------ results
  function optionRow(o, i, excluded) {
    const p = model.p, late = o.oars[0];
    const tags = (o.recommended ? `<span class="tag rec">★</span>` : '') + (o.nSat ? `<span class="tag">${tr.wd2[5]} ×${o.nSat}</span>` : '') + (o.nSun ? `<span class="tag">${tr.wd2[6]} ×${o.nSun}</span>` : '') + (o.nBid ? `<span class="tag">BID ×${o.nBid}</span>` : '');
    const why = excluded ? `<div class="why">${o.rejected.map((w) => '✕ ' + esc(tr.reason(w)) + refs(w.refs)).join('<br>')}</div>` : '';
    const sel = !excluded && model.sel === o;
    return `<tr class="${excluded ? '' : 'pick'} ${sel ? 'sel' : ''}" ${excluded ? '' : `data-opt="${o.key}" tabindex="0" role="button" aria-pressed="${sel}"`}><td class="t">${excluded ? '' : `<span class="tag">${i + 1}</span>`}${esc(tr.optTitle(o))}<br>${tags}${why}</td><td class="n">${tr.f2(o.d)}</td>${dcell(o.tumour.delta, true)}${late ? dcell(late.delta, false) : ''}<td class="n ${o.weeklyInc > 10 ? 'neg' : 'zero'}">${o.weeklyInc > 0.5 ? '+' + o.weeklyInc.toFixed(0) + ' %' : '±0'}</td><td class="n">${o.nNew}</td><td class="n">${esc(tr.dshort(o.end))}</td><td class="n">${tr.sgi(o.ext)}</td></tr>`;
  }
  function optHead() {
    const p = model.p, L = tr.t;
    return `<thead><tr><th>${esc(L('col_option'))}</th><th>${esc(L('col_d'))}</th><th>Δ ${esc(p.rx.multilevel ? p.tumour.name : L('col_t'))}</th>${p.oars.length ? `<th>Δ ${esc(p.oars[0].name)}</th>` : ''}<th>${esc(L('col_wk'))}</th><th>${esc(L('col_n'))}</th><th>${esc(L('col_end'))}</th><th>${esc(L('col_ext'))}</th></tr></thead>`;
  }
  function detailHtml(o) {
    const p = model.p, L = tr.t, m = tr.optMethod(o);
    let rem;
    if (p.rx.multilevel) rem = Object.keys(o.phaseCounts).sort().map((ph) => `${esc(p.rx.phases[ph].name || (L('phase') + ' ' + (+ph + 1)))}: ${o.phaseCounts[ph]} × (${Object.entries(o.phaseDoses[ph]).map(([k, v]) => esc(k) + ' ' + tr.f2(v)).join(', ')}) Gy`).join('<br>') + `<br><span class="small">${esc(L('scale'))}: ${o.scale.toFixed(3)}</span>`;
    else rem = `${o.nNew} × ${tr.f2(o.d)} Gy = ${(o.nNew * o.d).toFixed(2)} Gy` + (o.exact != null && Math.abs(o.exact - o.d) > 1e-4 ? ` <span class="small">(${esc(L('exact'))} ${o.exact.toFixed(3)} Gy)</span>` : '');
    const row = (r, tum) => `<tr><td>${esc(r.name)}${tum ? ' <span class="small">EQD2<sub>T</sub></span>' : ''}</td><td class="n">${tr.f1(r.planned)}</td><td class="n">${tr.f1(r.eqd2)}</td>${dcell(r.delta, tum)}<td class="n">${tr.sg(r.deltaPct)} %</td></tr>`;
    const byDay = [...RT.groupByDay(o.newFx).entries()].sort((a, b) => a[0] - b[0]);
    return `<div class="card" id="detail"><h2>${esc(L('detail'))}: ${esc(tr.optTitle(o))}</h2><p class="hint">${esc(m.text)}${refs(m.refs)}</p>
      <div class="split"><div>${calendarHtml(p, o, false)}${legend(['delivered', 'missed', 'new', 'bid', 'holiday', 'end'].concat(p.fixed.length ? ['bt'] : []))}</div>
      <div class="grow"><dl class="kv"><dt>${esc(L('remaining'))}</dt><dd>${rem}</dd><dt>${esc(L('ends'))}</dt><dd>${esc(tr.date(o.end))} · ${esc(L('ot'))} ${o.T} ${esc(L('days'))} (${tr.sgi(o.ext)} ${esc(L('vs_plan'))})</dd>${lcHtml(o)}</dl>
      <div class="scroll" style="margin-top:10px"><table><thead><tr><th>${esc(L('tissues'))}</th><th>${esc(L('planned_c'))}</th><th>${esc(L('eqd2'))}</th><th>Δ Gy</th><th>Δ %</th></tr></thead><tbody>${row(o.tumour, true)}${o.levels.map((r) => row(r, true)).join('')}${o.oars.map((r) => row(r, false)).join('')}<tr><td>${esc(L('acute_row'))}</td><td class="n">${tr.f1(o.weeklyPlanned)}</td><td class="n">${tr.f1(o.weeklyPeak)}</td>${dcell(o.weeklyPeak - o.weeklyPlanned, false)}<td class="n">${tr.sg(o.weeklyInc)} %</td></tr></tbody></table></div><p class="small" style="margin:6px 0 0">${esc(L('acute_hint'))}</p></div></div>
      ${o.warnings.length ? `<ul class="warn">${o.warnings.map((w) => `<li>${esc(tr.reason(w))}${refs(w.refs)}</li>`).join('')}</ul>` : ''}
      <details style="margin-top:10px"><summary class="small">${esc(L('hand'))}</summary><p class="small">${esc(L('hand_hint'))}</p>${[p.tumour].concat(p.oars.slice(0, 1)).map((t) => `<div class="out" style="margin-top:6px">${esc(handText(p, o, t))}</div>`).join('')}</details>
      <details style="margin-top:10px"><summary class="small">${esc(L('dates'))}</summary><p class="small">${byDay.map(([d, fx]) => esc(tr.dshort(d)) + (fx.length > 1 ? ' ×2' : '')).join(', ')}</p></details></div>`;
  }
  function lcText(o) {
    const r = RT.lcLoss(model.p, o); if (!r) return null;
    return r[1] < 0.05 ? tr.t('lc_none') : tr.t('lc_txt').replace('{a}', r[0].toFixed(1)).replace('{b}', r[1].toFixed(1));
  }
  window.__rtgapLc = lcText;
  const lcHtml = (o) => { const x = lcText(o); return x ? `<dt>${esc(tr.t('lc'))}</dt><dd>${esc(x)} ${refs(['RCR19'])}<div class="small">${esc(tr.t('lc_hint'))}</div></dd>` : ''; };
  function handText(p, o, t) {
    const w = RT.worksheet(p, o.course, t), L = tr.t; if (!w) return '–';
    const lines = [t.name + '  (α/β = ' + t.ab + ' Gy)'];
    for (const x of w.terms) {
      if (x.mixed) lines.push(x.n + ' × [' + x.m + ' fx]  → ' + x.bed.toFixed(2));
      else if (x.m > 1 && !x.theta) lines.push(x.n + ' × (' + x.m + ' × ' + x.d.toFixed(2) + ' Gy, ' + L('hand_bid') + '): ' + (x.n * x.m) + '·' + x.d.toFixed(2) + '·(1 + ' + x.d.toFixed(2) + '/' + t.ab + ') = ' + x.bed.toFixed(2));
      else if (x.m > 1) lines.push(x.n + ' × (' + x.m + ' × ' + x.d.toFixed(2) + ' Gy, ' + L('hand_bid') + '): ' + x.n + '·' + x.m + '·' + x.d.toFixed(2) + '·(1 + ' + x.d.toFixed(2) + '·(1 + ' + x.theta.toFixed(3) + ')/' + t.ab + ') = ' + x.bed.toFixed(2));
      else lines.push(x.n + ' × ' + x.d.toFixed(2) + ' Gy: ' + x.n + '·' + x.d.toFixed(2) + '·(1 + ' + x.d.toFixed(2) + '/' + t.ab + ') = ' + x.bed.toFixed(2));
    }
    if (w.loss > 0 || w.K > 0) lines.push('− ' + L('hand_rep') + ': K·(T − Tk) = ' + w.K.toFixed(2) + '·(' + w.T + ' − ' + w.tk + ') = ' + w.loss.toFixed(2));
    lines.push('BED = ' + w.bed.toFixed(2) + ' Gy' + t.ab + '   →   EQD2 = BED / (1 + 2/' + t.ab + ') = ' + w.eqd2.toFixed(2) + ' Gy');
    if (w.terms.some((x) => x.m > 1 && x.theta)) lines.push('θ = exp(−ln2 · ' + w.bidH + ' h / ' + t.repairH + ' h) = ' + w.theta.toFixed(3));
    return lines.join('\n');
  }
  window.__rtgapHand = handText;
  function renderResults() {
    const out = $('#results'), L = tr.t, m = model;
    if (m.error) {
      out.innerHTML = `<div class="card decision error"><div class="status">${esc(L('st_error'))}</div><div class="headline">${esc(L('errors'))}</div><ul class="err">${m.error.map((e) => `<li>${esc(tr.issue(e))}</li>`).join('')}</ul></div>`;
      updateDock(); return;
    }
    const p = m.p, dec = m.dec, rec = dec.recommended;
    let h = `<div class="card decision ${dec.status}" id="decision"><div class="status">${esc(L('st_' + dec.status))}</div><div class="headline">${esc(tr.head(dec.head))}</div>
      ${rec && rec.family !== 'baseline' ? `<p class="subline">${esc(tr.optShort(rec))}</p><p class="small" style="margin:0 0 8px">${esc(L('dec_note'))}</p>` : ''}
      ${m.sens && rec && rec.family !== 'baseline' ? `<p class="small" style="margin:0 0 8px"><span class="pill ${m.sens.sameFraction >= 0.9 ? 'c3' : 'c2'}">${esc(L(m.sens.sameFraction >= 0.9 ? 'robust_yes' : 'robust_no'))}</span> ${esc(L('unc'))} (${m.sens.n}): Δ ${esc(p.tumour.name === p.rx.primary || !p.rx.multilevel ? L('col_t').toLowerCase() : p.tumour.name)} ${tr.sg(m.sens.tumourPctRange[0])} … ${tr.sg(m.sens.tumourPctRange[1])} %${p.oars.length ? `, Δ ${esc(p.oars[0].name)} ${tr.sg(m.sens.oarPctRanges[p.oars[0].name][0])} … ${tr.sg(m.sens.oarPctRanges[p.oars[0].name][1])} %` : ''}; ${esc(L('unc_same'))} ${Math.round(100 * m.sens.sameFraction)} %.</p>` : ''}
      ${m.rec0 != null ? `<p class="small" style="margin:0 0 8px">${esc(L('rec_line'))} ${refs(['PUTORA'])}: <b>${Math.round(100 * m.rec0)} %</b> ${esc(L('rec_fixed'))}${m.rec5 != null && m.rec5 > m.rec0 + 0.005 ? `, <b>${Math.round(100 * m.rec5)} %</b> ${esc(L('rec_5'))}` : ''}.${m.base && lcText(m.base) ? ` ${esc(L('ch_uncomp'))}: ${esc(L('lc').toLowerCase())} ${esc(lcText(m.base))}.` : ''}</p>` : ''}
      ${dec.candidates.length ? `<p class="small">${esc(L('weigh'))}: ${dec.candidates.map((o) => `<a href="#detail" data-opt="${o.key}">${esc(tr.optTitle(o))}</a>`).join(' · ')}</p>` : ''}
      <details ${dec.trace.length ? 'open' : ''}><summary class="small">${esc(L('why'))}</summary><ol class="trace">${dec.trace.map((s) => `<li>${esc(tr.trace(s))}${refs(s.refs)}</li>`).join('')}</ol></details></div>`;
    if (p.inputWarnings.length) h += `<div class="card"><h2>${esc(L('input_checks'))}</h2><ul class="warn" style="margin-top:0">${p.inputWarnings.map((w) => `<li>${esc(tr.issue(w))}</li>`).join('')}</ul></div>`;
    if (p.remaining && m.base) {
      h += `<div class="card"><h2>${esc(L('chart_title'))} ${refs(['BCR', 'FOWLER'])}</h2><p class="hint">${esc(L('chart_sub'))}</p><div class="chartbox"><canvas id="chart" role="img" aria-label="${esc(L('chart_title'))}"></canvas></div>
        <div class="legend"><span><i style="background:var(--muted);height:3px;border:0;vertical-align:3px"></i>${esc(L('ch_planned'))}</span><span><i style="background:var(--bad);height:3px;border:0;vertical-align:3px"></i>${esc(L('ch_uncomp'))}</span>${m.sel && m.sel !== m.base ? `<span><i style="background:var(--accent);height:3px;border:0;vertical-align:3px"></i>${esc(L('ch_sel'))}</span>` : ''}<span><i style="background:var(--bad-soft)"></i>${esc(L('s_gap').toLowerCase())}</span></div></div>`;
      h += `<div class="card"><h2>${esc(L('options'))}</h2><p class="hint">${esc(L('options_hint'))} ${esc(L('col_delta'))}. ${esc(L('acute_hint'))}</p><div class="scroll"><table>${optHead()}<tbody>${dec.feasible.map((o, i) => optionRow(o, i, false)).join('')}</tbody></table></div>
        ${dec.rejected.length ? `<details style="margin-top:12px"><summary class="small">${esc(L('excluded'))} (${dec.rejected.length})</summary><div class="scroll"><table>${optHead()}<tbody>${dec.rejected.map((o, i) => optionRow(o, i, true)).join('')}</tbody></table></div></details>` : ''}</div>`;
      if (p.oars.length) h += `<div class="card"><h2>${esc(L('map_title'))} ${refs(['PUTORA'])}</h2><p class="hint">${esc(L('map_sub'))}</p><div class="chartbox" style="height:280px"><canvas id="map" role="img" aria-label="${esc(L('map_title'))}"></canvas></div>
        <div class="legend"><span><i style="background:var(--accent);border-radius:50%"></i>${esc(L('map_feas'))}</span><span><i style="border:1.5px solid var(--muted);border-radius:50%;background:transparent"></i>${esc(L('map_excl'))}</span>${m.given ? `<span><i style="background:var(--warn);transform:rotate(45deg)"></i>${esc(L('map_given'))}</span>` : ''}<span><i style="background:var(--ink);border-radius:50%"></i>${esc(L('ch_planned'))}</span></div></div>`;
      if (m.sel) h += detailHtml(m.sel);
      if (m.sens) {
        const s = m.sens, g = s.grid;
        h += `<div class="card"><h2>${esc(L('robust'))}</h2><p class="hint">${s.n} ${esc(L('rob_grid'))}: ${esc(L('g_ab'))} ${g.tumour_alpha_beta.join(', ')}; ${esc(L('g_rep'))} ${g.repopulation.join(', ')}; ${esc(L('g_tk'))} ${g.kickoff_shift_days.join(', ')}; ${esc(L('g_late'))} ${g.late_alpha_beta.join(', ')}.</p>
          <p style="margin:0 0 8px">${esc(L('rob_line'))} <b>${esc(tr.optTitle(s.option))}</b></p>
          <div class="scroll"><table><thead><tr><th>${esc(L('tissues'))}</th><th>Δ EQD2 (Gy)</th><th>Δ %</th></tr></thead><tbody>
          <tr><td>${esc(p.tumour.name)}</td><td class="n">${tr.sg(s.tumourRange[0])} … ${tr.sg(s.tumourRange[1])}</td><td class="n">${tr.sg(s.tumourPctRange[0])} … ${tr.sg(s.tumourPctRange[1])}</td></tr>
          ${Object.keys(s.oarRanges).map((k) => `<tr><td>${esc(k)}</td><td class="n">${tr.sg(s.oarRanges[k][0])} … ${tr.sg(s.oarRanges[k][1])}</td><td class="n">${tr.sg(s.oarPctRanges[k][0])} … ${tr.sg(s.oarPctRanges[k][1])}</td></tr>`).join('')}</tbody></table></div>
          <p style="margin:12px 0 6px">${esc(L('rob_same'))} <b>${Math.round(100 * s.sameFraction)} %</b>.</p>
          <div class="scroll"><table><thead><tr><th>${esc(L('rob_dec'))}</th><th>${esc(L('rob_cases'))}</th><th>${esc(L('rob_drange'))}</th></tr></thead><tbody>${s.decisions.map((d) => `<tr><td>${esc(d.o ? tr.optTitle(d.o) : L('st_clinical_decision'))}</td><td class="n">${d.count} / ${s.n}</td><td class="n">${d.o ? tr.f2(d.dRange[0]) + '–' + tr.f2(d.dRange[1]) : '–'}</td></tr>`).join('')}</tbody></table></div></div>`;
      }
      if (m.scen && m.scen.length) {
        h += `<div class="card"><h2>${esc(L('scen_title'))}</h2><p class="hint">${esc(L('scen_hint'))}</p><div class="scroll"><table><thead><tr><th>${esc(L('scen_resume'))}</th><th>${esc(L('scen_uncomp'))}</th><th>Δ ${esc(L('col_t'))}</th><th style="text-align:left">${esc(L('scen_dec'))}</th></tr></thead><tbody>
          ${m.scen.map((r) => `<tr><td class="n" style="text-align:left">${esc(tr.dshort(r.resume))}</td><td class="n">${r.nMissed} ${esc(L('fx'))} · ${tr.sgi(r.baseExt)} ${esc(L('days'))}</td>${dcell(r.baseDelta, true)}<td style="text-align:left"><span class="pill ${r.status === 'clinical_decision' ? 'c2' : r.status === 'no_action' ? 'c3' : ''}">${esc(L('st_' + r.status))}</span>${r.option && r.option.family !== 'baseline' ? `<div class="small">${esc(tr.optTitle(r.option))} · ${r.option.nNew} × ${tr.f2(r.option.d)} Gy</div>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
      }
    }
    const repLang = state.pdfLang || state.lang;
    h += `<div class="card" id="report"><h2>${esc(L('record'))}</h2>
      <div class="fields">${fld(L('case_ref'), 'caseRef', state.caseRef, 'type="text" autocomplete="off"')}${fld(L('calc_by'), 'calcBy', state.calcBy, 'type="text"')}${fld(L('checked_by'), 'checkedBy', state.checkedBy, 'type="text"')}
        <label class="f"><span>${esc(L('pdf_lang'))}</span><select data-bind="pdfLang" id="i-pdfLang"><option value="el" ${repLang === 'el' ? 'selected' : ''}>Ελληνικά</option><option value="en" ${repLang === 'en' ? 'selected' : ''}>English</option></select></label></div>
      <div class="rowbtn"><button type="button" class="btn pri" data-act="pdf">${esc(L('pdf'))}</button><button type="button" class="btn" data-act="json">${esc(L('json'))}</button><button type="button" class="btn" data-act="copy">${esc(L('copy_json'))}</button>
        <label class="btn" style="position:relative;overflow:hidden">${esc(L('import'))}<input type="file" id="imp" accept=".json,application/json" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div>
      <p class="small" style="margin:10px 0 0">${esc(L('checksum'))}: <span class="num" style="word-break:break-all">${m.checksum}</span> · RTGap ${RT.VERSION}</p></div>`;
    out.innerHTML = h;
    drawChart(); drawMap(); updateDock();
  }
  function updateDock() {
    const d = $('#dock'); if (!d) return;
    const m = model;
    d.innerHTML = m.error ? `<b>${esc(tr.t('st_error'))}</b><span>${esc(tr.issue(m.error[0]))}</span>` : `<b>${esc(tr.t('st_' + m.dec.status))}</b><span>${esc(tr.head(m.dec.head))}</span>`;
  }

  // ------------------------------------------------------------------ chart
  function drawChart() {
    const cv = $('#chart'); if (!cv || !model || model.error) return;
    const m = model, p = m.p, css = getComputedStyle(document.documentElement), col = (n) => css.getPropertyValue(n).trim();
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const plannedTL = RT.timeline(p, p.plannedCourse), baseTL = RT.timeline(p, m.base.course), selTL = m.sel && m.sel !== m.base ? RT.timeline(p, m.sel.course) : null;
    const gapStart = p.missed.length ? p.missed[0] : p.resume, x0 = Math.max(p.rx.start, gapStart - 12);
    let x1 = Math.max(p.plannedEnd, m.base.end, m.sel ? m.sel.end : 0) + 1;
    const vis = (tl) => tl.filter((q) => q.day >= x0);
    const allY = vis(plannedTL).concat(vis(baseTL), selTL ? vis(selTL) : []).map((q) => q.y);
    let y0 = Math.min(...allY), y1 = Math.max(...allY); const pad = Math.max(1, (y1 - y0) * 0.12); y0 = Math.floor(y0 - pad); y1 = Math.ceil(y1 + pad);
    const ml = 44, mr = 54, mt = 14, mb = 30, X = (d) => ml + (d - x0) / (x1 - x0) * (W - ml - mr), Y = (v) => mt + (1 - (v - y0) / (y1 - y0)) * (H - mt - mb);
    g.font = '11px ' + col('--f-num'); g.textBaseline = 'middle';
    // gap shading
    if (p.missed.length) { g.fillStyle = col('--bad-soft'); g.fillRect(X(Math.max(x0, p.missed[0] - 0.5)), mt, X(p.resume - 0.5) - X(Math.max(x0, p.missed[0] - 0.5)), H - mt - mb); }
    // grid
    const step = (y1 - y0) > 30 ? 10 : (y1 - y0) > 12 ? 5 : 2;
    g.strokeStyle = col('--line'); g.fillStyle = col('--muted'); g.lineWidth = 1; g.textAlign = 'right';
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) { g.beginPath(); g.moveTo(ml, Y(v)); g.lineTo(W - mr, Y(v)); g.stroke(); g.fillText(v, ml - 6, Y(v)); }
    g.textAlign = 'center';
    for (let d = x0; d <= x1; d++) if (RT.weekday(d) === 0) { const q = RT.ymd(d); g.fillText(q.d + '/' + q.m, X(d), H - mb + 12); g.beginPath(); g.moveTo(X(d), H - mb); g.lineTo(X(d), H - mb + 4); g.stroke(); }
    g.save(); g.translate(12, mt + (H - mt - mb) / 2); g.rotate(-Math.PI / 2); g.fillText(tr.t('ch_gy'), 0, 0); g.restore();
    // kick-off
    if (RT.hasTime(p.tumour)) { const tk = p.rx.start + p.tumour.tk; if (tk > x0 && tk < x1) { g.setLineDash([4, 4]); g.strokeStyle = col('--muted'); g.beginPath(); g.moveTo(X(tk), mt); g.lineTo(X(tk), H - mb); g.stroke(); g.setLineDash([]); g.textAlign = 'left'; g.fillText('Tk', X(tk) + 4, H - mb - 8); } }
    const line = (tl, color, width, dash) => {
      const v = vis(tl); if (!v.length) return;
      g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash || []); g.beginPath();
      v.forEach((q, i) => { if (i === 0) g.moveTo(X(q.day), Y(q.y)); else g.lineTo(X(q.day), Y(q.y)); });
      g.stroke(); g.setLineDash([]);
      const e = v[v.length - 1]; g.fillStyle = color; g.beginPath(); g.arc(X(e.day), Y(e.y), 3.5, 0, 6.3); g.fill();
      return e;
    };
    const ends = [];
    ends.push([line(plannedTL, col('--muted'), 1.5, [5, 4]), col('--muted')]);
    ends.push([line(baseTL, col('--bad'), 2), col('--bad')]);
    if (selTL) ends.push([line(selTL, col('--accent'), 2.5), col('--accent')]);
    // end labels, spread vertically
    g.textAlign = 'left'; const used = [];
    ends.filter((e) => e[0]).sort((a, b) => a[0].y - b[0].y).forEach(([e, c]) => { let yy = Y(e.y); for (const u of used) if (Math.abs(u - yy) < 12) yy = u - 12; used.push(yy); g.fillStyle = c; g.fillText(e.y.toFixed(1), Math.min(X(e.day) + 7, W - mr + 6), yy); });
  }

  let mapPts = [];
  function drawMap() {
    const cv = $('#map'); mapPts = []; if (!cv || !model || model.error) return;
    const m = model, css = getComputedStyle(document.documentElement), col = (n) => css.getPropertyValue(n).trim();
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const all = m.dec.feasible.map((o, i) => ({ o, i: i + 1, f: true })).concat(m.dec.rejected.map((o) => ({ o, f: false })));
    const xs = all.map((q) => q.o.oars[0].deltaPct), ys = all.map((q) => q.o.tumour.deltaPct);
    const xmin = Math.min(0, ...xs), xmax = Math.max(1, ...xs), ymin = Math.min(-1, ...ys), ymax = Math.max(0.5, ...ys);
    const px = (xmax - xmin) * 0.1, py = (ymax - ymin) * 0.12, x0 = xmin - px, x1 = xmax + px, y0 = ymin - py, y1 = ymax + py;
    const ml = 46, mr = 14, mt = 12, mb = 34, X = (v) => ml + (v - x0) / (x1 - x0) * (W - ml - mr), Y = (v) => mt + (1 - (v - y0) / (y1 - y0)) * (H - mt - mb);
    g.font = '11px ' + col('--f-num'); g.textBaseline = 'middle';
    const c = m.p.c;
    if (c.max_tumour_deficit_pct != null && c.max_late_increase_pct != null) { g.fillStyle = col('--good-soft'); const xa = X(Math.max(x0, xmin - px)), xb = X(Math.min(x1, c.max_late_increase_pct)), ya = Y(Math.max(y0, -c.max_tumour_deficit_pct)), yb = Y(y1); g.fillRect(xa, yb, xb - xa, ya - yb); }
    const tick = (lo, hi) => { const span = hi - lo, st = span > 20 ? 5 : span > 8 ? 2 : span > 4 ? 1 : 0.5, out = []; for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) out.push(Math.round(v * 10) / 10); return out; };
    g.strokeStyle = col('--line'); g.fillStyle = col('--muted'); g.lineWidth = 1;
    g.textAlign = 'right'; for (const v of tick(y0, y1)) { g.beginPath(); g.moveTo(ml, Y(v)); g.lineTo(W - mr, Y(v)); g.stroke(); g.fillText((v > 0 ? '+' : '') + v, ml - 6, Y(v)); }
    g.textAlign = 'center'; for (const v of tick(x0, x1)) { g.beginPath(); g.moveTo(X(v), mt); g.lineTo(X(v), H - mb); g.stroke(); g.fillText((v > 0 ? '+' : '') + v, X(v), H - mb + 11); }
    g.fillText(tr.t('map_x'), ml + (W - ml - mr) / 2, H - 8);
    g.save(); g.translate(11, mt + (H - mt - mb) / 2); g.rotate(-Math.PI / 2); g.fillText(tr.t('map_y'), 0, 0); g.restore();
    g.strokeStyle = col('--muted'); g.lineWidth = 1.2; g.beginPath(); g.moveTo(X(0), mt); g.lineTo(X(0), H - mb); g.moveTo(ml, Y(0)); g.lineTo(W - mr, Y(0)); g.stroke();
    g.fillStyle = col('--ink'); g.beginPath(); g.arc(X(0), Y(0), 4, 0, 6.3); g.fill();
    const seen = [];
    for (const q of all) {
      const o = q.o, x = X(o.oars[0].deltaPct), y = Y(o.tumour.deltaPct), given = o.family === 'custom', sel = o === m.sel;
      if (given) { g.fillStyle = col('--warn'); g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-5, -5, 10, 10); g.restore(); }
      else if (q.f) { g.fillStyle = col('--accent'); g.beginPath(); g.arc(x, y, o.recommended ? 6.5 : 5, 0, 6.3); g.fill(); }
      else { g.strokeStyle = col('--muted'); g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 4.5, 0, 6.3); g.stroke(); }
      if (sel) { g.strokeStyle = col('--ink'); g.lineWidth = 2; g.beginPath(); g.arc(x, y, 10, 0, 6.3); g.stroke(); }
      if (q.f) { let n = seen.filter((s) => Math.abs(s[0] - x) < 9 && Math.abs(s[1] - y) < 9).length; seen.push([x, y]); g.fillStyle = col('--ink'); g.textAlign = 'left'; g.fillText(String(q.i), x + 9 + n * 13, y - 9); mapPts.push({ x, y, key: o.key }); }
    }
  }
  document.addEventListener('click', (ev) => {
    if (ev.target.id !== 'map' || !mapPts.length) return;
    const r = ev.target.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    let best = null, bd = 30 * 30; for (const q of mapPts) { const d2 = (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y); if (d2 < bd) { bd = d2; best = q; } }
    if (best) { state.sel = best.key; compute(); persist(); renderResults(); }
  });

  /* Header art: cell survival on a semi-log plot. Single-dose LQ curves for α/β = 10 and 3 Gy, and the
     same late tissue given in 2-Gy fractions (the repeated shoulders that make fractionation work). */
  let heroT0 = null, heroDone = false;
  function drawHero(now) {
    const cv = $('#hero'); if (!cv) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = performance.now();
    if (heroT0 == null) heroT0 = t;
    const prog = (reduce || now === 'full') ? 1 : Math.max(0, Math.min(1, (t - heroT0) / 1600)), ease = 1 - Math.pow(1 - prog, 3);
    if (prog >= 1) heroDone = true;
    const wide = W > 1000, x0 = wide ? W * 0.43 : W * 0.06, x1 = wide ? W * 0.6 : W - 14, y0 = 20, y1 = H - 24, Dmax = 14, decades = 5;
    g.globalAlpha = wide ? 1 : 0.4;
    const X = (D) => x0 + (D / Dmax) * (x1 - x0), Y = (lg) => y0 + (-lg / decades) * (y1 - y0);
    g.lineWidth = 1; g.strokeStyle = 'rgba(159,176,207,0.10)';
    for (let k = 0; k <= decades; k++) { g.beginPath(); g.moveTo(x0, Y(-k)); g.lineTo(x1, Y(-k)); g.stroke(); }
    for (let D = 0; D <= Dmax; D += 2) { g.beginPath(); g.moveTo(X(D), y0); g.lineTo(X(D), y1); g.stroke(); }
    g.font = '10px ' + getComputedStyle(document.documentElement).getPropertyValue('--f-num'); g.fillStyle = 'rgba(169,184,214,0.45)';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    if (wide) for (let k = 0; k <= decades; k += 1) g.fillText(k === 0 ? '1' : '10⁻' + '¹²³⁴⁵'[k - 1], x0 - 5, Y(-k));
    const legendItems = [];
    const lgS = (D, a, ab) => -(a * D + (a / ab) * D * D) / Math.LN10;
    const curve = (fn, color, width, glow, label) => {
      g.save(); g.strokeStyle = color; g.lineWidth = width; g.shadowColor = color; g.shadowBlur = glow; g.beginPath();
      const Dend = Dmax * ease; let last = null;
      for (let D = 0; D <= Dend + 1e-9; D += 0.05) { const y = Math.max(-decades, fn(D)); const p = [X(D), Y(y)]; if (last == null) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); last = [p, y]; if (y <= -decades) break; }
      g.stroke(); g.restore();
      if (label) legendItems.push([color, label]);
    };
    curve((D) => lgS(D, 0.35, 10), 'rgba(127,178,255,0.8)', 1.6, 12, 'α/β = 10');
    curve((D) => lgS(D, 0.25, 3), 'rgba(234,240,251,0.4)', 1.3, 0, 'α/β = 3');
    curve((D) => { const n = Math.floor(D / 2), r = D - 2 * n; return n * lgS(2, 0.25, 3) + lgS(r, 0.25, 3); }, 'rgba(243,180,90,0.9)', 1.8, 10, '2 Gy × n');
    if (wide) { let ly = y0 + 4; g.textAlign = 'left'; for (const [c2, lab] of legendItems) { g.fillStyle = c2; g.fillRect(x1 - 104, ly - 1, 14, 2); g.fillStyle = 'rgba(214,224,242,0.75)'; g.fillText(lab, x1 - 84, ly); ly += 14; } }
    g.fillStyle = 'rgba(169,184,214,0.5)'; g.textAlign = 'center'; g.fillText('D (Gy)', x1 - 14, y1 + 13); g.textAlign = 'left'; if (wide) g.fillText('S', x0 + 4, y0 - 8);
    g.globalAlpha = 1;
    if (prog < 1 && now !== 'full') requestAnimationFrame(drawHero);
  }

  // ------------------------------------------------------------------ tools, references
  const SELF = RT.selfTest();
  const toolState = { P: 70, p: 2, E: 8, e: 4, n: 33, d: 2, ab: 10, T: 38, dp: 0.7, tk: 21 };
  function renderStatic() {
    const L = tr.t;
    $('#tagline').textContent = L('tagline');
    $('#herochips').innerHTML = L('chips').map((c) => `<span>${esc(c)}</span>`).join('');
    $('#foot-ver').textContent = 'v' + RT.VERSION;
    $('#foot-dev').innerHTML = esc(L('dev')) + ': <b>Konstantinos Vasilopoulos, PhD Candidate</b>';
    $('#foot-lic').innerHTML = esc(L('lic')) + ' <a href="https://github.com/konsvasilopoulos/RTGap" target="_blank" rel="noopener">' + esc(L('src')) + '</a>';
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lang === state.lang));
    $('#ex').innerHTML = `<option value="">${esc(L('ex_pick'))}</option>` + Object.keys(EXAMPLES).map((k) => `<option value="${k}">${esc(EX_NAMES[state.lang][k])}</option>`).join('');
    $('#ex').setAttribute('aria-label', L('examples')); $('#reset').textContent = L('reset');
    const tf = (k, lab) => `<label class="f"><span>${esc(lab)}</span><input type="number" step="any" inputmode="decimal" data-tool="${k}" id="t-${k}" value="${toolState[k]}"></label>`;
    $('#below').innerHTML = `
      <div class="card"><h2>${esc(L('tools'))}</h2><div class="tools">
        <div><h3 style="font:600 1rem var(--f-display)">${esc(L('joiner_t'))} ${refs(['JOINER', 'BCR'])}</h3><p class="hint">${esc(L('joiner_h'))}</p><div class="fields">${tf('P', L('j_P'))}${tf('p', L('j_p'))}${tf('E', L('j_E'))}${tf('e', L('j_e'))}</div><div class="out" id="j-out"></div></div>
        <div><h3 style="font:600 1rem var(--f-display)">${esc(L('eq_t'))} ${refs(['FOWLER', 'BCR'])}</h3><p class="hint">EQD2<sub>T</sub> = EQD2 − D<sub>prolif</sub> · (T − T<sub>k</sub>)</p><div class="fields">${tf('n', L('eq_n'))}${tf('d', L('eq_d'))}${tf('ab', L('eq_ab'))}${tf('T', L('eq_T'))}${tf('dp', L('eq_dp'))}${tf('tk', L('eq_tk'))}</div><div class="out" id="e-out"></div></div>
      </div></div>
      <div class="card" id="references"><h2>${esc(L('refs_title'))}</h2><p class="hint">${esc(L('refs_hint'))}</p><ol class="reflist">${I.REFS.map((r) => `<li id="ref-${r.id}">${esc(r.text)}${r.url ? ` <a href="${r.url}" target="_blank" rel="noopener">link</a>` : ''}<span class="use">${esc(r.use[state.lang])}</span></li>`).join('')}</ol></div>
      <div class="card"><h2>${esc(L('method'))}</h2><p style="max-width:92ch;margin:0 0 8px">${esc(L('method_text'))} ${refs(['BCR', 'FOWLER', 'RCR19', 'THAMES'])}</p><p class="small" style="max-width:92ch;margin:0 0 10px">${esc(L('xval'))}</p>
        <details><summary class="small">${esc(L('selftest'))}: ${SELF.filter((x) => x.ok).length}/${SELF.length} ${esc(L('st_pass'))}</summary><div class="scroll"><table><thead><tr><th>Test</th><th>${esc(L('st_exp'))}</th><th>${esc(L('st_got'))}</th><th></th></tr></thead><tbody>${SELF.map((x) => `<tr><td>${esc(x.id)} ${refs([x.src])}</td><td class="n">${x.expected}</td><td class="n">${isFinite(x.got) ? x.got.toFixed(3) : '–'}</td><td class="n ${x.ok ? 'pos' : 'neg'}">${x.ok ? '✓' : '✕'}</td></tr>`).join('')}</tbody></table></div></details></div>`;
    $('#disc').textContent = L('disclaimer');
    renderTools();
  }
  function renderTools() {
    const L = tr.t, s = toolState, el = state.lang === 'el';
    try { const j = RT.joiner(s.P, s.p, s.E, s.e); $('#j-out').textContent = `D = P − E = ${j.D.toFixed(2)} Gy\nd = (P·p − E·e) / (P − E) = ${j.d.toFixed(3)} Gy\n${L('j_res')}: ${j.nExact.toFixed(2)} → ${j.n} × ${j.practical.toFixed(2)} Gy`; }
    catch (e) { $('#j-out').textContent = L('j_bad'); }
    if (s.n > 0 && s.d > 0 && s.ab > 0) {
      const b = RT.bed(s.n, s.d, s.ab), e2 = RT.eqd2FromBed(b, s.ab), loss = (s.dp > 0 && s.tk != null && s.T != null) ? s.dp * Math.max(0, s.T - s.tk) : 0;
      $('#e-out').textContent = `${s.n} × ${s.d} Gy = ${(s.n * s.d).toFixed(2)} Gy\nBED = ${b.toFixed(2)} Gy${s.ab}\nEQD2 = ${e2.toFixed(2)} Gy` + (loss ? `\nEQD2_T = ${(e2 - loss).toFixed(2)} Gy (−${loss.toFixed(2)} Gy ${el ? 'επαναπληθυσμός' : 'repopulation'})` : '');
    } else $('#e-out').textContent = '–';
  }
  function showRef(id) {
    const r = I.REFS.find((x) => x.id === id), pop = $('#refpop'); if (!r) return;
    pop.innerHTML = `<button type="button" class="btn sm close" data-act="close-ref" aria-label="close">✕</button><div class="n">[${I.REF_NUM[id]}] ${esc(r.short)}</div><p style="margin:6px 0">${esc(r.text)}${r.url ? ` <a href="${r.url}" target="_blank" rel="noopener">link</a>` : ''}</p><p class="small" style="margin:0">${esc(r.use[state.lang])}</p>`;
    pop.hidden = false;
  }
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }

  // ------------------------------------------------------------------ saving
  let dl = null;
  if (window.claude && window.claude.use) window.claude.use('downloads').then((d) => { dl = d; }).catch(() => {});
  async function saveFile(filename, data, mime) {
    if (dl) { try { await dl.save({ filename, data }); toast(tr.t('saved')); return true; } catch (e) { if (e && e.code === 'declined') return false; } }
    try {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      if (window.claude && window.claude.use && !dl) toast(tr.t('save_fail'));
      return true;
    } catch (e) { toast(tr.t('save_fail')); return false; }
  }
  const exportJson = () => JSON.stringify({ rtgap: RT.VERSION, software: 'RTGap', case: model.cfg, protocol: {} }, null, 1);
  const fileStem = () => 'RTGap-' + (state.caseRef ? state.caseRef.replace(/[^\w\-]+/g, '_').slice(0, 40) + '-' : '') + (model.checksum || '').slice(0, 8);
  async function makePdf() {
    if (!model || model.error) return null;
    const lang = state.pdfLang || state.lang;
    return window.RTPDF.build({ model, tr: I.make(lang), lang, meta: { caseRef: state.caseRef, calcBy: state.calcBy, checkedBy: state.checkedBy, title: state.title }, inputJson: exportJson(), lc: (oo) => { const keep = tr; tr = I.make(lang); try { return lcText(oo); } finally { tr = keep; } }, hand: (pp, oo, tt) => { const keep = tr; tr = I.make(lang); try { return handText(pp, oo, tt); } finally { tr = keep; } } });
  }
  window.__rtgapMakePdf = makePdf;

  // ------------------------------------------------------------------ events
  function setPath(path, value) {
    const ks = path.split('.'); let o = state;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = value;
  }
  let timer = null;
  function refresh(full) {
    compute(); persist();
    if (full) { renderStatic(); renderInputs(); } else { renderGapCal(); renderBioNote(); const tt = $('#rx-total'); if (tt) tt.textContent = ((state.n || 0) * (state.d || 0)).toFixed(2) + ' Gy'; refreshSiteMeta(); }
    renderResults();
  }
  function refreshSiteMeta() { /* category pills depend on the planner; cheap to rebuild only on structural changes */ }
  const TEXT_BINDS = /(^title$|^caseRef$|^calcBy$|^checkedBy$|name$|^start$|^resume$|^site$|^category$|^primary$|^pdfLang$|^cause$|mode$|ratio$|date$)/;
  function onInput(ev) {
    const t = ev.target;
    if (t.dataset.tool) { toolState[t.dataset.tool] = num(t.value); renderTools(); return; }
    const b = t.dataset.bind; if (!b) return;
    let v;
    if (t.type === 'checkbox') v = t.checked; else if (TEXT_BINDS.test(b)) v = t.value; else v = num(t.value);
    if (b === 'c.bid_interval_h' || b === 'c.bid_max_dose' || b === 'c.dose_rounding' || b === 'tumour.ab') { if (v == null) return; }
    if ((b === 'n' || /\.n$/.test(b)) && v != null) v = Math.round(v);
    setPath(b, v);
    if (b === 'given.on' && v && model && model.p && !state.given.dates) { if (!state.given.n) state.given.n = model.p.remaining; if (!state.given.d) state.given.d = model.p.dRef; }
    if (b === 'brachy.on' && v && !state.brachy.fx.length && model && model.p) state.brachy.fx = [0, 7, 14, 21].map((k) => ({ date: RT.iso(model.p.plannedEnd + 3 + k), dose: 7 }));
    if (b === 'site') { const d = siteDefaults(v); state.tumour = d.tumour; state.oars = d.oars; state.category = 'auto'; }
    if (['caseRef', 'calcBy', 'checkedBy', 'pdfLang'].includes(b)) { persist(); return; }
    const struct = t.dataset.struct || t.type === 'checkbox' && (b === 'multi' || b === 'brachy.on' || b === 'given.on') || b === 'tumour.mode' || /levels\.\d+\.name$/.test(b) && ev.type === 'change';
    clearTimeout(timer);
    if (struct || ev.type === 'change' && (t.type === 'checkbox' || t.tagName === 'SELECT' || t.type === 'date')) refresh(!!struct || b === 'holidays' || b === 'scen' || t.type === 'date');
    else timer = setTimeout(() => refresh(false), 160);
  }
  function toggle(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
  function onClick(ev) {
    const t = ev.target.closest('[data-ref],[data-act],[data-day],[data-opt],[data-lang]'); if (!t) { if (!ev.target.closest('#refpop')) $('#refpop').hidden = true; return; }
    if (t.dataset.ref) { ev.preventDefault(); showRef(t.dataset.ref); return; }
    if (t.dataset.lang) { state.lang = t.dataset.lang; tr = I.make(state.lang); refresh(true); return; }
    if (t.dataset.day) {
      const d = t.dataset.day, m = state.mark;
      if (m === 'missed') toggle(state.missed, d); else if (m === 'unavail') toggle(state.unavailable, d); else if (m === 'chemo') toggle(state.c.chemo_dates, d); else toggle(state.closed, d);
      if (m === 'missed' && state.resume && state.missed.length && state.resume <= state.missed.slice().sort().pop()) state.resume = '';
      refresh(false); const r = $('#i-resume'); if (r) r.value = state.resume; return;
    }
    if (t.dataset.opt) { ev.preventDefault(); state.sel = t.dataset.opt; compute(); persist(); renderResults(); if (t.tagName === 'A') { const d = $('#detail'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return; }
    const a = t.dataset.act, i = +t.dataset.i, j = +t.dataset.j;
    if (a === 'close-ref') { $('#refpop').hidden = true; return; }
    if (a === 'mark') { state.mark = t.dataset.m; document.querySelectorAll('[data-act="mark"]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === state.mark)); persist(); return; }
    if (a === 'wd') { toggle(state.weekdays, i); state.weekdays.sort(); if (!state.weekdays.length) state.weekdays = [0, 1, 2, 3, 4]; refresh(true); return; }
    if (a === 'add-level') { state.phases[i].levels.push({ name: 'PTV' + (state.phases[i].levels.length + 1), d: 1.8 }); refresh(true); return; }
    if (a === 'rm-level') { state.phases[i].levels.splice(j, 1); refresh(true); return; }
    if (a === 'add-phase') { const last = state.phases[state.phases.length - 1]; state.phases.push({ name: 'Boost', n: 5, levels: [{ name: last.levels[0].name, d: last.levels[0].d }] }); refresh(true); return; }
    if (a === 'rm-phase') { state.phases.splice(i, 1); refresh(true); return; }
    if (a === 'add-oar') { state.oars.push({ name: 'OAR ' + (state.oars.length + 1), ab: 3, ratio: 1, limit: null, repair: 4.4, bt: 1 }); refresh(true); return; }
    if (a === 'add-bt') { const last = state.brachy.fx[state.brachy.fx.length - 1]; state.brachy.fx.push({ date: last && last.date ? RT.iso(RT.parseDate(last.date) + 7) : (model && model.p ? RT.iso(model.p.plannedEnd + 3) : ''), dose: last ? last.dose : 7 }); refresh(true); return; }
    if (a === 'given-reset') { state.given = { on: false, n: null, d: null, sat: false, sun: false, bid: 0, dates: null, bidDates: null }; refresh(true); return; }
    if (a === 'rm-bt') { state.brachy.fx.splice(i, 1); refresh(true); return; }
    if (a === 'rm-oar') { state.oars.splice(i, 1); refresh(true); return; }
    if (a === 'tf') { const o = RT.SITES[state.site].time_factor_option; state.tumour.mode = 'dp'; state.tumour.rate = o.dprolif_eqd2_per_day; state.tumour.tk = o.kickoff_days; refresh(true); return; }
    if (a === 'site-defaults') { const d = siteDefaults(state.site); state.tumour = d.tumour; state.oars = d.oars; refresh(true); return; }
    if (a === 'json') { saveFile(fileStem() + '.json', exportJson(), 'application/json'); return; }
    if (a === 'copy') { try { navigator.clipboard.writeText(exportJson()).then(() => toast(tr.t('copied')), () => toast(tr.t('save_fail'))); } catch (e) { toast(tr.t('save_fail')); } return; }
    if (a === 'pdf') { const old = t.textContent; t.textContent = tr.t('busy'); t.disabled = true; makePdf().then((blob) => blob && saveFile(fileStem() + '.pdf', blob, 'application/pdf')).catch(() => toast(tr.t('save_fail'))).then(() => { t.textContent = old; t.disabled = false; }); return; }
    if (a === 'dock') { const d = $('#decision') || $('#results'); d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  function loadState(s) { s.lang = state.lang; state = s; tr = I.make(state.lang); refresh(true); }
  document.addEventListener('input', onInput);
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'ex') { if (t.value) loadState(EXAMPLES[t.value]()); t.value = ''; return; }
    if (t.id === 'imp') { const f = t.files && t.files[0]; if (!f) return; f.text().then((txt) => { const j = JSON.parse(txt); loadState(fromCase(j.case || j)); }).catch(() => toast(tr.t('import_fail'))); return; }
    onInput(ev);
  });
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('tr[data-opt]')) { ev.preventDefault(); ev.target.click(); } if (ev.key === 'Escape') $('#refpop').hidden = true; });
  $('#reset').addEventListener('click', () => loadState(baseState({ missed: [], start: RT.iso(Math.floor(Date.now() / 86400000)) })));
  window.addEventListener('resize', () => { drawChart(); drawMap(); drawHero(heroDone ? 'full' : undefined); });
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { drawChart(); drawMap(); });
  new MutationObserver(() => { drawChart(); drawMap(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawChart(); drawMap(); });

  const hot = window.claude && window.claude.hot;
  const start = (data) => { if (data && data.v === 3) state = Object.assign(baseState(), data); tr = I.make(state.lang); refresh(true); };
  requestAnimationFrame(drawHero);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (heroDone) drawHero('full'); });
  if (hot && hot.snapshot) hot.snapshot(() => state);
  if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || null);
  window.__rtgap = { fromCase, toCase, loadState, get state() { return state; } };
})();
