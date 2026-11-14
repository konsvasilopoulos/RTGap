"""Command-line interface.

    rtgap plan case.yaml [--protocol local.yaml] [--html report.html] [--json results.json]
               [--outage-start 2026-11-04 --days 10] [--no-sensitivity]
    rtgap extract report.html [-o case.json]      # recover the exact input of a saved report
    rtgap validate cases/ [--protocol local.yaml] [--csv out.csv]   # retrospective comparison with what was given
    rtgap benchmark                               # reference values for comparison with other software
    rtgap sites [--protocol local.yaml]
    rtgap eqd2 -n 35 -d 2 --ab 10 [-T 46 --dprolif 0.7 --tk 21]
    rtgap error --planned 70 --p 2 --error 8 --e 4
"""
from __future__ import annotations

import argparse
import sys

from . import __version__, lq
import json

from .analysis import candidate_resume_dates, resume_scenarios, sensitivity
from .config import load_file, planner_from_dict
from .decide import decide
from .schedule import parse_date
from .validation import ValidationError
from .error import joiner_correction
from .report import html_report, text_report
from .rules import load_library


def _plan(args) -> int:
    cfg = load_file(args.case)
    if "case" in cfg and "prescription" not in cfg:          # file produced by 'rtgap extract'
        protocol = cfg.get("protocol") or {}
        cfg = cfg["case"]
    else:
        protocol = load_file(args.protocol) if args.protocol else (
            load_file(cfg["protocol"]) if cfg.get("protocol") else {})
    try:
        planner, custom = planner_from_dict(cfg, protocol)
    except ValidationError as exc:
        print(exc, file=sys.stderr)
        return 2
    dec = decide(planner, planner.options() + custom)
    sens = None if args.no_sensitivity or cfg.get("sensitivity") is False else \
        sensitivity(planner, dec, (cfg.get("sensitivity") or None) if isinstance(cfg.get("sensitivity"), dict) else None)

    sc_cfg = dict(cfg.get("scenarios") or {})
    if args.outage_start:
        sc_cfg["outage_start"] = args.outage_start
        sc_cfg.setdefault("days", args.days)
    scenarios, outage = None, None
    if sc_cfg.get("outage_start"):
        outage = parse_date(sc_cfg["outage_start"])
        dates = [parse_date(d) for d in sc_cfg.get("resume_dates", []) or []] or \
            candidate_resume_dates(planner, outage, int(sc_cfg.get("days", 10)))
        scenarios = resume_scenarios(planner, outage, dates)

    print(text_report(planner, dec, sens, scenarios))
    audit_input = {"case": cfg, "protocol": protocol}
    if args.html:
        title = cfg.get("title", "Gap compensation")
        with open(args.html, "w", encoding="utf-8") as fh:
            fh.write(html_report(planner, dec, title=title, protocol_name=protocol.get("name"), sens=sens,
                                 scenarios=scenarios, outage_start=outage, audit_input=audit_input))
        print(f"\nHTML report written to {args.html}")
    if args.json:
        from .export import results_dict
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(results_dict(planner, dec, sens, scenarios, audit_input), fh, indent=1,
                      default=str, ensure_ascii=False)
        print(f"JSON results written to {args.json}")
    return 0


