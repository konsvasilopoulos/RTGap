"""Site library, RCR category rules and local (departmental) constraints."""
from __future__ import annotations

import copy
import datetime as dt
from dataclasses import dataclass, field, fields
from importlib import resources
from typing import Any

from .tissues import Tissue

# RCR category -> (ideal, max) prolongation in days.
#   cat 1: no prolongation over 2 days (aim for none)
#   cat 2: ideally <= 2 days; compensation required beyond 5 days
#   cat 3: compensation generally considered beyond 7 days
CATEGORY_DEFAULTS = {1: (0, 2), 2: (2, 5), 3: (7, 7)}

# Repair half-time used for late-responding organs when two fractions fall on one day.
# 4.4 h: subcutaneous fibrosis, CHART head & neck (Bentzen, Saunders & Dische, Radiother Oncol 1999;
# 3.8 h telangiectasia, 4.9 h laryngeal oedema). Set repair_half_time_h: null to assume complete repair.
DEFAULT_LATE_REPAIR_H = 4.4


@dataclass
class CaseRules:
    """Rules that decide what is acceptable for this patient."""
    category: int | None = None
    ideal_extension_days: int | None = None
    max_extension_days: int | None = None
    max_overall_time_days: int | None = None
    no_acceleration: bool = False
    site_id: str | None = None
    site_name: str | None = None
    notes: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    gap_cause: str | None = None          # machine | holiday | toxicity | patient | other

    def __post_init__(self):
        if self.category in CATEGORY_DEFAULTS:
            ideal, mx = CATEGORY_DEFAULTS[self.category]
            if self.ideal_extension_days is None:
                self.ideal_extension_days = ideal
            if self.max_extension_days is None:
                self.max_extension_days = mx
        if self.max_extension_days is not None and self.ideal_extension_days is None:
            self.ideal_extension_days = 0


@dataclass
class Constraints:
    """Departmental / local constraints. Defaults allow everything: the tool
    generates every RCR method and these settings exclude what is not possible."""
    allow_saturday: bool = True
    allow_sunday: bool = True
    allow_bid: bool = True
    bid_interval_h: float = 6.0
    bid_max_dose: float = 2.2             # RCR: BID not recommended for d significantly > 2.2 Gy
    allow_consecutive_bid: bool = True    # False -> reject; True -> warn only
    avoid_consecutive_bid: bool = True    # pattern generation preference
    allow_dose_change: bool = True
    max_dose_per_fraction: float | None = None
    allow_extra_fractions: bool = True
    max_extra_fractions: int = 15
    max_fractions_per_week: int | None = None
    chemo_dates: tuple[dt.date, ...] = ()
    chemo_daily: bool = False             # RCR5d: BID not on chemo days if chemo non-daily or d > 1.5 Gy
    dose_rounding: float = 0.01
    # Acute-reaction surrogate: largest tolerated rise (percent) of the peak 7-day dose vs the plan.
    max_weekly_increase_pct: float | None = None
    # Tolerances (percent of planned EQD2) inside which a dose-modified schedule may be suggested
    # automatically. None (default) = never: every change of fraction size is a clinical decision.
    max_tumour_deficit_pct: float | None = None
    max_late_increase_pct: float | None = None

    @classmethod
    def from_dict(cls, d: dict | None) -> "Constraints":
        d = dict(d or {})
        names = {f.name for f in fields(cls)}
        unknown = set(d) - names
        if unknown:
            raise ValueError(f"unknown constraint(s): {', '.join(sorted(unknown))}")
        if "chemo_dates" in d:
            from .schedule import parse_date
            d["chemo_dates"] = tuple(parse_date(x) for x in d["chemo_dates"] or [])
        return cls(**d)


# --------------------------------------------------------------------------- #
@dataclass
class SiteProfile:
    id: str
    name: str
    category: int | None
    tumour: dict
    oars: list[dict]
    ideal_extension_days: int | None = None
    max_extension_days: int | None = None
    max_overall_time_days: int | None = None
    no_acceleration: bool = False
    notes: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)

    def rules(self) -> CaseRules:
        return CaseRules(category=self.category, ideal_extension_days=self.ideal_extension_days,
                         max_extension_days=self.max_extension_days,
                         max_overall_time_days=self.max_overall_time_days,
                         no_acceleration=self.no_acceleration, site_id=self.id, site_name=self.name,
                         notes=list(self.notes), sources=list(self.sources))

    def tumour_tissue(self) -> Tissue:
        t = self.tumour
        return Tissue.tumour(self.name, float(t.get("alpha_beta", 10.0)),
                             dprolif=t.get("dprolif_eqd2_per_day"), k_bed=t.get("k_bed_per_day"),
                             kickoff_days=t.get("kickoff_days"))

    def oar_tissues(self) -> list[Tissue]:
        return [oar_from_dict(o) for o in self.oars]


def oar_from_dict(o: dict) -> Tissue:
    ratio = o.get("dose_ratio", 1.0)
    ratio = tuple(float(x) for x in ratio) if isinstance(ratio, (list, tuple)) else float(ratio)
    t = Tissue(o["name"], float(o["alpha_beta"]), dose_ratio=ratio,
               repair_half_time_h=o.get("repair_half_time_h", DEFAULT_LATE_REPAIR_H) or None, max_eqd2=o.get("max_eqd2"))
    t.brachy_ratio = float(o.get("brachy_ratio", 1.0))
    return t


def _deep_merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def load_library(overrides: dict | None = None) -> dict[str, SiteProfile]:
    """Load the packaged site library, optionally merged with protocol overrides
    (``{site_id: {field: value}}``; new ids add new sites)."""
    import yaml
    raw: dict[str, Any] = yaml.safe_load(resources.files("rtgap").joinpath("data/sites.yaml").read_text("utf-8"))
    late = raw.get("defaults", {}).get("late_oar", {"name": "Late (α/β 3)", "alpha_beta": 3})
    sites = raw["sites"]
    for sid, over in (overrides or {}).items():
        sites[sid] = _deep_merge(sites.get(sid, {"name": sid, "category": None, "tumour": {"alpha_beta": 10}}), over)
    lib = {}
    for sid, s in sites.items():
        lib[sid] = SiteProfile(
            id=sid, name=s.get("name", sid), category=s.get("category"),
            tumour=dict(s.get("tumour") or {"alpha_beta": 10}),
            oars=list(s.get("oars") or [late]),
            ideal_extension_days=s.get("ideal_extension_days"),
            max_extension_days=s.get("max_extension_days"),
            max_overall_time_days=s.get("max_overall_time_days"),
            no_acceleration=bool(s.get("no_acceleration", False)),
            notes=list(s.get("notes") or []), sources=list(s.get("sources") or []),
        )
    return lib
