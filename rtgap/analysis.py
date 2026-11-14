"""Robustness of the decision.

* :func:`sensitivity` — re-runs the case over a grid of radiobiological
  parameters (tumour α/β, repopulation rate, kick-off time, late α/β) and
  reports (a) how the recommended schedule performs across the grid and
  (b) how often the decision itself would change.
* :func:`resume_scenarios` — when the end of an outage is unknown, runs the
  case for several possible resume dates.
"""
from __future__ import annotations

import dataclasses
import datetime as dt
import itertools
from collections import Counter
from dataclasses import dataclass, field

from .decide import Decision, decide
from .gap import GapPlanner, Option

DEFAULT_GRID = {
    "tumour_alpha_beta": (0.6, 1.0, 1.6),   # factors on the case value
    "repopulation": (0.67, 1.0, 1.33),      # factors on D_prolif / K
    "kickoff_shift_days": (-7, 0, 7),       # added to T_k
    "late_alpha_beta": (0.67, 1.0, 1.33),   # factors on every OAR α/β
}


@dataclass
class SensitivityResult:
    n: int
    grid: dict
    option_title: str
    tumour_range: tuple[float, float]                 # Δ EQD2 (Gy) of the chosen schedule
    tumour_pct_range: tuple[float, float]
    oar_ranges: dict[str, tuple[float, float]]        # Δ EQD2 (Gy)
    oar_pct_ranges: dict[str, tuple[float, float]]
    decisions: list[tuple[str, int, tuple[float, float]]]  # (title, count, d range)
    same_fraction: float
    worst_tumour_params: dict = field(default_factory=dict)


def _variant_tissues(p: GapPlanner, f_ab: float, f_rep: float, shift: float, f_late: float):
    tumours = []
    for t in p.tumours:
        tumours.append(dataclasses.replace(
            t, alpha_beta=t.alpha_beta * f_ab, dprolif=t.dprolif * f_rep,
            kickoff_days=None if t.kickoff_days is None else max(0.0, t.kickoff_days + shift)))
    oars = [dataclasses.replace(o, alpha_beta=o.alpha_beta * f_late) for o in p.oars]
    return tumours, oars


def sensitivity(p: GapPlanner, dec: Decision, grid: dict | None = None) -> SensitivityResult | None:
    if p.remaining == 0:
        return None
    g = dict(DEFAULT_GRID)
    g.update(grid or {})
    if not p.tumour.has_time_factor:
        g["repopulation"] = (1.0,)
        g["kickoff_shift_days"] = (0,)
    chosen: Option | None = dec.recommended or (dec.candidates[0] if dec.candidates else None)
    if chosen is None:
        chosen = next((o for o in dec.feasible), None)
    if chosen is None:
        return None
    base_key = chosen.key

    t_d, t_p = [], []
    o_d: dict[str, list[float]] = {o.name: [] for o in p.oars}
    o_p: dict[str, list[float]] = {o.name: [] for o in p.oars}
    decisions: Counter = Counter()
    d_ranges: dict[str, list[float]] = {}
    worst = (None, 1e9)
    combos = list(itertools.product(g["tumour_alpha_beta"], g["repopulation"],
                                    g["kickoff_shift_days"], g["late_alpha_beta"]))
    same = 0
    for f_ab, f_rep, shift, f_late in combos:
        tumours, oars = _variant_tissues(p, f_ab, f_rep, shift, f_late)
        q = p.variant(tumour=tumours, oars=oars)
        fixed = q.evaluate(chosen.key, chosen.title, chosen.method, chosen.new_fractions,
                           chosen.dose_per_fraction, chosen.strategy, family=chosen.family)
        t_d.append(fixed.tumour.delta)
        t_p.append(fixed.tumour.delta_pct)
        if fixed.tumour.delta < worst[1]:
            worst = ({"tumour α/β": round(tumours[0].alpha_beta, 2), "D_prolif": round(tumours[0].dprolif, 3),
                      "T_k": tumours[0].kickoff_days, "late α/β ×": f_late}, fixed.tumour.delta)
        for r in fixed.oars:
            o_d[r.name].append(r.delta)
            o_p[r.name].append(r.delta_pct)
        dq = decide(q)
        rec = dq.recommended
        label = rec.title if rec else "clinical decision"
        decisions[label] += 1
        if rec:
            d_ranges.setdefault(label, []).append(rec.dose_per_fraction)
        if (rec.key if rec else None) == (base_key if dec.recommended else None):
            same += 1
    rng = lambda xs: (min(xs), max(xs)) if xs else (0.0, 0.0)
    return SensitivityResult(
        n=len(combos), grid=g, option_title=chosen.title,
        tumour_range=rng(t_d), tumour_pct_range=rng(t_p),
        oar_ranges={k: rng(v) for k, v in o_d.items()}, oar_pct_ranges={k: rng(v) for k, v in o_p.items()},
        decisions=[(k, c, rng(d_ranges.get(k, []))) for k, c in decisions.most_common()],
        same_fraction=same / len(combos), worst_tumour_params=worst[0] or {},
    )


