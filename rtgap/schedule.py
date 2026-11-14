"""Fractions and calendar helpers."""
from __future__ import annotations

import datetime as dt
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Iterable, Sequence

WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_WEEKDAY_LOOKUP = {name.lower(): i for i, name in enumerate(WEEKDAY_NAMES)}


@dataclass(frozen=True, order=True)
class Fraction:
    """One fraction.

    ``slot`` is 0 for the first fraction of a day, 1 for the second (BID).
    ``dose`` is the dose per fraction of the *reference* quantity of the
    fraction's ``phase`` (the primary dose level, see Prescription); the dose
    to any tissue is ``dose`` times that tissue's ratio for the phase.
    """
    date: dt.date
    slot: int = 0
    dose: float = field(default=0.0, compare=False)
    phase: int = field(default=0, compare=False)

    def with_dose(self, dose: float) -> "Fraction":
        return Fraction(self.date, self.slot, dose, self.phase)

    def with_phase(self, phase: int, dose: float) -> "Fraction":
        return Fraction(self.date, self.slot, dose, phase)


def parse_date(value) -> dt.date:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    return dt.date.fromisoformat(str(value).strip())


def parse_weekdays(values: Iterable) -> tuple[int, ...]:
    out = []
    for v in values:
        if isinstance(v, int):
            out.append(v)
        else:
            key = str(v).strip().lower()[:3]
            if key not in _WEEKDAY_LOOKUP:
                raise ValueError(f"unknown weekday: {v!r}")
            out.append(_WEEKDAY_LOOKUP[key])
    return tuple(sorted(set(out)))


def daterange(first: dt.date, last: dt.date):
    """Inclusive range of dates."""
    day = first
    while day <= last:
        yield day
        day += dt.timedelta(days=1)


def overall_time(fractions: Sequence[Fraction]) -> int:
    """Overall treatment time in days: last fraction date minus first fraction date.

    This is the RCR convention (70 Gy / 35 fx, Monday start to Friday finish = 46 days).
    """
    if not fractions:
        return 0
    dates = [f.date for f in fractions]
    return (max(dates) - min(dates)).days


def group_by_day(fractions: Iterable[Fraction]) -> dict[dt.date, list[Fraction]]:
    days: dict[dt.date, list[Fraction]] = defaultdict(list)
    for f in fractions:
        days[f.date].append(f)
    for v in days.values():
        v.sort(key=lambda f: f.slot)
    return dict(days)


def bid_dates(fractions: Iterable[Fraction]) -> list[dt.date]:
    return sorted(d for d, fx in group_by_day(fractions).items() if len(fx) > 1)


def has_consecutive_bid(fractions: Iterable[Fraction]) -> bool:
    days = bid_dates(fractions)
    return any((b - a).days == 1 for a, b in zip(days, days[1:]))
