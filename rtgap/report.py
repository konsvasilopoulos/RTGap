"""Text and HTML reports."""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
from typing import Sequence

from . import __version__
from .decide import Decision
from .gap import GapPlanner, Option, weekday_name
from .schedule import group_by_day

DISCLAIMER = ("Decision-support calculation based on the linear-quadratic model with generic "
              "parameters. It does not replace clinical judgement. All parameters (α/β, D_prolif, "
              "kick-off time, dose ratios) and rules must be reviewed by the treating team, and any "
              "modified schedule must be independently checked before use.")


def _fmt_date(d: dt.date | None) -> str:
    return f"{weekday_name(d)} {d.isoformat()}" if d else "-"


def _signed(x: float, nd: int = 1) -> str:
    x = 0.0 if abs(x) < 0.5 * 10 ** -nd else x
    return f"{x:+.{nd}f}"


def _rules_line(p: GapPlanner) -> str:
    r = p.rules
    parts = []
    if r.site_name:
        parts.append(r.site_name)
    parts.append(f"RCR category {r.category}" if r.category else "no RCR category")
    if r.max_extension_days is not None:
        parts.append(f"prolongation ideal ≤ {r.ideal_extension_days} d, max ≤ {r.max_extension_days} d")
    if r.max_overall_time_days:
        parts.append(f"overall time ≤ {r.max_overall_time_days} d")
    if r.no_acceleration:
        parts.append("no acceleration")
    return " · ".join(parts)


def _constraints_line(p: GapPlanner) -> str:
    c = p.c
    yn = lambda b: "yes" if b else "no"
    s = (f"Sat {yn(c.allow_saturday)} · Sun {yn(c.allow_sunday)} · BID {yn(c.allow_bid)} "
         f"(≥ {c.bid_interval_h:g} h, d ≤ {c.bid_max_dose:g} Gy) · dose change {yn(c.allow_dose_change)} · "
         f"extra fx {yn(c.allow_extra_fractions)}")
    if c.max_dose_per_fraction:
        s += f" · d ≤ {c.max_dose_per_fraction:g} Gy"
    if c.max_fractions_per_week:
        s += f" · ≤ {c.max_fractions_per_week} fx/week"
    if c.chemo_dates:
        s += f" · chemo days {len(c.chemo_dates)} ({'daily' if c.chemo_daily else 'non-daily'})"
    if c.max_weekly_increase_pct is not None:
        s += f" · peak 7-day dose ≤ +{c.max_weekly_increase_pct:g} %"
    if c.max_tumour_deficit_pct is not None and c.max_late_increase_pct is not None:
        s += (f" · tolerances: tumour shortfall ≤ {c.max_tumour_deficit_pct:g} %, "
              f"late increase ≤ {c.max_late_increase_pct:g} %")
    else:
        s += " · no automatic dose-change tolerances"
    return s


