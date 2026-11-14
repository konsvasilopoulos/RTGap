"""Unscheduled-gap compensation: generation and evaluation of candidate schedules.

:class:`GapPlanner` builds *every* RCR compensation method on a real
calendar and evaluates it with the LQ model. Deciding which candidates
are acceptable, and which one to recommend, is done in :mod:`rtgap.decide`.

Families of candidates (RCR 2019 order of consideration):

* ``weekend``      same d, Saturday (and Sunday) treatment
* ``bid``          same d, two fractions per day (>= 6 h)
* ``weekend_bid``  same d, both
* ``accel_dose``   one of the above that still overruns, with d solved
* ``same_end``     planned end date kept, fewer and larger fractions
* ``extended``     prolongation accepted, d raised
* ``extra``        prolongation accepted, extra fractions at the planned d
* ``error``        a delivered dose differed from the plan: Joiner correction of
                   the remaining fractions, on the regular or an accelerated calendar
* ``baseline``     no compensation

Treatment history: every interruption of the course is entered as missed
dates (earlier ones too, so the prolongation is counted over the whole
course from the original end date). Fractions given outside the planned
calendar (a Saturday, a second fraction on a day), delivered fractions with
a wrong dose, and an earlier compensation that changed the rest of the
course (``plan_change``) are entered so that the delivered course is the
real one.

Dose-solved candidates come in two variants: ``match_tumour`` (restore the
planned time-corrected tumour EQD2) and ``match_late`` (keep the first
OAR at its planned EQD2).
"""
from __future__ import annotations

import dataclasses
import datetime as dt
import math
from dataclasses import dataclass, field
from typing import Iterable, Sequence

from . import lq
from .rules import CaseRules, Constraints
from .schedule import Fraction, WEEKDAY_NAMES, bid_dates, daterange, overall_time
from .tissues import Tissue

ONE_DAY = dt.timedelta(days=1)

__all__ = ["Phase", "Prescription", "Constraints", "CaseRules", "GapPlanner", "Option", "TissueResult", "DoseError",
           "allocate_phases"]


@dataclass
class Phase:
    """A treatment phase: n fractions, each delivering ``levels[name]`` Gy to every dose level.

    A simultaneous integrated boost (SIB) is one phase with several levels; a
    sequential boost is several phases (a level absent from a phase gets 0 Gy).
    """
    n_fractions: int
    levels: dict[str, float]
    name: str = ""

    def __post_init__(self):
        if self.n_fractions < 1:
            raise ValueError("each phase needs n_fractions >= 1")
        if not self.levels or max(self.levels.values()) <= 0:
            raise ValueError("each phase needs at least one dose level with d > 0")
        if any(v < 0 for v in self.levels.values()):
            raise ValueError("dose per fraction cannot be negative")


