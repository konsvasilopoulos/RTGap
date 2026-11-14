"""Load a case (and optionally a departmental protocol) into a GapPlanner.

Case file (YAML or JSON)::

    site: hn_scc                 # id from the site library (rtgap sites)
    prescription: {start, n_fractions, dose_per_fraction, treatment_weekdays, closed_dates}
    gap: {missed_dates, resume_date, unavailable_dates, delivered}
    tumour: {...}                # optional overrides of the site tumour parameters
    oars: [...]                  # optional; replaces the site default OARs
    rules: {category, ideal_extension_days, max_extension_days, max_overall_time_days, no_acceleration}
    constraints: {...}           # optional; overrides the protocol constraints
    custom_options: [...]

Protocol file::

    name: "Department of Radiotherapy, ..."
    constraints: {allow_sunday: false, max_late_increase_pct: 3, ...}
    sites: {hn_scc: {tumour: {k_bed_per_day: 0.8}}, my_site: {...}}
"""
from __future__ import annotations

import dataclasses
import json
from pathlib import Path

from .gap import GapPlanner, Phase, Prescription
from .rules import CaseRules, Constraints, load_library, oar_from_dict
from .schedule import Fraction, parse_date, parse_weekdays
from .tissues import Tissue
from .validation import ValidationError, check_case_dict, check_planner


def outage_missed_dates(rx: Prescription, outage_start, resume) -> set:
    """Planned treatment days from the start of an outage up to (not including) the resume date."""
    return {f.date for f in rx.planned_fractions() if outage_start <= f.date < resume}


def load_file(path: str | Path) -> dict:
    text = Path(path).read_text(encoding="utf-8")
    if str(path).lower().endswith((".yaml", ".yml")):
        import yaml
        return yaml.safe_load(text) or {}
    return json.loads(text)


load_case = load_file  # backwards compatibility


def prescription_from_dict(rx_cfg: dict) -> Prescription:
    """Simple form (n_fractions + dose_per_fraction) or phases with dose levels::

        phases:
          - {name: "SIB", n_fractions: 35, levels: {PTV70: 2.0, PTV63: 1.8, PTV56: 1.6}}
        primary_level: PTV70
    """
    from .holidays import closed_dates_for
    phases = None
    if rx_cfg.get("phases"):
        phases = tuple(Phase(int(p["n_fractions"]), {str(k): float(v) for k, v in p["levels"].items()},
                             p.get("name", "")) for p in rx_cfg["phases"])
    start = parse_date(rx_cfg["start"])
    closed = {parse_date(d) for d in rx_cfg.get("closed_dates", []) or []}
    if rx_cfg.get("holidays"):
        closed |= closed_dates_for(rx_cfg["holidays"], start.year, start.year + 1)
    return Prescription(
        start=start,
        n_fractions=None if phases else int(rx_cfg["n_fractions"]),
        dose_per_fraction=None if phases else float(rx_cfg["dose_per_fraction"]),
        treatment_weekdays=parse_weekdays(rx_cfg.get("treatment_weekdays", ["Mon", "Tue", "Wed", "Thu", "Fri"])),
        closed_dates=frozenset(closed), phases=phases, primary_level=rx_cfg.get("primary_level"),
    )