# --------------------------------------------------------------------------- #
def text_report(p: GapPlanner, dec: Decision, sens=None, scenarios=None) -> str:
    s = p.summary()
    rx = p.rx
    L = [f"RTGap {__version__} — unscheduled gap compensation", "=" * 78,
         f"Prescription : {rx.describe()}",
         f"Dates        : start {_fmt_date(rx.start)}, planned end {_fmt_date(s['planned_end'])} (T = {s['planned_T']} d)",
         f"Missed       : {', '.join(d.isoformat() for d in s['missed']) or '-'}",
         f"Status       : {s['delivered']} delivered, {s['remaining']} remaining, resume {_fmt_date(s['resume'])}",
         f"Rules        : {_rules_line(p)}",
         f"Local        : {_constraints_line(p)}",
         f"Tumour       : {p.tumour.describe()} · planned EQD2_T {s['planned_tumour_eqd2']:.2f} Gy"]
    for o, v in zip(p.oars, p.planned_oars):
        L.append(f"OAR          : {o.name}: {o.describe()} · planned EQD2 {v:.2f} Gy")
    if len(p.tumours) > 1:
        L.append("Levels       : " + ", ".join(f"{k} {v:.2f} Gy" for k, v in s["planned_level_eqd2"].items()))
    for w in p.input_warnings:
        L.append(f"INPUT CHECK  : {w}")
    L += ["", f"DECISION [{dec.status}]: {dec.headline}"]
    L += [f"  - {t}" for t in dec.trace]
    if dec.candidates:
        L.append("  Candidates for the clinical decision: " + "; ".join(o.title for o in dec.candidates))
    L.append("")

    def table(opts: Sequence[Option], title: str):
        if not opts:
            return
        L.append(title)
        hdr = f"{'':2}{'option':<50} {'n':>3} {'d/Gy':>5} {'end':>10} {'ext':>4} {'ΔT%':>6}"
        for t in p.tumours[1:]:
            hdr += f" {('Δ' + t.name)[:9] + '%':>10}"
        for o in p.oars:
            hdr += f" {('Δ' + o.name)[:9] + '%':>10}"
        L.append(hdr)
        L.append("-" * len(hdr))
        for o in opts:
            mark = "★ " if o.recommended else "  "
            row = (f"{mark}{o.title[:50]:<50} {o.n_new:>3} {o.dose_per_fraction:>5.2f} "
                   f"{o.end_date.isoformat():>10} {o.extension_days:>+4d} {_signed(o.tumour.delta_pct):>6}")
            for r in o.levels:
                row += f" {_signed(r.delta_pct):>10}"
            for r in o.oars:
                row += f" {_signed(r.delta_pct):>10}"
            L.append(row)
            for why in o.rejected:
                L.append(f"      ✗ {why}")
        L.append("")

    table(dec.feasible, "FEASIBLE OPTIONS (RCR order)")
    table(dec.rejected, "EXCLUDED OPTIONS")
    if sens is not None:
        L.append(f"ROBUSTNESS ({sens.n} parameter combinations) — {sens.option_title}:")
        L.append(f"  tumour Δ {_signed(sens.tumour_pct_range[0])} … {_signed(sens.tumour_pct_range[1])} %; " +
                 "; ".join(f"{k} Δ {_signed(v[0])} … {_signed(v[1])} %" for k, v in sens.oar_pct_ranges.items()))
        L.append(f"  same decision in {100 * sens.same_fraction:.0f} % of combinations: " +
                 "; ".join(f"{t} ({c})" for t, c, _ in sens.decisions))
        L.append("")
    if scenarios:
        L.append("IF TREATMENT RESUMES ON:")
        for r in scenarios:
            o = r.option
            what = o.title if o else ("no compensation" if r.status == "no_action" else "clinical decision")
            L.append(f"  {_fmt_date(r.resume)}: {r.n_missed} missed, uncompensated {r.baseline_extension:+d} d "
                     f"({_signed(r.baseline_tumour_delta)} Gy) → {what}")
        L.append("")
    L += ["Δ columns: % change of EQD2 vs the prescribed schedule (tumour time-corrected).", DISCLAIMER]
    return "\n".join(L)