def _validate(args) -> int:
    """Retrospective validation: each case file holds the interruption and, as its first
    ``custom_options`` entry, the schedule that was actually given. The tool's suggestion and the
    given schedule are evaluated side by side."""
    import csv
    import pathlib
    from .analysis import local_control_loss
    protocol = load_file(args.protocol) if args.protocol else {}
    rows = []
    files = sorted(f for f in pathlib.Path(args.folder).iterdir() if f.suffix.lower() in (".yaml", ".yml", ".json"))
    for f in files:
        cfg = load_file(f)
        if "case" in cfg and "prescription" not in cfg:
            cfg = cfg["case"]
        try:
            planner, custom = planner_from_dict(cfg, protocol)
        except Exception as exc:                      # noqa: BLE001 - report and continue
            rows.append({"case": f.name, "status": f"error: {exc}"})
            continue
        dec = decide(planner, planner.options())
        sug = dec.recommended
        row = {"case": f.name, "site": planner.rules.site_id or "", "status": dec.status,
               "tool_schedule": f"{sug.n_new} x {sug.dose_per_fraction:.2f} Gy ({sug.title})" if sug else "; ".join(o.title for o in dec.candidates),
               "tool_end": sug.end_date.isoformat() if sug else "", "tool_d_tumour": round(sug.tumour.delta, 2) if sug else "",
               "tool_d_late_pct": round(sug.max_late_increase_pct, 1) if sug else ""}
        if custom:
            g = custom[0]
            decide(planner, [g] + planner.options())   # fills warnings / rule violations of the given schedule
            lc = local_control_loss(planner, g)
            same = bool(sug) and sug.end_date == g.end_date and sug.n_new == g.n_new and abs(sug.dose_per_fraction - g.dose_per_fraction) < 0.011
            row.update({"given_schedule": f"{g.n_new} x {g.dose_per_fraction:.2f} Gy", "given_end": g.end_date.isoformat(),
                        "given_ext_days": g.extension_days, "given_d_tumour": round(g.tumour.delta, 2),
                        "given_d_late_pct": round(g.max_late_increase_pct, 1), "given_peak7_pct": round(g.weekly_increase_pct),
                        "given_lc_loss_pct": f"{lc[0]:.1f}-{lc[1]:.1f}" if lc else "",
                        "given_rule_violations": "; ".join(g.rejected), "same_as_tool": "yes" if same else "no"})
        rows.append(row)
    keys = []
    for r in rows:
        for k in r:
            if k not in keys:
                keys.append(k)
    for r in rows:
        print(" | ".join(f"{k}={r.get(k, '')}" for k in keys if r.get(k, "") != ""))
    n_given = sum(1 for r in rows if "same_as_tool" in r)
    n_same = sum(1 for r in rows if r.get("same_as_tool") == "yes")
    print(f"\n{len(rows)} cases; {n_given} with a given schedule; identical to the tool's suggestion: {n_same}")
    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=keys)
            w.writeheader()
            w.writerows(rows)
        print(f"CSV written to {args.csv}")
    return 0


BENCHMARK = [  # n, d, alpha/beta, T, K (BED/day), Tk
    (35, 2.0, 10, 46, 0.9, 28), (35, 2.0, 3, None, 0, None), (30, 2.0, 10, 39, 0.9, 28), (20, 2.75, 10, 25, 0.9, 28),
    (20, 2.75, 3, None, 0, None), (15, 2.67, 3.5, None, 0, None), (20, 3.0, 1.6, None, 0, None), (5, 5.0, 10, None, 0, None),
    (5, 5.0, 4, None, 0, None), (25, 1.8, 10, 32, 0.9, 28), (33, 2.12, 10, 44, 0.9, 28), (16, 3.125, 10, 21, 0.9, 28),
    (10, 3.0, 10, None, 0, None), (40, 2.0, 3, None, 0, None),
]


