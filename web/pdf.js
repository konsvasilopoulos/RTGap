/* rtgap PDF report: pages are laid out on canvas (so Greek renders with the browser's fonts and the page
 * needs no library or network), stored as JPEG pages in a hand-written PDF. The complete input is attached
 * to the PDF as an embedded file (rtgap-input.json). */
(function (root) {
  'use strict';
  const RT = root.RT, I = root.I18N;
  const PW = 794, PH = 1123, M = 50, SC = 2, CW = PW - 2 * M;
  const FONT = '"IBM Plex Sans", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
  const SERIF = '"STIX Two Text", Cambria, "Times New Roman", serif';
  const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
  const COL = { ink: '#0f1a2e', muted: '#56627a', line: '#cfd6e2', accent: '#1c5fe0', good: '#0c8463', warn: '#a86400', bad: '#c2314a', soft: '#eef2f8', delivered: '#33415f', bid: '#0d3a99', planned: '#dfe8fb' };

  function Doc() {
    const d = { pages: [], y: M, g: null };
    d.newPage = () => {
      const cv = document.createElement('canvas'); cv.width = PW * SC; cv.height = PH * SC;
      const g = cv.getContext('2d'); g.scale(SC, SC); g.fillStyle = '#fff'; g.fillRect(0, 0, PW, PH); g.textBaseline = 'alphabetic';
      d.pages.push(cv); d.g = g; d.y = M;
    };
    d.ensure = (h) => { if (d.y + h > PH - M - 26) d.newPage(); };
    d.font = (size, weight, fam) => { d.g.font = (weight || 400) + ' ' + size + 'px ' + (fam || FONT); };
    d.wrap = (text, maxW) => {
      const out = [];
      for (const para of String(text).split('\n')) {
        let line = '';
        for (const w of para.split(/\s+/)) {
          const t = line ? line + ' ' + w : w;
          if (d.g.measureText(t).width <= maxW || !line) line = t; else { out.push(line); line = w; }
        }
        out.push(line);
      }
      return out;
    };
    d.text = (text, o) => {
      o = o || {}; const size = o.size || 10.5, lh = o.lh || size * 1.42, x = M + (o.indent || 0), maxW = (o.maxW || CW) - (o.indent || 0);
      d.font(size, o.weight, o.fam); const lines = d.wrap(text, maxW);
      for (const ln of lines) { d.ensure(lh); d.font(size, o.weight, o.fam); d.g.fillStyle = o.color || COL.ink; d.g.fillText(ln, x, d.y + size); d.y += lh; }
      d.y += o.after == null ? 3 : o.after;
    };
    d.h2 = (t) => { d.ensure(110); d.y += 10; d.font(14, 600, SERIF); d.g.fillStyle = COL.ink; d.g.fillText(t, M, d.y + 14); d.y += 20; d.g.strokeStyle = COL.line; d.g.lineWidth = 1; d.g.beginPath(); d.g.moveTo(M, d.y); d.g.lineTo(PW - M, d.y); d.g.stroke(); d.y += 8; };
    d.bullets = (items, o) => { o = o || {}; for (const it of items) { d.ensure(16); d.font(10, 400); d.g.fillStyle = o.color || COL.muted; d.g.fillText(o.mark || '•', M + 4, d.y + 10); d.text(it, { size: o.size || 10, indent: 16, color: o.color, after: 2 }); } d.y += 3; };
    d.kv = (rows) => {
      const kw = 150;
      for (const [k, v] of rows) {
        d.font(10, 400); const lines = d.wrap(v, CW - kw), klines = d.wrap(k, kw - 10), h = Math.max(lines.length, klines.length) * 14.2 + 3; d.ensure(h);
        d.font(10, 400); d.g.fillStyle = COL.muted; klines.forEach((ln, i) => d.g.fillText(ln, M, d.y + 10 + i * 14.2));
        d.g.fillStyle = COL.ink; lines.forEach((ln, i) => d.g.fillText(ln, M + kw, d.y + 10 + i * 14.2)); d.y += h;
      }
      d.y += 4;
    };
    /* cols: [{label, w (fraction), align}], rows: [[{t, color, weight}|string]] */
    d.table = (cols, rows, o) => {
      o = o || {}; const size = o.size || 9.3, lh = size * 1.38, pad = 4;
      const xs = []; let x = M; for (const c of cols) { xs.push(x); x += c.w * CW; }
      const drawRow = (cells, head) => {
        d.font(size, head ? 600 : 400);
        const wrapped = cells.map((c, i) => { const cc = typeof c === 'string' ? { t: c } : (c || { t: '' }); d.font(size, head ? 600 : (cc.weight || 400), cc.mono ? MONO : FONT); return { c: cc, lines: d.wrap(cc.t, cols[i].w * CW - 2 * pad) }; });
        const h = Math.max(...wrapped.map((w) => w.lines.length)) * lh + 2 * pad;
        if (d.y + h > PH - M - 26) { d.newPage(); if (!head) drawRow(cols.map((c) => c.label), true); }
        if (o.fill && !head && o.fill(cells)) { d.g.fillStyle = o.fill(cells); d.g.fillRect(M, d.y, CW, h); }
        wrapped.forEach((w, i) => {
          d.font(size, head ? 600 : (w.c.weight || 400), w.c.mono ? MONO : FONT); d.g.fillStyle = head ? COL.muted : (w.c.color || COL.ink);
          w.lines.forEach((ln, k) => { const tw = d.g.measureText(ln).width, cx = cols[i].align === 'r' ? xs[i] + cols[i].w * CW - pad - tw : xs[i] + pad; d.g.fillText(ln, cx, d.y + pad + size + k * lh - 1); });
        });
        d.y += h; d.g.strokeStyle = COL.line; d.g.lineWidth = head ? 1 : 0.5; d.g.beginPath(); d.g.moveTo(M, d.y); d.g.lineTo(PW - M, d.y); d.g.stroke();
      };
      d.ensure(64); drawRow(cols.map((c) => c.label), true); rows.forEach((r) => drawRow(r, false)); d.y += 8;
    };
    d.newPage();
    return d;
  }

  function calendar(d, p, o, tr) {
    const cs = 24, gap = 3, lw = 40;
    const fe = p.missed.length ? p.missed[0] : p.resume;
    let first = fe - RT.weekday(fe) - 7; const st = p.rx.start - RT.weekday(p.rx.start); if (first < st) first = st;
    const lastD = Math.max(o ? o.end : p.plannedEnd, p.plannedEnd), last = lastD + (6 - RT.weekday(lastD));
    const weeks = Math.round((last - first + 1) / 7), h = 16 + weeks * (cs + gap);
    d.ensure(h + 8);
    const g = d.g, x0 = M, y0 = d.y;
    d.font(8, 400, MONO); g.fillStyle = COL.muted;
    tr.wd2.forEach((w, i) => g.fillText(w, x0 + lw + i * (cs + gap) + 5, y0 + 9));
    const delivered = new Set(p.delivered.map((f) => f.day)), missed = new Set(p.missed), planned = new Set(p.planned.map((f) => f.day)), nw = o ? RT.groupByDay(o.newFx) : new Map();
    const nDel = new Map(); for (const f of p.delivered) nDel.set(f.day, (nDel.get(f.day) || 0) + 1);
    const errD = new Set(p.doseErrors.map((e) => e.day)), xtra = new Set(p.extraDates);
    for (let w = 0; w < weeks; w++) {
      const mon = first + 7 * w, yy = y0 + 16 + w * (cs + gap), q = RT.ymd(mon);
      d.font(8, 400, MONO); g.fillStyle = COL.muted; g.fillText(q.d + '/' + q.m, x0, yy + 15);
      for (let i = 0; i < 7; i++) {
        const day = mon + i, xx = x0 + lw + i * (cs + gap); let fill = '#fff', ink = COL.muted, stroke = COL.line, sw = 0.8, txt = String(RT.ymd(day).d);
        if (i >= 5) { fill = COL.soft; stroke = COL.soft; }
        if (p.rx.closed.has(day)) { fill = '#e6e9ef'; }
        const isBt = p.fixed.some((f) => f.day === day); if (isBt) { fill = '#7a3fb8'; stroke = fill; ink = '#fff'; txt = 'BT'; }
        if (missed.has(day)) { fill = '#fff'; stroke = COL.bad; sw = 2; ink = COL.bad; }
        else if (delivered.has(day)) { fill = xtra.has(day) ? '#5a3fa0' : COL.delivered; stroke = fill; ink = '#fff'; if (nDel.get(day) > 1) txt += '×2'; }
        if (errD.has(day)) { stroke = COL.warn; sw = 2.4; }
        else if (!o && planned.has(day)) { fill = COL.planned; stroke = fill; ink = COL.ink; }
        if (nw.has(day)) { const n = nw.get(day).length; fill = n > 1 ? COL.bid : COL.accent; stroke = fill; ink = '#fff'; if (n > 1) txt += '×2'; }
        g.fillStyle = fill; g.fillRect(xx, yy, cs, cs); g.strokeStyle = stroke; g.lineWidth = sw; g.strokeRect(xx + sw / 2, yy + sw / 2, cs - sw, cs - sw);
        if (p.rx.closed.has(day) && !nw.has(day) && !isBt) { g.strokeStyle = '#b9c1cf'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(xx, yy + cs); g.lineTo(xx + cs, yy); g.stroke(); }
        if (day === p.plannedEnd) { g.strokeStyle = COL.ink; g.lineWidth = 1.6; g.strokeRect(xx - 1.5, yy - 1.5, cs + 3, cs + 3); }
        d.font(txt.length > 2 ? 6.8 : 8.2, 500, MONO); g.fillStyle = ink; const tw = g.measureText(txt).width; g.fillText(txt, xx + (cs - tw) / 2, yy + 15);
      }
    }
    // legend to the right
    const lx = x0 + lw + 7 * (cs + gap) + 22; let ly = y0 + 22;
    const leg = [[COL.delivered, tr.t('lg_delivered')], [null, tr.t('lg_missed')], o ? [COL.accent, tr.t('lg_new')] : [COL.planned, tr.t('lg_planned')]];
    if (o && o.nBid) leg.push([COL.bid, tr.t('lg_bid')]);
    if (p.fixed.length) leg.push(['#7a3fb8', tr.t('lg_bt')]);
    if (p.extraDates.length) leg.push(['#5a3fa0', tr.t('lg_extra')]);
    if (p.doseErrors.length) leg.push(['err', tr.t('lg_err')]);
    leg.push(['#e6e9ef', tr.t('lg_holiday')], ['end', tr.t('lg_end')]);
    d.font(8.5, 400);
    for (const [c, label] of leg) {
      if (c === null) { g.strokeStyle = COL.bad; g.lineWidth = 2; g.strokeRect(lx + 1, ly - 8, 9, 9); } else if (c === 'end') { g.strokeStyle = COL.ink; g.lineWidth = 1.6; g.strokeRect(lx + 1, ly - 8, 9, 9); } else if (c === 'err') { g.strokeStyle = COL.warn; g.lineWidth = 2.4; g.strokeRect(lx + 1, ly - 8, 9, 9); } else { g.fillStyle = c; g.fillRect(lx, ly - 9, 11, 11); }
      g.fillStyle = COL.muted; g.fillText(label, lx + 17, ly); ly += 15;
    }
    d.y += Math.max(h, ly - y0) + 8;
  }

  const refTxt = (ids) => (ids || []).filter((id) => I.REF_NUM[id]).map((id) => '[' + I.REF_NUM[id] + ']').join('');

  async function build(a) {
    const m = a.model, tr = a.tr, L = tr.t, p = m.p, dec = m.dec, rx = p.rx, meta = a.meta || {};
    if (document.fonts && document.fonts.load) {
      const want = Promise.all(['400 10px "IBM Plex Sans"', '600 10px "IBM Plex Sans"', '600 14px "STIX Two Text"', '400 9px "JetBrains Mono"'].map((f) => document.fonts.load(f, 'αβγ Ωμέγα abc').catch(() => null)));
      await Promise.race([want, new Promise((res) => setTimeout(res, 2500))]);   // offline: fall back to system fonts
    }
    const d = Doc(), g0 = d.g, now = new Date();
    const stamp = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    // header
    d.font(22, 600, SERIF); g0.fillStyle = COL.ink; g0.fillText('RTGap', M, d.y + 20);
    d.font(11, 400); g0.fillStyle = COL.muted; g0.fillText(L('rep_title'), M + 82, d.y + 19);
    d.font(9, 400, MONO); const right = L('generated') + ' ' + stamp; g0.fillText(right, PW - M - g0.measureText(right).width, d.y + 19);
    d.y += 30; g0.strokeStyle = COL.ink; g0.lineWidth = 1.5; g0.beginPath(); g0.moveTo(M, d.y); g0.lineTo(PW - M, d.y); g0.stroke(); d.y += 12;
    const siteName = tr.siteName(p.siteId, p.site);
    d.kv([[L('rep_case'), (meta.caseRef || '–') + (meta.title ? ' · ' + meta.title : '')], [L('s_site'), siteName + (p.rules.category ? ' · RCR ' + L('cat') + ' ' + p.rules.category : '')]]);

    // decision box
    const stCol = { recommended: COL.accent, no_action: COL.good, clinical_decision: COL.warn, no_gap: COL.good }[dec.status];
    const boxTop = d.y; d.y += 10;
    d.text(L('st_' + dec.status).toUpperCase(), { size: 8.5, fam: MONO, color: stCol, indent: 14, after: 2 });
    d.text(tr.head(dec.head), { size: 15, weight: 600, fam: SERIF, indent: 14, after: 2, lh: 20 });
    if (dec.recommended && dec.recommended.family !== 'baseline') { d.text(tr.optShort(dec.recommended), { size: 10, fam: MONO, color: COL.muted, indent: 14, after: 2 }); d.text(L('dec_note'), { size: 8.8, color: COL.muted, indent: 14, after: 2 }); }
    d.y += 6; d.g.fillStyle = stCol; d.g.fillRect(M, boxTop, 4, d.y - boxTop); d.y += 8;
    d.text(L('why'), { size: 10, weight: 600, after: 3 });
    dec.trace.forEach((s, i) => d.text((i + 1) + '. ' + tr.trace(s) + ' ' + refTxt(s.refs), { size: 9.8, indent: 6, after: 2 }));
    if (m.sens && dec.recommended && dec.recommended.family !== 'baseline') d.text(L('unc') + ' (' + m.sens.n + '): Δ ' + p.tumour.name + ' ' + tr.sg(m.sens.tumourPctRange[0]) + ' … ' + tr.sg(m.sens.tumourPctRange[1]) + ' %' + (p.oars.length ? ', Δ ' + p.oars[0].name + ' ' + tr.sg(m.sens.oarPctRanges[p.oars[0].name][0]) + ' … ' + tr.sg(m.sens.oarPctRanges[p.oars[0].name][1]) + ' %' : '') + '; ' + L('unc_same') + ' ' + Math.round(100 * m.sens.sameFraction) + ' % (' + L(m.sens.sameFraction >= 0.9 ? 'robust_yes' : 'robust_no') + ').', { size: 9.8, color: COL.muted, after: 4 });
    if (m.rec0 != null) d.text(L('rec_line') + ': ' + Math.round(100 * m.rec0) + ' % ' + L('rec_fixed') + (m.rec5 != null && m.rec5 > m.rec0 + 0.005 ? ', ' + Math.round(100 * m.rec5) + ' % ' + L('rec_5') : '') + '.' + (a.lc && m.base && a.lc(m.base) ? ' ' + L('ch_uncomp') + ': ' + L('lc').toLowerCase() + ' ' + a.lc(m.base) + ' [1].' : ''), { size: 9.8, color: COL.muted, after: 4 });
    if (dec.candidates.length) d.text(L('weigh') + ': ' + dec.candidates.map((o) => tr.optTitle(o)).join(' · '), { size: 9.8, color: COL.warn, after: 2 });
    if (p.inputWarnings.length) { d.text(L('input_checks'), { size: 10, weight: 600, after: 3 }); d.bullets(p.inputWarnings.map((w) => tr.issue(w)), { color: COL.warn }); }

    // summary
    d.h2(L('rep_summary'));
    const rxLine = rx.multilevel ? rx.phases.map((ph, i) => (ph.name || L('phase') + ' ' + (i + 1)) + ': ' + ph.n + ' × (' + Object.entries(ph.levels).filter(([, v]) => v > 0).map(([k, v]) => k + ' ' + v).join(', ') + ') Gy').join('; ') + ' → ' + rx.levelNames.map((k) => k + ' ' + (+rx.totalLevel(k).toFixed(2)) + ' Gy').join(', ')
      : rx.n + ' × ' + rx.refDose(0) + ' Gy = ' + (+rx.totalDose.toFixed(2)) + ' Gy';
    const T0 = p.plannedEnd - p.planned[0].day, c = p.c, yn = (b) => (b ? L('yes') : L('no')), t = p.tumour;
    const tum = 'α/β = ' + t.ab + ' Gy' + (RT.hasTime(t) ? '; D_prolif = ' + t.dprolif.toFixed(2) + ' Gy/' + (tr.el ? 'ημ.' : 'd') + ' (K = ' + RT.kFromDprolif(t.dprolif, t.ab).toFixed(2) + '); T_k = ' + t.tk + ' ' + L('days') : '') + '; EQD2_T ' + (p.tumours.length > 1 ? p.tumours.map((x, i) => x.name + ' ' + p.plannedLevels[i].toFixed(1)).join(', ') : p.plannedTumour.toFixed(1)) + ' Gy';
    d.kv([
      [L('rx_line'), rxLine + (p.fixed.length ? ' + ' + L('lg_bt') + ' ' + p.fixed.map((f) => f.dose + ' Gy (' + tr.dshort(f.day) + ')').join(', ') : '')], [L('start') + ' → ' + L('ends'), tr.date(p.planned[0].day) + ' → ' + tr.date(p.plannedEnd) + ' (T = ' + T0 + ' ' + L('days') + ')'],
      [L('missed_n'), p.missed.length ? p.missed.map(tr.dshort).join(', ') : '–'], [L('cause'), L('cause_' + (p.rules.gapCause || ''))],
    ].concat(p.interruptions.length > 1 ? [[L('intr_n'), p.interruptions.map((x, i) => (i + 1) + ') ' + tr.dshort(x[0]) + (x[1] !== x[0] ? '–' + tr.dshort(x[1]) : '') + ' (' + x[2] + ' ' + L('fx') + ')').join(' · ')]] : [],
      p.extraDates.length ? [[L('lg_extra'), p.extraDates.map(tr.dshort).join(', ')]] : [],
      p.doseErrors.length ? [[L('err_title'), p.doseErrors.map((e) => tr.dshort(e.day) + ': ' + tr.f2(e.actual) + ' Gy (' + L('planned_c').toLowerCase() + ' ' + tr.f2(e.intended) + ')').join(' · ')]] : [],
      p.planChange ? [[L('pc_title'), tr.dshort(p.planChange.from) + ': ' + p.planChange.n + ' × ' + p.planChange.d + ' Gy']] : [], [
      [L('status_line'), p.delivered.length + ' ' + L('delivered_n') + ', ' + p.remaining + ' ' + L('remaining_n') + '; ' + L('resume').toLowerCase() + ' ' + tr.date(p.resume)],
      [L('allowance'), p.rules.max != null ? L('ideal') + ' ≤ ' + p.rules.ideal + ', ' + L('max') + ' ≤ ' + p.rules.max + ' ' + L('days') + (p.rules.maxOTT ? '; ' + L('ott_cap') + ' ≤ ' + p.rules.maxOTT + ' ' + L('days') : '') + ' [1]' : '–'],
      [L('tumour'), tum],
    ].concat(p.oars.map((o, i) => [o.name, 'α/β = ' + o.ab + ' Gy; ' + L('ratio').toLowerCase() + ' ' + (Array.isArray(o.ratio) ? o.ratio.map((x) => +x.toFixed(3)).join('/') : o.ratio) + (o.repairH ? '; T½ ' + o.repairH + ' h' : '') + (o.maxEqd2 != null ? '; ' + L('limit') + ' ' + o.maxEqd2 : '') + '; EQD2 ' + p.plannedOars[i].toFixed(1) + ' Gy'])).concat([
      [L('dept_line'), L('guid_' + (p.rules.guidance || 'rcr2019')) + ' · ' + (m.cfg && m.cfg.audit && m.cfg.audit.protocol ? L('proto_title') + ': ' + m.cfg.audit.protocol + ' · ' : '') + L('c_sat') + ': ' + yn(c.allow_saturday) + ' · ' + L('c_sun') + ': ' + yn(c.allow_sunday) + ' · BID: ' + yn(c.allow_bid) + ' (≥ ' + c.bid_interval_h + ' h, d ≤ ' + c.bid_max_dose + ' Gy) · ' + L('c_dose') + ': ' + yn(c.allow_dose_change) + ' · ' + L('c_extra') + ': ' + yn(c.allow_extra_fractions) + (c.max_dose_per_fraction != null ? ' · d ≤ ' + c.max_dose_per_fraction + ' Gy' : '') + (c.max_fractions_per_week != null ? ' · ≤ ' + c.max_fractions_per_week + ' ' + L('fx') + '/wk' : '') + (c.max_weekly_increase_pct != null ? ' · ' + L('c_weekly') + ' ' + c.max_weekly_increase_pct : '') + ' · ' + L('c_tolT') + ' ' + (c.max_tumour_deficit_pct == null ? L('not_set') : c.max_tumour_deficit_pct) + ' · ' + L('c_tolL') + ' ' + (c.max_late_increase_pct == null ? L('not_set') : c.max_late_increase_pct)],
    ])));
    const notes = tr.siteNotes(p.siteId, p.site); if (notes.length) { d.text(L('site_notes'), { size: 10, weight: 600, after: 3 }); d.bullets(notes); }

    // schedule
    const o = m.sel;
    if (o && p.remaining) {
      d.h2(L('rep_selected') + ': ' + tr.optTitle(o));
      const mm = tr.optMethod(o); d.text(mm.text + ' ' + refTxt(mm.refs), { size: 9.8, color: COL.muted, after: 6 });
      calendar(d, p, o, tr);
      const rem = rx.multilevel ? Object.keys(o.phaseCounts).sort().map((ph) => (rx.phases[ph].name || L('phase') + ' ' + (+ph + 1)) + ': ' + o.phaseCounts[ph] + ' × (' + Object.entries(o.phaseDoses[ph]).map(([k, v]) => k + ' ' + v.toFixed(2)).join(', ') + ') Gy').join('; ') + ' (' + L('scale') + ' ' + o.scale.toFixed(3) + ')'
        : o.nNew + ' × ' + o.d.toFixed(2) + ' Gy = ' + (o.nNew * o.d).toFixed(2) + ' Gy' + (o.exact != null && Math.abs(o.exact - o.d) > 1e-4 ? ' (' + L('exact') + ' ' + o.exact.toFixed(3) + ' Gy)' : '');
      d.kv([[L('remaining'), rem], [L('ends'), tr.date(o.end) + ' · ' + L('ot') + ' ' + o.T + ' ' + L('days') + ' (' + tr.sgi(o.ext) + ' ' + L('vs_plan') + ')'],
        ].concat(a.lc && a.lc(o) ? [[L('lc'), a.lc(o) + ' [1]. ' + L('lc_hint')]] : [], [
        [L('dates'), [...RT.groupByDay(o.newFx).entries()].sort((x, y) => x[0] - y[0]).map(([day, fx]) => tr.dshort(day) + (fx.length > 1 ? ' ×2' : '')).join(', ')]]));
      const dc = (x, goodPos) => ({ t: tr.sg(x), mono: true, color: Math.abs(x) < 0.05 ? COL.muted : ((x > 0) === goodPos ? COL.good : COL.bad) });
      d.table([{ label: L('tissues'), w: 0.36 }, { label: L('planned_c') + ' EQD2', w: 0.16, align: 'r' }, { label: 'EQD2 (Gy)', w: 0.16, align: 'r' }, { label: 'Δ Gy', w: 0.16, align: 'r' }, { label: 'Δ %', w: 0.16, align: 'r' }],
        [[o.tumour, true]].concat(o.levels.map((r) => [r, true]), o.oars.map((r) => [r, false])).map(([r, tu]) => [r.name + (tu ? ' (EQD2_T)' : ''), { t: r.planned.toFixed(1), mono: true }, { t: r.eqd2.toFixed(1), mono: true }, dc(r.delta, tu), { t: tr.sg(r.deltaPct), mono: true }]).concat([[L('acute_row') + ' (Gy EQD2)', { t: o.weeklyPlanned.toFixed(1), mono: true }, { t: o.weeklyPeak.toFixed(1), mono: true }, dc(o.weeklyPeak - o.weeklyPlanned, false), { t: tr.sg(o.weeklyInc), mono: true }]]));
      d.text(L('acute_hint'), { size: 8.8, color: COL.muted, after: 6 });
      if (a.hand) { d.text(L('hand'), { size: 10, weight: 600, after: 3 }); for (const tt of [p.tumour].concat(p.oars.slice(0, 1))) d.text(a.hand(p, o, tt), { size: 8.6, fam: MONO, after: 6, lh: 12.5 }); }
      if (o.warnings.length) { d.text(L('warnings'), { size: 10, weight: 600, after: 3 }); d.bullets(o.warnings.map((w) => tr.reason(w) + ' ' + refTxt(w.refs)), { color: COL.warn }); }
    }
    // all options
    if (p.remaining && dec.feasible.length) {
      d.h2(L('rep_all'));
      const late = p.oars[0];
      const cols = [{ label: L('col_option'), w: late ? 0.42 : 0.54 }, { label: 'd (Gy)', w: 0.09, align: 'r' }, { label: 'Δ ' + (rx.multilevel ? p.tumour.name : L('col_t')), w: 0.12, align: 'r' }].concat(late ? [{ label: 'Δ ' + late.name, w: 0.12, align: 'r' }] : [], [{ label: L('col_n'), w: 0.06, align: 'r' }, { label: L('col_end'), w: 0.12, align: 'r' }, { label: L('col_ext'), w: 0.07, align: 'r' }]);
      const row = (x, ex) => [{ t: (x.recommended ? '★ ' : '') + tr.optTitle(x) + (ex ? '\n' + x.rejected.map((w) => '✕ ' + tr.reason(w) + ' ' + refTxt(w.refs)).join('\n') : ''), weight: x === o ? 600 : 400 }, { t: x.d.toFixed(2), mono: true }, { t: tr.sg(x.tumour.delta), mono: true, color: x.tumour.delta < -0.05 ? COL.bad : COL.ink }].concat(late ? [{ t: tr.sg(x.oars[0].delta), mono: true, color: x.oars[0].delta > 0.05 ? COL.bad : COL.ink }] : [], [{ t: String(x.nNew), mono: true }, { t: tr.dshort(x.end), mono: true }, { t: tr.sgi(x.ext), mono: true }]);
      d.table(cols, dec.feasible.map((x) => row(x, false)));
      d.text(L('col_delta') + '.', { size: 8.8, color: COL.muted, after: 6 });
      if (dec.rejected.length) { d.text(L('excluded'), { size: 10, weight: 600, after: 4 }); d.table(cols, dec.rejected.map((x) => row(x, true))); }
    }
    if (m.sens) {
      const s = m.sens, gq = s.grid;
      d.h2(L('robust'));
      d.text(s.n + ' ' + L('rob_grid') + ': ' + L('g_ab') + ' ' + gq.tumour_alpha_beta.join(', ') + '; ' + L('g_rep') + ' ' + gq.repopulation.join(', ') + '; ' + L('g_tk') + ' ' + gq.kickoff_shift_days.join(', ') + '; ' + L('g_late') + ' ' + gq.late_alpha_beta.join(', ') + '.', { size: 9.5, color: COL.muted });
      d.text(L('rob_line') + ' ' + tr.optTitle(s.option), { size: 10, after: 4 });
      d.table([{ label: L('tissues'), w: 0.4 }, { label: 'Δ EQD2 (Gy)', w: 0.3, align: 'r' }, { label: 'Δ %', w: 0.3, align: 'r' }],
        [[p.tumour.name, { t: tr.sg(s.tumourRange[0]) + ' … ' + tr.sg(s.tumourRange[1]), mono: true }, { t: tr.sg(s.tumourPctRange[0]) + ' … ' + tr.sg(s.tumourPctRange[1]), mono: true }]].concat(Object.keys(s.oarRanges).map((k) => [k, { t: tr.sg(s.oarRanges[k][0]) + ' … ' + tr.sg(s.oarRanges[k][1]), mono: true }, { t: tr.sg(s.oarPctRanges[k][0]) + ' … ' + tr.sg(s.oarPctRanges[k][1]), mono: true }])));
      d.text(L('rob_same') + ' ' + Math.round(100 * s.sameFraction) + ' %: ' + s.decisions.map((x) => (x.o ? tr.optTitle(x.o) : L('st_clinical_decision')) + ' (' + x.count + '/' + s.n + ')').join('; ') + '.', { size: 10 });
    }
    if (m.scen && m.scen.length) {
      d.h2(L('scen_title'));
      d.table([{ label: L('scen_resume'), w: 0.16 }, { label: L('scen_uncomp'), w: 0.2, align: 'r' }, { label: 'Δ ' + L('col_t') + ' (Gy)', w: 0.14, align: 'r' }, { label: L('scen_dec'), w: 0.5 }],
        m.scen.map((r) => [{ t: tr.dshort(r.resume), mono: true }, { t: r.nMissed + ' ' + L('fx') + ' · ' + tr.sgi(r.baseExt) + ' ' + L('days'), mono: true }, { t: tr.sg(r.baseDelta), mono: true, color: r.baseDelta < -0.05 ? COL.bad : COL.ink },
          { t: L('st_' + r.status) + (r.option && r.option.family !== 'baseline' ? ': ' + tr.optTitle(r.option) + ', ' + r.option.nNew + ' × ' + r.option.d.toFixed(2) + ' Gy' : ''), color: r.status === 'clinical_decision' ? COL.warn : COL.ink }]));
    }
    // method, references
    d.h2(L('method'));
    d.text(L('method_text') + ' [3][8][1][7]', { size: 9.5 }); d.text(L('xval'), { size: 9, color: COL.muted });
    d.h2(L('refs_title'));
    I.REFS.forEach((r, i) => d.text('[' + (i + 1) + '] ' + r.text, { size: 9.2, after: 3 }));
    // record
    d.h2(L('record'));
    d.kv([[L('software'), 'RTGap ' + RT.VERSION + ' · ' + L('dev') + ' Konstantinos Vasilopoulos, PhD Candidate · GNU AGPL-3.0 · github.com/konsvasilopoulos/RTGap'], [L('generated'), stamp], [L('checksum'), m.checksum]]);
    d.ensure(120); d.y += 10;
    for (const [lab, val] of [[L('calc_by'), meta.calcBy], [L('checked_by'), meta.checkedBy], [L('approved_by'), '']]) {
      d.font(10, 400); d.g.fillStyle = COL.muted; d.g.fillText(lab, M, d.y + 10);
      d.g.strokeStyle = COL.ink; d.g.lineWidth = 0.8; d.g.beginPath(); d.g.moveTo(M + 180, d.y + 12); d.g.lineTo(M + 440, d.y + 12); d.g.moveTo(M + 520, d.y + 12); d.g.lineTo(PW - M, d.y + 12); d.g.stroke();
      if (val) { d.g.fillStyle = COL.ink; d.g.fillText(val, M + 184, d.y + 9); }
      d.g.fillStyle = COL.muted; d.g.fillText(L('date'), M + 460, d.y + 10); d.y += 34;
    }
    d.text(L('disclaimer'), { size: 8.8, color: COL.muted });
    // footers
    d.pages.forEach((cv, i) => { const g = cv.getContext('2d'); g.font = '400 8px ' + MONO; g.fillStyle = COL.muted; g.fillText('RTGap ' + RT.VERSION + ' · Konstantinos Vasilopoulos, PhD Candidate · SHA-256 ' + m.checksum.slice(0, 12) + '…', M, PH - 30); const t2 = L('page') + ' ' + (i + 1) + ' ' + L('of') + ' ' + d.pages.length; g.fillText(t2, PW - M - g.measureText(t2).width, PH - 30); });
    const jpgs = [];
    for (const cv of d.pages) { const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.93)); jpgs.push(new Uint8Array(await blob.arrayBuffer())); }
    return assemble(jpgs, a.inputJson || '');
  }

  /* One-page (or longer) treatment sheet for the radiographers: the remaining fractions of the selected
   * schedule, with date, session, dose and blank columns for "given" and initials. No radiobiology. */
  async function buildSheet(a) {
    const m = a.model, tr = a.tr, L = tr.t, p = m.p, rx = p.rx, o = m.sel, meta = a.meta || {};
    if (!o || !p.remaining) return null;
    if (document.fonts && document.fonts.load) {
      const want = Promise.all(['400 10px "IBM Plex Sans"', '600 10px "IBM Plex Sans"', '600 14px "STIX Two Text"', '400 9px "JetBrains Mono"'].map((f) => document.fonts.load(f, 'αβγ Ωμέγα abc').catch(() => null)));
      await Promise.race([want, new Promise((res) => setTimeout(res, 2500))]);
    }
    const d = Doc(), g0 = d.g, now = new Date();
    const stamp = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    d.font(22, 600, SERIF); g0.fillStyle = COL.ink; g0.fillText('RTGap', M, d.y + 20);
    d.font(11, 400); g0.fillStyle = COL.muted; g0.fillText(L('sheet_title'), M + 82, d.y + 19);
    d.font(9, 400, MONO); const right = L('generated') + ' ' + stamp; g0.fillText(right, PW - M - g0.measureText(right).width, d.y + 19);
    d.y += 30; g0.strokeStyle = COL.ink; g0.lineWidth = 1.5; g0.beginPath(); g0.moveTo(M, d.y); g0.lineTo(PW - M, d.y); g0.stroke(); d.y += 12;
    const rxLine = rx.multilevel ? rx.levelNames.map((k) => k + ' ' + (+rx.totalLevel(k).toFixed(2)) + ' Gy').join(', ') : rx.n + ' × ' + rx.refDose(0) + ' Gy = ' + (+rx.totalDose.toFixed(2)) + ' Gy';
    d.kv([[L('rep_case'), (meta.caseRef || '–') + (meta.title ? ' · ' + meta.title : '')], [L('s_site'), tr.siteName(p.siteId, p.site)], [L('rx_line'), rxLine],
      [L('sheet_schedule'), tr.optTitle(o)], [L('status_line'), p.delivered.length + ' ' + L('delivered_n') + ' · ' + o.nNew + ' ' + L('sheet_to_give') + ' · ' + L('ends').toLowerCase() + ' ' + tr.date(o.end)]]);
    // key instructions
    const notes = [];
    const changed = Math.abs(o.scale - p.s0) > 1e-9;
    const lvTxt = (ph) => Object.entries(o.phaseDoses[ph] || {}).map(([k, v]) => (rx.multilevel ? k + ' ' : '') + v.toFixed(2) + ' Gy').join(' · ');
    if (changed) notes.push(L('sheet_newdose') + ': ' + Object.keys(o.phaseDoses).sort().map((ph) => lvTxt(ph)).join('; ') + '. ' + L('sheet_replan'));
    if (o.nBid) notes.push(L('sheet_bid').replace('{h}', p.c.bid_interval_h));
    if (o.nSat || o.nSun) notes.push(L('sheet_weekend'));
    if (!notes.length) notes.push(L('sheet_same'));
    const top = d.y; d.y += 8;
    for (const n of notes) { d.font(10.5, 600); d.text('• ' + n, { size: 10.5, weight: 600, indent: 12, after: 3 }); }
    d.y += 4; g0.fillStyle = changed ? COL.warn : COL.accent; g0.fillRect(M, top, 4, d.y - top); d.y += 8;
    // table
    const chemo = new Set(p.c.chemo_dates), first = p.delivered.length, total = p.delivered.length + o.nNew;
    const lvls = [rx.primary].concat(rx.levelNames.filter((x) => x !== rx.primary));
    const byDay = RT.groupByDay(o.newFx);
    const rows = [];
    const all = o.newFx.map((f) => ({ f, bt: false })).concat(p.fixed.filter((f) => f.day >= p.resume).map((f) => ({ f, bt: true }))).sort((x, y) => x.f.day - y.f.day || x.f.slot - y.f.slot);
    let k = first;
    for (const it of all) {
      const f = it.f, wd = RT.weekday(f.day), note = [];
      if (it.bt) { rows.push([{ t: '' }, { t: tr.date(f.day), mono: true }, { t: L('lg_bt') }].concat(lvls.map((_, q) => ({ t: q === 0 ? (+f.dose).toFixed(2) : '', mono: true })), [{ t: L('sheet_bt'), color: COL.muted }, '', ''])); continue; }
      k++;
      const two = (byDay.get(f.day) || []).length > 1;
      if (wd === 5) note.push(L('sheet_sat')); if (wd === 6) note.push(L('sheet_sun'));
      if (two && f.slot === 1) note.push(L('sheet_second').replace('{h}', p.c.bid_interval_h));
      if (chemo.has(f.day)) note.push(L('m_chemo'));
      if (changed && k === first + 1) note.push(L('sheet_first_new'));
      const sess = two ? (f.slot === 0 ? L('sheet_s1') : L('sheet_s2')) : '1';
      const pd = o.phaseDoses[f.phase] || {};
      rows.push([{ t: k + '/' + total, mono: true }, { t: tr.date(f.day), mono: true, weight: wd >= 5 ? 600 : 400 }, { t: sess }].concat(lvls.map((lv) => ({ t: pd[lv] != null ? pd[lv].toFixed(2) : '–', mono: true, weight: changed ? 600 : 400 })), [{ t: note.join(' · '), color: note.length ? COL.warn : COL.ink }, '', '']));
    }
    const lw = Math.min(0.13, 0.3 / lvls.length), noteW = 1 - 0.07 - 0.17 - 0.09 - 0.11 - 0.11 - lw * lvls.length;
    d.table([{ label: '#', w: 0.07 }, { label: L('date'), w: 0.17 }, { label: L('sheet_session'), w: 0.09 }].concat(lvls.map((lv) => ({ label: (rx.multilevel ? lv : L('sheet_dose')) + ' (Gy)', w: lw, align: 'r' })), [{ label: L('sheet_note'), w: noteW }, { label: L('sheet_given'), w: 0.11 }, { label: L('sheet_init'), w: 0.11 }]), rows, { size: 9.6 });
    d.ensure(110); d.y += 10;
    for (const lab of [L('sheet_by_phys'), L('sheet_by_md'), L('sheet_by_rt')]) {
      d.font(10, 400); d.g.fillStyle = COL.muted; d.g.fillText(lab, M, d.y + 10);
      d.g.strokeStyle = COL.ink; d.g.lineWidth = 0.8; d.g.beginPath(); d.g.moveTo(M + 200, d.y + 12); d.g.lineTo(M + 440, d.y + 12); d.g.moveTo(M + 520, d.y + 12); d.g.lineTo(PW - M, d.y + 12); d.g.stroke();
      d.g.fillStyle = COL.muted; d.g.fillText(L('date'), M + 460, d.y + 10); d.y += 30;
    }
    d.text(L('sheet_foot'), { size: 8.6, color: COL.muted });
    d.pages.forEach((cv, i) => { const g = cv.getContext('2d'); g.font = '400 8px ' + MONO; g.fillStyle = COL.muted; g.fillText('RTGap ' + RT.VERSION + ' · ' + L('sheet_title') + ' · SHA-256 ' + m.checksum.slice(0, 12) + '…', M, PH - 30); const pg = (i + 1) + '/' + d.pages.length; g.fillText(pg, PW - M - g.measureText(pg).width, PH - 30); });
    const jpgs = [];
    for (const cv of d.pages) { const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.93)); jpgs.push(new Uint8Array(await blob.arrayBuffer())); }
    return assemble(jpgs, a.inputJson || '');
  }

  /* A generic list page: title, key-value lines, one table, notes (used for the machine-outage list). */
  async function buildList(a) {
    const tr = a.tr, L = tr.t;
    if (document.fonts && document.fonts.load) {
      const want = Promise.all(['400 10px "IBM Plex Sans"', '600 10px "IBM Plex Sans"', '600 14px "STIX Two Text"', '400 9px "JetBrains Mono"'].map((f) => document.fonts.load(f, 'αβγ Ωμέγα abc').catch(() => null)));
      await Promise.race([want, new Promise((res) => setTimeout(res, 2500))]);
    }
    const d = Doc(), g0 = d.g, now = new Date();
    const stamp = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    d.font(22, 600, SERIF); g0.fillStyle = COL.ink; g0.fillText('RTGap', M, d.y + 20);
    d.font(11, 400); g0.fillStyle = COL.muted; g0.fillText(a.title, M + 82, d.y + 19);
    d.font(9, 400, MONO); const right = L('generated') + ' ' + stamp; g0.fillText(right, PW - M - g0.measureText(right).width, d.y + 19);
    d.y += 30; g0.strokeStyle = COL.ink; g0.lineWidth = 1.5; g0.beginPath(); g0.moveTo(M, d.y); g0.lineTo(PW - M, d.y); g0.stroke(); d.y += 12;
    d.kv(a.kv); d.y += 6;
    d.table(a.cols, a.rows, { size: 9.2 }); d.y += 8;
    for (const n of a.notes || []) d.text(n, { size: 8.6, color: COL.muted, after: 4 });
    d.pages.forEach((cv, i) => { const g = cv.getContext('2d'); g.font = '400 8px ' + MONO; g.fillStyle = COL.muted; g.fillText('RTGap ' + RT.VERSION + ' · ' + a.title, M, PH - 30); const pg = (i + 1) + '/' + d.pages.length; g.fillText(pg, PW - M - g.measureText(pg).width, PH - 30); });
    const jpgs = [];
    for (const cv of d.pages) { const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.93)); jpgs.push(new Uint8Array(await blob.arrayBuffer())); }
    return assemble(jpgs, '');
  }

  /* Minimal PDF 1.4 writer: one JPEG per A4 page + the input JSON as an embedded file. */
  function assemble(jpgs, inputJson) {
    const enc = new TextEncoder(), parts = [], offsets = []; let pos = 0;
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); pos += b.length; };
    const obj = (n, body, stream) => { offsets[n] = pos; push(n + ' 0 obj\n' + body + '\n'); if (stream) { push('stream\n'); push(stream); push('\nendstream\n'); } push('endobj\n'); };
    const n = jpgs.length, WPT = 595.28, HPT = 841.89, fileObj = 3 + 3 * n, specObj = fileObj + 1, total = specObj;
    const ascii = inputJson.replace(/[\u0080-￿]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\x80-\xff]/g, '?'));
    obj(1, '<< /Type /Catalog /Pages 2 0 R' + (ascii ? ' /Names << /EmbeddedFiles << /Names [(rtgap-input.json) ' + specObj + ' 0 R] >> >> /PageMode /UseAttachments' : '') + ' >>');
    obj(2, '<< /Type /Pages /Count ' + n + ' /Kids [' + jpgs.map((_, i) => (3 + 3 * i) + ' 0 R').join(' ') + '] >>');
    jpgs.forEach((jpg, i) => {
      const pg = 3 + 3 * i, content = 'q ' + WPT + ' 0 0 ' + HPT + ' 0 0 cm /Im0 Do Q';
      obj(pg, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + WPT + ' ' + HPT + '] /Resources << /XObject << /Im0 ' + (pg + 2) + ' 0 R >> >> /Contents ' + (pg + 1) + ' 0 R >>');
      obj(pg + 1, '<< /Length ' + content.length + ' >>', content);
      obj(pg + 2, '<< /Type /XObject /Subtype /Image /Width ' + (PW * SC) + ' /Height ' + (PH * SC) + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>', jpg);
    });
    if (ascii) {
      obj(fileObj, '<< /Type /EmbeddedFile /Subtype /application#2Fjson /Length ' + ascii.length + ' >>', ascii);
      obj(specObj, '<< /Type /Filespec /F (rtgap-input.json) /UF (rtgap-input.json) /EF << /F ' + fileObj + ' 0 R >> /Desc (rtgap input) >>');
    }
    const xref = pos, cnt = (ascii ? total : fileObj - 1) + 1;
    let x = 'xref\n0 ' + cnt + '\n0000000000 65535 f \n';
    for (let i = 1; i < cnt; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    push(x + 'trailer\n<< /Size ' + cnt + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(parts, { type: 'application/pdf' });
  }
  root.RTPDF = { build, buildSheet, buildList, assemble };
})(window);
