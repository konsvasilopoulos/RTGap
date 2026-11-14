"""Input checks. Errors stop the calculation; warnings are shown in the report."""
from __future__ import annotations

from dataclasses import dataclass

from .schedule import WEEKDAY_NAMES

CASE_KEYS = {"title", "site", "protocol", "category", "prescription", "gap", "tumour", "oars", "rules",
             "constraints", "options", "custom_options", "sensitivity", "scenarios", "audit", "brachy",
             "guidance"}
RX_KEYS = {"start", "n_fractions", "dose_per_fraction", "treatment_weekdays", "closed_dates", "holidays",
           "phases", "primary_level"}
GAP_KEYS = {"missed_dates", "resume_date", "unavailable_dates", "delivered", "outage_start", "cause",
            "extra_delivered", "dose_errors", "plan_change"}


class ValidationError(ValueError):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("Input errors:\n  - " + "\n  - ".join(errors))


@dataclass
class Issues:
    errors: list[str]
    warnings: list[str]

    def raise_if_errors(self):
        if self.errors:
            raise ValidationError(self.errors)


def check_case_dict(cfg: dict) -> list[str]:
    """Unknown keys are almost always typos: report them."""
    w = []
    for k in set(cfg) - CASE_KEYS:
        w.append(f"Unknown case key '{k}' ignored.")
    for k in set(cfg.get("prescription") or {}) - RX_KEYS:
        w.append(f"Unknown prescription key '{k}' ignored.")
    for k in set(cfg.get("gap") or {}) - GAP_KEYS:
        w.append(f"Unknown gap key '{k}' ignored.")
    return w


def _d(day) -> str:
    return f"{WEEKDAY_NAMES[day.weekday()]} {day.isoformat()}"


def check_planner(p) -> Issues:
    err: list[str] = []
    warn: list[str] = []
    rx = p.rx
    planned_dates = {f.date for f in p.planned}
    start, end = p.planned[0].date, p.planned[-1].date

    for m in p.missed:
        if m < rx.start:
            err.append(f"Missed date {_d(m)} is before the start of treatment ({_d(rx.start)}).")
        elif m in rx.closed_dates:
            warn.append(f"Missed date {_d(m)} is a planned closure (holiday): it was never a treatment day.")
        elif m not in planned_dates and m <= end:
            warn.append(f"Missed date {_d(m)} is not a planned treatment day (weekend?) and has no effect.")
        elif m > end:
            warn.append(f"Missed date {_d(m)} is after the planned end ({_d(end)}).")
    if p.missed and p.resume <= p.missed[-1]:
        err.append(f"Resume date {_d(p.resume)} must be after the last missed date ({_d(p.missed[-1])}).")
    if p.resume < rx.start:
        err.append(f"Resume date {_d(p.resume)} is before the start of treatment.")
    history = p.dose_errors or p.extra_dates or p.plan_change
    if not p.missed and p.resume <= end and not history:
        warn.append("No missed dates given: only the resume date defines the gap.")
    for d in p.extra_dates:
        if d < rx.start:
            err.append(f"Extra fraction on {_d(d)} is before the start of treatment.")
    for e in p.dose_errors:
        if e.actual > 2.5 * e.intended:
            warn.append(f"Dose error on {_d(e.date)}: {e.actual:g} Gy is more than 2.5 × the intended "
                        f"{e.intended:g} Gy. Check the value; LQ is uncertain at large doses.")
    if p.remaining == 0:
        warn.append("All prescribed fractions have been delivered: nothing to compensate.")

    for d in p.unavailable:
        if d < p.resume and d not in rx.closed_dates:
            warn.append(f"Unavailable date {_d(d)} is before the resume date and has no effect.")
    for d in p.c.chemo_dates:
        if d < start or d > end + (p.resume - start):
            warn.append(f"Chemotherapy date {_d(d)} is outside the treatment period.")

    for t in p.tumours:
        if not 0.5 <= t.alpha_beta <= 30:
            warn.append(f"{t.name}: unusual tumour α/β = {t.alpha_beta:g} Gy.")
        if t.dprolif > 0 and t.kickoff_days is None:
            warn.append(f"{t.name}: repopulation rate given without a kick-off time: time factor ignored.")
        if t.dprolif > 2:
            warn.append(f"{t.name}: D_prolif = {t.dprolif:g} Gy/day is unusually high (check K vs D_prolif units).")
    for o in p.oars:
        ratios = o.dose_ratio if isinstance(o.dose_ratio, (tuple, list)) else (o.dose_ratio,)
        if any(r < 0 for r in ratios):
            err.append(f"{o.name}: dose ratio cannot be negative.")
        if any(r > 1.2 for r in ratios):
            warn.append(f"{o.name}: dose ratio > 1.2 of the prescription: check the value.")
        if not 0.5 <= o.alpha_beta <= 15:
            warn.append(f"{o.name}: unusual α/β = {o.alpha_beta:g} Gy for a late endpoint.")
    for f in getattr(p, "fixed", []):
        if f.date < rx.start:
            warn.append(f"Brachytherapy fraction on {_d(f.date)} is before the start of external beam treatment.")
    if p.c.bid_interval_h < 6:
        warn.append(f"BID interval {p.c.bid_interval_h:g} h is below the RCR minimum of 6 h.")
    if p.c.dose_rounding and p.c.dose_rounding > 0.1:
        warn.append(f"Dose rounding {p.c.dose_rounding:g} Gy is coarse.")
    return Issues(err, warn)
