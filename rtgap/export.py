"""Machine-readable results (JSON-serialisable dict)."""
from __future__ import annotations

from . import __version__
from .decide import Decision
from .gap import GapPlanner, Option


def option_dict(o: Option) -> dict:
    return {
        "key": o.key, "family": o.family, "title": o.title, "strategy": o.strategy,
        "recommended": o.recommended, "rejected": o.rejected, "warnings": o.warnings,
        "n_new": o.n_new, "dose_per_fraction": o.dose_per_fraction, "scale": o.scale,
        "exact_dose": o.exact_dose, "end_date": o.end_date, "extension_days": o.extension_days,
        "overall_time": o.overall_time,
        "fractions": [{"date": f.date, "slot": f.slot, "phase": f.phase, "dose": round(f.dose, 4)}
                      for f in o.new_fractions],
        "phase_doses": {str(k): v for k, v in o.phase_doses.items()},
        "tissues": [{"name": r.name, "eqd2": r.eqd2, "planned": r.planned_eqd2, "delta": r.delta,
                     "delta_pct": r.delta_pct} for r in [o.tumour] + o.levels + o.oars],
    }


def results_dict(p: GapPlanner, dec: Decision, sens=None, scenarios=None, audit_input=None) -> dict:
    from .report import input_checksum
    out = {
        "software": f"RTGap {__version__}",
        "input_sha256": input_checksum(audit_input),
        "summary": p.summary(),
        "input_warnings": p.input_warnings,
        "decision": {"status": dec.status, "headline": dec.headline, "trace": dec.trace,
                     "recommended": option_dict(dec.recommended) if dec.recommended else None,
                     "candidates": [o.title for o in dec.candidates]},
        "feasible": [option_dict(o) for o in dec.feasible],
        "excluded": [option_dict(o) for o in dec.rejected],
    }
    if sens is not None:
        out["sensitivity"] = {"n": sens.n, "grid": sens.grid, "option": sens.option_title,
                              "tumour_delta_range": sens.tumour_range,
                              "tumour_delta_pct_range": sens.tumour_pct_range,
                              "oar_delta_pct_ranges": sens.oar_pct_ranges,
                              "same_decision_fraction": sens.same_fraction,
                              "decisions": [{"title": t, "count": c, "d_range": r} for t, c, r in sens.decisions]}
    if scenarios:
        out["scenarios"] = [{"resume": r.resume, "n_missed": r.n_missed, "status": r.status,
                             "headline": r.headline, "uncompensated_extension": r.baseline_extension,
                             "uncompensated_tumour_delta": r.baseline_tumour_delta} for r in scenarios]
    return out
