"""Apply RCR, site and local rules to the candidate schedules and choose one.

Decision flow (RCR 2019 order of consideration):

1. If the uncompensated prolongation is within the *ideal* allowance of the
   category, no compensation is needed.
2. Otherwise take the first feasible same-d acceleration (weekend, then BID,
   then both) that brings the prolongation within the ideal allowance.
3. Otherwise, if the uncompensated prolongation is within the *maximum*
   allowance of the category, accept it.
4. Otherwise take the first feasible same-d acceleration within the maximum.
5. Otherwise take the first feasible dose-modified option (same end date,
   then prolongation with raised d, then extra fractions) whose tumour
   shortfall and late-tissue increase are within the tolerances.
6. If nothing qualifies, no option is recommended: the feasible candidates
   are listed with their trade-offs for a clinical decision.

A delivered dose that differed from the plan (dose error) is handled first:
the Joiner correction of the remaining fractions restores every tissue at
once (BCR eq. 9.3–9.4) and is suggested on the first calendar (regular,
then weekends, then BID) that keeps the prolongation within the ideal,
then the maximum, allowance. Otherwise the choice is a clinical decision.

Infeasible candidates are never dropped silently: each is kept with the
rule(s) that excluded it.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from .gap import GapPlanner, Option
from .schedule import bid_dates, has_consecutive_bid

FAMILY_RANK = {"error": 0, "weekend": 1, "bid": 2, "weekend_bid": 3, "accel_dose": 4, "same_end": 5,
               "extended": 6, "extra": 7, "custom": 8}
SAME_D = {"weekend", "bid", "weekend_bid"}
DOSE_CHANGE = {"accel_dose", "same_end", "extended", "extra"}
ACUTE_WARN_PCT = 10.0     # rise of the peak 7-day dose above which a note on acute reactions is shown


@dataclass
class Decision:
    status: str                      # no_gap | no_action | recommended | clinical_decision
    headline: str
    recommended: Option | None
    trace: list[str] = field(default_factory=list)
    feasible: list[Option] = field(default_factory=list)
    rejected: list[Option] = field(default_factory=list)
    candidates: list[Option] = field(default_factory=list)   # for clinical_decision


# --------------------------------------------------------------------------- #
def rejection_reasons(p: GapPlanner, o: Option) -> list[str]:
    c, r = p.c, p.rules
    d = o.max_level_dose          # highest dose per fraction to any dose level
    why: list[str] = []
    if o.n_saturdays and not c.allow_saturday:
        why.append("Saturday treatment not available (local)")
    if o.n_sundays and not c.allow_sunday:
        why.append("Sunday treatment not available (local)")
    if o.n_bid_days:
        if not c.allow_bid:
            why.append("BID not available (local)")
        if d > c.bid_max_dose + 1e-9:
            why.append(f"BID with d = {d:.2f} Gy > {c.bid_max_dose:g} Gy (RCR)")
        if c.chemo_dates:
            clash = set(bid_dates(o.new_fractions)) & set(c.chemo_dates)
            if clash and (not c.chemo_daily or d > 1.5):
                why.append("BID on a chemotherapy day (RCR 5th ed. draft: not with non-daily chemo or d > 1.5 Gy)")
        if not c.allow_consecutive_bid and has_consecutive_bid(o.new_fractions):
            why.append("BID on consecutive days (local)")
    if abs(o.scale - p.s0) > 1e-9 and not c.allow_dose_change:
        why.append("change of dose per fraction not permitted (local)")
    if o.family == "extra" and not c.allow_extra_fractions:
        why.append("extra fractions not permitted (local)")
    if c.max_dose_per_fraction is not None and d > c.max_dose_per_fraction + 1e-9:
        why.append(f"d = {d:.2f} Gy above the local maximum of {c.max_dose_per_fraction:g} Gy")
    if c.max_fractions_per_week is not None:
        weeks = Counter(f.date.isocalendar()[:2] for f in o.course)
        worst = max(weeks.values(), default=0)
        if worst > c.max_fractions_per_week:
            why.append(f"{worst} fractions in one week > local maximum of {c.max_fractions_per_week}")
    if c.max_weekly_increase_pct is not None and o.weekly_increase_pct > c.max_weekly_increase_pct + 1e-9:
        why.append(f"peak 7-day dose +{o.weekly_increase_pct:.0f} % > local maximum of +{c.max_weekly_increase_pct:g} % (acute reactions)")
    if r.max_overall_time_days is not None and o.overall_time > r.max_overall_time_days:
        why.append(f"overall time {o.overall_time} d > {r.max_overall_time_days} d ({r.site_name or 'site'} rule)")
    if r.no_acceleration and o.family != "baseline":
        why.append("modified scheduling not appropriate for this site (RCR: no acceleration for SABR)")
    for t in o.oars + [o.tumour]:
        if t.limit is not None and t.eqd2 > t.limit + 1e-9:
            why.append(f"{t.name}: EQD2 {t.eqd2:.1f} Gy > limit {t.limit:g} Gy")
    return why


def warnings_for(p: GapPlanner, o: Option) -> list[str]:
    w: list[str] = []
    d = o.max_level_dose
    if o.n_bid_days:
        if has_consecutive_bid(o.new_fractions):
            w.append("BID on consecutive days: incomplete repair may accumulate (RCR: modified BED, "
                     "especially brain / spinal cord).")
        if not any(t.repair_half_time_h for t in p.oars):
            w.append(f"Late-tissue doses assume complete repair between BID fractions "
                     f"({p.c.bid_interval_h:g} h); RCR notes repair may be incomplete even at 6 h.")
    if d >= 6.0:
        w.append("d ≥ 6 Gy: LQ extrapolation is uncertain at large doses per fraction.")
    elif o.scale > 1.25:
        w.append(f"Fraction size +{100 * (o.scale - 1):.0f} %: results are sensitive to the α/β values.")
    if abs(o.scale - p.s0) > 1e-9:
        w.append("Dose per fraction changed: the plan must be rescaled / re-planned in the TPS "
                 "(MU, normalisation, OAR constraints) and independently checked.")
    if p.has_dose_error and (o.family in SAME_D or o.family == "baseline"):
        w.append("Keeps the dose per fraction: the dose error is not corrected.")
    if o.family == "error" and p.rx.is_multilevel:
        w.append("The Joiner correction is exact for the reference dose level only; the other levels are "
                 "scaled with it (check them in the table).")
    if o.weekly_increase_pct > ACUTE_WARN_PCT:
        w.append(f"Peak 7-day dose {o.weekly_peak:.1f} Gy EQD2 (+{o.weekly_increase_pct:.0f} % vs plan): "
                 "faster dose accumulation, expect stronger acute reactions.")
    if p.rules.gap_cause == "toxicity" and o.family != "baseline":
        w.append("The interruption was caused by acute toxicity: acceleration or larger fractions may be contraindicated.")
    mx = p.rules.max_extension_days
    if mx is not None and o.extension_days > mx:
        cat = f"category {p.category}" if p.category else "site"
        w.append(f"Prolongation of {o.extension_days} d exceeds the {cat} allowance ({mx} d).")
    return w


def _rank(p: GapPlanner, o: Option) -> int:
    if o.family == "baseline":
        mx = p.rules.max_extension_days
        return 0 if (mx is not None and o.extension_days <= mx) else 9
    return FAMILY_RANK.get(o.family, 8)


def _sort_key(o: Option):
    # within the same RCR step: match-tumour first, then least logistic burden
    # (e.g. no Sunday if Saturdays alone keep the prolongation within the allowance)
    return (o.rank, o.strategy != "match_tumour", o.burden, o.extension_days, o.n_new)


# --------------------------------------------------------------------------- #
def decide(p: GapPlanner, options: list[Option] | None = None) -> Decision:
    opts = p.options() if options is None else list(options)
    if p.remaining == 0 or not opts:
        return Decision("no_gap", "No fractions remaining: nothing to compensate.", None)

    for o in opts:
        o.warnings = o.warnings + [w for w in warnings_for(p, o) if w not in o.warnings]
        o.rejected = rejection_reasons(p, o)
        o.rank = _rank(p, o)
        o.recommended = False
    feasible = sorted([o for o in opts if o.feasible], key=_sort_key)
    rejected = sorted([o for o in opts if not o.feasible], key=_sort_key)

    r, c = p.rules, p.c
    ideal = r.ideal_extension_days if r.ideal_extension_days is not None else 0
    mx = r.max_extension_days if r.max_extension_days is not None else 0
    tol_t, tol_l = c.max_tumour_deficit_pct, c.max_late_increase_pct
    base = next(o for o in opts if o.family == "baseline")
    trace: list[str] = []
    cat = f"RCR category {r.category}" if r.category else (r.site_name or "no category")
    if r.category is None and r.max_extension_days is None:
        trace.append("No RCR category or allowance set: aiming to keep the planned end date.")
    trace.append(f"{cat}: ideal prolongation ≤ {ideal} d, maximum ≤ {mx} d"
                 + (f"; overall time ≤ {r.max_overall_time_days} d" if r.max_overall_time_days else "") + ".")
    trace.append(f"Without compensation the course ends {base.end_date.isoformat()} "
                 f"({base.extension_days:+d} d), tumour EQD2_T {base.tumour.delta:+.1f} Gy "
                 f"({base.tumour.delta_pct:+.1f} %).")

    def done(status, headline, opt=None, candidates=()):
        if opt is not None:
            opt.recommended = True
        return Decision(status, headline, opt, trace, feasible, rejected, list(candidates))

    auto_dose = tol_t is not None and tol_l is not None

    def late_ok(o: Option) -> bool:
        return tol_l is None or o.max_late_increase_pct <= tol_l + 1e-9

    def meets(o: Option) -> bool:
        return (-o.tumour.delta_pct <= tol_t + 1e-9) and (o.max_late_increase_pct <= tol_l + 1e-9)

    if r.gap_cause == "machine":
        trace.append("Machine fault: RCR first advises treating on a matched machine on the same day, if one is available.")
    if not p.tumour.has_time_factor and base.extension_days > 0:
        trace.append("No time factor is set for this tumour: the model does not quantify the loss from prolongation. "
                     "The category allowance still applies.")

    if len(p.interruptions) > 1:
        trace.append(f"{len(p.interruptions)} interruptions in this course ("
                     + ", ".join(f"{a.isoformat()}" + (f" to {b.isoformat()}" if b != a else "") + f": {n} d"
                                 for a, b, n in p.interruptions)
                     + "). The prolongation is counted over the whole course, from the original end date.")
    if p.plan_change is not None:
        f0, n0, d0 = p.plan_change
        trace.append(f"The plan was changed from {f0.isoformat()} to {n0} × {d0:g} Gy (earlier compensation); "
                     f"the targets remain those of the original prescription.")

    if p.has_dose_error:
        res = _decide_error(p, opts, feasible, rejected, base, ideal, mx, trace, done)
        if res is not None:
            return res

    if r.no_acceleration:
        trace.append("Site rule: no accelerated or modified scheduling; continue the course as planned.")
        if base.feasible:
            return done("no_action", "Continue at the planned dose per fraction (no acceleration for this site).", base)
        return done("clinical_decision", "Site rules exclude every option: clinical decision required.",
                    candidates=feasible[:3])

    # 1
    if base.feasible and base.extension_days <= ideal:
        trace.append(f"Step 1: prolongation {base.extension_days} d ≤ ideal {ideal} d → no compensation needed.")
        return done("no_action", "No compensation needed.", base)
    trace.append(f"Step 1: prolongation {base.extension_days} d > ideal {ideal} d → compensation considered.")

    if r.gap_cause == "toxicity":
        trace.append("The interruption was caused by acute toxicity: acceleration and larger fractions are not suggested "
                     "automatically. Clinical assessment of the reactions comes first.")
        if base.feasible and base.extension_days <= mx:
            trace.append(f"Step 3: prolongation {base.extension_days} d ≤ maximum {mx} d → accepted without compensation.")
            return done("no_action", f"No compensation needed (prolongation {base.extension_days} d within the allowance).", base)
        return done("clinical_decision", "Interruption due to acute toxicity: compensation is a clinical decision.",
                    candidates=[o for o in feasible if o.family != "baseline"][:3])

    same_d = [o for o in feasible if o.family in SAME_D]
    excluded_same_d = [o for o in rejected if o.family in SAME_D]
    # 2
    pick = next((o for o in same_d if o.extension_days <= ideal and late_ok(o)), None)
    if pick:
        trace.append(f"Step 2: '{pick.title}' keeps the prolongation at {pick.extension_days} d with the planned d.")
        return done("recommended", f"{pick.title}: {_short(pick)}", pick)
    if excluded_same_d:
        reasons = sorted({w for o in excluded_same_d for w in o.rejected})
        trace.append("Step 2: same-d weekend/BID options excluded: " + "; ".join(reasons) + ".")
    else:
        trace.append("Step 2: no same-d weekend/BID option reaches the ideal allowance.")
    # 3
    if base.feasible and base.extension_days <= mx:
        trace.append(f"Step 3: prolongation {base.extension_days} d ≤ maximum {mx} d → accepted without compensation.")
        return done("no_action", f"No compensation needed (prolongation {base.extension_days} d within the allowance).", base)
    # 4
    pick = next((o for o in same_d if o.extension_days <= mx and late_ok(o)), None)
    if pick:
        trace.append(f"Step 4: '{pick.title}' brings the prolongation to {pick.extension_days} d (≤ {mx} d).")
        return done("recommended", f"{pick.title}: {_short(pick)}", pick)
    trace.append(f"Step 3–4: prolongation cannot be kept within {mx} d with the planned d.")
    # 5
    dose_opts = [o for o in feasible if o.family in DOSE_CHANGE or o.family == "custom"]
    within = [o for o in dose_opts if o.extension_days <= mx]
    beyond = [o for o in dose_opts if o.extension_days > mx]
    if not auto_dose:
        trace.append("Step 5: a change of fraction size is needed. No local tolerances are set, so the trade-off "
                     "between tumour dose and late effects is a clinical decision.")
        return done("clinical_decision", "A change of fraction size is needed: clinical decision between the options.",
                    candidates=_tradeoff_candidates(within + beyond))
    pick = next((o for o in within + beyond if meets(o)), None)
    if pick:
        trace.append(f"Step 5: '{pick.title}' meets the local tolerances (tumour shortfall ≤ {tol_t:g} %, "
                     f"late increase ≤ {tol_l:g} %).")
        return done("recommended", f"{pick.title}: {_short(pick)}", pick)
    trace.append(f"Step 5: no dose-modified option meets both local tolerances (tumour shortfall ≤ {tol_t:g} %, "
                 f"late increase ≤ {tol_l:g} %). The trade-off is a clinical decision.")
    cands = _tradeoff_candidates(within + beyond)
    return done("clinical_decision", "Clinical decision needed: no option restores the tumour dose "
                "without raising the late-tissue dose beyond tolerance.", candidates=cands)


def _decide_error(p: GapPlanner, opts, feasible, rejected, base, ideal, mx, trace, done):
    """Dose-error branch. Returns a Decision, or None to continue with the gap flow."""
    errs = p.dose_errors
    dphys = sum(e.actual - e.intended for e in errs)
    t_eff = p.error_effect(p.tumour)
    l_eff = p.error_effect(p.oars[0]) if p.oars else None
    trace.append(f"Dose error on {len(errs)} delivered fraction{'s' if len(errs) > 1 else ''}: {dphys:+.2f} Gy to the reference level; "
                 f"EQD2 {p.tumour.name} {t_eff:+.2f} Gy"
                 + (f", {p.oars[0].name} {l_eff:+.2f} Gy" if l_eff is not None else "") + " (no time factor).")
    err_all = [o for o in opts if o.family == "error"]
    if p.joiner_target() is None:
        trace.append("The delivered dose already reaches the intended total: the error cannot be corrected by "
                     "adjusting the remaining fractions. Clinical decision.")
        return done("clinical_decision", "Dose error that cannot be corrected with the remaining fractions: "
                    "clinical decision.", candidates=feasible[:3])
    if not err_all:
        trace.append("The Joiner correction is smaller than the dose rounding: the remaining fractions stay as planned.")
        return None
    if p.rules.no_acceleration:
        trace.append("Site rule: no modified scheduling (SABR): the dose error needs a clinical decision.")
        return done("clinical_decision", "Dose error in a SABR course: clinical decision.",
                    candidates=[o for o in feasible if o.family == "error"][:3])
    # fewest calendar changes first; on a tie Joiner's rounding up (spares late tissues) before the nearest n
    ok = sorted([o for o in feasible if o.family == "error" and o.strategy == "joiner"],
                key=lambda o: (o.burden, max(0, o.extension_days), o.key.startswith("errn")))
    if p.rules.gap_cause == "toxicity":
        ok = [o for o in ok if not (o.n_weekend_fractions or o.n_bid_days)]
    pick = next((o for o in ok if o.extension_days <= ideal), None)
    if pick:
        trace.append(f"Joiner correction: '{pick.title}' brings every tissue back to the intended dose together "
                     f"(the rounding of n leaves the small differences shown in the table) and keeps the "
                     f"prolongation at {pick.extension_days} d (≤ ideal {ideal} d).")
        return done("recommended", f"{pick.title}: {_short(pick)}", pick)
    pick = next((o for o in ok if o.extension_days <= mx), None)
    if pick:
        trace.append(f"Joiner correction: '{pick.title}' brings every tissue back to the intended dose together, "
                     f"with a prolongation of {pick.extension_days} d (≤ maximum {mx} d).")
        return done("recommended", f"{pick.title}: {_short(pick)}", pick)
    excl = [o for o in rejected if o.family == "error" and o.strategy == "joiner"]
    if excl:
        reasons = sorted({w for o in excl for w in o.rejected})
        trace.append("Joiner correction excluded or beyond the allowance: " + "; ".join(reasons) + ".")
    else:
        trace.append(f"No Joiner correction keeps the prolongation within {mx} d.")
    cands = ok[:1] + _tradeoff_candidates([o for o in feasible if o.family in DOSE_CHANGE
                                           or (o.family == "error" and o.strategy != "joiner")])
    return done("clinical_decision", "Dose error together with a prolongation: clinical decision between the options.",
                candidates=cands[:3])


def _tradeoff_candidates(opts: list[Option]) -> list[Option]:
    """Best 'match tumour' and best 'match late' options, plus the extra-fractions one."""
    out: list[Option] = []
    for pred in (lambda o: o.strategy == "match_tumour",
                 lambda o: o.strategy == "match_late",
                 lambda o: o.family == "extra"):
        o = next((x for x in opts if pred(x) and x not in out), None)
        if o:
            out.append(o)
    return out


def _short(o: Option) -> str:
    s = f"{o.n_new} × {o.dose_per_fraction:.2f} Gy, ends {o.end_date.isoformat()} ({o.extension_days:+d} d)"
    extras = []
    if o.n_saturdays:
        extras.append(f"{o.n_saturdays} Sat")
    if o.n_sundays:
        extras.append(f"{o.n_sundays} Sun")
    if o.n_bid_days:
        extras.append(f"{o.n_bid_days} BID days")
    return s + (f" — {', '.join(extras)}" if extras else "")