@dataclass
class Prescription:
    """Prescription on a calendar.

    Simple form: ``Prescription(start, n_fractions, dose_per_fraction)``.
    Multi-level / multi-phase form: ``Prescription(start, phases=[Phase(...), ...],
    primary_level="PTV70")``. The primary level (default: highest total dose)
    drives the compensation; all levels are reported.
    """
    start: dt.date
    n_fractions: int | None = None
    dose_per_fraction: float | None = None
    treatment_weekdays: tuple[int, ...] = (0, 1, 2, 3, 4)
    closed_dates: frozenset[dt.date] = frozenset()   # planned closures (public holidays)
    phases: tuple[Phase, ...] | None = None
    primary_level: str | None = None

    def __post_init__(self):
        if self.phases is None:
            if self.n_fractions is None or self.dose_per_fraction is None:
                raise ValueError("give n_fractions and dose_per_fraction, or phases")
            if self.n_fractions < 1:
                raise ValueError("n_fractions must be >= 1")
            if self.dose_per_fraction <= 0:
                raise ValueError("dose_per_fraction must be > 0")
            self.phases = (Phase(self.n_fractions, {"PTV": float(self.dose_per_fraction)}),)
        self.phases = tuple(self.phases)
        names = self.level_names
        if self.primary_level is None:
            self.primary_level = max(names, key=self.total_dose_level)
        if self.primary_level not in names:
            raise ValueError(f"primary level {self.primary_level!r} not in {names}")
        self.n_fractions = sum(p.n_fractions for p in self.phases)
        self.dose_per_fraction = self.ref_dose(0)
        self.closed_dates = frozenset(self.closed_dates)

    # ------------------------------------------------------------------ #
    @property
    def level_names(self) -> list[str]:
        out: list[str] = []
        for p in self.phases:
            for k in p.levels:
                if k not in out:
                    out.append(k)
        return out

    @property
    def is_multilevel(self) -> bool:
        return len(self.phases) > 1 or len(self.level_names) > 1

    def level_dose(self, level: str, phase: int) -> float:
        return float(self.phases[phase].levels.get(level, 0.0))

    def ref_dose(self, phase: int) -> float:
        """Reference dose per fraction of a phase: the primary level, or the
        highest level if the primary level is not treated in that phase."""
        p = self.phases[phase]
        d = p.levels.get(self.primary_level, 0.0) if self.primary_level else 0.0
        return float(d if d > 0 else max(p.levels.values()))

    def level_ratios(self, level: str) -> tuple[float, ...]:
        return tuple(self.level_dose(level, i) / self.ref_dose(i) for i in range(len(self.phases)))

    def total_dose_level(self, level: str) -> float:
        return sum(p.n_fractions * p.levels.get(level, 0.0) for p in self.phases)

    @property
    def total_dose(self) -> float:
        return self.total_dose_level(self.primary_level)

    def phase_of(self, index: int) -> int:
        """Phase of the index-th fraction (0-based) of the course."""
        n = 0
        for i, p in enumerate(self.phases):
            n += p.n_fractions
            if index < n:
                return i
        return len(self.phases) - 1

    def describe(self) -> str:
        parts = []
        for i, p in enumerate(self.phases):
            lv = ", ".join(f"{k} {v:g}" for k, v in p.levels.items() if v > 0)
            label = p.name or (f"Phase {i + 1}" if len(self.phases) > 1 else "")
            parts.append(f"{label + ': ' if label else ''}{p.n_fractions} × ({lv}) Gy")
        tot = ", ".join(f"{k} {self.total_dose_level(k):g} Gy" for k in self.level_names)
        return "; ".join(parts) + (f" → {tot}" if self.is_multilevel else f" = {self.total_dose:g} Gy")

    # ------------------------------------------------------------------ #
    def is_treatment_day(self, day: dt.date) -> bool:
        return day.weekday() in self.treatment_weekdays and day not in self.closed_dates

    def planned_fractions(self) -> list[Fraction]:
        out: list[Fraction] = []
        day = self.start
        for _ in range(3660):
            if len(out) >= self.n_fractions:
                return out
            if self.is_treatment_day(day):
                ph = self.phase_of(len(out))
                out.append(Fraction(day, 0, self.ref_dose(ph), ph))
            day += ONE_DAY
        raise RuntimeError("could not build planned schedule")


@dataclass
class TissueResult:
    name: str
    eqd2: float
    planned_eqd2: float
    limit: float | None = None

    @property
    def delta(self) -> float:
        return self.eqd2 - self.planned_eqd2

    @property
    def delta_pct(self) -> float:
        return 100.0 * self.delta / self.planned_eqd2 if self.planned_eqd2 else 0.0


@dataclass
class Option:
    key: str
    family: str
    title: str
    method: str
    new_fractions: list[Fraction]
    dose_per_fraction: float
    strategy: str                      # keep_d | match_tumour | match_late | custom
    exact_dose: float | None = None
    scale: float = 1.0                 # new fraction doses = scale × planned phase doses
    course: list[Fraction] = field(default_factory=list)
    overall_time: int = 0
    end_date: dt.date | None = None
    extension_days: int = 0
    tumour: TissueResult | None = None
    levels: list[TissueResult] = field(default_factory=list)   # secondary dose levels
    oars: list[TissueResult] = field(default_factory=list)
    phase_doses: dict[int, dict[str, float]] = field(default_factory=dict)  # new fx: phase -> level -> d
    phase_counts: dict[int, int] = field(default_factory=dict)
    weekly_peak: float = 0.0            # largest EQD2 (primary level) delivered in any 7 consecutive days
    weekly_peak_planned: float = 0.0
    warnings: list[str] = field(default_factory=list)
    rejected: list[str] = field(default_factory=list)   # filled by decide
    rank: int = 99                                       # filled by decide
    recommended: bool = False

    @property
    def n_new(self) -> int:
        return len(self.new_fractions)

    @property
    def weekly_increase_pct(self) -> float:
        return 100.0 * (self.weekly_peak / self.weekly_peak_planned - 1.0) if self.weekly_peak_planned else 0.0

    @property
    def max_level_dose(self) -> float:
        """Highest dose per fraction to any dose level among the new fractions."""
        return max((d for lv in self.phase_doses.values() for d in lv.values()), default=self.dose_per_fraction)

    @property
    def n_bid_days(self) -> int:
        return len(bid_dates(self.new_fractions))

    @property
    def n_saturdays(self) -> int:
        return sum(1 for f in self.new_fractions if f.date.weekday() == 5)

    @property
    def n_sundays(self) -> int:
        return sum(1 for f in self.new_fractions if f.date.weekday() == 6)

    @property
    def n_weekend_fractions(self) -> int:
        return self.n_saturdays + self.n_sundays

    @property
    def burden(self) -> int:
        """Rough logistic burden used to order otherwise equivalent options."""
        return self.n_saturdays + 2 * self.n_sundays + self.n_bid_days

    @property
    def feasible(self) -> bool:
        return not self.rejected

    @property
    def max_late_increase_pct(self) -> float:
        return max((r.delta_pct for r in self.oars), default=0.0)


