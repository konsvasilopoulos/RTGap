"""Linear-quadratic (LQ) model primitives.

All doses in Gy, times in days unless stated otherwise.

Conventions
-----------
BED   = n d (1 + d / (alpha/beta))
EQD2  = BED / (1 + 2 / (alpha/beta))

Repopulation (time factor) is handled in two equivalent unit systems:

* ``dprolif``  - dose recovered per day, expressed as EQD2 (Gy/day).
                 This is the D_prolif of Joiner & van der Kogel,
                 *Basic Clinical Radiobiology*, ch. 9.
* ``k_bed``    - dose recovered per day, expressed as BED (Gy_ab/day).
                 This is the K of the RCR gap guidelines (2019).

They are related by  k_bed = dprolif * (1 + 2 / (alpha/beta)).
"""
from __future__ import annotations

import math

LN2 = math.log(2.0)


def bed(n: float, d: float, alpha_beta: float) -> float:
    """Biologically effective dose of n fractions of d Gy (no time factor)."""
    _check_ab(alpha_beta)
    return n * d * (1.0 + d / alpha_beta)


def quad_term(d: float, dt: float | None = None) -> float:
    """Quadratic dose term of one fraction: d² for LQ. With a transition dose ``dt`` (linear-quadratic-
    linear model, Astrahan 2008) the survival curve continues along its tangent above dt, so that
    BED = dt (1 + dt/ab) + (1 + 2 dt/ab)(d - dt), i.e. the quadratic term becomes 2 dt d - dt²."""
    if dt is None or d <= dt:
        return d * d
    return 2.0 * dt * d - dt * dt


def eqd2_from_bed(bed_value: float, alpha_beta: float) -> float:
    _check_ab(alpha_beta)
    return bed_value / (1.0 + 2.0 / alpha_beta)


def bed_from_eqd2(eqd2_value: float, alpha_beta: float) -> float:
    _check_ab(alpha_beta)
    return eqd2_value * (1.0 + 2.0 / alpha_beta)


def eqd2(n: float, d: float, alpha_beta: float) -> float:
    """Equivalent dose in 2-Gy fractions of n x d Gy (no time factor)."""
    return eqd2_from_bed(bed(n, d, alpha_beta), alpha_beta)


def k_bed_from_dprolif(dprolif: float, alpha_beta: float) -> float:
    return dprolif * (1.0 + 2.0 / alpha_beta)


def dprolif_from_k_bed(k_bed: float, alpha_beta: float) -> float:
    return k_bed / (1.0 + 2.0 / alpha_beta)


def repopulation_eqd2(overall_time: float, dprolif: float, kickoff: float | None) -> float:
    """EQD2 lost to repopulation for an overall time T (days).

    Zero if no kick-off time is given or T <= kick-off.
    """
    if kickoff is None or dprolif <= 0:
        return 0.0
    return dprolif * max(0.0, overall_time - kickoff)


def eqd2_time_corrected(n: float, d: float, alpha_beta: float, overall_time: float,
                        dprolif: float, kickoff: float | None) -> float:
    """EQD2_T = EQD2 - D_prolif * (T - T_k) for T > T_k."""
    return eqd2(n, d, alpha_beta) - repopulation_eqd2(overall_time, dprolif, kickoff)


def repair_factor(interval_h: float, half_time_h: float) -> float:
    """theta = exp(-mu * dt), mono-exponential repair with half-time T1/2 (hours).

    For two equal fractions per day the incomplete-repair factor of Thames
    reduces to h_2 = theta, so BED per day = 2d (1 + d (1 + theta) / ab).
    """
    if half_time_h <= 0:
        raise ValueError("repair half-time must be > 0")
    return math.exp(-LN2 * interval_h / half_time_h)


def solve_quadratic_dose(a_lin: float, b_quad: float, target: float) -> float:
    """Positive root d of  a_lin * d + b_quad * d**2 = target.

    Only the positive root is physically meaningful (cf. Example 5 in
    Basic Clinical Radiobiology, ch. 9).
    """
    if target <= 0:
        return 0.0
    if abs(b_quad) < 1e-15:
        if a_lin <= 0:
            raise ValueError("cannot solve: no dose dependence")
        return target / a_lin
    disc = a_lin * a_lin + 4.0 * b_quad * target
    if disc < 0:
        raise ValueError("no real solution")
    return (-a_lin + math.sqrt(disc)) / (2.0 * b_quad)


def _check_ab(alpha_beta: float) -> None:
    if alpha_beta <= 0:
        raise ValueError("alpha/beta must be > 0")
