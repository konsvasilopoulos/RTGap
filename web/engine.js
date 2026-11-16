/* rtgap engine (JavaScript port of the Python reference implementation).
 * Pure functions, no DOM. Dates are integer day numbers (days since 1970-01-01, UTC).
 * Messages are returned as {code, p} objects so that the UI can render them in any language.
 * Cross-validated against the Python package (web/xval.mjs). */
(function (root) {
  'use strict';
  const VERSION = '1.10.0';

  // ------------------------------------------------------------------ dates
  const DAY = 86400000;
  const parseDate = (s) => {
    if (typeof s === 'number') return s;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s).trim());
    if (!m) throw new Error('bad date: ' + s);
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY);
  };
  const iso = (d) => new Date(d * DAY).toISOString().slice(0, 10);
  const weekday = (d) => (((d + 3) % 7) + 7) % 7;           // Mon = 0
  const ymd = (d) => { const t = new Date(d * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
  const mkDate = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DAY);
  const WD = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const parseWeekdays = (a) => [...new Set((a || [0, 1, 2, 3, 4]).map((v) => {
    if (typeof v === 'number') return v;
    const i = WD.indexOf(String(v).trim().toLowerCase().slice(0, 3));
    if (i < 0) throw new Error('unknown weekday: ' + v);
    return i;
  }))].sort();

  // ------------------------------------------------------------------ holidays
  function orthodoxEaster(year) {
    const a = year % 4, b = year % 7, c = year % 19;
    const d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
    const month = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
    return mkDate(year, month, day) + 13;
  }
  function greekHolidays(year) {
    const e = orthodoxEaster(year), m = new Map();
    m.set(mkDate(year, 1, 1), 'newyear'); m.set(mkDate(year, 1, 6), 'epiphany');
    m.set(e - 48, 'cleanmonday'); m.set(mkDate(year, 3, 25), 'mar25');
    m.set(e - 2, 'goodfriday'); m.set(e, 'easter'); m.set(e + 1, 'eastermonday');
    m.set(mkDate(year, 5, 1), 'may1'); m.set(e + 50, 'holyspirit');
    m.set(mkDate(year, 8, 15), 'aug15'); m.set(mkDate(year, 10, 28), 'oct28');
    m.set(mkDate(year, 12, 25), 'xmas'); m.set(mkDate(year, 12, 26), 'dec26');
    return m;
  }
  function holidayMap(cal, y0, y1) {
    if (String(cal).toUpperCase() !== 'GR') throw new Error('unknown holiday calendar ' + cal);
    const out = new Map();
    for (let y = y0; y <= y1; y++) for (const [k, v] of greekHolidays(y)) out.set(k, v);
    return out;
  }

  // ------------------------------------------------------------------ LQ
  const bed = (n, d, ab) => n * d * (1 + d / ab);
  const eqd2FromBed = (b, ab) => b / (1 + 2 / ab);
  const eqd2 = (n, d, ab) => eqd2FromBed(bed(n, d, ab), ab);
  const kFromDprolif = (dp, ab) => dp * (1 + 2 / ab);
  const dprolifFromK = (k, ab) => k / (1 + 2 / ab);
  const repairFactor = (h, half) => Math.exp(-Math.LN2 * h / half);
  function solveQuadratic(a, b, target) {
    if (target <= 0) return 0;
    if (Math.abs(b) < 1e-15) { if (a <= 0) throw new Error('no dose dependence'); return target / a; }
    const disc = a * a + 4 * b * target;
    if (disc < 0) throw new Error('no real solution');
    return (-a + Math.sqrt(disc)) / (2 * b);
  }

  // ------------------------------------------------------------------ tissues
  // {name, ab, ratio:number|number[], dprolif, tk:null|number, repairH:null|number, maxEqd2:null|number}
  function mkTissue(o) {
    return { name: o.name, ab: +o.ab, ratio: o.ratio == null ? 1 : o.ratio, dprolif: o.dprolif || 0,
      tk: o.tk == null ? null : +o.tk, repairH: o.repairH || null, maxEqd2: o.maxEqd2 == null ? null : +o.maxEqd2, brachyRatio: o.brachyRatio == null ? 1 : +o.brachyRatio, lql: o.lql || null };
  }
  /** Quadratic dose term of one fraction: d² (LQ); above the transition dose dT the LQ-L tangent, 2·dT·d − dT² (Astrahan 2008). */
  const quadTerm = (d, dt) => (dt == null || d <= dt) ? d * d : 2 * dt * d - dt * dt;
  const lqlDt = (t) => (t.lql ? t.lql * t.ab : null);
  const bedFraction = (t, d) => d + quadTerm(d, lqlDt(t)) / t.ab;
  const tRatio = (t, ph) => Array.isArray(t.ratio) ? +t.ratio[Math.min(ph, t.ratio.length - 1)] : +t.ratio;
  const hasTime = (t) => t.dprolif > 0 && t.tk != null;
  const overallTime = (fx) => { if (!fx.length) return 0; let a = Infinity, b = -Infinity; for (const f of fx) { if (f.day < a) a = f.day; if (f.day > b) b = f.day; } return b - a; };
  function groupByDay(fx) {
    const m = new Map();
    for (const f of fx) { if (!m.has(f.day)) m.set(f.day, []); m.get(f.day).push(f); }
    for (const v of m.values()) v.sort((x, y) => x.slot - y.slot);
    return m;
  }
  function tissueBed(t, fx, bidH) {
    const theta = t.repairH ? repairFactor(bidH, t.repairH) : null;
    let total = 0;
    for (const day of groupByDay(fx).values()) {
      const ds = day.map((f) => f.dose * tRatio(t, f.phase));
      let lin = 0, quad = 0; const dt = lqlDt(t);
      for (const d of ds) { lin += d; quad += quadTerm(d, dt); }
      if (theta != null && ds.length > 1) {
        const cap = dt == null ? ds : ds.map((d) => Math.min(d, dt));
        for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) quad += 2 * cap[i] * cap[j] * Math.pow(theta, j - i);
      }
      total += lin + quad / t.ab;
    }
    if (hasTime(t)) {
      const own = fx.filter((f) => f.dose * tRatio(t, f.phase) > 0);
      total -= kFromDprolif(t.dprolif, t.ab) * Math.max(0, overallTime(own) - t.tk);
    }
    return total;
  }
  const tissueEqd2 = (t, fx, bidH) => eqd2FromBed(tissueBed(t, fx, bidH), t.ab);
  const tissueBedNoTime = (t, fx, bidH) => tissueBed(Object.assign({}, t, { dprolif: 0 }), fx, bidH);

  // ------------------------------------------------------------------ rules / constraints
  const CATEGORY_DEFAULTS = { 1: [0, 2], 2: [2, 5], 3: [7, 7] };
  function mkRules(r) {
    const o = Object.assign({ category: null, ideal: null, max: null, maxOTT: null, noAccel: false, siteId: null, notes: [], sources: [], gapCause: null,
      guidance: 'rcr2019', noDoseComp: false, targetOTT: null, edRules: [] }, r || {});
    if (CATEGORY_DEFAULTS[o.category]) {
      if (o.ideal == null) o.ideal = CATEGORY_DEFAULTS[o.category][0];
      if (o.max == null) o.max = CATEGORY_DEFAULTS[o.category][1];
    }
    if (o.max != null && o.ideal == null) o.ideal = 0;
    return o;
  }
  const CONSTRAINT_DEFAULTS = {
    allow_saturday: true, allow_sunday: true, allow_bid: true, bid_interval_h: 6, bid_max_dose: 2.2,
    allow_consecutive_bid: true, avoid_consecutive_bid: true, allow_dose_change: true, max_dose_per_fraction: null,
    allow_extra_fractions: true, max_extra_fractions: 15, max_fractions_per_week: null, chemo_dates: [], chemo_daily: false,
    dose_rounding: 0.01, max_weekly_increase_pct: null, max_tumour_deficit_pct: null, max_late_increase_pct: null,
  };
  function mkConstraints(c) {
    const o = Object.assign({}, CONSTRAINT_DEFAULTS);
    for (const k of Object.keys(c || {})) {
      if (!(k in CONSTRAINT_DEFAULTS)) throw new Error('unknown constraint: ' + k);
      if (c[k] !== undefined) o[k] = c[k];
    }
    o.chemo_dates = (o.chemo_dates || []).map(parseDate);
    return o;
  }

  // ------------------------------------------------------------------ prescription
  function mkRx(o) {
    let phases = o.phases;
    if (!phases) {
      if (!(o.n_fractions >= 1)) throw new Error('n_fractions must be >= 1');
      if (!(o.dose_per_fraction > 0)) throw new Error('dose_per_fraction must be > 0');
      phases = [{ n: Math.round(o.n_fractions), levels: { PTV: +o.dose_per_fraction }, name: '' }];
    }
    phases = phases.map((p) => {
      const n = Math.round(p.n != null ? p.n : p.n_fractions), levels = {};
      for (const k of Object.keys(p.levels || {})) levels[k] = +p.levels[k];
      const vals = Object.values(levels);
      if (!(n >= 1)) throw new Error('each phase needs n_fractions >= 1');
      if (!vals.length || Math.max(...vals) <= 0) throw new Error('each phase needs a dose level with d > 0');
      if (vals.some((v) => v < 0)) throw new Error('dose per fraction cannot be negative');
      return { n, levels, name: p.name || '' };
    });
    const rx = { start: parseDate(o.start), phases, weekdays: o.weekdays || [0, 1, 2, 3, 4], closed: new Set(o.closed || []), holidayNames: o.holidayNames || new Map() };
    rx.levelNames = [];
    for (const p of phases) for (const k of Object.keys(p.levels)) if (!rx.levelNames.includes(k)) rx.levelNames.push(k);
    rx.totalLevel = (lv) => phases.reduce((s, p) => s + p.n * (p.levels[lv] || 0), 0);
    rx.primary = o.primary_level || rx.levelNames.reduce((best, k) => (rx.totalLevel(k) > rx.totalLevel(best) ? k : best), rx.levelNames[0]);
    if (!rx.levelNames.includes(rx.primary)) throw new Error('primary level not found: ' + rx.primary);
    rx.n = phases.reduce((s, p) => s + p.n, 0);
    rx.levelDose = (lv, ph) => +(phases[ph].levels[lv] || 0);
    rx.refDose = (ph) => { const d = phases[ph].levels[rx.primary] || 0; return d > 0 ? d : Math.max(...Object.values(phases[ph].levels)); };
    rx.levelRatios = (lv) => phases.map((_, i) => rx.levelDose(lv, i) / rx.refDose(i));
    rx.multilevel = phases.length > 1 || rx.levelNames.length > 1;
    rx.phaseOf = (idx) => { let n = 0; for (let i = 0; i < phases.length; i++) { n += phases[i].n; if (idx < n) return i; } return phases.length - 1; };
    rx.isTreatmentDay = (d) => rx.weekdays.includes(weekday(d)) && !rx.closed.has(d);
    rx.planned = () => {
      const out = []; let d = rx.start;
      for (let g = 0; g < 3660 && out.length < rx.n; g++, d++)
        if (rx.isTreatmentDay(d)) { const ph = rx.phaseOf(out.length); out.push({ day: d, slot: 0, dose: rx.refDose(ph), phase: ph }); }
      if (out.length < rx.n) throw new Error('could not build planned schedule');
      return out;
    };
    rx.totalDose = rx.totalLevel(rx.primary);
    return rx;
  }

  // ------------------------------------------------------------------ planner
  const fxSort = (a, b) => a.day - b.day || a.slot - b.slot;
  function mkPlanner(a) {
    const p = { rx: a.rx, oars: a.oars.slice(), c: a.c || mkConstraints({}), rules: a.rules || mkRules({}), inputWarnings: [], _init: a };
    const rx = p.rx;
    if (Array.isArray(a.tumours)) p.tumours = a.tumours.slice();
    else if (rx.multilevel) {
      const order = [rx.primary].concat(rx.levelNames.filter((n) => n !== rx.primary));
      p.tumours = order.map((n) => Object.assign({}, a.tumour, { name: n, ratio: rx.levelRatios(n) }));
    } else p.tumours = [a.tumour];
    const nPh = rx.phases.length;
    p.fixed = (a.fixed || []).map((f) => ({ day: f.day, slot: 0, dose: +f.dose, phase: nPh })).sort(fxSort);
    if (p.fixed.length) {
      const ext = (t, extra) => (Array.isArray(t.ratio) && t.ratio.length > nPh) ? t : Object.assign({}, t, { ratio: rx.phases.map((_, i) => tRatio(t, i)).concat([extra]) });
      p.tumours = p.tumours.map((t, i) => ext(t, i === 0 ? 1 : 0));
      p.oars = p.oars.map((o) => ext(o, o.brachyRatio == null ? 1 : o.brachyRatio));
    }
    p.tumour = p.tumours[0];
    p.missed = [...new Set(a.missed || [])].sort((x, y) => x - y);
    p.planned = rx.planned();
    p.plannedEnd = p.planned[p.planned.length - 1].day;
    p.unavailable = new Set([...(a.unavailable || []), ...rx.closed]);
    p.extraDates = (a.extra || []).slice().sort((x, y) => x - y);
    const errsIn = (a.errors || []).map((e) => ({ day: e.day, slot: e.slot || 0, dose: +e.dose })).sort(fxSort);
    p.planChange = a.planChange || null;
    if (a.resume != null) p.resume = a.resume;
    else {
      const last = (p.missed.length ? [p.missed[p.missed.length - 1]] : []).concat(errsIn.map((e) => e.day), p.extraDates);
      p.resume = last.length ? Math.max(...last) + 1 : p.plannedEnd + 1;
    }
    let seq = []; for (let i = 0; i < rx.n; i++) seq.push(rx.phaseOf(i));
    p.s0 = 1;
    let pcFrom = null, pcAlloc = null, pcScale = 1;
    const HE = (code, pp) => { const e = new Error(code); e.code = code; e.p = pp || {}; return e; };
    if (a.delivered) p.delivered = a.delivered.slice().sort(fxSort);
    else {
      const ms = new Set(p.missed);
      const slots = p.planned.filter((f) => f.day < p.resume && !ms.has(f.day)).map((f) => ({ day: f.day, slot: 0 }));
      const have = new Set(slots.map((x) => x.day));
      for (const d of p.extraDates) {
        if (d >= p.resume) throw HE('e_extra_after', { d });
        if (ms.has(d)) throw HE('e_extra_missed', { d });
        const sl = have.has(d) ? 1 : 0;
        if (slots.some((x) => x.day === d && x.slot === sl)) throw HE('e_extra_three', { d });
        slots.push({ day: d, slot: sl }); have.add(d);
      }
      slots.sort(fxSort);
      if (p.planChange) {
        pcFrom = p.planChange.from; const pcN = p.planChange.n, pcD = p.planChange.d;
        if (pcFrom > p.resume) throw HE('e_pc_after');
        if (!(pcN >= 1) || !(pcD > 0)) throw HE('e_pc_bad');
        const i0 = slots.filter((x) => x.day < pcFrom).length;
        if (i0 >= rx.n) throw HE('e_pc_late');
        pcAlloc = allocatePhases(seq.slice(i0), Math.round(pcN));
        pcScale = pcD / rx.refDose(pcAlloc[0]);
        seq = seq.slice(0, i0).concat(pcAlloc);
        if (slots.length > seq.length) throw HE('e_pc_more');
      } else if (slots.length > rx.n) throw HE('e_more');
      p.delivered = slots.map((x, i) => { const ph = seq[i], sc = (pcFrom != null && x.day >= pcFrom) ? pcScale : 1; return { day: x.day, slot: x.slot, dose: sc * rx.refDose(ph), phase: ph }; });
    }
    if (p.delivered.some((f) => f.day >= p.resume)) throw new Error('delivered fractions must be before the resume date');
    p.doseErrors = [];
    for (const e of errsIn) {
      const i = p.delivered.findIndex((f) => f.day === e.day && f.slot === e.slot);
      if (i < 0) throw HE('e_err_none', { d: e.day });
      if (!(e.dose > 0)) throw HE('e_err_zero', { d: e.day });
      const f = p.delivered[i];
      if (Math.abs(e.dose - f.dose) > 1e-9) p.doseErrors.push({ day: e.day, slot: e.slot, intended: f.dose, actual: e.dose });
      p.delivered[i] = Object.assign({}, f, { dose: e.dose });
    }
    p.deliveredIntended = p.delivered.map((f) => { const e = p.doseErrors.find((x) => x.day === f.day && x.slot === f.slot); return e ? Object.assign({}, f, { dose: e.intended }) : f; });
    if (pcAlloc) {
      p.s0 = pcScale;
      p.remaining = seq.length - p.delivered.length;
      p.remainingPhases = seq.slice(p.delivered.length);
    } else {
      p.remaining = rx.n - p.delivered.length;
      if (p.remaining < 0) throw new Error('more fractions delivered than prescribed');
      p.remainingPhases = [];
      for (let i = p.delivered.length; i < rx.n; i++) p.remainingPhases.push(rx.phaseOf(i));
    }
    p.dRef = rx.refDose(p.remainingPhases.length ? p.remainingPhases[0] : 0);
    p.dCur = p.s0 * p.dRef;
    p.hasDoseError = p.doseErrors.length > 0;
    p.interruptions = interruptions(p);
    const bi = p.c.bid_interval_h;
    p.plannedCourse = p.planned.concat(p.fixed).sort(fxSort);
    p.plannedLevels = p.tumours.map((t) => tissueEqd2(t, p.plannedCourse, bi));
    p.plannedTumour = p.plannedLevels[0];
    p.plannedOars = p.oars.map((o) => tissueEqd2(o, p.plannedCourse, bi));
    p.plannedWeekly = weeklyPeak(p, p.plannedCourse);
    return p;
  }
  /** Missed planned treatment days grouped into interruptions: [first, last, number of days]. */
  function interruptions(p) {
    const given = [...new Set(p.delivered.map((f) => f.day))].sort((x, y) => x - y), planned = new Set(p.planned.map((f) => f.day)), out = [];
    for (const d of p.missed.filter((x) => planned.has(x))) {
      const last = out[out.length - 1];
      if (last && !given.some((g) => g > last[1] && g < d)) { last[1] = d; last[2]++; } else out.push([d, d, 1]);
    }
    return out;
  }
  function allocatePhases(phases, m) {
    const k = phases.length;
    if (m === k) return phases.slice();
    if (m > k) return phases.concat(Array(m - k).fill(k ? phases[k - 1] : 0));
    const order = [], counts = {};
    for (const ph of phases) { if (!(ph in counts)) { counts[ph] = 0; order.push(ph); } counts[ph]++; }
    const exact = {}, alloc = {};
    for (const ph of order) { exact[ph] = counts[ph] * m / k; alloc[ph] = Math.floor(exact[ph]); }
    const left = m - order.reduce((s2, ph) => s2 + alloc[ph], 0);
    order.slice().sort((x, y) => (exact[y] - alloc[y]) - (exact[x] - alloc[x])).slice(0, left).forEach((ph) => { alloc[ph]++; });
    const out = [];
    for (const ph of order.slice().sort((x, y) => x - y)) for (let i = 0; i < alloc[ph]; i++) out.push(ph);
    return out;
  }
  /** EQD2 (no time factor) delivered to a tissue minus what was intended, over the delivered fractions. */
  const errorEffect = (p, t) => { const bi = p.c.bid_interval_h; return eqd2FromBed(tissueBedNoTime(t, p.delivered, bi) - tissueBedNoTime(t, p.deliveredIntended, bi), t.ab); };
  /** Generalised Joiner correction (BCR eq. 9.3–9.4): linear and quadratic dose sums L, Q still to give. */
  function joinerTarget(p) {
    const rest = p.remainingPhases.map((ph) => p.s0 * p.rx.refDose(ph));
    let L = rest.reduce((a2, x) => a2 + x, 0), Q = rest.reduce((a2, x) => a2 + x * x, 0);
    for (const e of p.doseErrors) { L += e.intended - e.actual; Q += e.intended * e.intended - e.actual * e.actual; }
    return (L <= 1e-9 || Q <= 1e-12) ? null : [L, Q];
  }
  /** Largest EQD2 of the primary level (tumour α/β, no time factor) delivered within any 7 consecutive days. */
  function weeklyPeak(p, fx) {
    const t = p.tumour, per = new Map();
    for (const f of fx) { const d = f.dose * tRatio(t, f.phase); per.set(f.day, (per.get(f.day) || 0) + eqd2FromBed(bedFraction(t, d), t.ab)); }
    const days = [...per.keys()].sort((a, b) => a - b); let best = 0;
    for (let i = 0; i < days.length; i++) { let tot = 0; for (let j = i; j < days.length && days[j] - days[i] <= 6; j++) tot += per.get(days[j]); if (tot > best) best = tot; }
    return best;
  }
  const variant = (p, ch) => mkPlanner(Object.assign({}, p._init, { c: p.c, rules: p.rules }, ch));

  const isRegular = (p, d) => !p.unavailable.has(d) && p.rx.weekdays.includes(weekday(d));
  const isExtra = (p, d, sat, sun) => {
    if (p.unavailable.has(d) || p.rx.weekdays.includes(weekday(d))) return false;
    const w = weekday(d); return (w === 5 && sat) || (w === 6 && sun);
  };
  function daysFrom(p, start, n, sat, sun) {
    const out = [];
    for (let d = start, g = 0; out.length < n && g < 3660; d++, g++) if (isRegular(p, d) || isExtra(p, d, sat, sun)) out.push(d);
    return out;
  }
  const S = (day, slot) => ({ day, slot: slot || 0 });
  /** n fractions on the next treatment days; for sites without acceleration (SABR) on non-consecutive days (RCR). */
  function patternStandard(p, n) {
    if (!p.rules.noAccel) return daysFrom(p, p.resume, n).map((d) => S(d));
    const out = []; let last = p.delivered.length ? Math.max(...p.delivered.map((f) => f.day)) : null;
    for (let d = p.resume, g = 0; out.length < n && g < 3660; d++, g++) if ((isRegular(p, d) || isExtra(p, d, false, false)) && (last == null || d - last >= 2)) { out.push(S(d)); last = d; }
    return out;
  }
  function chooseBidDays(p, regular, need) {
    need = Math.min(need, regular.length);
    const chosen = [];
    if (p.c.avoid_consecutive_bid) for (const d of regular) { if (chosen.length >= need) break; if (!chosen.length || d - chosen[chosen.length - 1] > 1) chosen.push(d); }
    for (const d of regular) { if (chosen.length >= need) break; if (!chosen.includes(d)) chosen.push(d); }
    return chosen.sort((x, y) => x - y);
  }
  function patternAccelerated(p, n, sat, sun, bid) {
    const end = p.plannedEnd, window = [];
    if (p.resume <= end) for (let d = p.resume; d <= end; d++) window.push(d);
    const regular = window.filter((d) => isRegular(p, d));
    let slots = regular.map((d) => S(d));
    if (slots.length >= n) return slots.slice(0, n);
    let need = n - slots.length;
    if (sat || sun) { const extra = window.filter((d) => isExtra(p, d, sat, sun)).slice(0, need); slots = slots.concat(extra.map((d) => S(d))); need -= extra.length; }
    if (bid && need > 0) { const ch = chooseBidDays(p, regular, need); slots = slots.concat(ch.map((d) => S(d, 1))); need -= ch.length; }
    if (need > 0) {
      const start = Math.max(end + 1, p.resume);
      if (bid) {
        for (let d = start, g = 0; need > 0 && g < 3660; d++, g++) {
          if (!(isRegular(p, d) || isExtra(p, d, sat, sun))) continue;
          slots.push(S(d, 0)); need--;
          if (need > 0) { slots.push(S(d, 1)); need--; }
        }
      } else slots = slots.concat(daysFrom(p, start, need, sat, sun).map((d) => S(d)));
    }
    return slots.sort(fxSort);
  }
  function patternSameEnd(p, sat, sun) {
    if (p.resume > p.plannedEnd) return null;
    const days = [];
    for (let d = p.resume; d <= p.plannedEnd; d++) if (isRegular(p, d) || isExtra(p, d, sat, sun)) days.push(d);
    if (!days.length || days.length >= p.remaining) return null;
    return days.map((d) => S(d));
  }

  function assign(p, slots) {
    slots = slots.slice().sort(fxSort);
    const phases = allocatePhases(p.remainingPhases.length ? p.remainingPhases : [p.rx.phases.length - 1], slots.length);
    return slots.map((s, i) => ({ day: s.day, slot: s.slot, phase: phases[i], dose: p.rx.refDose(phases[i]) }));
  }
  const courseS = (p, slots, scale) => p.delivered.concat(assign(p, slots).map((f) => Object.assign({}, f, { dose: scale * f.dose })), p.fixed).sort(fxSort);
  function solveScale(p, slots, tissue, target) {
    const bi = p.c.bid_interval_h, s1 = 0.5, s2 = 1, s3 = 2;
    if (tissue.lql) {   // LQ-L: piecewise but increasing in the scale: 60 bisection steps on [0.02, 8]
      let lo = 0.02, hi = 8;
      if (tissueEqd2(tissue, courseS(p, slots, hi), bi) < target || tissueEqd2(tissue, courseS(p, slots, lo), bi) > target) throw new Error('no positive dose per fraction reaches the target');
      for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (tissueEqd2(tissue, courseS(p, slots, mid), bi) < target) lo = mid; else hi = mid; }
      return 0.5 * (lo + hi);
    }
    const f1 = tissueEqd2(tissue, courseS(p, slots, s1), bi), f2 = tissueEqd2(tissue, courseS(p, slots, s2), bi), f3 = tissueEqd2(tissue, courseS(p, slots, s3), bi);
    const b = ((f3 - f2) / (s3 - s2) - (f2 - f1) / (s2 - s1)) / (s3 - s1);
    const a = (f2 - f1) / (s2 - s1) - b * (s1 + s2);
    const c0 = f1 - a * s1 - b * s1 * s1;
    return solveQuadratic(a, b, target - c0);
  }
  const roundDose = (p, d) => { const st = p.c.dose_rounding; return st ? Math.round(Math.round(d / st) * st * 1e6) / 1e6 : d; };
  const TR = (name, e, pl, limit) => ({ name, eqd2: e, planned: pl, limit, delta: e - pl, deltaPct: pl ? 100 * (e - pl) / pl : 0 });

  function evaluate(p, key, family, t, slots, d, strategy, exact) {
    const bi = p.c.bid_interval_h, scale = d / p.dRef;
    const nw = assign(p, slots).map((f) => Object.assign({}, f, { dose: scale * f.dose }));
    const course = p.delivered.concat(nw, p.fixed).sort(fxSort), ebrt = p.delivered.concat(nw).sort(fxSort);
    const o = { key, family, t: t || {}, strategy, d, exact: exact == null ? null : exact, scale, newFx: nw.sort(fxSort), course,
      phaseCounts: {}, phaseDoses: {}, warnings: [], rejected: [], rank: 99, recommended: false };
    for (const f of nw) {
      o.phaseCounts[f.phase] = (o.phaseCounts[f.phase] || 0) + 1;
      const lv = {};
      for (const name of p.rx.levelNames) if (p.rx.levelDose(name, f.phase) > 0) lv[name] = Math.round(scale * p.rx.levelDose(name, f.phase) * 1e6) / 1e6;
      o.phaseDoses[f.phase] = lv;
    }
    o.T = overallTime(course);
    o.end = ebrt.length ? ebrt[ebrt.length - 1].day : null;
    o.ext = o.end != null ? o.end - p.plannedEnd : 0;
    const res = p.tumours.map((tt, i) => TR(tt.name, tissueEqd2(tt, course, bi), p.plannedLevels[i], tt.maxEqd2));
    o.tumour = res[0]; o.levels = res.slice(1);
    o.oars = p.oars.map((oo, i) => TR(oo.name, tissueEqd2(oo, course, bi), p.plannedOars[i], oo.maxEqd2));
    o.nNew = nw.length;
    const byDay = groupByDay(nw);
    o.bidDays = [...byDay.entries()].filter(([, v]) => v.length > 1).map(([k]) => k).sort((x, y) => x - y);
    o.nBid = o.bidDays.length;
    o.consecutiveBid = o.bidDays.some((d2, i) => i > 0 && d2 - o.bidDays[i - 1] === 1);
    o.nSat = nw.filter((f) => weekday(f.day) === 5).length;
    o.nSun = nw.filter((f) => weekday(f.day) === 6).length;
    o.burden = o.nSat + 2 * o.nSun + o.nBid;
    o.maxLevelDose = Math.max(d, ...Object.values(o.phaseDoses).flatMap((lv) => Object.values(lv)));
    if (!Object.keys(o.phaseDoses).length) o.maxLevelDose = d;
    else o.maxLevelDose = Math.max(...Object.values(o.phaseDoses).flatMap((lv) => Object.values(lv)));
    o.maxLateIncPct = o.oars.length ? Math.max(...o.oars.map((r) => r.deltaPct)) : 0;
    o.weeklyPeak = weeklyPeak(p, course); o.weeklyPlanned = p.plannedWeekly; o.weeklyInc = p.plannedWeekly ? 100 * (o.weeklyPeak / p.plannedWeekly - 1) : 0;
    return o;
  }
  function solved(p, key, family, t, slots, tissue, target, strategy) {
    let exact;
    try { exact = solveScale(p, slots, tissue, target) * p.dRef; } catch (e) { return null; }
    if (!(exact > 0)) return null;
    return evaluate(p, key, family, t, slots, roundDose(p, exact), strategy, exact);
  }
  function matches(p, key, family, t, slots) {
    const out = [];
    let o = solved(p, key + '_tumour', family, Object.assign({}, t, { match: 'tumour' }), slots, p.tumour, p.plannedTumour, 'match_tumour');
    if (o) out.push(o);
    if (p.oars.length) {
      o = solved(p, key + '_late', family, Object.assign({}, t, { match: 'late', lateName: p.oars[0].name }), slots, p.oars[0], p.plannedOars[0], 'match_late');
      if (o) out.push(o);
    }
    return out;
  }
  /** Joiner correction of the remaining fractions: n = L²/Q rounded up (Joiner) and, if different, to the
   *  nearest integer; d = L/n; regular calendar, then weekend days and/or BID if that overruns (RCR order). */
  function errorOptions(p) {
    const tg = joinerTarget(p); if (!tg) return [];
    const [L, Q] = tg, nEx = L * L / Q, nUp = Math.max(1, Math.ceil(nEx - 1e-9)), nNear = Math.max(1, Math.floor(nEx + 0.5));
    let out = [];
    const vars = [['', null], ['_sat', [true, false, false]], ['_satsun', [true, true, false]], ['_bid', [false, false, true]], ['_sat_bid', [true, false, true]], ['_satsun_bid', [true, true, true]]];
    for (const [n, stem] of [[nUp, 'err'], [nNear, 'errn']]) {
      if (stem === 'errn' && nNear === nUp) continue;
      for (const [suf, f] of vars) {
        const slots = f ? patternAccelerated(p, n, f[0], f[1], f[2]) : patternStandard(p, n);
        const ref = assign(p, slots).reduce((a2, x) => a2 + x.dose, 0), exact = L / ref * p.dRef;
        const o = evaluate(p, stem + suf, 'error', { base: 'error', n, cal: suf.slice(1), near: stem === 'errn' }, slots, roundDose(p, exact), 'joiner', exact);
        out.push(o);
        if (!f && o.ext <= 0) break;
      }
    }
    out = out.concat(matches(p, 'err_keep', 'error', { base: 'err_keep', k: p.remaining }, patternStandard(p, p.remaining)));
    return out;
  }
  const dedupe = (out) => {
    const seen = new Set(), ded = [];
    for (const o of out) {
      const sig = o.newFx.map((f) => f.day + ':' + f.slot).join(',') + '|' + o.d.toFixed(6);
      if (!seen.has(sig)) { seen.add(sig); ded.push(o); }
    }
    return ded;
  };
  function options(p) {
    if (p.remaining === 0) return [];
    const d0 = p.dCur, k = p.remaining;
    let out = [];
    const baseSlots = patternStandard(p, k);
    const base = evaluate(p, 'none', 'baseline', { base: 'none' }, baseSlots, d0, 'keep_d');
    out.push(base);
    if (p.hasDoseError) out = out.concat(errorOptions(p));
    if (base.ext <= 0) return dedupe(out);
    const short = base.tumour.delta < -0.005;
    const accel = [['sat', 'weekend', true, false, false], ['satsun', 'weekend', true, true, false], ['bid', 'bid', false, false, true],
      ['sat_bid', 'weekend_bid', true, false, true], ['satsun_bid', 'weekend_bid', true, true, true]];
    for (const [key, fam, sat, sun, bid] of accel) {
      const slots = patternAccelerated(p, k, sat, sun, bid);
      const o = evaluate(p, key, fam, { base: key }, slots, d0, 'keep_d');
      out.push(o);
      if (o.ext > 0 && o.tumour.delta < -0.005) out = out.concat(matches(p, key, 'accel_dose', { base: key, ext: o.ext, solved: true }, slots));
    }
    for (const [key, sat, sun] of [['same_end', false, false], ['same_end_sat', true, false], ['same_end_satsun', true, true]]) {
      const slots = patternSameEnd(p, sat, sun);
      if (slots) out = out.concat(matches(p, key, 'same_end', { base: key, n: slots.length, k }, slots));
    }
    if (short) {
      out = out.concat(matches(p, 'extended', 'extended', { base: 'extended', ext: base.ext, k }, baseSlots));
      let best = null, hit = null;
      for (let extra = 1; extra <= p.c.max_extra_fractions; extra++) {
        const o = evaluate(p, 'extra', 'extra', { base: 'extra', extra }, patternStandard(p, k + extra), d0, 'keep_d');
        o.t.ext = o.ext; o.t.d = d0;
        if (!best || o.tumour.eqd2 > best.tumour.eqd2) best = o;
        if (o.tumour.eqd2 >= p.plannedTumour - 1e-9) { hit = o; break; }
      }
      if (hit) out.push(hit);
      else if (best) { best.warnings.push({ code: 'w_extra_insufficient', p: {}, refs: ['BCR'] }); out.push(best); }
    }
    return dedupe(out);
  }

  // ------------------------------------------------------------------ decision
  const ACUTE_WARN_PCT = 10;
  const FAMILY_RANK = { error: 0, weekend: 1, bid: 2, weekend_bid: 3, accel_dose: 4, same_end: 5, extended: 6, extra: 7, custom: 8 };
  const SAME_D = ['weekend', 'bid', 'weekend_bid'], DOSE_CHANGE = ['accel_dose', 'same_end', 'extended', 'extra', 'custom'];
  function rejectionReasons(p, o) {
    const c = p.c, r = p.rules, d = o.maxLevelDose, why = [];
    const R = (code, pp, refs) => why.push({ code, p: pp || {}, refs: refs || [] });
    if (o.nSat && !c.allow_saturday) R('x_sat');
    if (o.nSun && !c.allow_sunday) R('x_sun');
    if (o.nBid) {
      if (!c.allow_bid) R('x_bid');
      if (d > c.bid_max_dose + 1e-9) R('x_bid_dose', { d, max: c.bid_max_dose }, ['RCR19']);
      if (c.chemo_dates.length) {
        const cs = new Set(c.chemo_dates);
        const clash = o.bidDays.some((x) => cs.has(x));
        if (clash && r.guidance === 'rcr5_draft' && (!c.chemo_daily || d > 1.5)) R('x_bid_chemo', {}, ['RCR5d']);
        else if (clash && r.guidance !== 'rcr5_draft') R('x_bid_chemo19', {}, ['RCR19']);
      }
      if (!c.allow_consecutive_bid && o.consecutiveBid) R('x_bid_consec');
    }
    if (Math.abs(o.scale - p.s0) > 1e-9 && !c.allow_dose_change) R('x_dose_change');
    if (o.family === 'extra' && !c.allow_extra_fractions) R('x_extra');
    if (c.max_dose_per_fraction != null && d > c.max_dose_per_fraction + 1e-9) R('x_max_d', { d, max: c.max_dose_per_fraction });
    if (c.max_fractions_per_week != null) {
      const weeks = {};
      for (const f of o.course) { const w = Math.floor((f.day + 3) / 7); weeks[w] = (weeks[w] || 0) + 1; }
      const worst = Math.max(0, ...Object.values(weeks));
      if (worst > c.max_fractions_per_week) R('x_week', { n: worst, max: c.max_fractions_per_week });
    }
    if (c.max_weekly_increase_pct != null && o.weeklyInc > c.max_weekly_increase_pct + 1e-9) R('x_weekly', { inc: o.weeklyInc, max: c.max_weekly_increase_pct });
    if (r.maxOTT != null && o.T > r.maxOTT) R('x_ott', { T: o.T, max: r.maxOTT }, ['RCR19']);
    if (r.noDoseComp && o.family !== 'error' && (Math.abs(o.scale - p.s0) > 1e-9 || o.family === 'extra')) R('x_no_dose_comp', {}, ['RCR5d']);
    if (r.noAccel && o.family !== 'baseline') R('x_noaccel', {}, ['RCR19', 'RCR5d']);
    for (const t of o.oars.concat([o.tumour])) if (t.limit != null && t.eqd2 > t.limit + 1e-9) R('x_limit', { name: t.name, eqd2: t.eqd2, limit: t.limit });
    return why;
  }
  function warningsFor(p, o) {
    const w = [], d = o.maxLevelDose;
    if (o.nBid) {
      if (o.consecutiveBid) w.push({ code: 'w_bid_consec', p: {}, refs: ['RCR19', 'THAMES'] });
      if (!p.oars.some((t) => t.repairH)) w.push({ code: 'w_bid_repair', p: { h: p.c.bid_interval_h }, refs: ['RCR5d', 'THAMES'] });
    }
    if (d >= 6 && !p.tumour.lql) w.push({ code: 'w_large_d', p: {}, refs: ['BCR'] });
    if (o.family === 'error' && o.strategy === 'joiner' && p.tumour.lql) w.push({ code: 'w_joiner_lql', p: {}, refs: ['JOINER', 'ASTRAHAN'] });
    else if (o.scale > 1.25) w.push({ code: 'w_scale', p: { pct: 100 * (o.scale - 1) }, refs: ['RCR19'] });
    if (Math.abs(o.scale - p.s0) > 1e-9) w.push({ code: 'w_replan', p: {}, refs: [] });
    if (p.hasDoseError && (SAME_D.includes(o.family) || o.family === 'baseline')) w.push({ code: 'w_err_uncorrected', p: {}, refs: [] });
    if (o.family === 'error' && p.rx.multilevel) w.push({ code: 'w_joiner_multi', p: {}, refs: ['JOINER'] });
    if (o.weeklyInc > ACUTE_WARN_PCT) w.push({ code: 'w_weekly', p: { peak: o.weeklyPeak, inc: o.weeklyInc }, refs: [] });
    if (p.rules.gapCause === 'toxicity' && o.family !== 'baseline') w.push({ code: 'w_tox', p: {}, refs: [] });
    const tg = p.rules.targetOTT;
    if (tg != null && o.T > tg) w.push({ code: 'w_ott_target', p: { T: o.T, tg }, refs: ['RCR5d'] });
    const mx = p.rules.max;
    if (mx != null && o.ext > mx) w.push({ code: 'w_over_allowance', p: { ext: o.ext, max: mx, cat: p.rules.category }, refs: ['RCR19'] });
    return w;
  }
  const cmpKey = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
  const sortKey = (o) => [o.rank, o.strategy !== 'match_tumour' ? 1 : 0, o.burden, o.ext, o.nNew];

  function decide(p, opts) {
    opts = opts || options(p);
    if (p.remaining === 0 || !opts.length) return { status: 'no_gap', head: { code: 'h_no_gap', p: {} }, recommended: null, trace: [], feasible: [], rejected: [], candidates: [] };
    for (const o of opts) {
      const have = new Set(o.warnings.map((x) => x.code));
      o.warnings = o.warnings.concat(warningsFor(p, o).filter((x) => !have.has(x.code)));
      o.rejected = rejectionReasons(p, o);
      const mx0 = p.rules.max;
      o.rank = o.family === 'baseline' ? ((mx0 != null && o.ext <= mx0) ? 0 : 9) : (o.family in FAMILY_RANK ? FAMILY_RANK[o.family] : 8);
      o.recommended = false;
    }
    const byKey = (a, b) => cmpKey(sortKey(a), sortKey(b));
    const feasible = opts.filter((o) => !o.rejected.length).sort(byKey);
    const rejected = opts.filter((o) => o.rejected.length).sort(byKey);
    const r = p.rules, c = p.c;
    const ideal = r.ideal != null ? r.ideal : 0, mx = r.max != null ? r.max : 0;
    const tolT = c.max_tumour_deficit_pct, tolL = c.max_late_increase_pct;
    const base = opts.find((o) => o.family === 'baseline');
    const trace = [];
    const TRC = (code, pp, refs) => trace.push({ code, p: pp || {}, refs: refs || [] });
    if (p.tumour.lql) TRC('t_lql', { f: p.tumour.lql }, ['ASTRAHAN']);
    TRC(r.guidance === 'rcr5_draft' ? 't_guid5' : 't_guid19', {}, [r.guidance === 'rcr5_draft' ? 'RCR5d' : 'RCR19']);
    for (const k of r.edRules) TRC('t_ed_' + k, {}, ['RCR5d']);
    if (r.category == null && r.max == null) TRC('t_nocat');
    TRC('t_rules', { cat: r.category, ideal, max: mx, ott: r.maxOTT }, r.category ? ['RCR19'] : []);
    TRC('t_base', { end: base.end, ext: base.ext, d: base.tumour.delta, pct: base.tumour.deltaPct }, ['BCR']);
    const done = (status, head, opt, cands) => { if (opt) opt.recommended = true; return { status, head, recommended: opt || null, trace, feasible, rejected, candidates: cands || [] }; };
    const autoDose = tolT != null && tolL != null;
    const lateOk = (o) => tolL == null || o.maxLateIncPct <= tolL + 1e-9;
    const meets = (o) => (-o.tumour.deltaPct <= tolT + 1e-9) && (o.maxLateIncPct <= tolL + 1e-9);
    const H = (o) => ({ code: 'h_option', p: { o } });
    if (r.gapCause === 'machine') TRC('t_transfer', {}, ['RCR19']);
    if (!hasTime(p.tumour) && base.ext > 0) TRC('t_notime', {}, ['RCR19']);

    if (p.interruptions.length > 1) TRC('t_multi', { list: p.interruptions }, ['RCR19']);
    if (p.planChange) TRC('t_plan_change', { from: p.planChange.from, n: p.planChange.n, d: p.planChange.d }, []);
    if (p.hasDoseError) {
      const res = decideError(p, opts, feasible, rejected, ideal, mx, TRC, done);
      if (res) return res;
    }
    if (r.noAccel) {
      TRC('t_noaccel', {}, ['RCR19', 'RCR5d']);
      if (!base.rejected.length) return done('no_action', { code: 'h_noaccel', p: {} }, base);
      return done('clinical_decision', { code: 'h_all_excluded', p: {} }, null, feasible.slice(0, 3));
    }
    if (!base.rejected.length && base.ext <= ideal) { TRC('t_s1_ok', { ext: base.ext, ideal }, ['RCR19']); return done('no_action', { code: 'h_none', p: {} }, base); }
    TRC('t_s1', { ext: base.ext, ideal }, ['RCR19']);
    if (r.gapCause === 'toxicity') {
      TRC('t_tox', {}, []);
      if (!base.rejected.length && base.ext <= mx) { TRC('t_s3', { ext: base.ext, max: mx }, ['RCR19']); return done('no_action', { code: 'h_none_within', p: { ext: base.ext } }, base); }
      return done('clinical_decision', { code: 'h_tox', p: {} }, null, feasible.filter((o) => o.family !== 'baseline').slice(0, 3));
    }
    const sameD = feasible.filter((o) => SAME_D.includes(o.family));
    const exSameD = rejected.filter((o) => SAME_D.includes(o.family));
    let pick = sameD.find((o) => o.ext <= ideal && lateOk(o));
    if (pick) { TRC('t_s2', { o: pick }, ['RCR19']); return done('recommended', H(pick), pick); }
    if (exSameD.length) {
      const seenR = new Map();
      for (const o of exSameD) for (const w of o.rejected) if (!seenR.has(w.code)) seenR.set(w.code, w);
      TRC('t_s2_excl', { reasons: [...seenR.values()] }, ['RCR19']);
    } else TRC('t_s2_none', {}, ['RCR19']);
    if (!base.rejected.length && base.ext <= mx) { TRC('t_s3', { ext: base.ext, max: mx }, ['RCR19']); return done('no_action', { code: 'h_none_within', p: { ext: base.ext } }, base); }
    pick = sameD.find((o) => o.ext <= mx && lateOk(o));
    if (pick) { TRC('t_s4', { o: pick, max: mx }, ['RCR19']); return done('recommended', H(pick), pick); }
    TRC('t_s34', { max: mx }, ['RCR19']);
    if (r.noDoseComp) {
      TRC('t_no_dose_comp', {}, ['RCR5d']);
      if (!base.rejected.length) return done('no_action', { code: 'h_no_dose_comp', p: {} }, base);
      return done('clinical_decision', { code: 'h_all_excluded', p: {} }, null, feasible.slice(0, 3));
    }
    const doseOpts = feasible.filter((o) => DOSE_CHANGE.includes(o.family));
    const within = doseOpts.filter((o) => o.ext <= mx), beyond = doseOpts.filter((o) => o.ext > mx);
    const all = within.concat(beyond);
    const tradeoff = () => { const cs = []; for (const pred of [(o) => o.strategy === 'match_tumour', (o) => o.strategy === 'match_late', (o) => o.family === 'extra']) { const o = all.find((x) => pred(x) && !cs.includes(x)); if (o) cs.push(o); } return cs; };
    if (!autoDose) { TRC('t_s5_off', {}, ['RCR19']); return done('clinical_decision', { code: 'h_dose_decision', p: {} }, null, tradeoff()); }
    pick = all.find(meets);
    if (pick) { TRC('t_s5', { o: pick, tolT, tolL }, ['RCR19', 'BCR']); return done('recommended', H(pick), pick); }
    TRC('t_s5_none', { tolT, tolL }, ['RCR19']);
    return done('clinical_decision', { code: 'h_clinical', p: {} }, null, tradeoff());
  }

  function decideError(p, opts, feasible, rejected, ideal, mx, TRC, done) {
    const errs = p.doseErrors, dphys = errs.reduce((a2, e) => a2 + e.actual - e.intended, 0);
    TRC('t_err', { n: errs.length, dphys, tname: p.rx.multilevel ? p.tumour.name : null, t: errorEffect(p, p.tumour), lname: p.oars.length ? p.oars[0].name : null, l: p.oars.length ? errorEffect(p, p.oars[0]) : null }, ['JOINER', 'BCR']);
    const errAll = opts.filter((o) => o.family === 'error');
    if (!joinerTarget(p)) { TRC('t_err_over', {}, ['JOINER']); return done('clinical_decision', { code: 'h_err_over', p: {} }, null, feasible.slice(0, 3)); }
    if (!errAll.length) { TRC('t_err_small', {}, ['JOINER']); return null; }
    if (p.rules.noAccel) { TRC('t_err_sabr', {}, ['RCR19']); return done('clinical_decision', { code: 'h_err_sabr', p: {} }, null, feasible.filter((o) => o.family === 'error').slice(0, 3)); }
    const k3 = (o) => [o.burden, Math.max(0, o.ext), o.key.indexOf('errn') === 0 ? 1 : 0];
    let ok = feasible.filter((o) => o.family === 'error' && o.strategy === 'joiner').sort((a2, b2) => cmpKey(k3(a2), k3(b2)));
    if (p.rules.gapCause === 'toxicity') ok = ok.filter((o) => !(o.nSat + o.nSun) && !o.nBid);
    let pick = ok.find((o) => o.ext <= ideal);
    if (pick) { TRC('t_err_pick', { o: pick, ideal }, ['JOINER', 'BCR']); return done('recommended', { code: 'h_option', p: { o: pick } }, pick); }
    pick = ok.find((o) => o.ext <= mx);
    if (pick) { TRC('t_err_pick_max', { o: pick, max: mx }, ['JOINER', 'RCR19']); return done('recommended', { code: 'h_option', p: { o: pick } }, pick); }
    const excl = rejected.filter((o) => o.family === 'error' && o.strategy === 'joiner');
    if (excl.length) { const seenR = new Map(); for (const o of excl) for (const w of o.rejected) if (!seenR.has(w.code)) seenR.set(w.code, w); TRC('t_err_excl', { reasons: [...seenR.values()] }, ['JOINER']); }
    else TRC('t_err_none', { max: mx }, ['JOINER']);
    const pool = feasible.filter((o) => DOSE_CHANGE.includes(o.family) || (o.family === 'error' && o.strategy !== 'joiner'));
    const cs = ok.slice(0, 1);
    for (const pred of [(o) => o.strategy === 'match_tumour', (o) => o.strategy === 'match_late', (o) => o.family === 'extra']) { const o = pool.find((x) => pred(x) && !cs.includes(x)); if (o) cs.push(o); }
    return done('clinical_decision', { code: 'h_err_clinical', p: {} }, null, cs.slice(0, 3));
  }

  // ------------------------------------------------------------------ analysis
  const DEFAULT_GRID = { tumour_alpha_beta: [0.6, 1.0, 1.6], repopulation: [0.67, 1.0, 1.33], kickoff_shift_days: [-7, 0, 7], late_alpha_beta: [0.67, 1.0, 1.33] };
  function sensitivity(p, dec, grid) {
    if (p.remaining === 0) return null;
    const g = Object.assign({}, DEFAULT_GRID, grid || {});
    if (!hasTime(p.tumour)) { g.repopulation = [1]; g.kickoff_shift_days = [0]; }
    const chosen = dec.recommended || dec.candidates[0] || dec.feasible[0];
    if (!chosen) return null;
    const tD = [], tP = [], oD = {}, oP = {}, counts = new Map(), dR = new Map();
    for (const o of p.oars) { oD[o.name] = []; oP[o.name] = []; }
    let same = 0, n = 0, worst = null, worstV = 1e9;
    for (const fab of g.tumour_alpha_beta) for (const frep of g.repopulation) for (const sh of g.kickoff_shift_days) for (const fl of g.late_alpha_beta) {
      n++;
      const tumours = p.tumours.map((t) => Object.assign({}, t, { ab: t.ab * fab, dprolif: t.dprolif * frep, tk: t.tk == null ? null : Math.max(0, t.tk + sh) }));
      const oars = p.oars.map((o) => Object.assign({}, o, { ab: o.ab * fl }));
      const q = variant(p, { tumours, oars });
      const fixed = evaluate(q, chosen.key, chosen.family, chosen.t, chosen.newFx, chosen.d, chosen.strategy);
      tD.push(fixed.tumour.delta); tP.push(fixed.tumour.deltaPct);
      if (fixed.tumour.delta < worstV) { worstV = fixed.tumour.delta; worst = { ab: tumours[0].ab, dprolif: tumours[0].dprolif, tk: tumours[0].tk, fl }; }
      for (const r of fixed.oars) { oD[r.name].push(r.delta); oP[r.name].push(r.deltaPct); }
      const dq = decide(q), rec = dq.recommended, label = rec ? rec.key : '__clinical';
      if (!counts.has(label)) { counts.set(label, { o: rec, count: 0 }); dR.set(label, []); }
      counts.get(label).count++;
      if (rec) dR.get(label).push(rec.d);
      if ((rec ? rec.key : null) === (dec.recommended ? chosen.key : null)) same++;
    }
    const rng = (a) => a.length ? [Math.min(...a), Math.max(...a)] : [0, 0];
    const oarR = {}, oarP = {};
    for (const k of Object.keys(oD)) { oarR[k] = rng(oD[k]); oarP[k] = rng(oP[k]); }
    return { n, grid: g, option: chosen, tumourRange: rng(tD), tumourPctRange: rng(tP), oarRanges: oarR, oarPctRanges: oarP,
      decisions: [...counts.entries()].sort((a, b) => b[1].count - a[1].count).map(([k, v]) => ({ o: v.o, count: v.count, dRange: rng(dR.get(k)) })),
      sameFraction: same / n, worst };
  }
  /* Probabilistic analysis: the radiobiological parameters are drawn from distributions centred on the
     entered values (log-normal factors for α/β and repopulation, a normal shift for T_k) and every schedule
     is re-evaluated, as it stands, for each draw. The widths are this tool's assumptions, not guidance values. */
  const MC_SD = { tumour_alpha_beta: 0.30, repopulation: 0.30, kickoff_days: 5, late_alpha_beta: 0.25 };
  function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function monteCarlo(p, opts, n, seed, spread) {
    if (!p.remaining || !opts.length) return null;
    n = n || 1000; spread = spread == null ? 1 : spread;
    const u = rng32(seed == null ? 20261116 : seed);
    const gauss = () => { let x = 0; while (x === 0) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); };
    const time = hasTime(p.tumour), sd = MC_SD;
    const res = opts.map((o) => ({ o, tumour: new Float64Array(n), tumourPct: new Float64Array(n), late: new Float64Array(n) }));
    for (let i = 0; i < n; i++) {
      const fab = Math.exp(spread * sd.tumour_alpha_beta * gauss()), frep = time ? Math.exp(spread * sd.repopulation * gauss()) : 1,
        sh = time ? spread * sd.kickoff_days * gauss() : 0, fl = Math.exp(spread * sd.late_alpha_beta * gauss());
      const tumours = p.tumours.map((t) => Object.assign({}, t, { ab: t.ab * fab, dprolif: t.dprolif * frep, tk: t.tk == null ? null : Math.max(0, t.tk + sh) }));
      const oars = p.oars.map((o) => Object.assign({}, o, { ab: o.ab * fl }));
      const q = variant(p, { tumours, oars });
      res.forEach((r) => { const e = evaluate(q, r.o.key, r.o.family, r.o.t, r.o.newFx, r.o.d, r.o.strategy); r.tumour[i] = e.tumour.delta; r.tumourPct[i] = e.tumour.deltaPct; r.late[i] = e.oars.length ? e.maxLateIncPct : 0; });
    }
    const qt = (a, f) => { const s2 = Float64Array.from(a).sort(), x = f * (s2.length - 1), k = Math.floor(x); return s2[k] + (x - k) * ((s2[Math.min(k + 1, s2.length - 1)]) - s2[k]); };
    for (const r of res) { r.tq = [qt(r.tumour, 0.05), qt(r.tumour, 0.5), qt(r.tumour, 0.95)]; r.tpq = [qt(r.tumourPct, 0.05), qt(r.tumourPct, 0.5), qt(r.tumourPct, 0.95)]; r.lq = [qt(r.late, 0.05), qt(r.late, 0.5), qt(r.late, 0.95)]; }
    return { n, spread, sd, time, hasOar: p.oars.length > 0, res };
  }
  function candidateResumeDates(p, outageStart, days) {
    const out = [];
    for (let i = 1; i <= days; i++) if (isRegular(p, outageStart + i)) out.push(outageStart + i);
    return out;
  }
  const currentOutageStart = (p) => p.interruptions.length ? p.interruptions[p.interruptions.length - 1][0] : (p.missed.length ? p.missed[0] : null);
  function resumeScenarios(p, outageStart, dates) {
    const earlier = p.missed.filter((d) => d < outageStart), I0 = p._init;
    const extra = (I0.extra || []).filter((d) => d < outageStart), errors = (I0.errors || []).filter((e) => e.day < outageStart);
    const pc = I0.planChange && I0.planChange.from <= outageStart ? I0.planChange : null;
    return dates.slice().sort((a, b) => a - b).map((r) => {
      const missed = p.planned.filter((f) => f.day >= outageStart && f.day < r).map((f) => f.day);
      const q = variant(p, { missed: earlier.concat(missed), resume: r, delivered: null, extra, errors, planChange: pc });
      const dec = decide(q);
      const base = q.remaining ? dec.feasible.concat(dec.rejected).find((o) => o.family === 'baseline') : null;
      return { resume: r, nMissed: missed.length, baseExt: base ? base.ext : 0, baseDelta: base ? base.tumour.delta : 0, status: dec.status, head: dec.head, option: dec.recommended };
    });
  }
  /** Cumulative time-corrected tumour EQD2 (primary level) day by day: the signature chart. */
  function timeline(p, course, tissue) {
    const t = tissue || p.tumour, bi = p.c.bid_interval_h;
    if (!course.length) return [];
    const pts = [], start = course[0].day, end = course[course.length - 1].day;
    for (let d = start; d <= end; d++) {
      const fx = course.filter((f) => f.day <= d);
      const noTime = Object.assign({}, t, { dprolif: 0 });
      let b = tissueBed(noTime, fx, bi);
      if (hasTime(t)) b -= kFromDprolif(t.dprolif, t.ab) * Math.max(0, d - start - t.tk);
      pts.push({ day: d, y: eqd2FromBed(b, t.ab) });
    }
    return pts;
  }

  /** Hand-check worksheet: the BED of a course for one tissue, as a short list of terms a second
   *  physicist can verify with a calculator. Returns null if the grouping does not reproduce the engine. */
  function worksheet(p, course, t) {
    const bi = p.c.bid_interval_h, theta = t.repairH ? repairFactor(bi, t.repairH) : 0, groups = new Map();
    for (const day of groupByDay(course).values()) {
      const ds = day.map((f) => f.dose * tRatio(t, f.phase)).filter((d) => d > 0);
      if (!ds.length) continue;
      const same = ds.every((d) => Math.abs(d - ds[0]) < 1e-9), key = same ? ds[0].toFixed(6) + 'x' + ds.length : ds.map((d) => d.toFixed(6)).join('+');
      if (!groups.has(key)) groups.set(key, { n: 0, d: ds[0], m: ds.length, mixed: !same, ds });
      groups.get(key).n++;
    }
    const terms = [];
    for (const gq of groups.values()) {
      let lin = 0, quad = 0; const dt = lqlDt(t), cap = dt == null ? gq.ds : gq.ds.map((d) => Math.min(d, dt));
      for (const d of gq.ds) { lin += d; quad += quadTerm(d, dt); }
      if (gq.m > 1 && theta) for (let i = 0; i < gq.ds.length; i++) for (let j = i + 1; j < gq.ds.length; j++) quad += 2 * cap[i] * cap[j] * Math.pow(theta, j - i);
      terms.push({ n: gq.n, d: gq.d, m: gq.m, mixed: gq.mixed, theta: gq.m > 1 ? theta : 0, bed: gq.n * (lin + quad / t.ab), lql: dt != null && gq.ds.some((d) => d > dt) });
    }
    terms.sort((a, b) => b.n - a.n);
    const noTime = terms.reduce((s, x) => s + x.bed, 0);
    const own = course.filter((f) => f.dose * tRatio(t, f.phase) > 0), T = overallTime(own);
    const K = hasTime(t) ? kFromDprolif(t.dprolif, t.ab) : 0, loss = hasTime(t) ? K * Math.max(0, T - t.tk) : 0;
    const total = noTime - loss;
    if (Math.abs(total - tissueBed(t, course, bi)) > 1e-6) return null;
    return { terms, noTime, T, K, tk: t.tk, loss, bed: total, eqd2: eqd2FromBed(total, t.ab), ab: t.ab, theta, bidH: bi, dt: lqlDt(t) };
  }

  /** Built-in self-test against published worked examples (runs in the browser at start-up). */
  function selfTest() {
    const out = [], MON = parseDate('2026-01-05'), day = (n) => MON + n;
    const chk = (id, src, expected, got, tol) => out.push({ id, src, expected, got, ok: Math.abs(got - expected) <= tol });
    const c0 = mkConstraints({});
    try {
      // Basic Clinical Radiobiology ch. 9
      const tHN = mkTissue({ name: 'T', ab: 10, dprolif: 0.7, tk: 21 });
      const e38 = eqd2(33, 2, 10) - 0.7 * (38 - 21), e45 = eqd2(33, 2, 10) - 0.7 * (45 - 21);
      chk('BCR Ex.4: 66 Gy/38 d ≡ … Gy/45 d', 'BCR', 70.9, 66 + (e38 - e45), 0.05);
      let p = mkPlanner({ rx: mkRx({ start: MON, n_fractions: 5, dose_per_fraction: 5 }), tumour: mkTissue({ name: 'T', ab: 10 }), oars: [mkTissue({ name: 'bowel', ab: 4 }), mkTissue({ name: 'fibrosis', ab: 1.7 })], missed: [day(2)], c: c0, rules: mkRules({}) });
      let slots = patternSameEnd(p, false, false);
      chk('BCR Ex.5: d for 2 fractions (Gy)', 'BCR', 6.7, solveScale(p, slots, p.tumour, p.plannedTumour) * p.dRef, 0.05);
      let o = evaluate(p, 't', 'custom', {}, slots, 6.7, 'custom');
      chk('BCR Ex.5: bowel EQD2 (Gy)', 'BCR', 38.9, o.oars[0].eqd2, 0.05);
      chk('BCR Ex.5: fibrosis EQD2 (Gy)', 'BCR', 48.5, o.oars[1].eqd2, 0.1);
      const j = joiner(70, 2, 8, 4);
      chk('BCR Ex.6: compensating d (Gy)', 'BCR', 1.74, j.d, 0.005);
      chk('BCR Ex.6: practical d for 36 fx (Gy)', 'BCR', 1.72, j.practical, 0.0001);
      // RCR 2019, Appendix B: 70 Gy/35 fx/46 d, K = 0.9 Gy10/day, Tdelay = 28 d
      const tum = mkTissue({ name: 'T', ab: 10, dprolif: dprolifFromK(0.9, 10), tk: 28 }), late = mkTissue({ name: 'late', ab: 3 });
      const mk = (weeks) => { const missed = []; for (const w of weeks) for (let i = 0; i < 5; i++) missed.push(day(7 * (w - 1) + i)); return mkPlanner({ rx: mkRx({ start: MON, n_fractions: 35, dose_per_fraction: 2 }), tumour: tum, oars: [late], missed, c: c0, rules: mkRules({ category: 1 }) }); };
      p = mk([]);
      chk('RCR reference: tumour BED10 (Gy)', 'RCR19', 67.8, tissueBed(tum, p.planned, 6), 0.05);
      chk('RCR reference: late BED3 (Gy)', 'RCR19', 116.7, tissueBed(late, p.planned, 6), 0.05);
      p = mk([7]); slots = patternAccelerated(p, 5, true, true, false);
      chk('RCR Ex.3: d for weekend compensation (Gy)', 'RCR19', 2.62, solveScale(p, slots, tum, p.plannedTumour) * 2, 0.005);
      chk('RCR Ex.3: late EQD2 at 2.62 Gy (Gy)', 'RCR19', 74.7, tissueEqd2(late, courseS(p, slots, 2.62 / 2), 6), 0.05);
      p = mk([6, 7]);
      const wk8 = [49, 50, 51, 52, 53].map((n) => S(day(n))), satFri = [47, 48, 49, 50, 51, 52, 53].map((n) => S(day(n)));
      chk('RCR Ex.4: 5 fx in week 8, iso-late d (Gy)', 'RCR19', 3.22, solveScale(p, wk8, late, p.plannedOars[0]) * 2, 0.005);
      chk('RCR Ex.4: 7 fx Sat–Fri, iso-late d (Gy)', 'RCR19', 2.57, solveScale(p, satFri, late, p.plannedOars[0]) * 2, 0.005);
      const bid = satFri.concat([47, 49, 51, 53].map((n) => S(day(n), 1)));
      chk('RCR Ex.4: 11 fx with BID, iso-late d (Gy)', 'RCR19', 1.87, solveScale(p, bid, late, p.plannedOars[0]) * 2, 0.005);
      const ext = patternStandard(p, 10), dd = solveScale(p, ext, tum, p.plannedTumour) * 2;
      chk('RCR Ex.4: extension to day 60, d (Gy)', 'RCR19', 2.85, dd, 0.005);
      chk('RCR Ex.4: late BED3 at that d (Gy)', 'RCR19', 138.9, tissueBed(late, courseS(p, ext, dd / 2), 6), 0.1);
    } catch (err) { out.push({ id: 'self-test error: ' + err.message, src: '', expected: 0, got: NaN, ok: false }); }
    return out;
  }

  const LC_LOSS_PER_DAY = [1.0, 1.4];   // % absolute local control per uncompensated day (RCR 2019)
  function lcLoss(p, o) {
    const t = p.tumour; if (!hasTime(t)) return null;
    const days = Math.max(0, -o.tumour.delta) / t.dprolif;
    return [LC_LOSS_PER_DAY[0] * days, LC_LOSS_PER_DAY[1] * days];
  }
  function recoverable(p, dec, lateTolPct) {
    const base = dec.feasible.concat(dec.rejected).find((o) => o.family === 'baseline');
    if (!base || base.tumour.delta > -0.005) return null;
    const ok = dec.feasible.filter((o) => o.maxLateIncPct <= lateTolPct + 1e-9);
    if (!ok.length) return 0;
    const best = Math.min(...ok.map((o) => Math.max(0, -o.tumour.delta)));
    return Math.max(0, Math.min(1, 1 - best / -base.tumour.delta));
  }
  /** A schedule entered by the user: n fractions of d Gy from the resume date, optionally using
   *  Saturdays, Sundays and nBid twice-daily days (first non-consecutive treatment days). */
  function customSlots(p, n, sat, sun, nBid) {
    nBid = Math.max(0, Math.min(nBid || 0, Math.floor(n / 2)));
    const days = daysFrom(p, p.resume, n - nBid, sat, sun), slots = days.map((d) => S(d));
    const bidDays = chooseBidDays(p, days.filter((d) => isRegular(p, d)), nBid);
    return slots.concat(bidDays.map((d) => S(d, 1))).sort(fxSort);
  }
  const customOption = (p, slots, d) => evaluate(p, 'custom', 'custom', { base: 'custom' }, slots, d, 'custom');

  // ------------------------------------------------------------------ Joiner error correction
  function joiner(P, pd, E, ed, rounding) {
    if (Math.min(P, pd, E, ed) <= 0) throw new Error('all doses must be > 0');
    const D = P - E;
    if (D <= 0) throw new Error('error dose reaches the planned total');
    const d = (P * pd - E * ed) / D;
    if (d <= 0) throw new Error('no positive compensating dose per fraction');
    const nExact = D / d, n = Math.max(1, Math.ceil(nExact - 1e-9)), st = rounding || 0.01;
    return { D, d, nExact, n, practical: Math.round(Math.round(D / n / st) * st * 1e6) / 1e6 };
  }

  // ------------------------------------------------------------------ case → planner (same schema as the Python package)
  let SITES = {};
  const setSites = (s) => { SITES = s; };
  const GUIDANCES = ['rcr2019', 'rcr5_draft'];
  function siteRules(site, id, guidance, n) {
    const r = { category: site.category == null ? null : site.category, ideal: site.ideal_extension_days == null ? null : site.ideal_extension_days,
      max: site.max_extension_days == null ? null : site.max_extension_days, maxOTT: site.max_overall_time_days || null,
      noAccel: !!site.no_acceleration, siteId: id, notes: site.notes || [], sources: site.sources || [], guidance: guidance || 'rcr2019', edRules: [] };
    const b0 = site.rcr5_draft;
    if (r.guidance === 'rcr5_draft' && b0) {
      const blocks = [b0].concat((b0.by_fractions || []).filter((b) => n != null && (b.min_fractions || 0) <= n && n <= (b.max_fractions == null ? 1e6 : b.max_fractions)));
      for (const b of blocks) {
        if ('max_overall_time_days' in b) r.maxOTT = b.max_overall_time_days;
        if ('target_overall_time_days' in b) r.targetOTT = b.target_overall_time_days;
        if ('no_dose_compensation' in b) r.noDoseComp = !!b.no_dose_compensation;
        if (b.rule) r.edRules.push(b.rule);
      }
    }
    return mkRules(r);
  }
  const DEFAULT_LATE_REPAIR_H = 4.4;   // Bentzen, Saunders & Dische 1999 (fibrosis)
  function oarFromCfg(o) {
    return mkTissue({ name: o.name, ab: o.alpha_beta, ratio: Array.isArray(o.dose_ratio) ? o.dose_ratio.map(Number) : (o.dose_ratio == null ? 1 : +o.dose_ratio),
      repairH: ('repair_half_time_h' in o) ? o.repair_half_time_h : DEFAULT_LATE_REPAIR_H, maxEqd2: o.max_eqd2, brachyRatio: o.brachy_ratio });
  }
  function rxFromCfg(c) {
    const start = parseDate(c.start), closed = new Set((c.closed_dates || []).map(parseDate));
    let names = new Map();
    if (c.holidays) { names = holidayMap(c.holidays, ymd(start).y, ymd(start).y + 1); for (const k of names.keys()) closed.add(k); }
    return mkRx({ start, n_fractions: c.n_fractions, dose_per_fraction: c.dose_per_fraction,
      phases: c.phases && c.phases.length ? c.phases.map((ph) => ({ n: ph.n_fractions, levels: ph.levels, name: ph.name })) : null,
      primary_level: c.primary_level, weekdays: parseWeekdays(c.treatment_weekdays), closed, holidayNames: names });
  }
  function ValidationError(errors) { const e = new Error('input errors'); e.errors = errors; e.validation = true; return e; }
  function plannerFromCase(cfg, protocol) {
    protocol = protocol || {};
    const lib = Object.assign({}, SITES);
    for (const k of Object.keys(protocol.sites || {})) lib[k] = Object.assign({}, lib[k] || { name: k, category: null, tumour: { alpha_beta: 10 } }, protocol.sites[k]);
    let site = null;
    if (cfg.site) { if (!lib[cfg.site]) throw ValidationError([{ code: 'e_site', p: { site: cfg.site } }]); site = lib[cfg.site]; }
    const ct = cfg.tumour || {};
    const t = Object.assign({}, site ? site.tumour : {}, ct);
    if ('dprolif_eqd2_per_day' in ct) delete t.k_bed_per_day;
    if ('k_bed_per_day' in ct) delete t.dprolif_eqd2_per_day;
    const ab = +(t.alpha_beta == null ? 10 : t.alpha_beta);
    const dprolif = t.k_bed_per_day != null ? dprolifFromK(+t.k_bed_per_day, ab) : (+t.dprolif_eqd2_per_day || 0);
    const tumour = mkTissue({ name: t.name || (site ? site.name : 'Tumour'), ab, dprolif, tk: t.kickoff_days, ratio: t.dose_ratio, repairH: t.repair_half_time_h });
    const oars = cfg.oars && cfg.oars.length ? cfg.oars.map(oarFromCfg) : (site && site.oars ? site.oars.map(oarFromCfg) : [oarFromCfg({ name: 'Late (α/β 3)', alpha_beta: 3 })]);
    const model = cfg.model || protocol.model || 'lq';
    if (!['lq', 'lql'].includes(model)) throw ValidationError([{ code: 'e_generic', p: { msg: 'model ' + model } }]);
    if (model === 'lql') {
      const fac = +(cfg.lql_dt_factor || protocol.lql_dt_factor || 2);
      if (!(fac > 0)) throw ValidationError([{ code: 'e_generic', p: { msg: 'lql_dt_factor' } }]);
      tumour.lql = fac; for (const o of oars) o.lql = fac;
    }
    const guidance = cfg.guidance || protocol.guidance || 'rcr2019';
    if (!GUIDANCES.includes(guidance)) throw ValidationError([{ code: 'e_generic', p: { msg: 'guidance ' + guidance } }]);
    let rx;
    const brachy = ((cfg.brachy || {}).fractions || []).map((f) => ({ day: parseDate(f.date), dose: +f.dose }));
    if (brachy.some((f) => !(f.dose > 0))) throw ValidationError([{ code: 'e_generic', p: { msg: 'brachytherapy dose' } }]);
    const rxCfg = brachy.length ? Object.assign({}, cfg.prescription, { closed_dates: (cfg.prescription.closed_dates || []).concat(brachy.map((f) => iso(f.day))) }) : cfg.prescription;
    try { rx = rxFromCfg(rxCfg); } catch (e) { throw ValidationError([{ code: 'e_generic', p: { msg: e.message } }]); }
    let rules = site ? siteRules(site, cfg.site, guidance, rx.n) : mkRules({ guidance });
    const over = Object.assign({}, cfg.rules || {});
    if ('category' in cfg && !('category' in over)) over.category = cfg.category;
    if (Object.keys(over).length) {
      const m = { category: rules.category, ideal: rules.ideal, max: rules.max, maxOTT: rules.maxOTT, noAccel: rules.noAccel, siteId: rules.siteId, notes: rules.notes, sources: rules.sources,
        guidance: rules.guidance, noDoseComp: rules.noDoseComp, targetOTT: rules.targetOTT, edRules: rules.edRules };
      if ('category' in over && over.category !== rules.category) { m.ideal = null; m.max = null; }
      if ('category' in over) m.category = over.category;
      if ('ideal_extension_days' in over) m.ideal = over.ideal_extension_days;
      if ('max_extension_days' in over) m.max = over.max_extension_days;
      if ('max_overall_time_days' in over) m.maxOTT = over.max_overall_time_days;
      if ('no_acceleration' in over) m.noAccel = !!over.no_acceleration;
      rules = mkRules(m);
    }
    const c = mkConstraints(Object.assign({}, protocol.constraints || {}, cfg.constraints || cfg.options || {}));
    const gap = cfg.gap || {};
    const resume = gap.resume_date ? parseDate(gap.resume_date) : null;
    const missed = new Set((gap.missed_dates || []).map(parseDate));
    if (gap.outage_start) {
      if (resume == null) throw ValidationError([{ code: 'e_outage', p: {} }]);
      const os = parseDate(gap.outage_start);
      for (const f of rx.planned()) if (f.day >= os && f.day < resume) missed.add(f.day);
    }
    if (gap.cause) { if (!['machine', 'holiday', 'toxicity', 'patient', 'other'].includes(gap.cause)) throw ValidationError([{ code: 'e_generic', p: { msg: 'gap cause' } }]); rules = mkRules(Object.assign({}, rules, { gapCause: gap.cause })); }
    const delivered = gap.delivered && gap.delivered.length ? gap.delivered.map((f) => ({ day: parseDate(f.date), slot: f.slot || 0, dose: +f.dose, phase: f.phase || 0 })) : null;
    const extra = (gap.extra_delivered || []).map(parseDate);
    const errors = (gap.dose_errors || []).map((e) => ({ day: parseDate(e.date), slot: e.slot || 0, dose: +e.dose }));
    const pc = gap.plan_change ? { from: parseDate(gap.plan_change.from), n: Math.round(+gap.plan_change.n_fractions), d: +gap.plan_change.dose_per_fraction } : null;
    let p;
    try {
      p = mkPlanner({ rx, tumour, oars, missed: [...missed], resume, delivered, unavailable: (gap.unavailable_dates || []).map(parseDate), c, rules, fixed: brachy, extra, errors, planChange: pc });
    } catch (e) { throw ValidationError([e.code ? { code: e.code, p: e.p } : { code: 'e_generic', p: { msg: e.message } }]); }
    p.site = site; p.siteId = cfg.site || null;
    const iss = validate(p);
    if (iss.errors.length) throw ValidationError(iss.errors);
    p.inputWarnings = iss.warnings;
    return p;
  }
  function validate(p) {
    const err = [], warn = [], rx = p.rx, E = (code, pp) => err.push({ code, p: pp || {} }), W = (code, pp) => warn.push({ code, p: pp || {} });
    const pd = new Set(p.planned.map((f) => f.day)), start = p.planned[0].day, end = p.plannedEnd;
    for (const m of p.missed) {
      if (m < rx.start) E('e_missed_before', { d: m, start: rx.start });
      else if (rx.closed.has(m)) W('v_missed_closed', { d: m });
      else if (!pd.has(m) && m <= end) W('v_missed_noplan', { d: m });
      else if (m > end) W('v_missed_after', { d: m, end });
    }
    if (p.missed.length && p.resume <= p.missed[p.missed.length - 1]) E('e_resume_before', { r: p.resume, m: p.missed[p.missed.length - 1] });
    if (p.resume < rx.start) E('e_resume_start', { r: p.resume });
    if (!p.missed.length && p.resume <= end && !(p.doseErrors.length || p.extraDates.length || p.planChange)) W('v_no_missed');
    for (const d of p.extraDates) if (d < rx.start) E('e_extra_before', { d });
    for (const e of p.doseErrors) if (e.actual > 2.5 * e.intended) W('v_err_large', { d: e.day, a: e.actual, i: e.intended });
    if (p.remaining === 0) W('v_all_delivered');
    for (const d of p.unavailable) if (d < p.resume && !rx.closed.has(d)) W('v_unavail_past', { d });
    for (const d of p.c.chemo_dates) if (d < start || d > end + (p.resume - start)) W('v_chemo_out', { d });
    for (const t of p.tumours) {
      if (!(t.ab >= 0.5 && t.ab <= 30)) W('v_ab_tumour', { name: t.name, ab: t.ab });
      if (t.dprolif > 0 && t.tk == null) W('v_no_tk', { name: t.name });
      if (t.dprolif > 2) W('v_dprolif_high', { name: t.name, v: t.dprolif });
    }
    for (const o of p.oars) {
      const rs = Array.isArray(o.ratio) ? o.ratio : [o.ratio];
      if (rs.some((x) => x < 0)) E('e_ratio_neg', { name: o.name });
      if (rs.some((x) => x > 1.2)) W('v_ratio_high', { name: o.name });
      if (!(o.ab >= 0.5 && o.ab <= 15)) W('v_ab_oar', { name: o.name, ab: o.ab });
    }
    for (const f of p.fixed) if (f.day < rx.start) W('v_brachy_before', { d: f.day });
    if (p.c.bid_interval_h < 6) W('v_bid_interval', { h: p.c.bid_interval_h });
    if (p.c.dose_rounding > 0.1) W('v_rounding', { v: p.c.dose_rounding });
    return { errors: err, warnings: warn };
  }

  // ------------------------------------------------------------------ SHA-256 (sync, for the audit checksum)
  function sha256(str) {
    const K = [], H = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
    for (let n = 2, i = 0; i < 64; n++) { let pr = true; for (let j = 2; j * j <= n; j++) if (n % j === 0) { pr = false; break; } if (pr) K[i++] = (Math.cbrt(n) % 1) * 4294967296 | 0; }
    const bytes = Array.from(new TextEncoder().encode(str)), l = bytes.length * 8;
    bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
    const rr = (x, n) => (x >>> n) | (x << (32 - n)), h = H.slice();
    for (let o = 0; o < bytes.length; o += 64) {
      const w = [];
      for (let i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) { const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  const canonical = (v) => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' :
    (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v === undefined ? null : v);
  const checksum = (obj) => sha256(canonical(obj));

  const api = { VERSION, parseDate, iso, weekday, ymd, mkDate, orthodoxEaster, greekHolidays, holidayMap, bed, eqd2, eqd2FromBed, kFromDprolif, dprolifFromK,
    mkTissue, tissueBed, tissueEqd2, hasTime, mkRules, mkConstraints, CONSTRAINT_DEFAULTS, CATEGORY_DEFAULTS, mkRx, mkPlanner, variant, options, decide, evaluate,
    solveScale, monteCarlo, MC_SD, patternAccelerated, patternSameEnd, patternStandard, sensitivity, candidateResumeDates, resumeScenarios, timeline, joiner, worksheet, selfTest, weeklyPeak, lcLoss, recoverable, customSlots, customOption, LC_LOSS_PER_DAY,
    plannerFromCase, setSites, get SITES() { return SITES; }, groupByDay, overallTime, isRegular, sha256, checksum, DEFAULT_GRID,
    allocatePhases, joinerTarget, errorEffect, interruptions, tissueBedNoTime, currentOutageStart, GUIDANCES, quadTerm, bedFraction, lqlDt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RT = api;
})(typeof window !== 'undefined' ? window : globalThis);
