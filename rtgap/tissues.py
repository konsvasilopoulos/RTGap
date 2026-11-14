"""Tissue (tumour or organ-at-risk) model evaluated on an arbitrary list of fractions."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from . import lq
from .schedule import Fraction, group_by_day, overall_time


@dataclass
class Tissue:
    """A tumour or normal-tissue endpoint.

    Parameters
    ----------
    name : label shown in reports
    alpha_beta : alpha/beta ratio (Gy)
    dose_ratio : dose to this tissue per Gy of the phase reference dose
        (1.0 = receives the prescription dose; conservative "point-dose"
        approach of the RCR). A tuple gives one ratio per treatment phase.
    dprolif : EQD2 lost per day of treatment beyond the kick-off time (Gy/day).
        Only meaningful for tumours / acute endpoints. 0 disables the time factor.
    kickoff_days : onset of accelerated repopulation (days from first fraction)
    repair_half_time_h : if set, incomplete repair is modelled between fractions
        given on the same day (mono-exponential, Thames). Overnight repair is
        assumed complete.
    max_eqd2 : optional tolerance (EQD2, Gy) used only to raise a warning
    """
    name: str
    alpha_beta: float
    dose_ratio: float | tuple[float, ...] = 1.0
    dprolif: float = 0.0
    kickoff_days: float | None = None
    repair_half_time_h: float | None = None
    max_eqd2: float | None = None
    brachy_ratio: float = 1.0          # dose to this tissue per Gy of a brachytherapy fraction

    # ------------------------------------------------------------------ #
    @classmethod
    def tumour(cls, name: str, alpha_beta: float, *, dprolif: float | None = None,
               k_bed: float | None = None, kickoff_days: float | None = None,
               **kw) -> "Tissue":
        """Build a tumour with the repopulation rate given either as D_prolif
        (EQD2 Gy/day, Joiner) or as K (BED Gy/day, RCR)."""
        if dprolif is not None and k_bed is not None:
            raise ValueError("give either dprolif or k_bed, not both")
        if k_bed is not None:
            dprolif = lq.dprolif_from_k_bed(k_bed, alpha_beta)
        return cls(name=name, alpha_beta=alpha_beta, dprolif=dprolif or 0.0,
                   kickoff_days=kickoff_days, **kw)

    def ratio(self, phase: int = 0) -> float:
        r = self.dose_ratio
        if isinstance(r, (tuple, list)):
            return float(r[min(phase, len(r) - 1)])
        return float(r)

    @property
    def k_bed(self) -> float:
        return lq.k_bed_from_dprolif(self.dprolif, self.alpha_beta)

    @property
    def has_time_factor(self) -> bool:
        return self.dprolif > 0 and self.kickoff_days is not None

    # ------------------------------------------------------------------ #
    def bed_without_time(self, fractions: Sequence[Fraction], bid_interval_h: float = 6.0) -> float:
        ab = self.alpha_beta
        theta = None
        if self.repair_half_time_h:
            theta = lq.repair_factor(bid_interval_h, self.repair_half_time_h)
        total = 0.0
        for fx in group_by_day(fractions).values():
            doses = [f.dose * self.ratio(f.phase) for f in fx]
            linear = sum(doses)
            quad = sum(d * d for d in doses)
            if theta is not None and len(doses) > 1:
                for i in range(len(doses)):
                    for j in range(i + 1, len(doses)):
                        quad += 2.0 * doses[i] * doses[j] * theta ** (j - i)
            total += linear + quad / ab
        return total

    def repopulation_bed(self, fractions: Sequence[Fraction]) -> float:
        """Repopulation over this tissue's own overall time: first to last fraction that
        actually irradiates it (a level treated only in phase 1 stops 'counting' after phase 1)."""
        if not self.has_time_factor:
            return 0.0
        own = [f for f in fractions if f.dose * self.ratio(f.phase) > 0]
        return self.k_bed * max(0.0, overall_time(own) - self.kickoff_days)

    def bed(self, fractions: Sequence[Fraction], bid_interval_h: float = 6.0) -> float:
        return self.bed_without_time(fractions, bid_interval_h) - self.repopulation_bed(fractions)

    def eqd2(self, fractions: Sequence[Fraction], bid_interval_h: float = 6.0) -> float:
        return lq.eqd2_from_bed(self.bed(fractions, bid_interval_h), self.alpha_beta)

    def describe(self) -> str:
        parts = [f"α/β = {self.alpha_beta:g} Gy"]
        if isinstance(self.dose_ratio, (tuple, list)):
            if any(abs(x - 1.0) > 1e-9 for x in self.dose_ratio):
                parts.append("dose ratio per phase " + "/".join(f"{x:.3g}" for x in self.dose_ratio))
        elif self.dose_ratio != 1.0:
            parts.append(f"dose ratio {self.dose_ratio:g}")
        if self.has_time_factor:
            parts.append(f"D_prolif = {self.dprolif:.3g} Gy/day (K = {self.k_bed:.3g} Gy{self.alpha_beta:g}/day) "
                         f"after T_k = {self.kickoff_days:g} d")
        if self.repair_half_time_h:
            parts.append(f"repair T½ = {self.repair_half_time_h:g} h")
        if self.max_eqd2 is not None:
            parts.append(f"limit EQD2 ≤ {self.max_eqd2:g} Gy")
        return ", ".join(parts)


# ---------------------------------------------------------------------- #
# Generic parameters from the RCR guidance (4th ed., 2019). These are
# *generic* values: the clinical team must confirm them for each patient.
RCR_GENERIC = {
    "tumour_alpha_beta": 10.0,
    "k_bed_per_day": 0.9,      # Gy10/day, head & neck working value
    "kickoff_days": 28.0,
    "late_alpha_beta": 3.0,
    "cord_alpha_beta": 2.0,
}
