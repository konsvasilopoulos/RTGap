"""Correction of dose-per-fraction errors (Joiner 2004; Basic Clinical Radiobiology eq. 9.3–9.4).

With the planned treatment P Gy at p Gy/fraction and an erroneous dose of
E Gy at e Gy/fraction already delivered, the compensating treatment

    D = P - E                       (9.3)
    d = (P p - E e) / (P - E)       (9.4)

brings *every* tissue back to its planned isoeffect simultaneously,
without knowing any alpha/beta. Valid only without incomplete repair and
without a time factor (overall time must be kept). The number of
fractions is rounded up, which slightly favours late-responding tissues.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class ErrorCorrection:
    planned_total: float
    planned_dpf: float
    error_total: float
    error_dpf: float
    compensating_total: float
    compensating_dpf: float
    n_exact: float
    n_fractions: int
    practical_dpf: float

    def text(self) -> str:
        return (f"Compensating dose D = {self.planned_total:g} - {self.error_total:g} = "
                f"{self.compensating_total:.2f} Gy\n"
                f"Dose per fraction d = ({self.planned_total:g}·{self.planned_dpf:g} - "
                f"{self.error_total:g}·{self.error_dpf:g}) / {self.compensating_total:.2f} = "
                f"{self.compensating_dpf:.3f} Gy\n"
                f"Number of fractions = {self.n_exact:.2f} → {self.n_fractions} × {self.practical_dpf:.2f} Gy\n"
                "Valid only without incomplete repair and with unchanged overall time.")


def joiner_correction(planned_total: float, planned_dpf: float, error_total: float,
                      error_dpf: float, rounding: float = 0.01) -> ErrorCorrection:
    P, p, E, e = planned_total, planned_dpf, error_total, error_dpf
    if min(P, p, E, e) <= 0:
        raise ValueError("all doses must be > 0")
    D = P - E
    if D <= 0:
        raise ValueError("error dose already equals or exceeds the planned total dose")
    d = (P * p - E * e) / D
    if d <= 0:
        raise ValueError("no positive compensating dose per fraction exists "
                         "(error in large fractions too big to compensate exactly)")
    n_exact = D / d
    # round the number of fractions *up*: more, smaller fractions spare late tissues
    n = max(1, math.ceil(n_exact - 1e-9))
    practical = round(round((D / n) / rounding) * rounding, 6)
    return ErrorCorrection(P, p, E, e, D, d, n_exact, n, practical)
