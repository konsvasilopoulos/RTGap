/* rtgap web application: state, inputs, results. */
(function () {
  'use strict';
  const RT = window.RT, I = window.I18N;
  RT.setSites(window.RTGAP_SITES);
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { if (v === '' || v == null) return null; const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };

  // ------------------------------------------------------------------ department protocol (same schema as the Python package)
  const CONTACT = 'kostasvasilopoulosgr@yahoo.com';   // e-mail shown in the footer and in "About"; empty = not shown
  const PKEY = 'rtgap.protocol', SITE_RULE_KEYS = ['ideal_extension_days', 'max_extension_days', 'max_overall_time_days'];
  function normProto(p, ignored) {
    ignored = ignored || [];
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('not a protocol');
    const out = { name: String(p.name || '').slice(0, 120), constraints: {}, sites: {}, guidance: p.guidance === 'rcr5_draft' ? 'rcr5_draft' : 'rcr2019' };
    if (p.guidance && !['rcr2019', 'rcr5_draft'].includes(p.guidance)) ignored.push('guidance');
    for (const k of Object.keys(p.constraints || {})) {
      if (k === 'chemo_dates') { ignored.push('constraints.chemo_dates'); continue; }
      if (!(k in RT.CONSTRAINT_DEFAULTS)) { ignored.push('constraints.' + k); continue; }
      const v = p.constraints[k], d0 = RT.CONSTRAINT_DEFAULTS[k];
      if (typeof d0 === 'boolean' ? typeof v !== 'boolean' : !(v === null || isFinite(+v))) { ignored.push('constraints.' + k); continue; }
      out.constraints[k] = typeof d0 === 'boolean' || v === null ? v : +v;
    }
    for (const id of Object.keys(p.sites || {})) {
      if (!RT.SITES[id]) { ignored.push('sites.' + id); continue; }
      const x = p.sites[id] || {}, o = {};
      if (x.tumour && typeof x.tumour === 'object') o.tumour = x.tumour;
      if (Array.isArray(x.oars) && x.oars.length) o.oars = x.oars.filter((q) => q && q.name && isFinite(+q.alpha_beta));
      for (const k of SITE_RULE_KEYS) if (x[k] != null && isFinite(+x[k])) o[k] = +x[k];
      for (const k of Object.keys(x)) if (!['tumour', 'oars', 'notes', 'name', 'category', 'sources'].concat(SITE_RULE_KEYS).includes(k)) ignored.push('sites.' + id + '.' + k);
      if (Object.keys(o).length) out.sites[id] = o;
    }
    return out;
  }
  let proto = null;
  try { const r = localStorage.getItem(PKEY); if (r) proto = normProto(JSON.parse(r)); } catch (e) { proto = null; }
  const saveProto = () => { try { if (proto) localStorage.setItem(PKEY, JSON.stringify(proto)); else localStorage.removeItem(PKEY); } catch (e) { /* ignore */ } };
  const protoSite = (id) => (proto && proto.sites[id]) || null;

  // ------------------------------------------------------------------ state
  function siteDefaults(id) {
    const s = RT.SITES[id] || RT.SITES.generic, ov = protoSite(id), t = Object.assign({}, s.tumour || {}, ov && ov.tumour ? ov.tumour : {});
    if (ov && ov.tumour) { if ('dprolif_eqd2_per_day' in ov.tumour) delete t.k_bed_per_day; if ('k_bed_per_day' in ov.tumour) delete t.dprolif_eqd2_per_day; }
    return {
      tumour: { ab: t.alpha_beta == null ? 10 : +t.alpha_beta, mode: t.dprolif_eqd2_per_day != null ? 'dp' : 'k',
        rate: t.k_bed_per_day != null ? +t.k_bed_per_day : (t.dprolif_eqd2_per_day != null ? +t.dprolif_eqd2_per_day : 0), tk: t.kickoff_days == null ? null : +t.kickoff_days },
      oars: ((ov && ov.oars) || s.oars || [{ name: 'Late (α/β 3)', alpha_beta: 3 }]).map((o) => ({ name: o.name, ab: +o.alpha_beta, ratio: o.dose_ratio == null ? 1 : (Array.isArray(o.dose_ratio) ? o.dose_ratio.join('/') : o.dose_ratio),
        limit: o.max_eqd2 == null ? null : o.max_eqd2, repair: 'repair_half_time_h' in o ? o.repair_half_time_h : 4.4, bt: o.brachy_ratio == null ? 1 : o.brachy_ratio })),
    };
  }
  const C0 = () => Object.assign({}, RT.CONSTRAINT_DEFAULTS, proto ? proto.constraints : {}, { chemo_dates: [] });
  /** The protocol entry for a site, built from the current inputs (same tumour keys as the library). */
  function siteEntryFromState(s) {
    const lib = (RT.SITES[s.site] || {}).tumour || {}, t = s.tumour, ab = t.ab;
    const tum = { alpha_beta: ab, kickoff_days: t.tk };
    let rate = t.rate || 0, mode = t.mode;
    const want = lib.k_bed_per_day != null ? 'k' : (lib.dprolif_eqd2_per_day != null ? 'dp' : mode);
    if (want !== mode && rate) rate = want === 'k' ? RT.kFromDprolif(rate, ab) : RT.dprolifFromK(rate, ab);
    tum[want === 'k' ? 'k_bed_per_day' : 'dprolif_eqd2_per_day'] = +(+rate).toFixed(6);
    return { tumour: tum, oars: s.oars.map((o) => { const r = { name: o.name || 'OAR', alpha_beta: o.ab, dose_ratio: parseRatio(o.ratio), repair_half_time_h: o.repair || null }; if (o.limit != null) r.max_eqd2 = o.limit; return r; }) };
  }
  function constraintsDiff(c, base) {
    const out = [];
    for (const k of Object.keys(RT.CONSTRAINT_DEFAULTS)) { if (k === 'chemo_dates') continue; const a = c[k] == null ? null : c[k], b = base[k] == null ? null : base[k]; if (a !== b) out.push(k); }
    return out;
  }
  function baseState(over) {
    const s = Object.assign({ v: 3, lang: 'el', pdfLang: null, title: '', caseRef: '', calcBy: '', checkedBy: '', site: 'hn_scc', category: 'auto',
      start: '2026-10-05', multi: false, n: 35, d: 2, phases: [{ name: 'SIB', n: 35, levels: [{ name: 'PTV70', d: 2 }, { name: 'PTV63', d: 1.8 }, { name: 'PTV56', d: 1.6 }] }], primary: '',
      weekdays: [0, 1, 2, 3, 4], holidays: true, closed: [], missed: [], unavailable: [], resume: '', cause: '', brachy: { on: false, fx: [] }, guidance: proto ? proto.guidance : 'rcr2019', model: 'lq', lqlF: 2, extra: [], errors: [], pc: { on: false, from: '', n: null, d: null }, given: { on: false, n: null, d: null, sat: false, sun: false, bid: 0, dates: null, bidDates: null }, scen: false, scenDays: 10, mark: 'missed', c: C0(), sel: null }, over || {});
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
    hn_hist: () => baseState({ site: 'hn_scc', n: 35, d: 2, start: '2026-10-05', missed: ['2026-10-14', '2026-10-15', '2026-11-04', '2026-11-05'], extra: ['2026-10-17'],
      errors: [{ date: '2026-10-30', dose: 2.6 }], cause: 'machine', ui: { hist: true }, c: Object.assign(C0(), { allow_sunday: false }) }),
    palliative: () => baseState({ site: 'palliative', n: 10, d: 3, start: '2026-10-05', missed: ['2026-10-07', '2026-10-08', '2026-10-09'] }),
  };
  const EX_NAMES = { el: { hn_sib: 'Κεφαλή-τράχηλος SIB 70/63/56, βλάβη με άγνωστη επισκευή', hn_hist: 'Κεφαλή-τράχηλος 70/35: δύο διακοπές και ένα λάθος δόσης', hn_70: 'Κεφαλή-τράχηλος 70/35, τμήμα μόνο καθημερινές', rectum: 'Ορθό 5 × 5 Gy, χάθηκε η Τετάρτη (βιβλίο, Παράδ. 5)', cervix: 'Τράχηλος μήτρας 45/25 + βραχυθεραπεία 4 × 7 Gy', nsclc: 'NSCLC 55/20, χωρίς Σαββατοκύριακα', prostate: 'Προστάτης 60/20', breast: 'Μαστός 40/15', palliative: 'Παρηγορική 30/10' },
    en: { hn_sib: 'Head & neck SIB 70/63/56, outage with unknown repair date', hn_hist: 'Head & neck 70/35: two interruptions and a dose error', hn_70: 'Head & neck 70/35, weekdays-only department', rectum: 'Rectum 5 × 5 Gy, Wednesday missed (textbook Ex. 5)', cervix: 'Cervix 45/25 + brachytherapy 4 × 7 Gy', nsclc: 'NSCLC 55/20, no weekends', prostate: 'Prostate 60/20', breast: 'Breast 40/15', palliative: 'Palliative 30/10' } };

  const parseRatio = (v) => { if (typeof v === 'number') return v; const parts = String(v == null ? '' : v).split('/').map((x) => num(x)).filter((x) => x != null); return parts.length > 1 ? parts : (parts.length ? parts[0] : 1); };
  const fixOar = (o) => { if (o.repair === undefined) o.repair = 4.4; if (o.bt == null) o.bt = 1; return o; };
  let state = EXAMPLES.hn_sib();
  try { const raw = localStorage.getItem('rtgap.state'); if (raw) { const s = JSON.parse(raw); if (s && s.v === 3) { state = Object.assign(baseState(), s); state.oars.forEach(fixOar); if (!state.given) state.given = baseState().given; if (!state.brachy) state.brachy = { on: false, fx: [] }; if (!state.ui) state.ui = {}; if (!state.extra) state.extra = []; if (!state.errors) state.errors = []; if (!state.pc) state.pc = { on: false, from: '', n: null, d: null }; if (!state.guidance) state.guidance = proto ? proto.guidance : 'rcr2019'; if (!state.model) { state.model = 'lq'; state.lqlF = 2; } } } } catch (e) { /* storage unavailable */ }
  let fromLink = false;
  try { const mh = /[#&]c=([\w\-]+)/.exec(location.hash || ''); if (mh) { const lang0 = state.lang; state = fromCase(JSON.parse(b64dEarly(mh[1]))); state.lang = lang0; fromLink = true; history.replaceState(null, '', location.pathname + location.search); } } catch (e) { /* bad link: ignore */ }
  let tr = I.make(state.lang), model = null;
  function b64dEarly(str) { return decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))); }
  // ---- undo / redo: snapshots of the inputs, taken whenever they are saved
  const hist = [], fut = []; let lastSnap = null, lastPush = 0;
  const undoBtn = () => { const u = document.getElementById('undo'), r = document.getElementById('redo'); if (u) u.disabled = !hist.length; if (r) r.disabled = !fut.length; };
  const persist = () => {
    const cur = JSON.stringify(state);
    if (cur !== lastSnap) {
      const now = Date.now();
      if (lastSnap != null && now - lastPush > 700) { hist.push(lastSnap); if (hist.length > 60) hist.shift(); lastPush = now; }
      if (lastSnap != null) fut.length = 0;
      lastSnap = cur; undoBtn();
    }
    try { localStorage.setItem('rtgap.state', cur); } catch (e) { /* ignore */ }
  };
  function timeTravel(from, to) {
    if (!from.length) return;
    to.push(lastSnap); const snap = from.pop(), lang = state.lang;
    state = JSON.parse(snap); state.lang = lang; lastSnap = JSON.stringify(state); lastPush = 0;
    tr = I.make(state.lang); refresh(true); undoBtn();
  }
  let HOSTED = false; try { HOSTED = /^https?:$/.test(location.protocol) && window.top === window; } catch (e) { HOSTED = false; }
  let installEvt = null;

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
    if (s.extra && s.extra.length) out.gap.extra_delivered = s.extra.slice().sort();
    const errs = (s.errors || []).filter((e) => e.date && e.dose != null).map((e) => ({ date: e.date, dose: e.dose }));
    if (errs.length) out.gap.dose_errors = errs.sort((a, b) => (a.date < b.date ? -1 : 1));
    if (s.pc && s.pc.on && s.pc.from && s.pc.n > 0 && s.pc.d > 0) out.gap.plan_change = { from: s.pc.from, n_fractions: s.pc.n, dose_per_fraction: s.pc.d };
    if (s.category !== 'auto') out.rules = { category: s.category === 'none' ? null : +s.category };
    else { const ov = protoSite(s.site); if (ov) { const r = {}; for (const k of SITE_RULE_KEYS) if (ov[k] != null) r[k] = ov[k]; if (Object.keys(r).length) out.rules = r; } }
    if (proto) out.audit = { protocol: proto.name || '–' };
    if (s.guidance === 'rcr5_draft') out.guidance = 'rcr5_draft';
    if (s.model === 'lql') { out.model = 'lql'; out.lql_dt_factor = s.lqlF > 0 ? s.lqlF : 2; }
    if (s.scen && s.missed.length) out.scenarios = { days: s.scenDays || 10 };
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
    s.extra = (g.extra_delivered || []).map((d) => String(d).slice(0, 10));
    s.errors = (g.dose_errors || []).map((e) => ({ date: String(e.date).slice(0, 10), dose: e.dose }));
    if (g.plan_change) s.pc = { on: true, from: String(g.plan_change.from).slice(0, 10), n: g.plan_change.n_fractions, d: g.plan_change.dose_per_fraction };
    if (g.outage_start && s.resume) { const os = RT.parseDate(g.outage_start), r = RT.parseDate(s.resume); for (let d = os; d < r; d++) if (RT.weekday(d) < 5 && !s.missed.includes(RT.iso(d))) s.missed.push(RT.iso(d)); }
    const c = cfg.constraints || cfg.options || {};
    s.c = Object.assign({}, RT.CONSTRAINT_DEFAULTS, { chemo_dates: [] });     // a case file is self-contained
    s.guidance = cfg.guidance === 'rcr5_draft' ? 'rcr5_draft' : 'rcr2019';
    s.model = cfg.model === 'lql' ? 'lql' : 'lq'; s.lqlF = cfg.lql_dt_factor || 2;
    for (const k of Object.keys(c)) if (k in RT.CONSTRAINT_DEFAULTS) s.c[k] = k === 'chemo_dates' ? c[k].map((d) => String(d).slice(0, 10)) : c[k];
    const cat = cfg.rules && 'category' in cfg.rules ? cfg.rules.category : ('category' in cfg ? cfg.category : undefined);
    if (cat !== undefined) s.category = cat == null ? 'none' : String(cat);
    const co = (cfg.custom_options || [])[0];
    if (co && co.dates && co.dates.length && co.dose) s.given = { on: true, n: co.dates.length + (co.bid_dates || []).length, d: co.dose, sat: false, sun: false, bid: 0, dates: co.dates.map((d) => String(d).slice(0, 10)), bidDates: (co.bid_dates || []).map((d) => String(d).slice(0, 10)) };
    if (cfg.scenarios) { s.scen = true; s.scenDays = cfg.scenarios.days || 10; }
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
        const os = RT.currentOutageStart(m.p);
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
    const nDel = new Map(); for (const f of p.delivered) nDel.set(f.day, (nDel.get(f.day) || 0) + 1);
    const errMap = new Map(p.doseErrors.map((e) => [e.day, e])), xtra = new Set(p.extraDates);
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
        else if (delivered.has(d)) {
          cls.push('delivered');
          if (nDel.get(d) > 1) txt += '<small>×2</small>';
          if (xtra.has(d)) { cls.push('xtra'); title += ' · ' + tr.t('lg_extra'); }
        }
        if (errMap.has(d)) { const e = errMap.get(d); cls.push('errd'); title += ' · ' + tr.t('lg_err') + ': ' + tr.f2(e.actual) + ' Gy (' + tr.t('planned_c').toLowerCase() + ' ' + tr.f2(e.intended) + ')'; }
        else if (!opt && planned.has(d)) cls.push('planned');
        if (nw.has(d)) { const n = nw.get(d).length; cls.push(n > 1 ? 'bid' : 'new'); if (n > 1) txt += '<small>×2</small>'; }
        if (d === p.plannedEnd) cls.push('endmark');
        if (d < p.rx.start) cls.push('out');
        const words = cls.filter((k) => ({ delivered: 1, missed: 1, planned: 1, closed: 1, unavail: 1, chemo: 1 })[k] && !(k === 'planned' && cls.includes('missed'))).map((k) => tr.t('lg_' + (k === 'closed' ? 'holiday' : k))).join(', ');
        const lab = title + (words ? ' · ' + words : '');
        h += interactive ? `<button type="button" class="${cls.join(' ')}" data-day="${RT.iso(d)}" title="${esc(title)}" aria-label="${esc(lab)}" aria-pressed="${cls.includes('missed')}">${txt}</button>` : `<div class="${cls.join(' ')}" title="${esc(title)}">${txt}</div>`;
      }
    }
    return h + '</div>';
  }
  const legend = (keys) => '<div class="legend">' + keys.map((k) => {
    const st = { delivered: 'background:#33415f', missed: 'border:2px solid var(--bad)', planned: 'background:var(--accent-soft)', new: 'background:var(--accent)', bid: 'background:#0d3a99',
      holiday: 'background:repeating-linear-gradient(45deg,var(--panel),var(--panel) 3px,var(--line) 3px,var(--line) 5px)', bt: 'background:var(--bt)', unavail: 'border:2px dashed var(--warn)', chemo: 'background:var(--warn);border-radius:50%', end: 'box-shadow:0 0 0 2px var(--ink)', extra: 'background:#5a3fa0', err: 'box-shadow:inset 0 0 0 2px var(--warn)' }[k];
    return `<span><i style="${st}"></i>${esc(tr.t('lg_' + k))}</span>`; }).join('') + '</div>';

  // ------------------------------------------------------------------ inputs
  const fold = (k) => (state.ui && state.ui[k]) ? 'open' : '';
  const gl = (k) => `<button type="button" class="help" data-gl="${k}" aria-label="?">?</button>`;
  function bioSum() {
    const s = state, L = tr.t, t = s.tumour;
    const rate = t.rate ? (t.mode === 'dp' ? 'D_prolif ' : 'K ') + t.rate + (t.tk != null && t.tk !== '' ? ' · T_k ' + t.tk : '') : L('sum_notime');
    return (s.model === 'lql' ? 'LQ-L · ' : '') + L('tumour') + ' α/β ' + t.ab + ' · ' + rate + ' · ' + s.oars.length + ' ' + L('sum_oars');
  }
  function deptSum() {
    const c = state.c, L = tr.t, y = (b) => (b ? '✓' : '✗');
    let s = (proto ? (proto.name || L('proto_unnamed')) + (constraintsDiff(c, C0()).length || state.guidance !== proto.guidance ? ' *' : '') + ' · ' : '') + (state.guidance === 'rcr5_draft' ? L('guid_short5') : 'RCR 2019') + ' · ' + tr.wd2[5] + ' ' + y(c.allow_saturday) + ' · ' + tr.wd2[6] + ' ' + y(c.allow_sunday) + ' · BID ' + y(c.allow_bid) + ' · ' + L('sum_dose') + ' ' + y(c.allow_dose_change);
    s += ' · ' + (c.max_tumour_deficit_pct != null && c.max_late_increase_pct != null ? L('sum_tol') + ' ' + c.max_tumour_deficit_pct + '%\u00a0/\u00a0' + c.max_late_increase_pct + '%' : L('sum_notol'));
    return s;
  }
  function protoStatus() {
    const L = tr.t, diff = proto ? constraintsDiff(state.c, C0()).concat(state.guidance !== proto.guidance ? ['guidance'] : []) : [];
    const status = !proto ? L('proto_none_hint') : (diff.length ? L('proto_differs') + ' (' + diff.length + ')' : L('proto_matches'));
    return esc(status) + (proto && diff.length ? ` <button type="button" class="linkbtn" data-act="proto-apply">${esc(L('proto_apply'))}</button>` : '');
  }
  function protoBox() {
    const L = tr.t;
    return `<div class="proto"><div class="proto-head"><b>${esc(L('proto_title'))}</b>${gl('proto')}<span class="pill ${proto ? 'c3' : 'plain'}">${esc(proto ? (proto.name || L('proto_unnamed')) : L('proto_none'))}</span></div>
      <p class="small" style="margin:4px 0 8px" id="proto-status">${protoStatus()}</p>
      <div class="fields"><label class="f"><span>${esc(L('proto_name'))}</span><input id="proto-name" type="text" value="${esc(proto ? proto.name : '')}" placeholder="${esc(L('proto_name_ph'))}"></label></div>
      <div class="rowbtn" style="margin-top:8px"><button type="button" class="btn sm pri" data-act="proto-save">${esc(L(proto ? 'proto_update' : 'proto_save'))}</button>${proto ? `<button type="button" class="btn sm" data-act="proto-export">${esc(L('proto_export'))}</button>` : ''}<label class="btn sm" style="position:relative;overflow:hidden">${esc(L('proto_import'))}<input type="file" id="proto-imp" accept=".json,application/json" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>${proto ? `<button type="button" class="btn sm" data-act="proto-rm">${esc(L('proto_rm'))}</button>` : ''}</div></div>`;
  }
  function givenSum() {
    const g = state.given; if (!g || !g.on) return tr.t('sum_none');
    if (g.dates) return (g.dates.length + (g.bidDates || []).length) + ' × ' + g.d + ' Gy';
    return (g.n || '?') + ' × ' + (g.d || '?') + ' Gy';
  }
  function renderInputs() {
    const s = state, L = tr.t, site = RT.SITES[s.site] || {}, el = $('#inputs');
    const groups = { 1: [], 2: [], 3: [], x: [] };
    for (const id of Object.keys(RT.SITES)) (groups[RT.SITES[id].category] || groups.x).push(id);
    const og = (label, ids) => `<optgroup label="${esc(label)}">${ids.map((id) => `<option value="${id}" ${id === s.site ? 'selected' : ''}>${esc(tr.siteName(id, RT.SITES[id]))}</option>`).join('')}</optgroup>`;
    const p = model && model.p, rules = p ? p.rules : null;
    const catPill = rules ? (rules.category ? `<span class="pill c${rules.category}">${esc(L('cat'))} ${rules.category}</span>` : `<span class="pill plain">${esc(L('cat'))}: ${esc(L('cat_none'))}</span>`) : '';
    const allow = rules && rules.max != null ? `<span class="pill plain">${esc(L('allowance'))}: ${esc(L('ideal'))} ≤ ${rules.ideal} · ${esc(L('max'))} ≤ ${rules.max} ${esc(L('days'))}</span>` : '';
    const ott = rules && rules.maxOTT ? `<span class="pill plain">${esc(L('ott_cap'))} ≤ ${rules.maxOTT} ${esc(L('days'))}</span>` : '';
    const noacc = (rules && rules.noAccel ? `<span class="pill c2">${esc(L('no_accel'))}</span>` : '') + (rules && rules.guidance === 'rcr5_draft' ? `<span class="pill c2">${esc(L('guid_short5'))}</span>` : '') + (rules && rules.noDoseComp ? `<span class="pill c2">${esc(L('no_dose_comp'))}</span>` : '') + (rules && rules.targetOTT ? `<span class="pill plain">${esc(L('ott_target'))} ≤ ${rules.targetOTT} ${esc(L('days'))}</span>` : '');
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
    <nav class="steps" aria-label="${esc(L('nav_label'))}">${L('nav').map((x, i) => `<button type="button" data-act="nav" data-i="${i + 1}"><b>${i + 1}</b>${esc(x)}</button>`).join('')}</nav>
    <div class="card" id="sec-1"><h2><span class="step">1</span>${esc(L('s_site'))}</h2><p class="hint">${esc(L('s_site_hint'))}</p>
      <label class="f"><span>${esc(L('s_site'))}</span><select data-bind="site" id="i-site" data-struct="1">${og('RCR ' + L('cat') + ' 1', groups[1])}${og('RCR ' + L('cat') + ' 2', groups[2])}${og('RCR ' + L('cat') + ' 3', groups[3])}${og('—', groups.x)}</select></label>
      <div class="meta" id="site-meta">${catPill}${allow}${ott}${noacc}${srcRefs}</div>
      ${notes.length ? `<ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <label class="f" style="margin-top:10px"><span>${esc(L('cat'))}</span><select data-bind="category" id="i-category" data-struct="1">${[['auto', L('cat_auto')], ['1', L('cat1')], ['2', L('cat2')], ['3', L('cat3')], ['none', L('cat_none')]].map(([v, t2]) => `<option value="${v}" ${s.category === v ? 'selected' : ''}>${esc(t2)}</option>`).join('')}</select></label>
    </div>
    <div class="card" id="sec-2"><h2><span class="step">2</span>${esc(L('s_rx'))}</h2>
      <div class="fields" style="margin-bottom:10px">${fld(L('start'), 'start', s.start, 'type="date"')}</div>
      ${chk(L('levels_mode'), 'multi', s.multi)}
      <div style="margin-top:8px">${rxHtml}</div>
      <div class="f" style="margin-top:10px"><span>${esc(L('treat_days'))}</span><div class="wdays">${tr.wd2.map((w, i) => `<button type="button" data-act="wd" data-i="${i}" aria-pressed="${s.weekdays.includes(i)}">${w}</button>`).join('')}</div></div>
      <div style="margin-top:8px">${chk(L('gr_holidays'), 'holidays', s.holidays)}</div>
      <div style="margin-top:4px">${chk(L('brachy'), 'brachy.on', s.brachy.on)}</div>
      ${s.brachy.on ? `<p class="hint" style="margin-top:6px">${esc(L('brachy_hint'))}</p>${s.brachy.fx.map((f, i) => `<div class="lvl">${fld(L('bt_date'), `brachy.fx.${i}.date`, f.date, 'type="date"')}${fld(L('bt_dose'), `brachy.fx.${i}.dose`, f.dose)}<button type="button" class="btn x" data-act="rm-bt" data-i="${i}" aria-label="${esc(L('remove'))}">✕</button></div>`).join('')}<div class="rowbtn" style="margin-top:6px"><button type="button" class="btn sm" data-act="add-bt">+ ${esc(L('add_bt'))}</button></div>` : ''}
    </div>
    <div class="card" id="sec-3"><h2><span class="step">3</span>${esc(L('s_gap'))}</h2><p class="hint">${esc(L('gap_hint'))}</p>
      <div class="seg" role="group">${['missed', 'unavail', 'chemo', 'closed', 'extra', 'err'].map((m) => `<button type="button" data-act="mark" data-m="${m}" aria-pressed="${s.mark === m}">${esc(L('m_' + m))}</button>`).join('')}</div>
      <div id="gapcal"></div>
      <div class="fields">${fld(L('resume'), 'resume', s.resume, 'type="date"')}
        <label class="f"><span>${esc(L('cause'))}</span><select data-bind="cause" id="i-cause">${['', 'machine', 'holiday', 'toxicity', 'patient', 'other'].map((v) => `<option value="${v}" ${s.cause === v ? 'selected' : ''}>${esc(L('cause_' + v))}</option>`).join('')}</select></label></div>
      <p class="small" style="margin:4px 0 8px">${esc(L('resume_auto'))}</p>
      <details class="sub" data-fold="hist" ${fold('hist') || ((s.errors.length || s.extra.length || s.pc.on) ? 'open' : '')}><summary>${esc(L('hist_title'))}${gl('hist')}</summary>
        <p class="hint" style="margin-top:6px">${esc(L('hist_hint'))}</p>
        <h3 class="mini">${esc(L('err_title'))}</h3>
        ${s.errors.map((e, i) => `<div class="lvl">${fld(L('err_date'), `errors.${i}.date`, e.date, 'type="date"')}${fld(L('err_dose'), `errors.${i}.dose`, e.dose)}<button type="button" class="btn x" data-act="rm-err" data-i="${i}" aria-label="${esc(L('remove'))}">✕</button></div>`).join('') || `<p class="small" style="margin:0 0 6px">${esc(L('err_none'))}</p>`}
        <div class="rowbtn" style="margin-top:4px"><button type="button" class="btn sm" data-act="add-err">+ ${esc(L('err_add'))}</button></div>
        <h3 class="mini">${esc(L('pc_title'))}</h3>
        ${chk(L('pc_on'), 'pc.on', s.pc.on)}
        ${s.pc.on ? `<div class="fields" style="margin-top:8px">${fld(L('pc_from'), 'pc.from', s.pc.from, 'type="date"')}${fld(L('pc_n'), 'pc.n', s.pc.n, 'type="number" min="1" step="1" inputmode="numeric"')}${fld(L('pc_d'), 'pc.d', s.pc.d)}</div><p class="small" style="margin:6px 0 0">${esc(L('pc_hint'))}</p>` : ''}
      </details>
      ${chk(L('scen'), 'scen', s.scen)}
    </div>
    <details class="card fold" id="sec-4" data-fold="bio" ${fold('bio')}><summary><h2><span class="step">4</span>${esc(L('s_bio'))}</h2><span class="fold-sum" id="bio-sum">${esc(bioSum())}</span></summary>
      <div class="fields">${fld(L('tumour') + ' ' + L('ab'), 'tumour.ab', s.tumour.ab)}
        <label class="f"><span>${esc(L('rate'))}</span><select data-bind="tumour.mode" id="i-tumour-mode"><option value="k" ${s.tumour.mode === 'k' ? 'selected' : ''}>${esc(L('rate_k'))}</option><option value="dp" ${s.tumour.mode === 'dp' ? 'selected' : ''}>${esc(L('rate_dp'))}</option></select></label>
        ${fld(L('rate'), 'tumour.rate', s.tumour.rate)}${fld(L('tk'), 'tumour.tk', s.tumour.tk)}</div>
      <p class="small gl-row"><span>${esc(L('gl_what'))}</span><span>${gl('ab')} α/β</span><span>${gl('k')} K / D<sub>prolif</sub></span><span>${gl('tk')} T<sub>k</sub></span><span>${gl('repair')} T½</span><span>${gl('eqd2')} EQD2</span></p>
      <div class="fields" style="margin-top:10px"><label class="f"><span>${esc(L('model_label'))}${gl('lql')}</span><select data-bind="model" id="i-model" data-struct="1"><option value="lq" ${s.model !== 'lql' ? 'selected' : ''}>${esc(L('model_lq'))}</option><option value="lql" ${s.model === 'lql' ? 'selected' : ''}>${esc(L('model_lql'))}</option></select></label>${s.model === 'lql' ? fld(L('model_f'), 'lqlF', s.lqlF) : ''}</div>
      ${s.model === 'lql' ? `<p class="small" style="margin:6px 0 0">${esc(L('model_note'))} ${refs(['ASTRAHAN'])}</p>` : ''}
      <p class="small" style="margin:6px 0 12px" id="bio-note"></p>
      ${site.time_factor_option ? `<div class="rowbtn" style="margin:-4px 0 12px"><button type="button" class="btn sm" data-act="tf">${esc(L('tf_apply'))}: ${site.time_factor_option.dprolif_eqd2_per_day} Gy/${state.lang === 'el' ? 'ημέρα' : 'day'}</button>${refs([site.time_factor_option.source])}</div><p class="small" style="margin:-6px 0 12px">${esc(L('tf_note'))}</p>` : ''}
      <h3 style="font:600 0.95rem var(--f-body);margin-bottom:4px">${esc(L('oars'))}</h3><p class="hint">${esc(L('oar_hint'))}</p>
      ${s.oars.map((o, i) => `<div class="phase"><div class="lvl" style="grid-template-columns:minmax(0,1fr) auto">${fld(L('name'), `oars.${i}.name`, o.name, 'type="text"')}<button type="button" class="btn x" data-act="rm-oar" data-i="${i}" aria-label="${esc(L('remove'))}" ${s.oars.length < 2 ? 'disabled' : ''}>✕</button></div>
        <div class="fields" style="grid-template-columns:repeat(auto-fit,minmax(96px,1fr))">${fld(L('ab'), `oars.${i}.ab`, o.ab)}${fld(L('ratio'), `oars.${i}.ratio`, o.ratio, 'type="text" inputmode="decimal"')}${s.brachy.on ? fld(L('bt_ratio'), `oars.${i}.bt`, o.bt) : ''}${fld(L('repair'), `oars.${i}.repair`, o.repair, `type="number" step="any" inputmode="decimal" placeholder="∞"`)}${fld(L('limit'), `oars.${i}.limit`, o.limit)}</div></div>`).join('')}
      <p class="small" style="margin:0 0 4px">${esc(L('ratio_hint'))} ${refs(['BENTZEN99', 'THAMES'])}</p>
      <div class="rowbtn"><button type="button" class="btn sm" data-act="add-oar">+ ${esc(L('add_oar'))}</button><button type="button" class="btn sm" data-act="site-defaults">${esc(L(protoSite(s.site) ? 'site_defaults_dept' : 'site_defaults'))}</button><button type="button" class="btn sm" data-act="proto-site">${esc(L('proto_site_save'))}</button>${protoSite(s.site) ? `<button type="button" class="btn sm" data-act="proto-site-rm">${esc(L('proto_site_rm'))}</button>` : ''}</div>
      ${protoSite(s.site) ? `<p class="small" style="margin:6px 0 0">${esc(L('proto_site_note'))}</p>` : ''}
    </details>
    <details class="card fold" id="sec-5" data-fold="dept" ${fold('dept')}><summary><h2><span class="step">5</span>${esc(L('s_dept'))}</h2><span class="fold-sum" id="dept-sum">${esc(deptSum())}</span></summary>${protoBox()}
      <label class="f"><span>${esc(L('guid_label'))}${gl('guidance')}</span><select data-bind="guidance" id="i-guidance" data-struct="1">${['rcr2019', 'rcr5_draft'].map((g) => `<option value="${g}" ${s.guidance === g ? 'selected' : ''}>${esc(L('guid_' + g))}</option>`).join('')}</select></label>
      ${s.guidance === 'rcr5_draft' ? `<p class="small warnnote" style="margin:6px 0 10px">${esc(L('guid_draft_note'))} ${refs(['RCR5d'])}</p>` : `<p class="small" style="margin:6px 0 10px">${esc(L('guid_19_note'))} ${refs(['RCR19'])}</p>`}<p class="hint">${esc(L('dept_hint'))}</p>
      <div class="sw">${chk(L('c_sat'), 'c.allow_saturday', c.allow_saturday)}${chk(L('c_sun'), 'c.allow_sunday', c.allow_sunday)}${chk(L('c_bid'), 'c.allow_bid', c.allow_bid, refs(['RCR19']))}${chk(L('c_consec'), 'c.allow_consecutive_bid', c.allow_consecutive_bid)}${chk(L('c_dose'), 'c.allow_dose_change', c.allow_dose_change)}${chk(L('c_extra'), 'c.allow_extra_fractions', c.allow_extra_fractions)}${chk(L('c_chemo_daily'), 'c.chemo_daily', c.chemo_daily, refs(['RCR5d']))}</div>
      <div class="fields">${fld(L('c_bid_h'), 'c.bid_interval_h', c.bid_interval_h)}${fld(L('c_bid_max'), 'c.bid_max_dose', c.bid_max_dose)}${fld(L('c_maxd'), 'c.max_dose_per_fraction', c.max_dose_per_fraction, `type="number" step="any" inputmode="decimal" placeholder="${esc(L('none_opt'))}"`)}${fld(L('c_week'), 'c.max_fractions_per_week', c.max_fractions_per_week, `type="number" step="1" inputmode="numeric" placeholder="${esc(L('none_opt'))}"`)}${fld(L('c_round'), 'c.dose_rounding', c.dose_rounding)}${fld(L('c_weekly'), 'c.max_weekly_increase_pct', c.max_weekly_increase_pct, `type="number" step="any" inputmode="decimal" placeholder="${esc(L('none_opt'))}"`)}</div>
      <div class="fields" style="margin-top:12px">${fld(L('c_tolT'), 'c.max_tumour_deficit_pct', c.max_tumour_deficit_pct, `type="number" step="any" inputmode="decimal" placeholder="${esc(L('not_set'))}"`)}${fld(L('c_tolL'), 'c.max_late_increase_pct', c.max_late_increase_pct, `type="number" step="any" inputmode="decimal" placeholder="${esc(L('not_set'))}"`)}</div>
      <p class="small" style="margin:6px 0 0">${esc(L('tol_hint'))}</p>
    </details>
    <details class="card fold" id="sec-6" data-fold="given" ${fold('given')}><summary><h2><span class="step">6</span>${esc(L('given'))}</h2><span class="fold-sum">${esc(givenSum())}</span></summary><p class="hint">${esc(L('given_hint'))}</p>
      ${chk(L('given'), 'given.on', s.given.on)}
      ${s.given.on ? (s.given.dates ? `<p class="small">${s.given.dates.length + (s.given.bidDates || []).length} × ${s.given.d} Gy · ${esc(s.given.dates.map((d) => tr.dshort(RT.parseDate(d))).join(', '))}</p><div class="rowbtn"><button type="button" class="btn sm" data-act="given-reset">${esc(L('remove'))}</button></div>`
        : `<div class="fields" style="margin-top:8px">${fld(L('given_n'), 'given.n', s.given.n, 'type="number" min="1" step="1" inputmode="numeric"')}${fld(L('given_d'), 'given.d', s.given.d)}${fld(L('given_bid'), 'given.bid', s.given.bid, 'type="number" min="0" step="1" inputmode="numeric"')}</div><div class="sw" style="margin-top:8px">${chk(L('given_sat'), 'given.sat', s.given.sat)}${chk(L('given_sun'), 'given.sun', s.given.sun)}</div>`) : ''}
    </details>`;
    renderGapCal(); renderBioNote();
  }
  function renderGapCal() {
    const box = $('#gapcal'); if (!box) return;
    if (!model || !model.p) { box.innerHTML = ''; return; }
    const p = model.p, L = tr.t;
    const keys = ['delivered', 'missed', 'planned', 'holiday', 'unavail', 'chemo', 'end'].concat(p.fixed.length ? ['bt'] : [], p.extraDates.length ? ['extra'] : [], p.doseErrors.length ? ['err'] : []);
    let info = '';
    if (p.interruptions.length) {
      info = `<p class="small intr"><b>${esc(L('intr_n'))}: ${p.interruptions.length}</b> · ` + p.interruptions.map((x, i) => (p.interruptions.length > 1 ? (i + 1) + ') ' : '') + tr.dshort(x[0]) + (x[1] !== x[0] ? '–' + tr.dshort(x[1]) : '') + ' (' + x[2] + ' ' + L('fx') + ')').join(' · ');
      if (model.base) info += ` · ${esc(L('intr_total'))} <b>${tr.sgi(model.base.ext)} ${esc(L('days'))}</b>`;
      info += '</p>';
    }
    box.innerHTML = calendarHtml(p, null, true) + legend(keys) + info;
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
      else if (x.lql && x.m === 1) lines.push(x.n + ' × ' + x.d.toFixed(2) + ' Gy (LQ-L, d > dT = ' + (+w.dt.toFixed(2)) + '): ' + x.n + '·[' + (+w.dt.toFixed(2)) + '·(1 + ' + (+w.dt.toFixed(2)) + '/' + t.ab + ') + (1 + 2·' + (+w.dt.toFixed(2)) + '/' + t.ab + ')·(' + x.d.toFixed(2) + ' − ' + (+w.dt.toFixed(2)) + ')] = ' + x.bed.toFixed(2));
      else if (x.lql) lines.push(x.n + ' × (' + x.m + ' × ' + x.d.toFixed(2) + ' Gy, LQ-L)  → ' + x.bed.toFixed(2));
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
    const B = { chart: '', opts: '', map: '', det: '', sens: '', scen: '', rep: '' };
    let h = kpiHtml(m) + `<div class="card decision ${dec.status}" id="decision"><div class="status">${esc(L('st_' + dec.status))}</div><div class="headline">${esc(tr.head(dec.head))}</div>
      ${rec && rec.family !== 'baseline' ? `<p class="subline">${esc(tr.optShort(rec))}</p><p class="small" style="margin:0 0 8px">${esc(L('dec_note'))}</p>` : ''}
      ${m.sens && rec && rec.family !== 'baseline' ? `<p class="small" style="margin:0 0 8px"><span class="pill ${m.sens.sameFraction >= 0.9 ? 'c3' : 'c2'}">${esc(L(m.sens.sameFraction >= 0.9 ? 'robust_yes' : 'robust_no'))}</span> ${esc(L('unc'))} (${m.sens.n}): Δ ${esc(p.tumour.name === p.rx.primary || !p.rx.multilevel ? L('col_t').toLowerCase() : p.tumour.name)} ${tr.sg(m.sens.tumourPctRange[0])} … ${tr.sg(m.sens.tumourPctRange[1])} %${p.oars.length ? `, Δ ${esc(p.oars[0].name)} ${tr.sg(m.sens.oarPctRanges[p.oars[0].name][0])} … ${tr.sg(m.sens.oarPctRanges[p.oars[0].name][1])} %` : ''}; ${esc(L('unc_same'))} ${Math.round(100 * m.sens.sameFraction)} %.</p>` : ''}
      ${m.rec0 != null ? `<p class="small" style="margin:0 0 8px">${esc(L('rec_line'))} ${refs(['PUTORA'])}: <b>${Math.round(100 * m.rec0)} %</b> ${esc(L('rec_fixed'))}${m.rec5 != null && m.rec5 > m.rec0 + 0.005 ? `, <b>${Math.round(100 * m.rec5)} %</b> ${esc(L('rec_5'))}` : ''}.${m.base && lcText(m.base) ? ` ${esc(L('ch_uncomp'))}: ${esc(L('lc').toLowerCase())} ${esc(lcText(m.base))}.` : ''}</p>` : ''}
      ${dec.candidates.length ? `<p class="small">${esc(L('weigh'))}: ${dec.candidates.map((o) => `<a href="#detail" data-opt="${o.key}">${esc(tr.optTitle(o))}</a>`).join(' · ')}</p>` : ''}
      <details data-fold="why" ${fold('why')}><summary class="small">${esc(L('why'))} (${dec.trace.length})</summary><ol class="trace">${dec.trace.map((s) => `<li>${esc(tr.trace(s))}${refs(s.refs)}</li>`).join('')}</ol></details></div>`;
    if (p.inputWarnings.length) h += `<div class="card"><h2>${esc(L('input_checks'))}</h2><ul class="warn" style="margin-top:0">${p.inputWarnings.map((w) => `<li>${esc(tr.issue(w))}</li>`).join('')}</ul></div>`;
    if (p.remaining && m.base) {
      B.chart += `<div class="card"><h2>${esc(L('chart_title'))} ${refs(['BCR', 'FOWLER'])}</h2><p class="hint">${esc(L('chart_sub'))}</p><div class="chartbox"><canvas id="chart" role="img" aria-label="${esc(L('chart_title'))}"></canvas></div>
        <div class="legend"><span><i style="background:var(--muted);height:3px;border:0;vertical-align:3px"></i>${esc(L('ch_planned'))}</span><span><i style="background:var(--bad);height:3px;border:0;vertical-align:3px"></i>${esc(L('ch_uncomp'))}</span>${m.sel && m.sel !== m.base ? `<span><i style="background:var(--accent);height:3px;border:0;vertical-align:3px"></i>${esc(L('ch_sel'))}</span>` : ''}<span><i style="background:var(--bad-soft)"></i>${esc(L('s_gap').toLowerCase())}</span></div></div>`;
      B.opts += `<div class="card"><h2>${esc(L('options'))}${gl('eqd2')}</h2><p class="hint">${esc(L('options_hint'))} ${esc(L('col_delta'))}. ${esc(L('acute_hint'))}${gl('peak7')}</p><div class="scroll"><table>${optHead()}<tbody>${dec.feasible.map((o, i) => optionRow(o, i, false)).join('')}</tbody></table></div>
        ${dec.rejected.length ? `<details style="margin-top:12px"><summary class="small">${esc(L('excluded'))} (${dec.rejected.length})</summary><div class="scroll"><table>${optHead()}<tbody>${dec.rejected.map((o, i) => optionRow(o, i, true)).join('')}</tbody></table></div></details>` : ''}</div>`;
      B.opts += compareHtml(m);
      if (p.oars.length) B.map += `<div class="card"><h2>${esc(L('map_title'))} ${refs(['PUTORA'])}</h2><p class="hint">${esc(L('map_sub'))}</p><div class="chartbox" style="height:280px"><canvas id="map" role="img" aria-label="${esc(L('map_title'))}"></canvas></div>
        <div class="legend"><span><i style="background:var(--accent);border-radius:50%"></i>${esc(L('map_feas'))}</span><span><i style="border:1.5px solid var(--muted);border-radius:50%;background:transparent"></i>${esc(L('map_excl'))}</span>${m.given ? `<span><i style="background:var(--warn);transform:rotate(45deg)"></i>${esc(L('map_given'))}</span>` : ''}<span><i style="background:var(--ink);border-radius:50%"></i>${esc(L('ch_planned'))}</span></div></div>`;
      if (m.sel) B.det += detailHtml(m.sel);
      if (m.sens) {
        const s = m.sens, g = s.grid;
        B.sens += `<div class="card"><h2>${esc(L('robust'))}</h2><p class="hint">${s.n} ${esc(L('rob_grid'))}: ${esc(L('g_ab'))} ${g.tumour_alpha_beta.join(', ')}; ${esc(L('g_rep'))} ${g.repopulation.join(', ')}; ${esc(L('g_tk'))} ${g.kickoff_shift_days.join(', ')}; ${esc(L('g_late'))} ${g.late_alpha_beta.join(', ')}.</p>
          <p style="margin:0 0 8px">${esc(L('rob_line'))} <b>${esc(tr.optTitle(s.option))}</b></p>
          <div class="scroll"><table><thead><tr><th>${esc(L('tissues'))}</th><th>Δ EQD2 (Gy)</th><th>Δ %</th></tr></thead><tbody>
          <tr><td>${esc(p.tumour.name)}</td><td class="n">${tr.sg(s.tumourRange[0])} … ${tr.sg(s.tumourRange[1])}</td><td class="n">${tr.sg(s.tumourPctRange[0])} … ${tr.sg(s.tumourPctRange[1])}</td></tr>
          ${Object.keys(s.oarRanges).map((k) => `<tr><td>${esc(k)}</td><td class="n">${tr.sg(s.oarRanges[k][0])} … ${tr.sg(s.oarRanges[k][1])}</td><td class="n">${tr.sg(s.oarPctRanges[k][0])} … ${tr.sg(s.oarPctRanges[k][1])}</td></tr>`).join('')}</tbody></table></div>
          <p style="margin:12px 0 6px">${esc(L('rob_same'))} <b>${Math.round(100 * s.sameFraction)} %</b>.</p>
          <div class="scroll"><table><thead><tr><th>${esc(L('rob_dec'))}</th><th>${esc(L('rob_cases'))}</th><th>${esc(L('rob_drange'))}</th></tr></thead><tbody>${s.decisions.map((d) => `<tr><td>${esc(d.o ? tr.optTitle(d.o) : L('st_clinical_decision'))}</td><td class="n">${d.count} / ${s.n}</td><td class="n">${d.o ? tr.f2(d.dRange[0]) + '–' + tr.f2(d.dRange[1]) : '–'}</td></tr>`).join('')}</tbody></table></div></div>`;
      }
      if (m.scen && m.scen.length) {
        B.scen += `<div class="card"><h2>${esc(L('scen_title'))}</h2><p class="hint">${esc(L('scen_hint'))}</p><div class="scroll"><table><thead><tr><th>${esc(L('scen_resume'))}</th><th>${esc(L('scen_uncomp'))}</th><th>Δ ${esc(L('col_t'))}</th><th style="text-align:left">${esc(L('scen_dec'))}</th></tr></thead><tbody>
          ${m.scen.map((r) => `<tr><td class="n" style="text-align:left">${esc(tr.dshort(r.resume))}</td><td class="n">${r.nMissed} ${esc(L('fx'))} · ${tr.sgi(r.baseExt)} ${esc(L('days'))}</td>${dcell(r.baseDelta, true)}<td style="text-align:left"><span class="pill ${r.status === 'clinical_decision' ? 'c2' : r.status === 'no_action' ? 'c3' : ''}">${esc(L('st_' + r.status))}</span>${r.option && r.option.family !== 'baseline' ? `<div class="small">${esc(tr.optTitle(r.option))} · ${r.option.nNew} × ${tr.f2(r.option.d)} Gy</div>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
      }
    }
    const repLang = state.pdfLang || state.lang;
    B.rep += `<div class="card" id="report"><h2>${esc(L('record'))}</h2>
      <div class="fields">${fld(L('case_ref'), 'caseRef', state.caseRef, 'type="text" autocomplete="off"')}${fld(L('calc_by'), 'calcBy', state.calcBy, 'type="text"')}${fld(L('checked_by'), 'checkedBy', state.checkedBy, 'type="text"')}
        <label class="f"><span>${esc(L('pdf_lang'))}</span><select data-bind="pdfLang" id="i-pdfLang"><option value="el" ${repLang === 'el' ? 'selected' : ''}>Ελληνικά</option><option value="en" ${repLang === 'en' ? 'selected' : ''}>English</option></select></label></div>
      <div class="rowbtn"><button type="button" class="btn pri" data-act="pdf">${esc(L('pdf'))}</button><button type="button" class="btn" data-act="print">${esc(L('print'))}</button>${model.sel && model.p.remaining ? `<button type="button" class="btn" data-act="sheet">${esc(L('sheet_btn'))}</button>` : ''}<button type="button" class="btn" data-act="json">${esc(L('json'))}</button><button type="button" class="btn" data-act="copysum">${esc(L('copy_sum'))}</button><button type="button" class="btn" data-act="copy">${esc(L('copy_json'))}</button>
        <label class="btn" style="position:relative;overflow:hidden">${esc(L('import'))}<input type="file" id="imp" accept=".json,application/json" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div>
      <p class="small" style="margin:10px 0 0">${esc(L('checksum'))}: <span class="num" style="word-break:break-all">${m.checksum}</span> · RTGap ${RT.VERSION}</p></div>`;
    B.rep += shareHtml() + savedHtml();
    const wantPre = ((state.ui && state.ui.tab) === 'an') || !(B.det + B.chart + B.opts);
    const panes = { plan: B.det + B.chart, opts: B.opts + B.map, an: B.sens + B.scen + (wantPre ? preflightHtml() : ' '), rep: B.rep };
    const avail = ['plan', 'opts', 'an', 'rep'].filter((k) => panes[k]);
    let tab = (state.ui && state.ui.tab) || 'plan'; if (!avail.includes(tab)) tab = avail[0];
    if (printing) { out.innerHTML = `<pre class="printsum">${esc(summaryText())}</pre>` + h + avail.map((k) => `<h2 class="printh">${esc(L('tab_' + k))}</h2>` + (k === 'an' ? B.sens + B.scen + preflightHtml() : panes[k])).join(''); out.querySelectorAll('details[data-fold="why"]').forEach((d) => { d.open = true; }); drawChart(); drawMap(); return; }
    if (avail.length > 1) h += `<div class="tabs" role="tablist" id="tabs">${avail.map((k) => `<button type="button" role="tab" data-act="tab" data-tab="${k}" aria-selected="${k === tab}">${esc(L('tab_' + k))}${k === 'opts' ? ` <span class="cnt">${dec.feasible.length}</span>` : ''}</button>`).join('')}</div>`;
    h += `<div class="pane" role="tabpanel">${panes[tab]}</div>`;
    out.innerHTML = h;
    drawChart(); drawMap(); updateDock();
  }
  // ---- before the start: closed days inside the course, and what another start day would change
  function preflight() {
    const L0 = toCase(state), rows = [];
    const mk = (start, ideal) => {
      const c = JSON.parse(JSON.stringify(L0)); c.prescription.start = start; c.gap = {}; delete c.custom_options; delete c.scenarios;
      if (ideal) { c.prescription.holidays = false; delete c.prescription.closed_dates; }
      return RT.plannerFromCase(c, {});
    };
    let d = RT.parseDate(state.start), guard = 0;
    const p00 = mk(state.start, false);
    while (rows.length < 8 && guard++ < 40) {
      if (RT.isRegular(p00, d) || d === RT.parseDate(state.start)) {
        try {
          const p = mk(RT.iso(d), false), q = mk(RT.iso(d), true), closed = [];
          for (let x = p.rx.start; x <= p.plannedEnd; x++) if (p.rx.closed.has(x) && q.rx.weekdays.includes(RT.weekday(x)) && !p.fixed.some((f) => f.day === x)) closed.push(x);
          rows.push({ start: d, end: p.plannedEnd, T: p.plannedEnd - p.rx.start, ext: (p.plannedEnd - p.rx.start) - (q.plannedEnd - q.rx.start), closed, names: p.rx.holidayNames || new Map(), dT: p.plannedTumour - q.plannedTumour, rules: p.rules, hasTime: RT.hasTime(p.tumour) });
        } catch (e) { /* skip a start day that cannot be planned */ }
      }
      d++;
    }
    if (!rows.length) return null;
    const best = rows.reduce((a, r) => (r.ext < a.ext ? r : a), rows[0]), cur = rows[0];
    let comp = null;
    if (cur.closed.length) {
      try {
        const c = JSON.parse(JSON.stringify(L0)); c.gap = { missed_dates: cur.closed.map(RT.iso), unavailable_dates: cur.closed.map(RT.iso), cause: 'holiday' };
        c.prescription.holidays = false; delete c.prescription.closed_dates; delete c.custom_options; delete c.scenarios;
        const p = RT.plannerFromCase(c, {}); comp = { p, dec: RT.decide(p) };
      } catch (e) { comp = null; }
    }
    return { rows, best, cur, comp };
  }
  function preflightHtml() {
    const L = tr.t; let r;
    try { r = preflight(); } catch (e) { r = null; }
    if (!r) return '';
    const { rows, best, cur, comp } = r, mx = cur.rules.max != null ? cur.rules.max : 0;
    const nm = (x, row) => tr.dshort(x) + (row.names.get(x) ? ' ' + tr.hol(row.names.get(x)) : '');
    let h = `<div class="card" id="preflight"><h2>${esc(L('pre_title'))} ${refs(['RCR19'])}</h2><p class="hint">${esc(L('pre_hint'))}</p>`;
    h += cur.closed.length ? `<div class="warnbox"><b>${cur.closed.length} ${esc(L(cur.closed.length === 1 ? 'pre_closed1' : 'pre_closed'))}</b>: ${esc(cur.closed.map((x) => nm(x, cur)).join(' · '))}. ${esc(L(cur.closed.length === 1 ? 'pre_cost1' : 'pre_cost'))} <b>${tr.sgi(cur.ext)} ${esc(L('days'))}</b>${cur.hasTime ? `, ${esc(L('col_t'))} <b>${tr.sg(cur.dT)} Gy</b> EQD2` : ''}.${cur.rules.category === 1 && cur.ext > mx ? ' ' + esc(L('pre_cat1')) : ''}</div>` : `<p><b>${esc(L('pre_clear'))}</b></p>`;
    if (comp) h += `<p style="margin:8px 0"><span class="small">${esc(L('pre_comp'))}</span><br><b>${esc(tr.head(comp.dec.head))}</b>${comp.dec.recommended && comp.dec.recommended.family !== 'baseline' ? `<br><span class="small num">${esc(tr.optShort(comp.dec.recommended))}</span>` : ''}</p>`;
    h += `<div class="scroll"><table><thead><tr><th style="text-align:left">${esc(L('pre_start'))}</th><th>${esc(L('ends'))}</th><th>T</th><th>${esc(L('pre_ncl'))}</th><th>${esc(L('kpi_ext'))}</th><th>Δ ${esc(L('col_t'))}</th><th></th></tr></thead><tbody>` +
      rows.map((x, i) => `<tr class="${x === best && best.ext < cur.ext ? 'best' : ''}"><td style="text-align:left">${esc(tr.date(x.start))}${i === 0 ? ` <span class="pill plain">${esc(L('pre_now'))}</span>` : ''}${x === best && best.ext < cur.ext ? ` <span class="pill c3">${esc(L('pre_best'))}</span>` : ''}</td><td class="n">${esc(tr.dshort(x.end))}</td><td class="n">${x.T}</td><td class="n" title="${esc(x.closed.map((y) => nm(y, x)).join(', '))}">${x.closed.length}</td><td class="n ${x.ext > mx ? 'neg' : ''}">${tr.sgi(x.ext)}</td>${x.hasTime ? dcell(x.dT) : '<td class="n">–</td>'}<td>${i ? `<button type="button" class="btn sm" data-act="pre-start" data-d="${RT.iso(x.start)}">${esc(L('pre_use'))}</button>` : ''}</td></tr>`).join('') + `</tbody></table></div><p class="small" style="margin:8px 0 0">${esc(L('pre_note'))}</p></div>`;
    return h;
  }
  // ---- two schedules side by side
  function compareHtml(m) {
    const L = tr.t, p = m.p, dec = m.dec, all = dec.feasible.concat(dec.rejected); if (all.length < 2) return '';
    const ui = state.ui || {}, base = all.find((o) => o.family === 'baseline');
    let A = all.find((o) => o.key === ui.cmpA) || m.sel || dec.feasible[0] || all[0];
    let B = all.find((o) => o.key === ui.cmpB) || (base && base !== A ? base : all.find((o) => o !== A));
    if (B === A) B = all.find((o) => o !== A);
    const excl = (o) => dec.rejected.includes(o);
    const sel = (id, cur) => `<select id="${id}" aria-label="${id === 'cmp-a' ? 'A' : 'B'}">${all.map((o) => `<option value="${esc(o.key)}" ${o === cur ? 'selected' : ''}>${excl(o) ? '✗ ' : ''}${esc(tr.optTitle(o))}</option>`).join('')}</select>`;
    // rows: [label, value A, value B, text A, text B, which direction is better (+1 higher, -1 lower, 0 none), threshold]
    const rows = [[L('remaining'), null, null, o => o.nNew + ' × ' + tr.f2(o.d) + ' Gy', 0],
      [L('ends'), null, null, o => tr.dshort(o.end), 0],
      [L('kpi_ext') + ' (' + L('days') + ')', o => o.ext, null, o => tr.sgi(o.ext), -1, 0.5],
      [L('cmp_wkend'), o => o.nSat + o.nSun, null, o => String(o.nSat + o.nSun), -1, 0.5],
      [L('cmp_bid'), o => o.nBid, null, o => String(o.nBid), -1, 0.5],
      [(p.rx.multilevel ? p.tumour.name : L('col_t')) + ' · Δ EQD2 (Gy)', o => o.tumour.delta, null, o => tr.sg(o.tumour.delta), 1, 0.05]]
      .concat(A.levels.map((r, i) => [r.name + ' · Δ EQD2 (Gy)', o => o.levels[i].delta, null, o => tr.sg(o.levels[i].delta), 1, 0.05]),
        A.oars.map((r, i) => [r.name + ' · Δ %', o => o.oars[i].deltaPct, null, o => tr.sg(o.oars[i].deltaPct), -1, 0.05]),
        [[L('acute_row') + ' · Δ %', o => o.weeklyInc, null, o => tr.sg(o.weeklyInc), -1, 0.5], [L('cmp_warn'), o => o.warnings.length + o.rejected.length, null, o => String(o.warnings.length + o.rejected.length), -1, 0.5]]);
    const proA = [], proB = [];
    const body = rows.map(([lab, val, , txt, dir, eps]) => {
      let ca = '', cb = '';
      if (val && dir) { const a = val(A), b = val(B); if (Math.abs(a - b) > eps) { const aBetter = dir > 0 ? a > b : a < b; if (aBetter) { ca = 'better'; proA.push(lab.split(' · ')[0]); } else { cb = 'better'; proB.push(lab.split(' · ')[0]); } } }
      return `<tr><td style="text-align:left">${esc(lab)}</td><td class="n ${ca}">${esc(txt(A))}</td><td class="n ${cb}">${esc(txt(B))}</td></tr>`;
    }).join('');
    const col = (o, tag, pros) => `<div class="cmpcol"><div class="cmphead"><span class="cmptag ${tag === 'A' ? 'a' : 'b'}">${tag}</span><b>${esc(tr.optTitle(o))}</b></div>
      <p class="small" style="margin:2px 0 6px">${esc(tr.optShort(o))}${excl(o) ? ` · <span class="neg">${esc(L('cmp_excl'))}: ${esc(o.rejected.map((w) => tr.reason(w)).join('; '))}</span>` : ''}</p>
      ${calendarHtml(p, o, false)}
      <p class="small" style="margin:6px 0"><b>${esc(L('cmp_pro'))}:</b> ${pros.length ? esc(pros.join(', ')) : '–'}</p>
      ${excl(o) ? '' : `<button type="button" class="btn sm ${m.sel === o ? '' : 'pri'}" data-opt="${esc(o.key)}">${esc(m.sel === o ? L('cmp_selected') : L('cmp_use'))}</button>`}</div>`;
    return `<div class="card" id="compare"><h2>${esc(L('cmp_title'))}</h2><p class="hint">${esc(L('cmp_hint'))}</p>
      <div class="cmppick"><label><span class="cmptag a">A</span>${sel('cmp-a', A)}</label><button type="button" class="btn sm" data-act="cmp-swap" aria-label="swap">⇄</button><label><span class="cmptag b">B</span>${sel('cmp-b', B)}</label></div>
      <div class="scroll"><table class="cmptable"><thead><tr><th></th><th><span class="cmptag a">A</span></th><th><span class="cmptag b">B</span></th></tr></thead><tbody>${body}</tbody></table></div>
      <p class="small" style="margin:6px 0 12px"><span class="better" style="padding:1px 6px;border-radius:4px">${esc(L('cmp_legend'))}</span></p>
      <div class="cmpgrid">${col(A, 'A', proA)}${col(B, 'B', proB)}</div></div>`;
  }
  function kpiHtml(m) {
    const p = m.p, L = tr.t, b = m.base, o = m.sel;
    if (!b || !p.remaining) return '';
    const nMiss = p.interruptions.reduce((a, x) => a + x[2], 0), same = !o || o === b;
    const cls = (bad) => (bad ? 'bad' : 'ok');
    const pair = (x0, x1, fmt, unit) => same ? `<b>${fmt(x0)}</b> ${unit}` : `<s>${fmt(x0)}</s> <span class="arr">→</span> <b>${fmt(x1)}</b> ${unit}`;
    const late = o && o.oars.length ? o.oars.reduce((a, r) => (r.deltaPct > a.deltaPct ? r : a), o.oars[0]) : null;
    const mx = p.rules.max != null ? p.rules.max : 0, cur = same ? b : o;
    const tiles = [
      [L('kpi_missed'), `<b>${nMiss}</b> ${esc(L('fx'))}`, p.remaining + ' ' + L('kpi_left') + (p.doseErrors.length ? ' · ' + p.doseErrors.length + ' ' + L('lg_err') : ''), nMiss || p.doseErrors.length ? 'warn' : 'ok'],
      [L('kpi_ext'), pair(b.ext, cur.ext, tr.sgi, esc(L('days'))), L('allowance') + ' ≤ ' + mx + ' ' + L('days'), cur.ext > mx ? 'bad' : (cur.ext > (p.rules.ideal || 0) ? 'warn' : 'ok')],
      [L('kpi_tum'), pair(b.tumour.delta, cur.tumour.delta, (x) => tr.sg(x), 'Gy'), tr.sg(cur.tumour.deltaPct) + ' % EQD2' + (RT.hasTime(p.tumour) ? '' : ' · ' + L('sum_notime')), cls(cur.tumour.deltaPct < -1)],
    ];
    if (late) tiles.push([L('kpi_late'), `<b>${tr.sg(late.deltaPct)}</b> %`, late.name + ' · ' + tr.sg(late.delta) + ' Gy', late.deltaPct > 5 ? 'bad' : (late.deltaPct > 1 ? 'warn' : 'ok')]);
    return `<div class="kpis">${tiles.map(([k, v, sub, c]) => `<div class="kpi ${c}"><span class="k">${esc(k)}</span><span class="v">${v}</span><span class="s">${esc(sub)}</span></div>`).join('')}</div>`;
  }
  // ---- share link and cases saved on this device
  const CKEY = 'rtgap.cases';
  const loadCases = () => { try { const a = JSON.parse(localStorage.getItem(CKEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const storeCases = (a) => { try { localStorage.setItem(CKEY, JSON.stringify(a.slice(0, 400))); return true; } catch (e) { return false; } };
  const b64e = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = (str) => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));
  function shareUrl() {
    const c = toCase(state); delete c.title; delete c.audit;       // no free text that could identify a patient
    let base = 'https://konsvasilopoulos.github.io/RTGap/';
    try { if (/github\.io$|^localhost$|^127\./.test(location.hostname) || location.protocol === 'file:') base = location.href.split('#')[0]; } catch (e) { /* keep canonical */ }
    return base + '#c=' + b64e(JSON.stringify(c));
  }
  function shareHtml() {
    const L = tr.t;
    return `<div class="card"><h2>${esc(L('share_title'))}</h2><p class="hint">${esc(L('share_hint'))}</p><div class="rowbtn" style="margin-top:0"><button type="button" class="btn" data-act="share">${esc(L('share_btn'))}</button></div></div>`;
  }
  function savedHtml() {
    const L = tr.t, list = loadCases();
    return `<div class="card"><h2>${esc(L('saved_title'))}</h2><p class="hint">${esc(L('saved_hint'))}</p>
      <div class="rowbtn" style="margin:0 0 10px"><button type="button" class="btn sm" data-act="backup">${esc(L('bk_save'))}</button><label class="btn sm" style="position:relative;overflow:hidden">${esc(L('bk_load'))}<input type="file" id="bk-imp" accept=".json,application/json" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div>
      <div class="savebar"><input type="text" id="save-name" placeholder="${esc(L('saved_name'))}" value="${esc(state.caseRef || '')}" autocomplete="off"><button type="button" class="btn pri" data-act="case-save">${esc(L('saved_save'))}</button></div>
      ${list.length ? `<ul class="saved">${list.map((c, i) => `<li><button type="button" class="linkbtn" data-act="case-load" data-i="${i}">${esc(c.name)}</button><span class="small">${esc(c.when)} · ${esc(c.sum || '')}</span><button type="button" class="btn x" data-act="case-del" data-i="${i}" aria-label="${esc(L('remove'))}">✕</button></li>`).join('')}</ul>` : `<p class="small" style="margin:10px 0 0">${esc(L('saved_none'))}</p>`}</div>`;
  }
  function summaryText() {
    const m = model, p = m.p, L = tr.t, o = m.sel, lines = [];
    lines.push('RTGap ' + RT.VERSION + ' — ' + L('rep_title') + (state.caseRef ? ' — ' + state.caseRef : ''));
    lines.push(L('s_site') + ': ' + tr.siteName(p.siteId, p.site) + (p.rules.category ? ' (RCR ' + p.rules.category + ')' : ''));
    lines.push(L('missed_n') + ': ' + (p.missed.length ? p.missed.map(tr.dshort).join(', ') : '–') + (p.rules.gapCause ? ' · ' + L('cause_' + p.rules.gapCause) : ''));
    if (p.doseErrors.length) lines.push(L('err_title') + ': ' + p.doseErrors.map((e) => tr.dshort(e.day) + ' ' + tr.f2(e.actual) + ' Gy (' + L('planned_c').toLowerCase() + ' ' + tr.f2(e.intended) + ')').join(', '));
    if (p.planChange) lines.push(L('pc_title') + ': ' + tr.dshort(p.planChange.from) + ', ' + p.planChange.n + ' × ' + p.planChange.d + ' Gy');
    lines.push(L('guid_label') + ': ' + L('guid_' + (p.rules.guidance || 'rcr2019')));
    lines.push(L('st_' + m.dec.status) + ': ' + tr.head(m.dec.head));
    if (o && p.remaining) {
      lines.push(L('remaining') + ': ' + tr.optShort(o));
      lines.push('Δ EQD2: ' + [o.tumour].concat(o.levels, o.oars).map((r) => r.name + ' ' + tr.sg(r.delta) + ' Gy').join(', ') + ' · ' + L('acute_row') + ' ' + tr.sg(o.weeklyInc) + ' %');
      for (const w of o.warnings) lines.push('• ' + tr.reason(w));
    }
    lines.push(L('checksum') + ' ' + m.checksum.slice(0, 16) + '…');
    return lines.join('\n');
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
    g.fillStyle = col('--bad-soft');
    for (const [a0, b0] of p.interruptions) {
      const nxt = p.delivered.find((f) => f.day > b0), e0 = nxt ? nxt.day : p.resume, xa = X(Math.max(x0, a0 - 0.5)), xb = X(Math.max(x0, e0 - 0.5));
      if (xb > xa) g.fillRect(xa, mt, xb - xa, H - mt - mb);
    }
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
    const wide = W > 1000, x0 = wide ? Math.max(W * 0.55, 700) : W * 0.06, x1 = wide ? x0 + Math.min(W * 0.14, 190) : W - 14, y0 = wide ? 66 : 20, y1 = H - 24, Dmax = 14, decades = 5;
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
    $('#foot-contact').innerHTML = CONTACT ? esc(L('contact')) + ': <a href="mailto:' + esc(CONTACT) + '">' + esc(CONTACT) + '</a>' : '';
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
      <div class="card" id="triage"></div>
      <div class="card" id="audit"></div>`;
    docsParts = { guide: `<p class="hint">${esc(L('guide_hint'))}</p>` + L('guide').map((gq, i) => `<details class="sub" ${i === 0 ? 'open' : ''}><summary>${i + 1}. ${esc(gq.t)}</summary><ol class="gsteps">${gq.s.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>${gq.ex ? `<div class="rowbtn" style="margin:4px 0 6px"><button type="button" class="btn sm pri" data-act="guide-open" data-ex="${gq.ex}">${esc(L('guide_open'))}</button></div>` : ''}</details>`).join(''), method: `<p style="max-width:92ch;margin:0 0 8px">${esc(L('method_text'))} ${refs(['BCR', 'FOWLER', 'RCR19', 'THAMES'])}</p><p class="small" style="max-width:92ch;margin:0 0 10px">${esc(L('xval'))}</p><p class="small">${esc(L('doc_more'))} <a href="https://github.com/konsvasilopoulos/RTGap/blob/main/docs/REFERENCE.md" target="_blank" rel="noopener">docs/REFERENCE.md</a> · <a href="https://github.com/konsvasilopoulos/RTGap/blob/main/docs/INTENDED_USE.md" target="_blank" rel="noopener">docs/INTENDED_USE.md</a></p>`,
      refs: `<p class="hint">${esc(L('refs_hint'))}</p><ol class="reflist">${I.REFS.map((r) => `<li id="ref-${r.id}">${esc(r.text)}${r.url ? ` <a href="${r.url}" target="_blank" rel="noopener">link</a>` : ''}<span class="use">${esc(r.use[state.lang])}</span></li>`).join('')}</ol>`,
      test: `<p>${esc(L('selftest'))}: <b>${SELF.filter((x) => x.ok).length}/${SELF.length}</b> ${esc(L('st_pass'))}</p><div class="scroll"><table><thead><tr><th>Test</th><th>${esc(L('st_exp'))}</th><th>${esc(L('st_got'))}</th><th></th></tr></thead><tbody>${SELF.map((x) => `<tr><td>${esc(x.id)} ${refs([x.src])}</td><td class="n">${x.expected}</td><td class="n">${isFinite(x.got) ? x.got.toFixed(3) : '–'}</td><td class="n ${x.ok ? 'pos' : 'neg'}">${x.ok ? '✓' : '✕'}</td></tr>`).join('')}</tbody></table></div>` };
    $('#docsbtn').textContent = L('docs_btn'); renderDocs(); renderTriage(); renderAudit();
    $('#disc').textContent = L('disclaimer');
    $('#skip').textContent = L('skip'); $('#about').setAttribute('aria-label', L('about_btn')); $('#docs').setAttribute('aria-label', L('docs_btn'));
    $('#aboutbtn').textContent = L('about_btn'); $('#undo').title = L('undo'); $('#undo').setAttribute('aria-label', L('undo')); $('#redo').title = L('redo'); $('#redo').setAttribute('aria-label', L('redo')); undoBtn();
    $('#foot-site').innerHTML = HOSTED ? '<a href="welcome.html">' + esc(L('welcome_link')) + '</a>' : ''; setTheme(theme());
    $('#about').innerHTML = `<div class="modal-in" role="document"><button type="button" class="btn sm close" data-act="about-close" aria-label="close">✕</button>
      <div class="about-head"><h2>RT<i>Gap</i> <span>v${RT.VERSION}</span></h2><p>${esc(L('about_lead'))}</p></div>
      <div class="feats">${L('feats').map(([a, b]) => `<div><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join('')}</div>
      <div id="install-slot"></div>
      <h3>${esc(L('about_valid_t'))}</h3><p>${esc(L('about_valid').replace('{a}', SELF.filter((x) => x.ok).length + '/' + SELF.length))}</p>
      <h3>${esc(L('about_use_t'))}</h3><p>${esc(L('disclaimer'))}</p>
      <h3>${esc(L('about_cite_t'))}</h3><p class="cite">Vasilopoulos K. RTGap: compensation of unscheduled radiotherapy interruptions. Version ${RT.VERSION}, 2026. https://github.com/konsvasilopoulos/RTGap</p>
      <p class="small">${esc(L('dev'))}: Konstantinos Vasilopoulos, PhD Candidate · ${esc(L('lic'))} <a href="https://github.com/konsvasilopoulos/RTGap" target="_blank" rel="noopener">${esc(L('src'))}</a></p></div>`;
    fillInstall();
    let seen = false; try { seen = localStorage.getItem('rtgap.intro') === '1'; } catch (e) { /* ignore */ }
    $('#intro').hidden = seen;
    $('#intro').innerHTML = `<div class="intro-in"><div class="intro-steps">${L('intro').map((x, i) => `<div><b>${i + 1}</b><span>${esc(x)}</span></div>`).join('')}</div>
      <div class="rowbtn" style="margin:0"><button type="button" class="btn pri sm" data-act="intro-try">${esc(L('intro_try'))}</button><button type="button" class="btn sm" data-act="about">${esc(L('about_btn'))}</button><button type="button" class="btn sm" data-act="intro-hide">${esc(L('intro_hide'))}</button></div></div>`;
    renderTools();
  }
  function fillInstall() {
    const el = $('#install-slot'); if (!el) return; const L = tr.t;
    let standalone = false; try { standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone; } catch (e) { /* ignore */ }
    el.innerHTML = !HOSTED || standalone ? '' : `<h3>${esc(L('inst_t'))}</h3><p>${esc(L('inst_text'))}</p>${installEvt ? `<div class="rowbtn" style="margin:4px 0 8px"><button type="button" class="btn pri sm" data-act="install">${esc(L('inst_btn'))}</button></div>` : `<p class="small">${esc(L('inst_how'))}</p>`}`;
  }
  let docsParts = {}, docTab = 'guide';
  function renderDocs() {
    const L = tr.t;
    $('#docs').innerHTML = `<div class="modal-in" role="document"><button type="button" class="btn sm close" data-act="docs-close" aria-label="close">✕</button>
      <div class="about-head"><h2>${esc(L('docs_btn'))}</h2></div>
      <div class="tabs flat" role="tablist">${['guide', 'method', 'refs', 'test'].map((k) => `<button type="button" role="tab" data-act="docs" data-tab="${k}" aria-selected="${k === docTab}">${esc(L('doc_' + k))}</button>`).join('')}</div>
      <div class="docbody">${docsParts[docTab] || ''}</div></div>`;
  }
  // ---- machine outage: every saved case at once, in order of priority (RCR: category 1 first)
  const tri = { from: '', to: '' };
  function triageRows() {
    if (!tri.from || !tri.to || tri.to < tri.from) return null;
    const a = RT.parseDate(tri.from), b = RT.parseDate(tri.to), rows = [];
    loadCases().forEach((c, idx) => {
      const row = { name: c.name, idx };
      try {
        const s2 = Object.assign(baseState(), JSON.parse(JSON.stringify(c.state))); s2.oars.forEach(fixOar);
        s2.given = baseState().given; s2.scen = false; s2.resume = '';
        const p0 = RT.plannerFromCase(toCase(s2), {}), b0 = p0.remaining ? RT.options(p0).find((o) => o.family === 'baseline') : null;
        const lastDay = b0 ? b0.end : p0.plannedEnd, add = [];
        for (let d = Math.max(a, p0.rx.start); d <= Math.min(b, lastDay); d++) if (RT.isRegular(p0, d) && !p0.missed.includes(d)) add.push(RT.iso(d));
        row.site = tr.siteName(p0.siteId, p0.site); row.cat = p0.rules.category;
        if (!add.length) { row.none = true; rows.push(row); return; }
        s2.missed = s2.missed.concat(add); s2.cause = 'machine'; row.state = s2;
        const p = RT.plannerFromCase(toCase(s2), {}), dec = RT.decide(p), base = dec.feasible.concat(dec.rejected).find((o) => o.family === 'baseline');
        Object.assign(row, { n: add.length, ext: base.ext, dT: base.tumour.deltaPct, status: dec.status, rec: dec.recommended, head: dec.head, max: p.rules.max != null ? p.rules.max : 0 });
      } catch (e) { row.err = true; }
      rows.push(row);
    });
    const key = (r) => [r.err || r.none ? 1 : 0, r.cat == null ? 4 : r.cat, r.dT == null ? 0 : r.dT, -(r.ext || 0)];
    rows.sort((x, y) => { const kx = key(x), ky = key(y); for (let i = 0; i < kx.length; i++) if (kx[i] !== ky[i]) return kx[i] < ky[i] ? -1 : 1; return 0; });
    return rows;
  }
  // ---- many patients at once: CSV import into the cases saved on this device
  const CSV_HEAD = 'name,site,start,n_fractions,dose_per_fraction,missed_dates';
  const importBar = () => `<div class="rowbtn" style="margin:0 0 10px"><label class="btn sm" style="position:relative;overflow:hidden">${esc(tr.t('csv_import'))}<input type="file" id="csv-imp" accept=".csv,text/csv,text/plain" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label><button type="button" class="btn sm" data-act="csv-template">${esc(tr.t('csv_template'))}</button></div>`;
  function csvDate(x) {
    x = String(x || '').trim(); let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(x);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/.exec(x);
    return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : null;
  }
  function importCsv(txt) {
    const lines = txt.replace(/^\ufeff/, '').split(/\r?\n/).filter((l) => l.trim()); if (lines.length < 2) throw new Error('empty');
    const sep = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
    const cut = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
    const head = cut(lines[0]).map((x) => x.toLowerCase()), col = (k) => head.indexOf(k);
    for (const k of ['name', 'site', 'start', 'n_fractions', 'dose_per_fraction']) if (col(k) < 0) throw new Error('header');
    const list = loadCases(), bad = []; let ok = 0; const today = new Date().toISOString().slice(0, 10);
    const names = Object.keys(RT.SITES).map((id) => [id, tr.siteName(id, RT.SITES[id]).toLowerCase(), String(RT.SITES[id].name || '').toLowerCase()]);
    lines.slice(1).forEach((l, i) => {
      const c = cut(l), name = c[col('name')], sraw = (c[col('site')] || '').toLowerCase(), start = csvDate(c[col('start')]), n = Math.round(+c[col('n_fractions')]), d = +String(c[col('dose_per_fraction')]).replace(',', '.');
      const hit = names.find((x) => x[0] === sraw || x[1] === sraw || x[2] === sraw);
      const missed = col('missed_dates') >= 0 && c[col('missed_dates')] ? c[col('missed_dates')].split(/[ |]+/).map(csvDate) : [];
      if (!name || !hit || !start || !(n >= 1) || !(d > 0) || missed.includes(null)) { bad.push(i + 2); return; }
      try {
        const s2 = baseState({ site: hit[0], start, n, d, missed, caseRef: name, lang: state.lang }); RT.plannerFromCase(toCase(s2), {});
        const k = list.findIndex((x) => x.name === name); if (k >= 0) list.splice(k, 1);
        list.unshift({ name: name.slice(0, 80), when: today, sum: tr.siteName(hit[0], RT.SITES[hit[0]]), state: s2 }); ok++;
      } catch (e) { bad.push(i + 2); }
    });
    storeCases(list); return { ok, bad };
  }
  // ---- audit of the saved cases (RCR asks departments to audit interruptions regularly)
  function auditRows() {
    return loadCases().map((c) => {
      const row = { name: c.name };
      try {
        const s2 = Object.assign(baseState(), JSON.parse(JSON.stringify(c.state))); s2.oars.forEach(fixOar); s2.scen = false;
        const p = RT.plannerFromCase(toCase(s2), {}), dec = RT.decide(p), all = dec.feasible.concat(dec.rejected);
        const base = all.find((o) => o.family === 'baseline'), ch = all.find((o) => o.key === s2.sel) || dec.recommended || base;
        Object.assign(row, { site: tr.siteName(p.siteId, p.site), cat: p.rules.category, nI: p.interruptions.length, nF: p.interruptions.reduce((a, x) => a + x[2], 0), cause: s2.cause || '',
          ext0: base ? base.ext : 0, ext: ch ? ch.ext : 0, max: p.rules.max, dT: ch ? ch.tumour.deltaPct : 0, sched: ch && ch !== base ? tr.optTitle(ch) : '' });
        row.within = row.max == null ? null : row.ext <= row.max;
      } catch (e) { row.err = true; }
      return row;
    });
  }
  function renderAudit() {
    const box = $('#audit'); if (!box) return;
    const L = tr.t, rows = auditRows().filter((r) => !r.err);
    let h = `<h2>${esc(L('aud_title'))} ${refs(['RCR19'])}</h2><p class="hint">${esc(L('aud_hint'))}</p>`;
    if (!rows.length) { box.innerHTML = h + `<p class="small">${esc(L('tri_none'))}</p>`; return; }
    const cats = [1, 2, 3, null].map((k) => { const rs = rows.filter((r) => (r.cat == null ? null : r.cat) === k), it = rs.filter((r) => r.nI > 0), wi = rs.filter((r) => r.within !== false); return { k, n: rs.length, it: it.length, days: it.reduce((a, r) => a + r.nF, 0), wi: wi.length, pct: rs.length ? Math.round(100 * wi.length / rs.length) : null }; }).filter((x) => x.n);
    h += `<div class="kpis" style="margin-bottom:12px">${cats.map((x) => `<div class="kpi ${x.k === 1 && x.pct < 95 ? 'bad' : (x.pct < 95 ? 'warn' : 'ok')}"><span class="k">${esc(x.k ? L('cat') + ' ' + x.k : L('aud_nocat'))}</span><span class="v"><b>${x.pct}</b> %</span><span class="s">${x.wi}/${x.n} ${esc(L('aud_within'))} · ${x.it} ${esc(L('aud_int'))}</span></div>`).join('')}</div>`;
    h += `<details class="sub"><summary>${esc(L('aud_list'))} (${rows.length})</summary><div class="scroll"><table><thead><tr><th style="text-align:left">${esc(L('rep_case'))}</th><th>${esc(L('cat'))}</th><th>${esc(L('intr_n'))}</th><th>${esc(L('missed_n'))}</th><th>${esc(L('aud_ext0'))}</th><th>${esc(L('aud_ext'))}</th><th>${esc(L('aud_ok'))}</th></tr></thead><tbody>` +
      rows.map((r) => `<tr><td style="text-align:left">${esc(r.name)}<br><span class="small">${esc(r.site)}${r.sched ? ' · ' + esc(r.sched) : ''}</span></td><td class="n">${r.cat || '–'}</td><td class="n">${r.nI}</td><td class="n">${r.nF}</td><td class="n">${tr.sgi(r.ext0)}</td><td class="n">${tr.sgi(r.ext)}</td><td class="n ${r.within === false ? 'neg' : ''}">${r.within == null ? '–' : (r.within ? '✓' : '✗')}</td></tr>`).join('') + `</tbody></table></div></details>
      <div class="rowbtn"><button type="button" class="btn" data-act="aud-csv">${esc(L('aud_csv'))}</button></div><p class="small" style="margin:8px 0 0">${esc(L('aud_note'))}</p>`;
    box.innerHTML = h; box._rows = rows;
  }
  function renderTriage() {
    const box = $('#triage'); if (!box) return;
    const L = tr.t, n = loadCases().length, rows = n ? triageRows() : null;
    let h = `<h2>${esc(L('tri_title'))} ${refs(['RCR19'])}</h2><p class="hint">${esc(L('tri_hint'))}</p>`;
    h += importBar();
    if (!n) h += `<p class="small">${esc(L('tri_none'))}</p>`;
    else {
      h += `<div class="fields" style="max-width:520px"><label class="f"><span>${esc(L('tri_from'))}</span><input type="date" id="tri-from" value="${esc(tri.from)}"></label><label class="f"><span>${esc(L('tri_to'))}</span><input type="date" id="tri-to" value="${esc(tri.to)}"></label></div><p class="small" style="margin:6px 0 10px">${n} ${esc(L('tri_n'))}</p>`;
      if (rows) {
        const hit = rows.filter((r) => !r.none && !r.err), load = new Map();
        for (const r of hit) if (r.rec) { for (const f of r.rec.newFx) if (RT.weekday(f.day) >= 5) { const k = 'w' + f.day; load.set(k, (load.get(k) || 0) + 1); } for (const d of r.rec.bidDays) { const k = 'b' + d; load.set(k, (load.get(k) || 0) + 1); } }
        h += `<div class="scroll"><table><thead><tr><th>#</th><th style="text-align:left">${esc(L('rep_case'))}</th><th>${esc(L('cat'))}</th><th>${esc(L('missed_n'))}</th><th>${esc(L('kpi_ext'))}</th><th>Δ ${esc(L('col_t'))} %</th><th style="text-align:left">${esc(L('scen_dec'))}</th></tr></thead><tbody>` +
          rows.map((r, i) => r.err ? `<tr><td class="n">–</td><td>${esc(r.name)}</td><td colspan="5" class="small">${esc(L('tri_err'))}</td></tr>`
            : r.none ? `<tr class="dim"><td class="n">–</td><td style="text-align:left">${esc(r.name)}<br><span class="small">${esc(r.site)}</span></td><td class="n">${r.cat || '–'}</td><td colspan="4" class="small" style="text-align:left">${esc(L('tri_unaff'))}</td></tr>`
            : `<tr class="pick" data-act="tri-open" data-i="${i}" tabindex="0" role="button"><td class="n">${i + 1}</td><td style="text-align:left"><b>${esc(r.name)}</b><br><span class="small">${esc(r.site)}</span></td><td class="n">${r.cat ? `<span class="pill c${r.cat}">${r.cat}</span>` : '–'}</td><td class="n">${r.n} ${esc(L('fx'))}</td><td class="n ${r.ext > r.max ? 'neg' : ''}">${tr.sgi(r.ext)} ${esc(L('days'))}</td>${dcell(r.dT, true)}<td style="white-space:normal;min-width:220px;text-align:left"><span class="small">${esc(L('st_' + r.status))}</span><br>${esc(tr.head(r.head))}${r.rec && r.rec.family !== 'baseline' ? `<br><span class="small num">${esc(tr.optShort(r.rec))}</span>` : ''}</td></tr>`).join('') + '</tbody></table></div>';
        const wl = [...load.entries()].sort((x, y) => (+x[0].slice(1)) - (+y[0].slice(1)) || (x[0] < y[0] ? -1 : 1));
        const wlTxt = wl.map(([k, v]) => tr.dshort(+k.slice(1)) + (k[0] === 'b' ? ' BID' : '') + ' × ' + v).join(' · '); box._load = wlTxt;
        if (wl.length) h += `<p class="small" style="margin:10px 0 0"><b>${esc(L('tri_load'))}:</b> ${esc(wlTxt)}</p>`;
        h += `<div class="rowbtn"><button type="button" class="btn" data-act="tri-pdf">${esc(L('tri_pdf'))}</button><button type="button" class="btn" data-act="tri-csv">${esc(L('tri_csv'))}</button></div>`;
        h += `<p class="small" style="margin:8px 0 0">${esc(L('tri_note'))}</p>`;
        box._rows = rows;
      }
    }
    box.innerHTML = h;
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
    pop.innerHTML = `<button type="button" class="btn sm close" data-act="close-ref" aria-label="close">✕</button><div class="n">[${I.REF_NUM[id]}] ${esc(r.short)}</div><p style="margin:6px 0">${esc(r.text)}${r.url ? ` <a href="${r.url}" target="_blank" rel="noopener">link</a>` : ''}</p><p class="small" style="margin:0">${esc(r.use[state.lang])}</p><p class="small" style="margin:6px 0 0"><button type="button" class="linkbtn" data-act="docs" data-tab="refs">${esc(tr.t('refs_all'))}</button></p>`;
    pop.hidden = false;
  }
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }

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
  async function makeSheet() {
    if (!model || model.error || !model.sel) return null;
    const lang = state.pdfLang || state.lang;
    return window.RTPDF.buildSheet({ model, tr: I.make(lang), lang, meta: { caseRef: state.caseRef, title: state.title }, inputJson: exportJson() });
  }
  async function makePdf() {
    if (!model || model.error) return null;
    const lang = state.pdfLang || state.lang;
    return window.RTPDF.build({ model, tr: I.make(lang), lang, meta: { caseRef: state.caseRef, calcBy: state.calcBy, checkedBy: state.checkedBy, title: state.title }, inputJson: exportJson(), lc: (oo) => { const keep = tr; tr = I.make(lang); try { return lcText(oo); } finally { tr = keep; } }, hand: (pp, oo, tt) => { const keep = tr; tr = I.make(lang); try { return handText(pp, oo, tt); } finally { tr = keep; } } });
  }
  window.__rtgapMakePdf = makePdf; window.__rtgapMakeSheet = makeSheet;

  // ------------------------------------------------------------------ events
  function setPath(path, value) {
    const ks = path.split('.'); let o = state;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = value;
  }
  let timer = null;
  let focusDay = null, printing = false;
  function announce() {
    const el = $('#sr-status'); if (!el || !model) return;
    el.textContent = model.error ? tr.t('st_error') : tr.t('st_' + model.dec.status) + ': ' + tr.head(model.dec.head);
    if (focusDay) { const b = document.querySelector('#gapcal [data-day="' + focusDay + '"]'); if (b) b.focus({ preventScroll: true }); focusDay = null; }
  }
  function refresh(full) {
    compute(); persist(); setTimeout(announce, 0);
    if (full) { renderStatic(); renderInputs(); } else { renderGapCal(); renderBioNote(); const ps = $('#proto-status'); if (ps) ps.innerHTML = protoStatus(); const ds = $('#dept-sum'); if (ds) ds.textContent = deptSum(); const bs = $('#bio-sum'); if (bs) bs.textContent = bioSum(); const tt = $('#rx-total'); if (tt) tt.textContent = ((state.n || 0) * (state.d || 0)).toFixed(2) + ' Gy'; refreshSiteMeta(); }
    renderResults();
  }
  function refreshSiteMeta() { /* category pills depend on the planner; cheap to rebuild only on structural changes */ }
  const TEXT_BINDS = /(^guidance$|^model$|^title$|^caseRef$|^calcBy$|^checkedBy$|name$|^start$|^resume$|^site$|^category$|^primary$|^pdfLang$|^cause$|mode$|ratio$|date$|^pc\.from$)/;
  function onInput(ev) {
    const t = ev.target;
    if (t.dataset.tool) { toolState[t.dataset.tool] = num(t.value); renderTools(); return; }
    const b = t.dataset.bind; if (!b) return;
    let v;
    if (t.type === 'checkbox') v = t.checked; else if (TEXT_BINDS.test(b)) v = t.value; else v = num(t.value);
    if (b === 'c.bid_interval_h' || b === 'c.bid_max_dose' || b === 'c.dose_rounding' || b === 'tumour.ab') { if (v == null) return; }
    if ((b === 'n' || /\.n$/.test(b)) && v != null) v = Math.round(v);
    setPath(b, v);
    if (b === 'pc.on' && v && model && model.p && !state.pc.from) { state.pc.from = state.resume || (model.p.missed.length ? RT.iso(model.p.resume) : ''); state.pc.n = model.p.remaining; state.pc.d = +model.p.dCur.toFixed(3); }
    if (b === 'given.on' && v && model && model.p && !state.given.dates) { if (!state.given.n) state.given.n = model.p.remaining; if (!state.given.d) state.given.d = model.p.dRef; }
    if (b === 'brachy.on' && v && !state.brachy.fx.length && model && model.p) state.brachy.fx = [0, 7, 14, 21].map((k) => ({ date: RT.iso(model.p.plannedEnd + 3 + k), dose: 7 }));
    if (b === 'site') { const d = siteDefaults(v); state.tumour = d.tumour; state.oars = d.oars; state.category = 'auto'; }
    if (['caseRef', 'calcBy', 'checkedBy', 'pdfLang'].includes(b)) { persist(); return; }
    const struct = t.dataset.struct || t.type === 'checkbox' && (b === 'multi' || b === 'brachy.on' || b === 'given.on' || b === 'pc.on') || b === 'tumour.mode' || /levels\.\d+\.name$/.test(b) && ev.type === 'change';
    clearTimeout(timer);
    if (struct || ev.type === 'change' && (t.type === 'checkbox' || t.tagName === 'SELECT' || t.type === 'date')) refresh(!!struct || b === 'holidays' || b === 'scen' || t.type === 'date');
    else timer = setTimeout(() => refresh(false), 160);
  }
  function toggle(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
  function onClick(ev) {
    if (ev.target.classList && ev.target.classList.contains('modal')) { ev.target.hidden = true; return; }
    const t = ev.target.closest('[data-ref],[data-gl],[data-act],[data-day],[data-opt],[data-lang]'); if (!t) { if (!ev.target.closest('#refpop')) $('#refpop').hidden = true; return; }
    if (t.dataset.ref) { ev.preventDefault(); showRef(t.dataset.ref); return; }
    if (t.dataset.gl) { ev.preventDefault(); const gg = tr.t('gloss')[t.dataset.gl]; const pop = $('#refpop'); pop.innerHTML = `<button type="button" class="btn sm close" data-act="close-ref" aria-label="close">✕</button><div class="n">${esc(gg[0])}</div><p style="margin:6px 0 0">${esc(gg[1])}</p>`; pop.hidden = false; return; }
    if (t.dataset.lang) { state.lang = t.dataset.lang; tr = I.make(state.lang); refresh(true); return; }
    if (t.dataset.day) { focusDay = t.dataset.day;
      const d = t.dataset.day, m = state.mark, p0 = model && model.p, dd = RT.parseDate(d);
      if (m === 'err') {
        const i = state.errors.findIndex((e) => e.date === d);
        if (i >= 0) state.errors.splice(i, 1);
        else {
          const f = p0 && p0.delivered.find((x) => x.day === dd && x.slot === 0);
          if (!f) { toast(tr.t('err_need_delivered')); return; }
          state.errors.push({ date: d, dose: +f.dose.toFixed(3) }); state.ui = state.ui || {}; state.ui.hist = true;
        }
        refresh(true); return;
      }
      if (m === 'extra') {
        if (state.missed.includes(d)) { toast(tr.t('extra_missed')); return; }
        toggle(state.extra, d); refresh(false); return;
      }
      if (m === 'missed') { toggle(state.missed, d); const i = state.extra.indexOf(d); if (i >= 0) state.extra.splice(i, 1); const j = state.errors.findIndex((e) => e.date === d); if (j >= 0) { state.errors.splice(j, 1); refresh(true); return; } }
      else if (m === 'unavail') toggle(state.unavailable, d); else if (m === 'chemo') toggle(state.c.chemo_dates, d); else toggle(state.closed, d);
      if (m === 'missed' && state.resume && state.missed.length && state.resume <= state.missed.slice().sort().pop()) state.resume = '';
      refresh(false); const r = $('#i-resume'); if (r) r.value = state.resume; return;
    }
    if (t.dataset.opt) { ev.preventDefault(); state.sel = t.dataset.opt; state.ui = state.ui || {}; state.ui.tab = 'plan'; compute(); persist(); renderResults(); { const tb = $('#tabs'); if (tb && t.tagName !== 'A') tb.scrollIntoView({ behavior: 'smooth', block: 'start' }); } if (t.tagName === 'A') { const d = $('#detail'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return; }
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
    if (a === 'proto-save') {
      const nm = ($('#proto-name') && $('#proto-name').value.trim()) || (proto && proto.name) || tr.t('proto_unnamed');
      const cons = {}; for (const k of constraintsDiff(state.c, RT.CONSTRAINT_DEFAULTS)) cons[k] = state.c[k];
      proto = { name: nm, constraints: cons, sites: proto ? proto.sites : {}, guidance: state.guidance || 'rcr2019' }; saveProto(); toast(tr.t('proto_saved')); refresh(true); return;
    }
    if (a === 'proto-apply') { if (proto) { state.c = Object.assign(C0(), { chemo_dates: state.c.chemo_dates || [] }); state.guidance = proto.guidance; refresh(true); } return; }
    if (a === 'proto-export') {
      if (!proto) return;
      const out = { name: proto.name, generator: 'RTGap ' + RT.VERSION, saved: new Date().toISOString().slice(0, 10), guidance: proto.guidance, constraints: proto.constraints, sites: proto.sites };
      saveFile('RTGap-protocol-' + (proto.name || 'department').replace(/[^\w\-]+/g, '_').slice(0, 40) + '.json', JSON.stringify(out, null, 1), 'application/json'); return;
    }
    if (a === 'proto-rm') { proto = null; saveProto(); toast(tr.t('proto_removed')); refresh(true); return; }
    if (a === 'proto-site') {
      const nm = (proto && proto.name) || tr.t('proto_unnamed');
      if (!proto) proto = { name: nm, constraints: {}, sites: {}, guidance: state.guidance || 'rcr2019' };
      proto.sites[state.site] = Object.assign({}, proto.sites[state.site] || {}, siteEntryFromState(state)); saveProto(); toast(tr.t('proto_site_saved')); refresh(true); return;
    }
    if (a === 'proto-site-rm') { if (proto) { delete proto.sites[state.site]; saveProto(); } refresh(true); return; }
    if (a === 'site-defaults') { const d = siteDefaults(state.site); state.tumour = d.tumour; state.oars = d.oars; refresh(true); return; }
    if (a === 'json') { saveFile(fileStem() + '.json', exportJson(), 'application/json'); return; }
    if (a === 'tab') { state.ui = state.ui || {}; state.ui.tab = t.dataset.tab; persist(); renderResults(); return; }
    if (a === 'nav') { const el2 = $('#sec-' + t.dataset.i); if (el2) { if (el2.tagName === 'DETAILS') el2.open = true; el2.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return; }
    if (a === 'theme') { const order = ['auto', 'light', 'dark'], cur = theme(); setTheme(order[(order.indexOf(cur) + 1) % 3]); return; }
    if (a === 'about') { $('#about').hidden = false; return; }
    if (a === 'docs') { if (t.dataset.tab) docTab = t.dataset.tab; renderDocs(); $('#docs').hidden = false; $('#refpop').hidden = true; return; }
    if (a === 'print') { window.print(); return; }
    if (a === 'undo') { timeTravel(hist, fut); return; }
    if (a === 'redo') { timeTravel(fut, hist); return; }
    if (a === 'cmp-swap') { const x = $('#cmp-a').value; state.ui = state.ui || {}; state.ui.cmpA = $('#cmp-b').value; state.ui.cmpB = x; renderResults(); return; }
    if (a === 'install') { if (installEvt) { installEvt.prompt(); installEvt = null; fillInstall(); } return; }
    if (a === 'backup') {
      const out = { app: 'RTGap', kind: 'backup', version: RT.VERSION, saved: new Date().toISOString(), cases: loadCases(), protocol: proto, current: JSON.parse(JSON.stringify(state)) };
      saveFile('RTGap-backup-' + out.saved.slice(0, 10) + '.json', JSON.stringify(out), 'application/json'); return;
    }
    if (a === 'guide-open') { $('#docs').hidden = true; if (EXAMPLES[t.dataset.ex]) { const s2 = EXAMPLES[t.dataset.ex](); s2.lang = state.lang; loadState(s2); } window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (a === 'csv-template') { saveFile('RTGap-patients-template.csv', '\ufeff' + CSV_HEAD + '\r\nRT-001,hn_scc,2026-10-05,35,2,\r\nRT-002,prostate,2026-10-12,20,3,2026-10-20 2026-10-21\r\n', 'text/csv'); return; }
    if (a === 'aud-csv') {
      const L = tr.t, q = (x) => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"', rows = $('#audit')._rows || [];
      const head = [L('rep_case'), L('s_site'), L('cat'), L('intr_n'), L('missed_n'), L('cause'), L('aud_ext0'), L('aud_ext'), L('allowance'), L('aud_ok'), 'Δ ' + L('col_t') + ' %', L('remaining')];
      saveFile('RTGap-audit-' + new Date().toISOString().slice(0, 10) + '.csv', '\ufeff' + [head].concat(rows.map((r) => [r.name, r.site, r.cat || '', r.nI, r.nF, r.cause ? L('cause_' + r.cause) : '', r.ext0, r.ext, r.max == null ? '' : r.max, r.within == null ? '' : (r.within ? 1 : 0), r.dT.toFixed(1), r.sched])).map((r) => r.map(q).join(',')).join('\r\n'), 'text/csv'); return;
    }
    if (a === 'docs-close') { $('#docs').hidden = true; return; }
    if (a === 'pre-start') { state.start = t.dataset.d; refresh(true); return; }
    if (a === 'tri-csv' || a === 'tri-pdf') {
      const rows = ($('#triage')._rows || []), L = tr.t, q = (x) => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"';
      const cells = (r, i) => r.err ? [i + 1, r.name, '', '', '', '', '', L('tri_err'), ''] : r.none ? ['', r.name, r.site, r.cat || '', 0, '', '', L('tri_unaff'), ''] : [i + 1, r.name, r.site, r.cat || '', r.n, r.ext, r.dT.toFixed(1), L('st_' + r.status) + ': ' + tr.head(r.head), r.rec && r.rec.family !== 'baseline' ? tr.optShort(r.rec) : ''];
      const head = ['#', L('rep_case'), L('s_site'), L('cat'), L('missed_n'), L('kpi_ext') + ' (' + L('days') + ')', 'Δ ' + L('col_t') + ' %', L('scen_dec'), L('remaining')];
      const stem = 'RTGap-outage-' + tri.from + '_' + tri.to;
      if (a === 'tri-csv') { saveFile(stem + '.csv', '\ufeff' + [head].concat(rows.map(cells)).map((r) => r.map(q).join(',')).join('\r\n'), 'text/csv'); return; }
      const wl = $('#triage')._load || '';
      window.RTPDF.buildList({ tr, title: L('tri_pdf_title'), kv: [[L('tri_from'), tr.date(RT.parseDate(tri.from))], [L('tri_to'), tr.date(RT.parseDate(tri.to))], [L('tri_n').replace(/^./, (c) => c.toUpperCase()), String(rows.length)]].concat(wl ? [[L('tri_load'), wl]] : []),
        cols: [{ label: '#', w: 0.05 }, { label: head[1], w: 0.25 }, { label: L('cat'), w: 0.08 }, { label: L('missed_n'), w: 0.09 }, { label: L('kpi_ext'), w: 0.09 }, { label: head[6], w: 0.09 }, { label: head[7], w: 0.35 }],
        rows: rows.map((r, i) => { const c = cells(r, i); return [{ t: String(c[0]), mono: true }, { t: c[1] + (c[2] ? ' · ' + c[2] : '') }, { t: String(c[3]), mono: true }, { t: String(c[4] || '–'), mono: true }, { t: c[5] === '' ? '–' : tr.sgi(c[5]), mono: true }, { t: c[6] === '' ? '–' : c[6], mono: true }, { t: c[7] + (c[8] ? ' · ' + c[8] : '') }]; }),
        notes: [L('tri_note'), L('disclaimer')] }).then((blob) => saveFile(stem + '.pdf', blob, 'application/pdf')).catch(() => toast(L('save_fail')));
      return;
    }
    if (a === 'tri-open') { const r = ($('#triage')._rows || [])[+t.dataset.i]; if (r && r.state) { loadState(JSON.parse(JSON.stringify(r.state))); toast(r.name); window.scrollTo({ top: 0, behavior: 'smooth' }); } return; }
    if (a === 'about-close') { $('#about').hidden = true; return; }
    if (a === 'intro-hide') { try { localStorage.setItem('rtgap.intro', '1'); } catch (e) { /* ignore */ } $('#intro').hidden = true; return; }
    if (a === 'intro-try') { loadState(EXAMPLES.hn_70()); const r0 = $('#results'); if (r0 && window.innerWidth <= 900) r0.scrollIntoView({ behavior: 'smooth' }); return; }
    if (a === 'share') { const u = shareUrl(); try { navigator.clipboard.writeText(u).then(() => toast(tr.t('share_ok')), () => window.prompt(tr.t('share_btn'), u)); } catch (e) { toast(tr.t('save_fail')); } return; }
    if (a === 'case-save') {
      const nm = (($('#save-name') && $('#save-name').value) || '').trim() || (tr.siteName(state.site, RT.SITES[state.site]) + ' ' + state.start);
      const list = loadCases().filter((c) => c.name !== nm), d0 = new Date();
      list.unshift({ name: nm.slice(0, 80), when: d0.toISOString().slice(0, 10), sum: model && !model.error ? tr.siteName(model.p.siteId, model.p.site) : '', state: JSON.parse(JSON.stringify(state)) });
      toast(tr.t(storeCases(list) ? 'saved_done' : 'save_fail')); renderResults(); renderTriage(); renderAudit(); return;
    }
    if (a === 'case-load') { const c = loadCases()[+t.dataset.i]; if (c && c.state) { const s2 = Object.assign(baseState(), c.state); s2.oars.forEach(fixOar); loadState(s2); toast(c.name); } return; }
    if (a === 'case-del') { const list = loadCases(); list.splice(+t.dataset.i, 1); storeCases(list); renderResults(); renderTriage(); renderAudit(); return; }
    if (a === 'add-err') { const p0 = model && model.p, f = p0 && p0.delivered.length ? p0.delivered[p0.delivered.length - 1] : null; state.errors.push({ date: f ? RT.iso(f.day) : '', dose: f ? +f.dose.toFixed(3) : null }); refresh(true); return; }
    if (a === 'rm-err') { state.errors.splice(+t.dataset.i, 1); refresh(true); return; }
    if (a === 'copysum') { try { navigator.clipboard.writeText(summaryText()).then(() => toast(tr.t('copied')), () => toast(tr.t('save_fail'))); } catch (e) { toast(tr.t('save_fail')); } return; }
    if (a === 'copy') { try { navigator.clipboard.writeText(exportJson()).then(() => toast(tr.t('copied')), () => toast(tr.t('save_fail'))); } catch (e) { toast(tr.t('save_fail')); } return; }
    if (a === 'sheet') { const old = t.textContent; t.textContent = tr.t('busy'); t.disabled = true; makeSheet().then((blob) => blob && saveFile(fileStem() + '-sheet.pdf', blob, 'application/pdf')).catch(() => toast(tr.t('save_fail'))).then(() => { t.textContent = old; t.disabled = false; }); return; }
    if (a === 'pdf') { const old = t.textContent; t.textContent = tr.t('busy'); t.disabled = true; makePdf().then((blob) => blob && saveFile(fileStem() + '.pdf', blob, 'application/pdf')).catch(() => toast(tr.t('save_fail'))).then(() => { t.textContent = old; t.disabled = false; }); return; }
    if (a === 'dock') { const d = $('#decision') || $('#results'); d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  const theme = () => { try { return localStorage.getItem('rtgap.theme') || 'auto'; } catch (e) { return 'auto'; } };
  function setTheme(v) {
    try { localStorage.setItem('rtgap.theme', v); } catch (e) { /* ignore */ }
    if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v);
    const b = $('#theme'); if (b) { b.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="' + (v === 'dark' ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.8"/>' + (v === 'auto' ? '<path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor"/>' : '') + '</svg>'; b.title = tr.t('theme_' + v); b.setAttribute('aria-label', tr.t('theme_' + v)); }
  }
  function loadState(s) { s.lang = state.lang; state = s; tr = I.make(state.lang); refresh(true); }
  document.addEventListener('input', onInput);
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'ex') { if (t.value) loadState(EXAMPLES[t.value]()); t.value = ''; return; }
    if (t.id === 'tri-from' || t.id === 'tri-to') { tri[t.id === 'tri-from' ? 'from' : 'to'] = t.value; if (t.id === 'tri-from' && (!tri.to || tri.to < tri.from)) tri.to = tri.from; renderTriage(); return; }
    if (t.id === 'proto-imp') {
      const f = t.files && t.files[0]; if (!f) return;
      f.text().then((txt) => {
        const ign = []; proto = normProto(JSON.parse(txt), ign); saveProto();
        state.c = Object.assign(C0(), { chemo_dates: state.c.chemo_dates || [] }); state.guidance = proto.guidance;
        refresh(true); toast(tr.t('proto_loaded') + (ign.length ? ' ' + tr.t('proto_ignored') + ': ' + ign.slice(0, 4).join(', ') + (ign.length > 4 ? '…' : '') : ''));
      }).catch(() => toast(tr.t('proto_fail'))); return;
    }
    if (t.id === 'cmp-a' || t.id === 'cmp-b') { state.ui = state.ui || {}; state.ui[t.id === 'cmp-a' ? 'cmpA' : 'cmpB'] = t.value; renderResults(); return; }
    if (t.id === 'bk-imp') {
      const f = t.files && t.files[0]; if (!f) return;
      f.text().then((txt) => {
        const j = JSON.parse(txt); if (j.app !== 'RTGap' || !Array.isArray(j.cases)) throw new Error('not a backup');
        const list = loadCases(); let n = 0;
        for (const c of j.cases.slice().reverse()) { if (!c || !c.name || !c.state) continue; const k = list.findIndex((x) => x.name === c.name); if (k >= 0) list.splice(k, 1); list.unshift(c); n++; }
        storeCases(list);
        if (j.protocol) { proto = normProto(j.protocol); saveProto(); }
        refresh(true); renderTriage(); renderAudit(); toast(n + ' ' + tr.t('bk_done') + (j.protocol ? ' · ' + tr.t('proto_title') : ''));
      }).catch(() => toast(tr.t('bk_fail'))); return;
    }
    if (t.id === 'csv-imp') { const f = t.files && t.files[0]; if (!f) return; f.text().then((txt) => { const r = importCsv(txt); renderResults(); renderTriage(); renderAudit(); toast(r.ok + ' ' + tr.t('csv_ok') + (r.bad.length ? ' · ' + tr.t('csv_bad') + ' ' + r.bad.slice(0, 8).join(', ') : '')); }).catch(() => toast(tr.t('csv_fail'))); return; }
    if (t.id === 'imp') { const f = t.files && t.files[0]; if (!f) return; f.text().then((txt) => { const j = JSON.parse(txt); loadState(fromCase(j.case || j)); }).catch(() => toast(tr.t('import_fail'))); return; }
    onInput(ev);
  });
  document.addEventListener('click', onClick);
  document.addEventListener('toggle', (ev) => { const d = ev.target; if (d && d.dataset && d.dataset.fold) { state.ui = state.ui || {}; if (!!state.ui[d.dataset.fold] !== d.open) { state.ui[d.dataset.fold] = d.open; persist(); } } }, true);
  document.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('tr[data-opt]')) { ev.preventDefault(); ev.target.click(); } if (ev.key === 'Escape') { $('#refpop').hidden = true; $('#about').hidden = true; $('#docs').hidden = true; } });
  // keyboard: arrows in the calendar and between tabs; focus stays inside an open dialog
  document.addEventListener('keydown', (ev) => {
    const tg = ev.target, k = ev.key; if (!tg || !tg.matches) return;
    if (tg.matches('#gapcal button[data-day]') && /^Arrow/.test(k)) {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[k], nx = document.querySelector('#gapcal [data-day="' + RT.iso(RT.parseDate(tg.dataset.day) + step) + '"]');
      if (nx) { ev.preventDefault(); nx.focus(); } return;
    }
    if (tg.matches('[role="tab"]') && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End')) {
      const tabs = [...tg.parentElement.querySelectorAll('[role="tab"]')], i = tabs.indexOf(tg), j = k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : (i + (k === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      ev.preventDefault(); const sel = '[role="tab"][data-act="' + tabs[j].dataset.act + '"][data-tab="' + tabs[j].dataset.tab + '"]'; tabs[j].click(); const nb = document.querySelector(sel); if (nb) nb.focus(); return;
    }
    if (k === 'Tab') {
      const dlg = [...document.querySelectorAll('.modal')].find((x) => !x.hidden); if (!dlg) return;
      const f = [...dlg.querySelectorAll('button, a[href], input, select, summary')].filter((x) => x.offsetParent !== null); if (!f.length) return;
      if (ev.shiftKey && (document.activeElement === f[0] || !dlg.contains(document.activeElement))) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && (document.activeElement === f[f.length - 1] || !dlg.contains(document.activeElement))) { ev.preventDefault(); f[0].focus(); }
    }
  });
  let opener = null;
  new MutationObserver((ms) => { for (const m of ms) { const el = m.target; if (!el.classList || !el.classList.contains('modal')) continue; if (!el.hidden) { if (!el.contains(document.activeElement)) { opener = document.activeElement; const c = el.querySelector('.close'); if (c) c.focus(); } } else if (opener && document.body.contains(opener)) { opener.focus(); opener = null; } } }).observe(document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });
  let themeBefore = null;
  window.addEventListener('beforeprint', () => { themeBefore = document.documentElement.getAttribute('data-theme'); document.documentElement.setAttribute('data-theme', 'light'); printing = true; renderResults(); });
  window.addEventListener('afterprint', () => { printing = false; if (themeBefore) document.documentElement.setAttribute('data-theme', themeBefore); else document.documentElement.removeAttribute('data-theme'); renderResults(); });
  document.addEventListener('keydown', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || (ev.key !== 'z' && ev.key !== 'Z' && ev.key !== 'y')) return;
    const tg = ev.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return;
    ev.preventDefault(); if (ev.key === 'y' || ev.shiftKey) timeTravel(fut, hist); else timeTravel(hist, fut);
  });
  if (HOSTED) {
    try {
      const lk = document.createElement('link'); lk.rel = 'manifest'; lk.href = 'manifest.webmanifest'; document.head.appendChild(lk);
      const ic = document.createElement('link'); ic.rel = 'apple-touch-icon'; ic.href = 'icon-192.png'; document.head.appendChild(ic);
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* offline install not available */ });
      window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; fillInstall(); });
    } catch (e) { /* ignore */ }
  }
  $('#reset').addEventListener('click', () => loadState(baseState({ missed: [], start: RT.iso(Math.floor(Date.now() / 86400000)) })));
  window.addEventListener('resize', () => { drawChart(); drawMap(); drawHero(heroDone ? 'full' : undefined); });
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { drawChart(); drawMap(); });
  new MutationObserver(() => { drawChart(); drawMap(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawChart(); drawMap(); });

  const hot = window.claude && window.claude.hot;
  const start = (data) => { if (data && data.v === 3) state = Object.assign(baseState(), data); tr = I.make(state.lang); refresh(true); };
  requestAnimationFrame(drawHero);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { for (const e of es) $('#dock').classList.toggle('show', !e.isIntersecting); }, { threshold: 0 });
    const watch = () => { io.disconnect(); const d = $('#decision'); if (d) io.observe(d); else $('#dock').classList.remove('show'); };
    new MutationObserver(watch).observe($('#results'), { childList: true }); watch();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (heroDone) drawHero('full'); });
  if (hot && hot.snapshot) hot.snapshot(() => state);
  if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || null);
  window.__rtgap = { fromCase, toCase, loadState, shareUrl, get state() { return state; }, model: () => model };
})();
