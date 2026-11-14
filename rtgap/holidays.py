"""Public-holiday calendars (days without treatment).

Greece (``GR``): New Year (1 Jan), Epiphany (6 Jan), Clean Monday (Easter − 48),
25 March, Good Friday (Easter − 2), Easter Monday (Easter + 1), Labour Day
(1 May), Holy Spirit Monday (Easter + 50), Dormition (15 Aug), Ochi Day
(28 Oct), Christmas (25 Dec), Synaxis of the Theotokos (26 Dec).
Easter is the Orthodox (Julian) Easter.

Notes: when 1 May falls in Holy Week it is sometimes moved by ministerial
decision; local holidays (e.g. a town's patron saint) are not included.
Add or remove such days with ``closed_dates`` in the prescription.
"""
from __future__ import annotations

import datetime as dt
from typing import Iterable

D = dt.timedelta


def orthodox_easter(year: int) -> dt.date:
    """Orthodox Easter Sunday (Gregorian date), Meeus' Julian algorithm. Valid 1900–2099."""
    if not 1900 <= year <= 2099:
        raise ValueError("orthodox_easter valid for 1900–2099")
    a, b, c = year % 4, year % 7, year % 19
    d = (19 * c + 15) % 30
    e = (2 * a + 4 * b - d + 34) % 7
    month = (d + e + 114) // 31
    day = (d + e + 114) % 31 + 1
    return dt.date(year, month, day) + D(days=13)


def greek_holidays(year: int) -> dict[dt.date, str]:
    e = orthodox_easter(year)
    return {
        dt.date(year, 1, 1): "New Year's Day",
        dt.date(year, 1, 6): "Epiphany",
        e - D(days=48): "Clean Monday",
        dt.date(year, 3, 25): "Independence Day / Annunciation",
        e - D(days=2): "Good Friday",
        e: "Easter Sunday",
        e + D(days=1): "Easter Monday",
        dt.date(year, 5, 1): "Labour Day",
        e + D(days=50): "Holy Spirit Monday",
        dt.date(year, 8, 15): "Dormition of the Theotokos",
        dt.date(year, 10, 28): "Ochi Day",
        dt.date(year, 12, 25): "Christmas Day",
        dt.date(year, 12, 26): "Synaxis of the Theotokos",
    }


CALENDARS = {"GR": greek_holidays}


def holiday_names(calendar: str, years: Iterable[int]) -> dict[dt.date, str]:
    key = calendar.upper()
    if key not in CALENDARS:
        raise ValueError(f"unknown holiday calendar {calendar!r} (available: {', '.join(CALENDARS)})")
    out: dict[dt.date, str] = {}
    for y in years:
        out.update(CALENDARS[key](y))
    return out


def closed_dates_for(calendar: str, first_year: int, last_year: int) -> set[dt.date]:
    return set(holiday_names(calendar, range(first_year, last_year + 1)))