# --------------------------------------------------------------------------- #
@dataclass
class ScenarioRow:
    resume: dt.date
    n_missed: int
    baseline_extension: int
    baseline_tumour_delta: float
    status: str
    headline: str
    option: Option | None


def outage_missed(p: GapPlanner, outage_start: dt.date, resume: dt.date) -> list[dt.date]:
    return sorted(f.date for f in p.planned if outage_start <= f.date < resume)


def candidate_resume_dates(p: GapPlanner, outage_start: dt.date, days: int) -> list[dt.date]:
    """Regular treatment days from the day after the outage start, over ``days`` calendar days."""
    out = []
    for i in range(1, days + 1):
        d = outage_start + dt.timedelta(days=i)
        if p.is_regular(d):
            out.append(d)
    return out


def current_outage_start(p: GapPlanner) -> dt.date | None:
    """First day of the latest interruption (earlier interruptions are history)."""
    if p.interruptions:
        return p.interruptions[-1][0]
    return p.missed[0] if p.missed else None


def resume_scenarios(p: GapPlanner, outage_start: dt.date, resume_dates) -> list[ScenarioRow]:
    """Decision for each possible resume date of the current outage. Earlier interruptions, extra
    fractions and dose errors before the outage are kept."""
    rows = []
    earlier = [d for d in p.missed if d < outage_start]
    init = p._init
    extra = [d for d in (init.get("extra_delivered") or ()) if d < outage_start]
    errs = [e for e in (init.get("dose_errors") or ()) if e[0] < outage_start]
    pc = init.get("plan_change")
    if pc is not None and pc[0] > outage_start:
        pc = None
    for r in sorted(resume_dates):
        missed = outage_missed(p, outage_start, r)
        q = p.variant(missed_dates=earlier + missed, resume_date=r, delivered=None,
                      extra_delivered=extra, dose_errors=errs, plan_change=pc)
        dec = decide(q)
        base = next(o for o in dec.feasible + dec.rejected if o.family == "baseline") if q.remaining else None
        rows.append(ScenarioRow(
            resume=r, n_missed=len(missed),
            baseline_extension=base.extension_days if base else 0,
            baseline_tumour_delta=base.tumour.delta if base else 0.0,
            status=dec.status, headline=dec.headline, option=dec.recommended))
    return rows


# --------------------------------------------------------------------------- #
LC_LOSS_PER_DAY = (1.0, 1.4)   # % absolute local control per uncompensated day (RCR 2019, fast-growing tumours)


def local_control_loss(p: GapPlanner, o: Option) -> tuple[float, float] | None:
    """Rule-of-thumb loss of local control (percent, absolute) for a schedule.

    The tumour EQD2 shortfall is expressed in days of repopulation (shortfall / D_prolif) and
    multiplied by the RCR figure of about 1.0-1.4 % per day. Only for tumours with a time factor;
    a rough guide for fast-growing (category 1) tumours, not a TCP model.
    """
    t = p.tumour
    if not t.has_time_factor:
        return None
    days = max(0.0, -o.tumour.delta) / t.dprolif
    return (LC_LOSS_PER_DAY[0] * days, LC_LOSS_PER_DAY[1] * days)


def recoverable_fraction(p: GapPlanner, dec: Decision, late_tol_pct: float) -> float | None:
    """Share of the uncompensated tumour loss that the best feasible option recovers while keeping
    every organ within ``late_tol_pct`` percent of its planned EQD2 (idea after Putora et al. 2012)."""
    base = next((o for o in dec.feasible + dec.rejected if o.family == "baseline"), None)
    if base is None or base.tumour.delta > -0.005:
        return None
    ok = [o for o in dec.feasible if o.max_late_increase_pct <= late_tol_pct + 1e-9]
    if not ok:
        return 0.0
    best = min(max(0.0, -o.tumour.delta) for o in ok)
    return max(0.0, min(1.0, 1.0 - best / -base.tumour.delta))