def allocate_phases(phases: Sequence[int], m: int) -> list[int]:
    """Spread the phase sequence ``phases`` (one entry per planned fraction) over ``m`` fractions.

    Same length: unchanged. Longer: the extra fractions repeat the last phase.
    Shorter: fractions are shared between the phases in proportion (largest
    remainder), keeping their order.
    """
    k = len(phases)
    if m == k:
        return list(phases)
    if m > k:
        return list(phases) + [phases[-1] if phases else 0] * (m - k)
    order: list[int] = []
    counts: dict[int, int] = {}
    for ph in phases:
        if ph not in counts:
            counts[ph] = 0
            order.append(ph)
        counts[ph] += 1
    exact = {ph: counts[ph] * m / k for ph in order}
    alloc = {ph: int(exact[ph]) for ph in order}
    left = m - sum(alloc.values())
    for ph in sorted(order, key=lambda x: exact[x] - alloc[x], reverse=True)[:left]:
        alloc[ph] += 1
    return [ph for ph in sorted(order) for _ in range(alloc[ph])]


@dataclass
class DoseError:
    """A delivered fraction whose dose differed from the intended dose (reference level, Gy)."""
    date: dt.date
    slot: int
    intended: float
    actual: float


class GapPlanner:
    def __init__(self, prescription: Prescription, tumour: Tissue | Sequence[Tissue], oars: Sequence[Tissue],
                 missed_dates: Iterable = (), resume_date: dt.date | None = None,
                 delivered: Sequence[Fraction] | None = None,
                 unavailable_dates: Iterable[dt.date] = (),
                 constraints: Constraints | None = None,
                 rules: CaseRules | None = None, category: int | None = None,
                 brachy: Sequence[tuple[dt.date, float]] = (),
                 extra_delivered: Iterable[dt.date] = (),
                 dose_errors: Sequence[tuple[dt.date, int, float]] = (),
                 plan_change: tuple[dt.date, int, float] | None = None):
        """``extra_delivered``: dates on which a fraction was given outside the planned calendar (a
        non-treatment day, or a second fraction on a day that already had one). ``dose_errors``:
        ``(date, slot, dose)`` of delivered fractions whose dose differed from the intended one (dose
        to the reference level; every level scales with it). ``plan_change``: ``(from_date, n, d)``,
        an earlier compensation: from that date the rest of the course was n fractions with the
        reference dose d (the first fraction on ``from_date`` included)."""
        self._init = dict(prescription=prescription, tumour=tumour, oars=oars, missed_dates=missed_dates,
                          resume_date=resume_date, delivered=delivered, unavailable_dates=unavailable_dates,
                          constraints=constraints, rules=rules, category=category, brachy=brachy,
                          extra_delivered=extra_delivered, dose_errors=dose_errors, plan_change=plan_change)
        self.rx = rx = prescription
        self.input_warnings: list[str] = []
        self.oars = list(oars)
        self.c = constraints or Constraints()
        if rules is None:
            rules = CaseRules(category=category)
        elif category is not None and category != rules.category:
            rules = dataclasses.replace(rules, category=category,
                                        ideal_extension_days=None, max_extension_days=None)
        self.rules = rules

        # one tumour tissue per dose level, primary first
        if isinstance(tumour, Tissue):
            if rx.is_multilevel:
                order = [rx.primary_level] + [n for n in rx.level_names if n != rx.primary_level]
                self.tumours = [dataclasses.replace(tumour, name=n, dose_ratio=rx.level_ratios(n)) for n in order]
            else:
                self.tumours = [tumour]
        else:
            self.tumours = list(tumour)
        # Brachytherapy fractions: fixed dates and doses, modelled as one extra "phase". The primary
        # level receives the full dose, other dose levels none, each organ its brachy_ratio.
        n_ph = len(rx.phases)
        self.fixed = sorted(Fraction(d, 0, float(dose), n_ph) for d, dose in brachy)
        if self.fixed:
            def extend(t: Tissue, extra: float) -> Tissue:
                if isinstance(t.dose_ratio, (tuple, list)) and len(t.dose_ratio) > n_ph:
                    return t                                   # already extended (variant of a planner)
                return dataclasses.replace(t, dose_ratio=tuple(t.ratio(i) for i in range(n_ph)) + (extra,))
            self.tumours = [extend(t, 1.0 if i == 0 else 0.0) for i, t in enumerate(self.tumours)]
            self.oars = [extend(o, o.brachy_ratio) for o in self.oars]
        self.tumour = self.tumours[0]

        self.missed = sorted(set(missed_dates))
        self.planned = rx.planned_fractions()
        self.unavailable = frozenset(unavailable_dates) | rx.closed_dates
        self.extra_dates = sorted(extra_delivered)
        errs_in = sorted((d, int(sl), float(x)) for d, sl, x in dose_errors)
        self.plan_change = plan_change

        if resume_date is None:
            last = [self.missed[-1]] if self.missed else []
            last += [d for d, _, _ in errs_in] + self.extra_dates
            resume_date = (max(last) + ONE_DAY) if last else self.planned[-1].date + ONE_DAY
        self.resume = resume_date

        n_total = rx.n_fractions
        seq = [rx.phase_of(i) for i in range(n_total)]      # phase of the i-th fraction given
        self.s0 = 1.0                                       # current scale of the plan (after an earlier change)
        pc_from, pc_alloc, pc_scale = None, None, 1.0
        if delivered is None:
            missed = set(self.missed)
            dates = [f.date for f in self.planned if f.date < self.resume and f.date not in missed]
            slots = [(d, 0) for d in dates]
            have = set(dates)
            for d in self.extra_dates:
                if d >= self.resume:
                    raise ValueError(f"extra fraction on {d.isoformat()} is not before the resume date")
                if d in missed:
                    raise ValueError(f"{d.isoformat()} is marked both missed and as an extra fraction")
                sl = 1 if d in have else 0
                if (d, sl) in slots:
                    raise ValueError(f"more than two fractions on {d.isoformat()}")
                slots.append((d, sl)); have.add(d)
            slots.sort()
            if plan_change is not None:
                pc_from, pc_n, pc_d = plan_change
                if pc_from > self.resume:
                    raise ValueError("the plan change must start on or before the resume date")
                if pc_n < 1 or pc_d <= 0:
                    raise ValueError("the plan change needs n >= 1 and d > 0")
                i0 = sum(1 for d, _ in slots if d < pc_from)
                if i0 >= n_total:
                    raise ValueError("the plan change starts after the last prescribed fraction")
                pc_alloc = allocate_phases(seq[i0:], int(pc_n))
                pc_scale = float(pc_d) / rx.ref_dose(pc_alloc[0])
                seq = seq[:i0] + pc_alloc
                if len(slots) > len(seq):
                    raise ValueError("more fractions delivered than in the changed plan")
            elif len(slots) > n_total:
                raise ValueError("more fractions delivered than prescribed")
            delivered = []
            for i, (d, sl) in enumerate(slots):
                ph = seq[i]
                sc = pc_scale if (pc_from is not None and d >= pc_from) else 1.0
                delivered.append(Fraction(d, sl, sc * rx.ref_dose(ph), ph))
        self.delivered = sorted(delivered)
        if any(f.date >= self.resume for f in self.delivered):
            raise ValueError("delivered fractions must be before the resume date")

        # dose errors: replace the dose of the delivered fraction, keep what was intended
        self.dose_errors: list[DoseError] = []
        if errs_in:
            idx = {(f.date, f.slot): i for i, f in enumerate(self.delivered)}
            for d, sl, x in errs_in:
                if (d, sl) not in idx:
                    raise ValueError(f"dose error on {d.isoformat()}: no fraction was delivered that day")
                if x <= 0:
                    raise ValueError(f"dose error on {d.isoformat()}: the delivered dose must be > 0 "
                                     "(a fraction that was not given is a missed date)")
                i = idx[(d, sl)]
                f = self.delivered[i]
                if abs(x - f.dose) > 1e-9:
                    self.dose_errors.append(DoseError(d, sl, f.dose, x))
                self.delivered[i] = f.with_dose(x)
        self.delivered_intended = list(self.delivered)
        for e in self.dose_errors:
            i = next(j for j, f in enumerate(self.delivered) if (f.date, f.slot) == (e.date, e.slot))
            self.delivered_intended[i] = self.delivered[i].with_dose(e.intended)

        if pc_alloc is not None:
            self.s0 = pc_scale
            done = len(self.delivered)
            self.remaining = len(seq) - done
            self.remaining_phases = seq[done:]
        else:
            self.remaining = rx.n_fractions - len(self.delivered)
            if self.remaining < 0:
                raise ValueError("more fractions delivered than prescribed")
            self.remaining_phases = [rx.phase_of(i) for i in range(len(self.delivered), rx.n_fractions)]
        self.d_ref = rx.ref_dose(self.remaining_phases[0]) if self.remaining_phases else rx.ref_dose(0)
        self.d_cur = self.s0 * self.d_ref
        self.interruptions = self._interruptions()

        bi = self.c.bid_interval_h
        self.planned_course = sorted(self.planned + self.fixed)
        self.planned_levels = [t.eqd2(self.planned_course, bi) for t in self.tumours]
        self.planned_tumour = self.planned_levels[0]
        self.planned_oars = [o.eqd2(self.planned_course, bi) for o in self.oars]
        self.planned_weekly = self.weekly_peak(self.planned_course)

    @property
    def has_dose_error(self) -> bool:
        return bool(self.dose_errors)

    def _interruptions(self) -> list[tuple[dt.date, dt.date, int]]:
        """Missed planned treatment days grouped into interruptions: (first, last, number of days).
        Two missed days belong to the same interruption when no fraction was given between them."""
        given = sorted({f.date for f in self.delivered})
        planned = {f.date for f in self.planned}
        days = [d for d in self.missed if d in planned]
        out: list[list] = []
        for d in days:
            if out and not any(out[-1][1] < g < d for g in given):
                out[-1][1] = d; out[-1][2] += 1
            else:
                out.append([d, d, 1])
        return [tuple(x) for x in out]

    def error_effect(self, tissue: Tissue) -> float:
        """EQD2 (no time factor) delivered to ``tissue`` minus what was intended, over the delivered fractions."""
        bi = self.c.bid_interval_h
        return lq.eqd2_from_bed(tissue.bed_without_time(self.delivered, bi) - tissue.bed_without_time(self.delivered_intended, bi),
                                tissue.alpha_beta)

    def joiner_target(self) -> tuple[float, float] | None:
        """Generalised Joiner correction (BCR eq. 9.3–9.4) for the remaining fractions, on the reference
        level: the linear and quadratic dose sums still to give, L = Σd and Q = Σd², so that the whole
        course has the sums of the intended course (delivered as intended + the current plan). Equal
        fractions then need n = L²/Q, d = Q/L. None if no positive solution exists."""
        rest = [self.s0 * self.rx.ref_dose(ph) for ph in self.remaining_phases]
        L = sum(rest) + sum(e.intended - e.actual for e in self.dose_errors)
        Q = sum(x * x for x in rest) + sum(e.intended ** 2 - e.actual ** 2 for e in self.dose_errors)
        if L <= 1e-9 or Q <= 1e-12:
            return None
        return L, Q

    def weekly_peak(self, fractions: Sequence[Fraction]) -> float:
        """Peak dose accumulation: the largest EQD2 of the primary level (tumour alpha/beta, no time
        factor) delivered within any 7 consecutive days. A surrogate for the intensity that drives
        acute reactions; weekend and twice-daily treatment raise it even when total doses are unchanged."""
        t = self.tumour
        per_day: dict[dt.date, float] = {}
        for f in fractions:
            d = f.dose * t.ratio(f.phase)
            per_day[f.date] = per_day.get(f.date, 0.0) + lq.eqd2_from_bed(d * (1.0 + d / t.alpha_beta), t.alpha_beta)
        days = sorted(per_day)
        best = 0.0
        for i, d0 in enumerate(days):
            tot = 0.0
            for d1 in days[i:]:
                if (d1 - d0).days > 6:
                    break
                tot += per_day[d1]
            best = max(best, tot)
        return best

    def variant(self, **changes) -> "GapPlanner":
        """A copy of this planner with some constructor arguments replaced."""
        kw = dict(self._init)
        kw.update(constraints=self.c, rules=self.rules, category=None)
        kw.update(changes)
        return GapPlanner(**kw)

    @property
    def category(self) -> int | None:
        return self.rules.category

    # ------------------------------------------------------------------ #
    # calendar
    @property
    def planned_end(self) -> dt.date:
        return self.planned[-1].date

    def is_regular(self, day: dt.date) -> bool:
        return day not in self.unavailable and day.weekday() in self.rx.treatment_weekdays

    def is_extra_day(self, day: dt.date, sat: bool, sun: bool) -> bool:
        if day in self.unavailable or day.weekday() in self.rx.treatment_weekdays:
            return False
        wd = day.weekday()
        return (wd == 5 and sat) or (wd == 6 and sun)

    def _days_from(self, start: dt.date, sat: bool = False, sun: bool = False):
        day = start
        for _ in range(3660):
            if self.is_regular(day) or self.is_extra_day(day, sat, sun):
                yield day
            day += ONE_DAY

    # ------------------------------------------------------------------ #
    # slot patterns (dates only; doses are assigned later)
    def pattern_standard(self, n: int) -> list[Fraction]:
        """n fractions on the next treatment days. For sites without acceleration (SABR) RCR asks
        that treatment resumes on non-consecutive days: then the days are at least 2 days apart,
        also from the last fraction given."""
        gen = self._days_from(self.resume)
        if not self.rules.no_acceleration:
            return [Fraction(next(gen), 0) for _ in range(n)]
        out: list[Fraction] = []
        last = max((f.date for f in self.delivered), default=None)
        while len(out) < n:
            d = next(gen)
            if last is None or (d - last).days >= 2:
                out.append(Fraction(d, 0)); last = d
        return out

    def pattern_accelerated(self, n: int, sat: bool = False, sun: bool = False,
                            bid: bool = False) -> list[Fraction]:
        """n fractions finishing as close as possible to the planned end date,
        using extra weekend days first, then BID (RCR order)."""
        end = self.planned_end
        window = list(daterange(self.resume, end)) if self.resume <= end else []
        regular = [d for d in window if self.is_regular(d)]
        slots = [Fraction(d, 0) for d in regular]
        if len(slots) >= n:
            return slots[:n]
        need = n - len(slots)
        if sat or sun:
            extra = [d for d in window if self.is_extra_day(d, sat, sun)][:need]
            slots += [Fraction(d, 0) for d in extra]
            need -= len(extra)
        if bid and need > 0:
            chosen = self._choose_bid_days(regular, need)
            slots += [Fraction(d, 1) for d in chosen]
            need -= len(chosen)
        if need > 0:  # cannot fit: continue past the planned end
            start = max(end + ONE_DAY, self.resume)
            if bid:
                days = self._days_from(start, sat, sun)
                while need > 0:
                    d = next(days)
                    slots.append(Fraction(d, 0)); need -= 1
                    if need > 0:
                        slots.append(Fraction(d, 1)); need -= 1
            else:
                days = self._days_from(start, sat, sun)
                slots += [Fraction(next(days), 0) for _ in range(need)]
        return sorted(slots)

    def _choose_bid_days(self, regular: list[dt.date], need: int) -> list[dt.date]:
        need = min(need, len(regular))
        chosen: list[dt.date] = []
        if self.c.avoid_consecutive_bid:
            for d in regular:
                if len(chosen) >= need:
                    break
                if not chosen or (d - chosen[-1]).days > 1:
                    chosen.append(d)
        for d in regular:
            if len(chosen) >= need:
                break
            if d not in chosen:
                chosen.append(d)
        return sorted(chosen)

    def pattern_same_end(self, sat: bool = False, sun: bool = False) -> list[Fraction] | None:
        """All available single-fraction days up to the planned end (fewer than needed)."""
        if self.resume > self.planned_end:
            return None
        days = [d for d in daterange(self.resume, self.planned_end)
                if self.is_regular(d) or self.is_extra_day(d, sat, sun)]
        if not days or len(days) >= self.remaining:
            return None
        return [Fraction(d, 0) for d in days]

    # ------------------------------------------------------------------ #
    # dose solving
    def _assign(self, slots: Sequence[Fraction]) -> list[Fraction]:
        """Give each new slot the phase it delivers (in date order), see :func:`allocate_phases`."""
        slots = sorted(slots)
        rp = self.remaining_phases or [len(self.rx.phases) - 1]
        phases = allocate_phases(rp, len(slots))
        return [s.with_phase(ph, self.rx.ref_dose(ph)) for s, ph in zip(slots, phases)]

    def _course_s(self, slots: Sequence[Fraction], scale: float) -> list[Fraction]:
        new = [f.with_dose(scale * f.dose) for f in self._assign(slots)]
        return sorted(self.delivered + new + self.fixed)

    def _course(self, slots: Sequence[Fraction], d: float) -> list[Fraction]:
        """Course with the new fractions at ``d`` Gy (reference dose of the first remaining phase)."""
        return self._course_s(slots, d / self.d_ref)

    def solve_scale(self, slots: Sequence[Fraction], tissue: Tissue, target_eqd2: float) -> float:
        """Scale factor on the planned doses of ``slots`` so that ``tissue`` reaches ``target_eqd2``.

        EQD2(course) is exactly quadratic in the scale (the time factor depends
        only on dates), so three evaluations give the coefficients and the
        positive root is returned.
        """
        # sample at positive scales (a fraction with zero dose does not count towards a
        # tissue's overall time, so s = 0 is not on the same parabola)
        bi = self.c.bid_interval_h
        s1, s2, s3 = 0.5, 1.0, 2.0
        f1, f2, f3 = (tissue.eqd2(self._course_s(slots, x), bi) for x in (s1, s2, s3))
        b = ((f3 - f2) / (s3 - s2) - (f2 - f1) / (s2 - s1)) / (s3 - s1)
        a = (f2 - f1) / (s2 - s1) - b * (s1 + s2)
        c0 = f1 - a * s1 - b * s1 * s1
        return lq.solve_quadratic_dose(a, b, target_eqd2 - c0)

    def solve_dose(self, slots: Sequence[Fraction], tissue: Tissue, target_eqd2: float) -> float:
        """As :meth:`solve_scale`, expressed as dose per fraction of the reference level (Gy)."""
        return self.solve_scale(slots, tissue, target_eqd2) * self.d_ref

    def _round(self, d: float) -> float:
        step = self.c.dose_rounding
        return round(round(d / step) * step, 6) if step else d

    # ------------------------------------------------------------------ #
    def evaluate(self, key: str, title: str, method: str, slots: Sequence[Fraction],
                 d: float, strategy: str, exact: float | None = None, family: str = "custom") -> Option:
        """Evaluate ``slots`` with the reference dose per fraction ``d`` (Gy)."""
        bi = self.c.bid_interval_h
        scale = d / self.d_ref
        assigned = self._assign(slots)
        new = [f.with_dose(scale * f.dose) for f in assigned]
        course = sorted(self.delivered + new + self.fixed)
        ebrt = sorted(self.delivered + new)
        opt = Option(key=key, family=family, title=title, method=method, new_fractions=sorted(new),
                     dose_per_fraction=d, strategy=strategy, exact_dose=exact, scale=scale)
        for f in new:
            opt.phase_counts[f.phase] = opt.phase_counts.get(f.phase, 0) + 1
            opt.phase_doses[f.phase] = {lv: round(scale * self.rx.level_dose(lv, f.phase), 6)
                                        for lv in self.rx.level_names if self.rx.level_dose(lv, f.phase) > 0}
        opt.course = course
        opt.overall_time = overall_time(course)
        opt.end_date = ebrt[-1].date if ebrt else None        # end of external beam; overall time includes brachytherapy
        opt.extension_days = (opt.end_date - self.planned_end).days if opt.end_date else 0
        res = [TissueResult(t.name, t.eqd2(course, bi), p, t.max_eqd2)
               for t, p in zip(self.tumours, self.planned_levels)]
        opt.tumour, opt.levels = res[0], res[1:]
        opt.oars = [TissueResult(o.name, o.eqd2(course, bi), p, o.max_eqd2)
                    for o, p in zip(self.oars, self.planned_oars)]
        opt.weekly_peak, opt.weekly_peak_planned = self.weekly_peak(course), self.planned_weekly
        return opt

    def _solved(self, key, family, title, method, slots, tissue, target, strategy) -> Option | None:
        try:
            exact = self.solve_dose(slots, tissue, target)
        except ValueError:
            return None
        if exact <= 0:
            return None
        return self.evaluate(key, title, method, slots, self._round(exact), strategy, exact, family)

    def _matches(self, key, family, title, method, slots) -> list[Option]:
        out = []
        o = self._solved(f"{key}_tumour", family, f"{title} — match tumour", method,
                         slots, self.tumour, self.planned_tumour, "match_tumour")
        if o:
            out.append(o)
        if self.oars:
            o = self._solved(f"{key}_late", family, f"{title} — match {self.oars[0].name}", method,
                             slots, self.oars[0], self.planned_oars[0], "match_late")
            if o:
                out.append(o)
        return out

    # ------------------------------------------------------------------ #
    def options(self) -> list[Option]:
        """Every candidate schedule (no filtering). See :func:`rtgap.decide.decide`."""
        if self.remaining == 0:
            return []
        d0 = self.d_cur
        k = self.remaining
        out: list[Option] = []

        base_slots = self.pattern_standard(k)
        base = self.evaluate("none", "No compensation", "Continue at the planned d; accept the prolongation",
                             base_slots, d0, "keep_d", family="baseline")
        out.append(base)
        if self.has_dose_error:
            out += self._error_options()
        if base.extension_days <= 0:
            return _dedupe(out)
        short = base.tumour.delta < -0.005

        bi_h = self.c.bid_interval_h
        accel = [
            ("sat", "weekend", "Saturdays, same d", (True, False, False)),
            ("satsun", "weekend", "Saturdays + Sundays, same d", (True, True, False)),
            ("bid", "bid", f"BID (≥ {bi_h:g} h), same d", (False, False, True)),
            ("sat_bid", "weekend_bid", "Saturdays + BID, same d", (True, False, True)),
            ("satsun_bid", "weekend_bid", "Saturdays + Sundays + BID, same d", (True, True, True)),
        ]
        method = {"weekend": "RCR: treat at weekends", "bid": "RCR: two fractions per day",
                  "weekend_bid": "RCR: weekends and two fractions per day"}
        for key, fam, title, (sat, sun, bid) in accel:
            slots = self.pattern_accelerated(k, sat, sun, bid)
            opt = self.evaluate(key, title, method[fam], slots, d0, "keep_d", family=fam)
            out.append(opt)
            if opt.extension_days > 0 and opt.tumour.delta < -0.005:
                out += self._matches(key, "accel_dose", f"{title.replace(', same d', '')} +{opt.extension_days} d",
                                     method[fam] + ", d solved", slots)

        for key, label, (sat, sun) in [("same_end", "", (False, False)),
                                       ("same_end_sat", " incl. Sat", (True, False)),
                                       ("same_end_satsun", " incl. Sat+Sun", (True, True))]:
            slots = self.pattern_same_end(sat, sun)
            if slots:
                out += self._matches(key, "same_end", f"Same end date, {len(slots)} fx{label}",
                                     f"Fewer, larger fractions: {len(slots)} instead of {k} "
                                     "(BCR ch. 9 Ex. 5; RCR App. B)", slots)

        if short:
            out += self._matches("extended", "extended", f"+{base.extension_days} d, {k} fx",
                                 "Accept the prolongation, raise d (RCR App. B)", base_slots)
            extra = self._extra_fractions_option(k, d0)
            if extra:
                out.append(extra)
        return _dedupe(out)

    def _error_options(self) -> list[Option]:
        """Joiner correction of the remaining fractions: n = L²/Q rounded up (Joiner's rule, it spares
        late tissues) and, if different, rounded to the nearest integer; d = L/n. Each on the regular
        calendar and, if that overruns the planned end, with weekend days and/or BID (RCR order)."""
        tgt = self.joiner_target()
        if tgt is None:
            return []
        L, Q = tgt
        n_exact = L * L / Q
        n_up = max(1, math.ceil(n_exact - 1e-9))
        n_near = max(1, int(math.floor(n_exact + 0.5)))
        out: list[Option] = []
        variants = [("", "", (False, False, False)), ("_sat", ", Saturdays", (True, False, False)),
                    ("_satsun", ", Saturdays + Sundays", (True, True, False)), ("_bid", ", BID", (False, False, True)),
                    ("_sat_bid", ", Saturdays + BID", (True, False, True)),
                    ("_satsun_bid", ", Saturdays + Sundays + BID", (True, True, True))]
        for n, stem, label0 in [(n_up, "err", "Joiner"), (n_near, "errn", "Joiner, nearest n")]:
            if stem == "errn" and n_near == n_up:
                continue
            for suf, label, (sat, sun, bid) in variants:
                slots = self.pattern_standard(n) if not suf else self.pattern_accelerated(n, sat, sun, bid)
                ref = sum(f.dose for f in self._assign(slots))
                exact = L / ref * self.d_ref
                o = self.evaluate(stem + suf, f"Dose error corrected ({label0}): {n} fx{label}",
                                  "Joiner: remaining dose and fraction size restore every tissue (BCR eq. 9.3–9.4)",
                                  slots, self._round(exact), "joiner", exact, "error")
                out.append(o)
                if not suf and o.extension_days <= 0:
                    break
        k = self.remaining
        out += self._matches("err_keep", "error", f"Dose error: {k} fx, d solved",
                             "Same number of fractions, d solved for one tissue (BCR ch. 9)", self.pattern_standard(k))
        return out

    def _extra_fractions_option(self, k: int, d0: float) -> Option | None:
        method = "Extra fractions at the planned d (RCR: when the overall time cannot be kept)"
        best = None
        for extra in range(1, self.c.max_extra_fractions + 1):
            slots = self.pattern_standard(k + extra)
            label = f"{d0:g} Gy" if not self.rx.is_multilevel else "planned dose"
            opt = self.evaluate("extra", f"+{extra} fx at {label}", method, slots, d0, "keep_d", family="extra")
            opt.title = f"+{opt.extension_days} d, {opt.title}"
            if best is None or opt.tumour.eqd2 > best.tumour.eqd2:
                best = opt
            if opt.tumour.eqd2 >= self.planned_tumour - 1e-9:
                return opt
        if best is not None:
            best.warnings.append("Extra fractions could not restore the planned tumour dose "
                                 "(repopulation outpaces the added dose).")
        return best

    # ------------------------------------------------------------------ #
    def custom_option(self, title: str, dates: Sequence[dt.date], bid_dates_: Sequence[dt.date] = (),
                      strategy: str = "match_tumour", dose: float | None = None) -> Option:
        """User-defined pattern. ``strategy``: keep_d | match_tumour | match_late | dose."""
        slots = [Fraction(d, 0) for d in dates] + [Fraction(d, 1) for d in bid_dates_]
        if strategy == "keep_d":
            return self.evaluate("custom", title, "User defined", slots, self.d_cur, "keep_d")
        if strategy == "dose":
            if dose is None:
                raise ValueError("strategy 'dose' needs a dose")
            return self.evaluate("custom", title, "User defined", slots, float(dose), "custom")
        tissue, target = ((self.tumour, self.planned_tumour) if strategy == "match_tumour"
                          else (self.oars[0], self.planned_oars[0]))
        exact = self.solve_dose(slots, tissue, target)
        return self.evaluate("custom", title, "User defined", slots, self._round(exact), strategy, exact)

    def summary(self) -> dict:
        return {
            "planned_end": self.planned_end,
            "planned_T": overall_time(self.planned_course),
            "delivered": len(self.delivered),
            "remaining": self.remaining,
            "resume": self.resume,
            "missed": self.missed,
            "planned_tumour_eqd2": self.planned_tumour,
            "planned_level_eqd2": dict(zip([t.name for t in self.tumours], self.planned_levels)),
            "planned_oar_eqd2": dict(zip([o.name for o in self.oars], self.planned_oars)),
        }


def _dedupe(options: list[Option]) -> list[Option]:
    """Drop options identical (same slots, same d) to one listed earlier."""
    seen, out = set(), []
    for o in options:
        sig = (tuple((f.date, f.slot) for f in o.new_fractions), round(o.dose_per_fraction, 6))
        if sig not in seen:
            seen.add(sig)
            out.append(o)
    return out


def weekday_name(day: dt.date) -> str:
    return WEEKDAY_NAMES[day.weekday()]