# --------------------------------------------------------------------------- #
CSS = """
:root{--ink:#1d2433;--muted:#5b6578;--line:#dfe3ea;--bg:#f7f8fa;--card:#fff;
--delivered:#3d4a63;--missed:#d64545;--new:#1f8a70;--bid:#0b5d4b;--planned:#c9d3e3;--wk:#eef1f6;
--good:#1f8a70;--warn:#b7791f;--bad:#c53030}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
color:var(--ink);background:var(--bg)}main{max-width:1040px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:1.45rem;margin:0 0 4px}h2{font-size:1.1rem;margin:28px 0 10px}
.sub{color:var(--muted);margin:0 0 18px}.card{background:var(--card);border:1px solid var(--line);
border-radius:10px;padding:14px 16px;margin:0 0 14px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:0}dt{color:var(--muted)}dd{margin:0}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
th:first-child,td:first-child,th:nth-child(2),td:nth-child(2){text-align:left}
th{font-weight:600;color:var(--muted);font-size:.85rem}td.t{white-space:normal;min-width:140px}th{white-space:normal;vertical-align:bottom}
.pos{color:var(--good)}.neg{color:var(--bad)}.zero{color:var(--muted)}
.tag{display:inline-block;font-size:.75rem;padding:1px 7px;border-radius:99px;background:var(--wk);color:var(--muted);margin-left:6px}
.opt h3{font-size:1rem;margin:0 0 2px}.opt .m{color:var(--muted);font-size:.85rem;margin:0 0 8px}
.warn{color:var(--warn);font-size:.88rem;margin:6px 0 0;padding-left:18px}
.row{display:flex;flex-wrap:wrap;gap:12px 22px;align-items:flex-start}.row dl{flex:1 1 300px}
.cal{display:grid;grid-template-columns:38px repeat(7,30px);gap:3px;margin:6px 0 8px}.cal .wl{font-size:.68rem;color:var(--muted);display:flex;align-items:center}.cal .hd{font-size:.68rem;color:var(--muted);text-align:center}
.strip{display:flex;gap:2px;margin:8px 0 2px}.cell{width:30px;height:28px;border-radius:4px;line-height:1;flex-direction:column;
background:#fff;border:1px solid var(--line);font-size:.7rem;color:var(--muted);display:flex;align-items:center;justify-content:center}
.cell b{font-size:.6rem}.cell.delivered,.cell.new,.cell.bid{color:#fff}
.cell.wk{background:var(--wk);border-color:var(--wk)}.cell.planned{background:var(--planned);border-color:var(--planned)}
.cell.delivered{background:var(--delivered);border-color:var(--delivered)}
.cell.missed{background:#fff;border:2px solid var(--missed);color:var(--missed);font-weight:700;text-decoration:line-through}
.cell.new{background:var(--new);border-color:var(--new)}.cell.bid{background:var(--bid);border-color:var(--bid);font-weight:700}
.cell.closed{background:repeating-linear-gradient(45deg,#fff,#fff 3px,var(--line) 3px,var(--line) 5px)}
.cell.endmark{outline:2px solid var(--ink);outline-offset:1px}
.days{display:flex;gap:2px;font-size:.62rem;color:var(--muted)}.days span{width:20px;min-width:20px;text-align:center}
.legend{display:flex;flex-wrap:wrap;gap:12px;font-size:.8rem;color:var(--muted);margin-top:6px}
.legend i{display:inline-block;width:12px;height:12px;border-radius:2px;vertical-align:-2px;margin-right:4px}
.decision{border-left:5px solid var(--new)}.decision.cd{border-left-color:var(--warn)}.decision.na{border-left-color:var(--delivered)}
.decision h2{margin:0 0 6px}.decision .big{font-size:1.05rem;font-weight:600;margin:0 0 8px}
.trace{margin:8px 0 0;padding-left:20px;font-size:.88rem;color:var(--muted)}
tr.rec td{background:#eaf6f1}tr.rej td{color:var(--muted)}.why{font-size:.8rem;color:var(--bad);white-space:normal}
details summary{cursor:pointer;color:var(--muted);font-weight:600;margin:4px 0}
.sign{display:grid;gap:14px;margin:16px 0 8px}.sign div{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}
.sign .line{flex:1 1 140px;border-bottom:1px solid var(--ink);height:1.2em}.sign .line.s{flex:0 1 90px}
button{font:inherit;padding:7px 12px;border-radius:8px;border:1px solid var(--line);background:#fff;cursor:pointer;margin:4px 6px 0 0}
@media print{body{background:#fff;font-size:12px}main{max-width:none;padding:0}.noprint{display:none}
.card{break-inside:avoid;border-color:#bbb}a{color:inherit;text-decoration:none}.scroll{overflow:visible}}
.note{font-size:.82rem;color:var(--muted)}footer{margin-top:28px;font-size:.8rem;color:var(--muted)}
"""


def _delta_cell(x: float, good_if_positive: bool) -> str:
    if abs(x) < 0.05:
        cls, x = "zero", 0.0
    else:
        cls = "pos" if (x > 0) == good_if_positive else "neg"
    return f'<td class="{cls}">{x:+.1f}</td>'


def _cell(p: GapPlanner, option: Option | None, d: dt.date, new: dict) -> str:
    delivered = {f.date for f in p.delivered}
    planned_dates = {f.date for f in p.planned}
    cls, txt = [], str(d.day)
    if d.weekday() >= 5:
        cls.append("wk")
    if d in p.unavailable:
        cls.append("closed")
    if d in delivered:
        cls.append("delivered")
    elif d in p.missed:
        cls.append("missed")
    elif option is None and d in planned_dates and d >= p.resume:
        cls.append("planned")
    if d in new:
        n = len(new[d])
        cls.append("bid" if n > 1 else "new")
        if n > 1:
            txt = f"{d.day}<b>×2</b>"
    if d == p.planned_end:
        cls.append("endmark")
    return f'<div class="cell {" ".join(cls)}" title="{_fmt_date(d)}">{txt}</div>'