def planner_from_dict(cfg: dict, protocol: dict | None = None) -> tuple[GapPlanner, list]:
    """Return the planner and a list of evaluated custom options."""
    protocol = protocol or {}
    library = load_library(protocol.get("sites"))

    site = None
    if cfg.get("site"):
        sid = cfg["site"]
        if sid not in library:
            raise ValueError(f"unknown site {sid!r}; run 'rtgap sites' for the list")
        site = library[sid]

    # tumour: site defaults, then case overrides
    t_cfg = dict(site.tumour if site else {})
    t_cfg.update(cfg.get("tumour") or {})
    if "dprolif_eqd2_per_day" in (cfg.get("tumour") or {}):
        t_cfg.pop("k_bed_per_day", None)
    if "k_bed_per_day" in (cfg.get("tumour") or {}):
        t_cfg.pop("dprolif_eqd2_per_day", None)
    tumour = Tissue.tumour(
        t_cfg.get("name", site.name if site else "Tumour"), float(t_cfg.get("alpha_beta", 10.0)),
        dprolif=t_cfg.get("dprolif_eqd2_per_day"), k_bed=t_cfg.get("k_bed_per_day"),
        kickoff_days=t_cfg.get("kickoff_days"), dose_ratio=float(t_cfg.get("dose_ratio", 1.0)),
        repair_half_time_h=t_cfg.get("repair_half_time_h"),
    )
    if cfg.get("oars"):
        oars = [oar_from_dict(o) for o in cfg["oars"]]
    elif site:
        oars = site.oar_tissues()
    else:
        oars = [oar_from_dict({"name": "Late (α/β 3)", "alpha_beta": 3})]

    rules = site.rules() if site else CaseRules()
    over = dict(cfg.get("rules") or {})
    if "category" in cfg and "category" not in over:
        over["category"] = cfg["category"]
    if over:
        if "category" in over and over["category"] != rules.category:
            over.setdefault("ideal_extension_days", None)
            over.setdefault("max_extension_days", None)
        rules = dataclasses.replace(rules, **over)

    c_cfg = dict(protocol.get("constraints") or {})
    c_cfg.update(cfg.get("constraints") or cfg.get("options") or {})
    constraints = Constraints.from_dict(c_cfg)

    brachy = [(parse_date(f["date"]), float(f["dose"])) for f in ((cfg.get("brachy") or {}).get("fractions") or [])]
    if any(d <= 0 for _, d in brachy):
        raise ValidationError(["brachytherapy dose must be > 0"])
    rx_cfg = dict(cfg["prescription"])
    if brachy:      # no external beam on a brachytherapy day
        rx_cfg["closed_dates"] = list(rx_cfg.get("closed_dates") or []) + [d for d, _ in brachy]
    rx = prescription_from_dict(rx_cfg)
    gap = cfg.get("gap", {}) or {}
    delivered = None
    if gap.get("delivered"):
        delivered = [Fraction(parse_date(f["date"]), int(f.get("slot", 0)), float(f["dose"]), int(f.get("phase", 0)))
                     for f in gap["delivered"]]
    resume = parse_date(gap["resume_date"]) if gap.get("resume_date") else None
    missed = {parse_date(d) for d in gap.get("missed_dates", []) or []}
    if gap.get("outage_start"):
        if resume is None:
            raise ValidationError(["gap.outage_start needs gap.resume_date (or use 'scenarios' for unknown dates)."])
        missed |= outage_missed_dates(rx, parse_date(gap["outage_start"]), resume)
    if gap.get("cause"):
        if gap["cause"] not in ("machine", "holiday", "toxicity", "patient", "other"):
            raise ValidationError([f"unknown gap cause {gap['cause']!r}"])
        rules = dataclasses.replace(rules, gap_cause=gap["cause"])
    try:
        planner = GapPlanner(
            rx, tumour, oars, missed_dates=sorted(missed), resume_date=resume, delivered=delivered,
            unavailable_dates=[parse_date(d) for d in gap.get("unavailable_dates", []) or []],
            constraints=constraints, rules=rules, brachy=brachy,
        )
    except ValueError as exc:
        raise ValidationError([str(exc)]) from exc
    issues = check_planner(planner)
    issues.raise_if_errors()
    planner.input_warnings = check_case_dict(cfg) + issues.warnings
    custom = []
    for co in cfg.get("custom_options", []) or []:
        custom.append(planner.custom_option(
            co.get("name", "Custom"),
            [parse_date(d) for d in co.get("dates", [])],
            [parse_date(d) for d in co.get("bid_dates", []) or []],
            strategy=co.get("strategy", "match_tumour"), dose=co.get("dose"),
        ))
    return planner, custom