def _benchmark(args) -> int:
    """Reference values to key into another LQ calculator (for example LQL-Equiv) and compare."""
    print("| n | d (Gy) | α/β (Gy) | T (d) | K (Gy/d) | Tk (d) | BED (Gy) | EQD2 (Gy) | other software | difference |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for n, d, ab, T, K, tk in BENCHMARK:
        b = lq.bed(n, d, ab) - (K * max(0, T - tk) if T is not None and K else 0)
        print(f"| {n} | {d:g} | {ab:g} | {T if T is not None else '–'} | {K if K else '–'} | {tk if tk is not None else '–'} | "
              f"{b:.2f} | {lq.eqd2_from_bed(b, ab):.2f} |  |  |")
    return 0


def _extract(args) -> int:
    import html as _html
    import re
    text = open(args.report, encoding="utf-8").read()
    m = re.search(r'<script type="application/json" id="rtgap-input">(.*?)</script>', text, re.S)
    if not m:
        print("no rtgap input found in this file", file=sys.stderr)
        return 1
    data = json.loads(m.group(1).replace("<\\/", "</"))
    out = json.dumps(data, indent=1, ensure_ascii=False)
    if args.o:
        open(args.o, "w", encoding="utf-8").write(out)
        print(f"input written to {args.o} (run: rtgap plan {args.o})")
    else:
        print(out)
    return 0


def _sites(args) -> int:
    protocol = load_file(args.protocol) if args.protocol else {}
    for sid, s in load_library(protocol.get("sites")).items():
        r = s.rules()
        t = s.tumour
        tf = (f"K {t['k_bed_per_day']} after {t.get('kickoff_days')} d" if t.get("k_bed_per_day")
              else f"Dprolif {t['dprolif_eqd2_per_day']} after {t.get('kickoff_days')} d"
              if t.get("dprolif_eqd2_per_day") else "no time factor")
        lim = (f"ext ≤ {r.ideal_extension_days}/{r.max_extension_days} d" if r.max_extension_days is not None
               else "no allowance")
        extra = (f", OTT ≤ {r.max_overall_time_days} d" if r.max_overall_time_days else "") + \
                (", no acceleration" if r.no_acceleration else "")
        print(f"{sid:<26} cat {str(s.category or '-'):<2} α/β {t.get('alpha_beta', 10):<4} {tf:<22} "
              f"{lim}{extra}  — {s.name}")
    return 0


def _eqd2(args) -> int:
    b = lq.bed(args.n, args.d, args.ab)
    e = lq.eqd2_from_bed(b, args.ab)
    print(f"{args.n:g} × {args.d:g} Gy, α/β = {args.ab:g} Gy: BED = {b:.2f} Gy{args.ab:g}, EQD2 = {e:.2f} Gy")
    if args.T is not None and args.dprolif and args.tk is not None:
        loss = lq.repopulation_eqd2(args.T, args.dprolif, args.tk)
        print(f"T = {args.T:g} d, D_prolif = {args.dprolif:g} Gy/d, T_k = {args.tk:g} d: "
              f"EQD2_T = {e - loss:.2f} Gy (−{loss:.2f} Gy)")
    return 0


def _error(args) -> int:
    print(joiner_correction(args.planned, args.p, args.error, args.e).text())
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="rtgap", description="LQ decision support for radiotherapy gaps and dose errors")
    ap.add_argument("--version", action="version", version=f"RTGap {__version__}")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("plan", help="compensation options for an unscheduled gap")
    p.add_argument("case", help="case file (.yaml/.yml or .json)")
    p.add_argument("--protocol", help="departmental protocol file (constraints, site overrides)")
    p.add_argument("--html", help="write an HTML report")
    p.add_argument("--json", help="write machine-readable results")
    p.add_argument("--outage-start", help="first day of an outage of unknown length: scan resume dates")
    p.add_argument("--days", type=int, default=10, help="calendar days to scan after --outage-start")
    p.add_argument("--no-sensitivity", action="store_true", help="skip the parameter robustness analysis")
    p.set_defaults(func=_plan)

    v = sub.add_parser("validate", help="retrospective comparison of past cases with the schedule that was given")
    v.add_argument("folder")
    v.add_argument("--protocol")
    v.add_argument("--csv")
    v.set_defaults(func=_validate)

    b = sub.add_parser("benchmark", help="reference BED/EQD2 values for comparison with other software")
    b.set_defaults(func=_benchmark)

    x = sub.add_parser("extract", help="recover the input stored in a saved HTML report")
    x.add_argument("report")
    x.add_argument("-o", help="output file (.json)")
    x.set_defaults(func=_extract)

    s = sub.add_parser("sites", help="list the site library")
    s.add_argument("--protocol", help="protocol file with site overrides")
    s.set_defaults(func=_sites)

    q = sub.add_parser("eqd2", help="BED / EQD2 of a schedule")
    q.add_argument("-n", type=float, required=True)
    q.add_argument("-d", type=float, required=True)
    q.add_argument("--ab", type=float, required=True)
    q.add_argument("-T", type=float)
    q.add_argument("--dprolif", type=float)
    q.add_argument("--tk", type=float)
    q.set_defaults(func=_eqd2)

    r = sub.add_parser("error", help="Joiner correction of a dose-per-fraction error (eq. 9.3–9.4)")
    r.add_argument("--planned", type=float, required=True, help="planned total dose P (Gy)")
    r.add_argument("--p", type=float, required=True, help="planned dose per fraction p (Gy)")
    r.add_argument("--error", type=float, required=True, help="dose delivered in error E (Gy)")
    r.add_argument("--e", type=float, required=True, help="erroneous dose per fraction e (Gy)")
    r.set_defaults(func=_error)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