def _calendar(p: GapPlanner, option: Option | None, first: dt.date, last: dt.date) -> str:
    """Week-per-row calendar (Mon..Sun). ``first`` is a Monday, ``last`` a Sunday."""
    new = group_by_day(option.new_fractions) if option else {}
    head = '<div class="wl"></div>' + "".join(f'<div class="hd">{n[0:2]}</div>' for n in
                                               ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"])
    rows = []
    monday = first
    while monday <= last:
        days = [monday + dt.timedelta(days=i) for i in range(7)]
        rows.append(f'<div class="wl">{monday.day}/{monday.month}</div>' +
                    "".join(_cell(p, option, d, new) for d in days))
        monday += dt.timedelta(days=7)
    return '<div class="cal">' + head + "".join(rows) + "</div>"


def _option_row(p: GapPlanner, o: Option, idx: str, e) -> str:
    tags = ""
    if o.recommended:
        tags += '<span class="tag">★ recommended</span>'
    if o.n_bid_days:
        tags += f'<span class="tag">BID ×{o.n_bid_days}</span>'
    if o.n_saturdays:
        tags += f'<span class="tag">Sat ×{o.n_saturdays}</span>'
    if o.n_sundays:
        tags += f'<span class="tag">Sun ×{o.n_sundays}</span>'
    why = ("<div class='why'>" + "<br>".join("✗ " + e(w) for w in o.rejected) + "</div>") if o.rejected else ""
    link = f"<a href='#o{idx}'>{e(o.title)}</a>" if not o.rejected else e(o.title)
    cls = "rec" if o.recommended else ("rej" if o.rejected else "")
    return (f"<tr class='{cls}'><td>{idx}</td><td class='t'>{link}{tags}{why}</td>"
            f"<td>{o.dose_per_fraction:.2f}</td>{_delta_cell(o.tumour.delta, True)}"
            + "".join(_delta_cell(r.delta, True) for r in o.levels)
            + "".join(_delta_cell(r.delta, False) for r in o.oars) +
            f"<td>{o.n_new}</td><td>{weekday_name(o.end_date)} {o.end_date.day}/{o.end_date.month}</td>"
            f"<td>{o.extension_days:+d}</td></tr>")


def _option_card(p: GapPlanner, o: Option, idx: str, first, last, e) -> str:
    oar_txt = "; ".join(f"{e(r.name)} {r.eqd2:.1f} Gy ({_signed(r.delta)}, {_signed(r.delta_pct)} %)" for r in o.oars)
    exact = (f" (exact {o.exact_dose:.3f} Gy)" if o.exact_dose is not None
             and abs(o.exact_dose - o.dose_per_fraction) > 1e-4 else "")
    warn = ("<ul class='warn'>" + "".join(f"<li>{e(w)}</li>" for w in o.warnings) + "</ul>") if o.warnings else ""
    dates = ", ".join(f"{weekday_name(d)} {d.day}/{d.month}{' ×2' if len(fx) > 1 else ''}"
                      for d, fx in sorted(group_by_day(o.new_fractions).items()))
    star = " ★" if o.recommended else ""
    if p.rx.is_multilevel:
        rem = "<br>".join(
            f"{e(p.rx.phases[ph].name or f'Phase {ph + 1}')}: {o.phase_counts[ph]} × ("
            + ", ".join(f"{e(lv)} {dd:.2f}" for lv, dd in o.phase_doses[ph].items()) + ") Gy"
            for ph in sorted(o.phase_counts))
        rem += f"<br><span class='note'>scale {o.scale:.3f} × planned doses{exact}</span>"
    else:
        rem = f"{o.n_new} × {o.dose_per_fraction:.2f} Gy{exact} = {o.n_new * o.dose_per_fraction:.2f} Gy"
    lv_txt = "".join(f"<dt>{e(r.name)} EQD2<sub>T</sub></dt><dd>{r.eqd2:.1f} Gy ({_signed(r.delta)} Gy, "
                     f"{_signed(r.delta_pct)} %)</dd>" for r in o.levels)
    return f"""
<div class="card opt" id="o{idx}"><h3>{idx}. {e(o.title)}{star}</h3><p class="m">{e(o.method)}</p>
<div class="row">{_calendar(p, o, first, last)}<dl>
<dt>Remaining</dt><dd>{rem}</dd>
<dt>Ends</dt><dd>{_fmt_date(o.end_date)} · T = {o.overall_time} d ({o.extension_days:+d} d vs plan)</dd>
<dt>{e(o.tumour.name)} EQD2<sub>T</sub></dt><dd>{o.tumour.eqd2:.1f} Gy ({_signed(o.tumour.delta)} Gy, {_signed(o.tumour.delta_pct)} %)</dd>
{lv_txt}<dt>OAR EQD2</dt><dd>{oar_txt}</dd>
<dt>Dates</dt><dd class="note">{dates}</dd></dl></div>{warn}</div>"""


def input_checksum(audit_input: dict | None) -> str:
    blob = json.dumps(audit_input or {}, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _sensitivity_html(sens, e) -> str:
    if sens is None:
        return ""
    g = sens.grid
    t0, t1 = sens.tumour_range
    rows = "".join(f"<tr><td class='t'>{e(name)}</td><td>{_signed(sens.oar_ranges[name][0])} … "
                   f"{_signed(sens.oar_ranges[name][1])}</td><td>{_signed(sens.oar_pct_ranges[name][0])} … "
                   f"{_signed(sens.oar_pct_ranges[name][1])} %</td></tr>" for name in sens.oar_ranges)
    dec_rows = "".join(f"<tr><td class='t'>{e(t)}</td><td>{c} / {sens.n}</td><td>"
                       + (f"{r[0]:.2f}–{r[1]:.2f}" if r[1] > 0 else "-") + "</td></tr>" for t, c, r in sens.decisions)
    grid = (f"tumour α/β × {', '.join(f'{x:g}' for x in g['tumour_alpha_beta'])}; "
            f"repopulation × {', '.join(f'{x:g}' for x in g['repopulation'])}; "
            f"T_k {', '.join(f'{x:+g}' for x in g['kickoff_shift_days'])} d; "
            f"late α/β × {', '.join(f'{x:g}' for x in g['late_alpha_beta'])}")
    worst = ", ".join(f"{k} {v}" for k, v in sens.worst_tumour_params.items())
    return f"""<h2>Robustness to the radiobiological parameters</h2>
<div class="card"><p class="note">{sens.n} parameter combinations: {e(grid)}.</p>
<p><b>{e(sens.option_title)}</b> across the grid: tumour EQD2<sub>T</sub> {_signed(t0)} … {_signed(t1)} Gy
({_signed(sens.tumour_pct_range[0])} … {_signed(sens.tumour_pct_range[1])} %).
<span class="note">Worst tumour case: {e(worst)}.</span></p>
<div class="scroll"><table><thead><tr><th>OAR</th><th>Δ EQD2 (Gy)</th><th>Δ %</th></tr></thead><tbody>{rows}</tbody></table></div>
<p style="margin-top:12px">Decision re-run with each combination: same recommendation in
<b>{100 * sens.same_fraction:.0f} %</b> of cases.</p>
<div class="scroll"><table><thead><tr><th>Recommended</th><th>Cases</th><th>d range (Gy)</th></tr></thead>
<tbody>{dec_rows}</tbody></table></div></div>"""


def _scenarios_html(rows, outage_start, e) -> str:
    if not rows:
        return ""
    body = []
    for r in rows:
        o = r.option
        what = e(o.title) if o else ("No compensation" if r.status == "no_action" else "Clinical decision")
        detail = (f"{o.n_new} × {o.dose_per_fraction:.2f} Gy, ends {o.end_date.day}/{o.end_date.month} "
                  f"({o.extension_days:+d} d)") if o and o.family != "baseline" else ""
        body.append(f"<tr><td>{weekday_name(r.resume)} {r.resume.day}/{r.resume.month}</td>"
                    f"<td>{r.n_missed} fx · {r.baseline_extension:+d} d</td>{_delta_cell(r.baseline_tumour_delta, True)}"
                    f"<td class='t'>{what}<div class='note'>{detail}</div></td></tr>")
    return f"""<h2>If treatment resumes on…</h2>
<div class="card scroll"><p class="note">Outage from {_fmt_date(outage_start)}; each row re-runs the whole decision.
“Uncompensated” = missed fractions, prolongation and tumour Δ EQD2<sub>T</sub> (Gy) without compensation.</p>
<table><thead><tr><th>Resume</th><th>Uncompensated</th><th>Δ T</th><th>Decision</th></tr></thead>
<tbody>{''.join(body)}</tbody></table></div>"""


def html_report(p: GapPlanner, dec: Decision, title: str = "Gap compensation",
                protocol_name: str | None = None, sens=None, scenarios=None, outage_start=None,
                audit_input: dict | None = None, generated: dt.datetime | None = None) -> str:
    s = p.summary()
    rx = p.rx
    e = html.escape
    all_opts = dec.feasible + dec.rejected
    ends = [o.end_date for o in all_opts if o.end_date] + [p.planned_end]
    first_event = min(p.missed + [p.resume])
    first = first_event - dt.timedelta(days=first_event.weekday() + 7)
    first = max(first, rx.start - dt.timedelta(days=rx.start.weekday()))
    last = max(o.end_date for o in dec.feasible) if dec.feasible else max(ends)
    last = max(last, p.planned_end)
    last = last + dt.timedelta(days=6 - last.weekday())
    n_before = sum(1 for f in p.delivered if f.date < first)

    cls = {"recommended": "", "no_action": "na", "clinical_decision": "cd", "no_gap": "na"}[dec.status]
    label = {"recommended": "Recommended", "no_action": "No compensation needed",
             "clinical_decision": "Clinical decision needed", "no_gap": "Nothing to do"}[dec.status]
    cand = ""
    if dec.candidates:
        cand = ("<p class='note'>Options to weigh: " +
                ", ".join(f"<a href='#o{dec.feasible.index(o) + 1}'>{e(o.title)}</a>" for o in dec.candidates
                          if o in dec.feasible) + "</p>")
    decision = f"""<div class="card decision {cls}"><h2>{label}</h2><p class="big">{e(dec.headline)}</p>
<ul class="trace">{''.join(f'<li>{e(t)}</li>' for t in dec.trace)}</ul>{cand}</div>"""

    oar_head = "".join(f"<th>Δ {e(o.name)}</th>" for o in p.oars)
    lvl_head = "".join(f"<th>Δ {e(t.name)}</th>" for t in p.tumours[1:])
    head = (f"<thead><tr><th>#</th><th>Option</th><th>d (Gy)</th><th>Δ {e(p.tumour.name)} EQD2<sub>T</sub></th>{lvl_head}{oar_head}"
            f"<th>n</th><th>Ends</th><th>Δt (d)</th></tr></thead>")
    feas_rows = "".join(_option_row(p, o, str(i), e) for i, o in enumerate(dec.feasible, 1))
    rej_rows = "".join(_option_row(p, o, f"x{i}", e) for i, o in enumerate(dec.rejected, 1))
    cards = "".join(_option_card(p, o, str(i), first, last, e) for i, o in enumerate(dec.feasible, 1))
    rejected_block = ""
    if dec.rejected:
        rejected_block = f"""<details class="card scroll"><summary>Excluded options ({len(dec.rejected)}) and why</summary>
<table>{head}<tbody>{rej_rows}</tbody></table></details>"""

    notes = "".join(f"<li>{e(n)}</li>" for n in p.rules.notes)
    notes_block = f"<dt>Site notes</dt><dd><ul class='trace' style='margin:0'>{notes}</ul></dd>" if notes else ""
    oar_params = "".join(f"<dt>{e(o.name)}</dt><dd>{e(o.describe())} · planned EQD2 {v:.1f} Gy</dd>"
                         for o, v in zip(p.oars, p.planned_oars))
    proto = f"<dt>Protocol</dt><dd>{e(protocol_name)}</dd>" if protocol_name else ""
    levels_txt = ", ".join(f"{e(k)} {v:.1f} Gy" for k, v in s["planned_level_eqd2"].items()) \
        if len(p.tumours) > 1 else f"{s['planned_tumour_eqd2']:.1f} Gy"
    lvl_head = "".join(f"<th>Δ {e(t.name)}</th>" for t in p.tumours[1:])
    input_warn = ""
    if p.input_warnings:
        input_warn = ("<div class='card'><h3 style='margin:0 0 4px;font-size:1rem'>Input checks</h3><ul class='warn'>"
                      + "".join(f"<li>{e(w)}</li>" for w in p.input_warnings) + "</ul></div>")
    generated = generated or dt.datetime.now().astimezone()
    checksum = input_checksum(audit_input)
    blob = json.dumps(audit_input or {}, indent=1, default=str, ensure_ascii=False).replace("</", "<\\/")
    record = f"""<h2>Record</h2><div class="card"><dl>
<dt>Generated</dt><dd>{generated.strftime('%Y-%m-%d %H:%M %Z')}</dd>
<dt>Software</dt><dd>rtgap {__version__}</dd>
<dt>Input SHA-256</dt><dd class="note" style="word-break:break-all">{checksum}</dd></dl>
<div class="sign"><div><span>Calculated by</span><span class="line"></span><span>Date</span><span class="line s"></span></div>
<div><span>Checked by</span><span class="line"></span><span>Date</span><span class="line s"></span></div>
<div><span>Approved (clinician)</span><span class="line"></span><span>Date</span><span class="line s"></span></div></div>
<p class="note">The complete input of this calculation is stored inside this file; it can be re-loaded with
<code>rtgap extract</code> or the “Download input” button, and the checksum above identifies it.</p>
<div class="noprint"><button onclick="window.print()">Print / save as PDF</button>
<button onclick="dl()">Download input (JSON)</button></div></div>
<script type="application/json" id="rtgap-input">{blob}</script>
<script>
function dl(){{const t=document.getElementById('rtgap-input').textContent;
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{{type:'application/json'}}));
a.download='rtgap-input-{checksum[:8]}.json';a.click();}}
window.addEventListener('beforeprint',()=>document.querySelectorAll('details').forEach(d=>d.open=true));
</script>"""
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(title)}</title>
<style>{CSS}</style></head><body><main>
<h1>{e(title)}</h1><p class="sub">RTGap {__version__} · LQ-based compensation for unscheduled interruptions</p>
{decision}
{input_warn}
<div class="card"><dl>
<dt>Prescription</dt><dd>{e(rx.describe())} · {_fmt_date(rx.start)} → {_fmt_date(s['planned_end'])} (T = {s['planned_T']} d)</dd>
<dt>Missed</dt><dd>{', '.join(_fmt_date(d) for d in s['missed']) or '-'}</dd>
<dt>Status</dt><dd>{s['delivered']} delivered, {s['remaining']} remaining, resume {_fmt_date(s['resume'])}</dd>
<dt>Rules</dt><dd>{e(_rules_line(p))}</dd>{notes_block}{proto}
<dt>Local</dt><dd>{e(_constraints_line(p))}</dd>
<dt>Tumour</dt><dd>{e(p.tumour.describe())} · planned EQD2<sub>T</sub> {levels_txt}</dd>
{oar_params}
</dl></div>
<h2>Plan as prescribed</h2>
<div class="card">{_calendar(p, None, first, last)}
<div class="legend"><span><i style="background:var(--delivered)"></i>delivered</span>
<span><i style="border:2px solid var(--missed)"></i>missed</span><span><i style="background:var(--planned)"></i>planned</span>
<span><i style="background:var(--new)"></i>new fraction</span><span><i style="background:var(--bid)"></i>2 fractions (BID)</span>
<span><i style="background:var(--wk)"></i>weekend</span><span><i style="outline:2px solid var(--ink)"></i>planned last day</span></div>
{f'<p class="note">{n_before} earlier delivered fractions not shown.</p>' if n_before else ''}</div>
<h2>Feasible options</h2>
<div class="card scroll"><table>{head}<tbody>{feas_rows}</tbody></table>
<p class="note">Listed in the RCR order of consideration. Δ in Gy EQD2 vs the prescribed schedule; green = favourable, red = unfavourable.</p></div>
{rejected_block}
{cards}
{_sensitivity_html(sens, e)}
{_scenarios_html(scenarios, outage_start, e)}
{record}
<h2>Method</h2><div class="card note">
<p>BED = Σ d (1 + d/(α/β)) per tissue, with optional incomplete repair between same-day fractions
(mono-exponential, Thames). Tumour EQD2<sub>T</sub> = EQD2 − D<sub>prolif</sub>·(T − T<sub>k</sub>) for T &gt; T<sub>k</sub>,
T = last − first fraction date; K (RCR, BED/day) = D<sub>prolif</sub>(1 + 2/(α/β)).
Doses are rounded to {p.c.dose_rounding:g} Gy before evaluation. OAR doses use dose ratio × prescribed fraction dose
(1.0 = point dose at prescription, conservative). With several dose levels the plan is scaled as a whole
(all levels by the same factor), and the primary level drives the decision.</p>
<p>References: Bentzen &amp; Joiner, in Joiner &amp; van der Kogel (eds.) <i>Basic Clinical Radiobiology</i>, ch. 9;
RCR, <i>The timely delivery of radical radiotherapy</i>, 4th ed. (2019) and 5th ed. draft for consultation; Joiner (2004).</p></div>
<footer>{e(DISCLAIMER)}</footer></main></body></html>"""
