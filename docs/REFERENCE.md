# RTGap reference

Detailed notes on the model, the decision flow, the case and protocol files and the command line. The short overview is in the [README](../README.md).

LQ-based decision support for **unscheduled interruptions (gaps)** in radiotherapy
and for **dose-per-fraction errors**.

Describe the prescription, the missed days and the tissues of interest, and
`rtgap` builds candidate post-gap schedules **on a real calendar** (weekends,
public holidays, twice-daily slots). For each candidate it reports:

* the time-corrected tumour EQD2 (repopulation after the kick-off time),
* the EQD2 of each organ at risk (late endpoints),
* the change from the schedule as prescribed, plus warnings (RCR category
  limits, BID with d > 2.2 Gy, consecutive BID days, large d per fraction, OAR limits).

> **Not a medical device.** This is a research and educational tool. Every
> parameter must be confirmed by the treating team, and every modified schedule
> must be checked independently before clinical use.

## LQ-L model (1.5)

`model: lql` with `lql_dt_factor: 2.0` (case or protocol key). Above the transition dose
d_T = factor × α/β of each tissue the fraction BED continues along the LQ tangent
(Astrahan, Med Phys 2008): BED = d_T(1 + d_T/(α/β)) + (1 + 2 d_T/(α/β))(d − d_T). Below d_T
nothing changes. For two fractions on one day the incomplete-repair cross term uses the doses
capped at d_T. Doses per fraction are then solved by bisection instead of the closed form. The
Joiner correction stays an LQ result and is flagged as approximate. The default is plain LQ, as in
the RCR guidance and the published examples.

## New in 1.2: RCR edition switch

`guidance: rcr2019` (default, the published 4th edition) or `guidance: rcr5_draft`
(the 5th edition draft for consultation). It is a case key, a protocol key and a
setting of the web app's department card; the report states which was used.
The decision order and categories are the same; the draft adds:

| | RCR 2019 | RCR 5th edition draft |
|---|---|---|
| 1-week breast (≤ 5 fx) | category 2 rules | no extra dose for an interruption; finish within 3 weeks where possible (note) |
| 3-week breast (13–16 fx) | category 2 rules | overall time ≤ 5 weeks (T ≤ 34 d, excludes) |
| Medulloblastoma | category 1 | also total time ideally < 45 d (note) |
| BID on a chemotherapy day | excluded (2019: not on the same day as concomitant chemotherapy) | excluded only if the chemotherapy is not daily or d > 1.5 Gy |

In both editions SABR resumes on non-consecutive days after an unintended
delay, which the calendar now applies. The draft is not final: when the 5th
edition is published the library will be updated against the final text.

## New in 1.1

* **Several interruptions in one course.** Mark every interruption, earlier
  ones too: the prolongation is counted over the whole course from the
  original end date, as the RCR allowance requires. Fractions given outside
  the plan (an earlier Saturday or second fraction) and an earlier
  compensation that changed the rest of the course (`plan_change`) are
  entered so that the delivered course is the real one.
* **Dose errors inside the gap workflow.** A delivered fraction with a wrong
  dose (`dose_errors`) is corrected with the generalised Joiner method
  (BCR eq. 9.3–9.4): the remaining dose and fraction size restore the total
  dose and the sum of squared fraction doses, which brings every tissue back
  together whatever its α/β. The number of fractions is offered rounded up
  (Joiner's rule) and to the nearest integer, on the regular calendar and,
  when that overruns, with weekend days and BID in the RCR order.
* **Department protocol in the web app.** Save the department settings and
  its own values per site as the default for every new case, export them as
  a protocol file for colleagues and for the Python command line, and import
  one. A case file still contains every value used.
* **Treatment sheet for radiographers (PDF).** The remaining fractions with
  date, session, dose per level and blank columns for time given and
  initials, plus the key instructions (new dose and re-plan, BID spacing,
  weekend days) and signature lines.

```yaml
gap:
  missed_dates: [2026-10-14, 2026-10-15, 2026-11-04, 2026-11-05]   # both interruptions
  extra_delivered: [2026-10-17]                                     # Saturday catch-up already given
  dose_errors: [{date: 2026-10-30, dose: 2.6}]                      # given instead of 2.0 Gy
  plan_change: {from: 2026-10-19, n_fractions: 27, dose_per_fraction: 2.05}   # optional
```

## How a case is decided

1. **Site library** (`rtgap sites`). 26 entries cover RCR categories 1–3,
   the 5th-edition draft changes (bladder, glioblastoma, ependymoma),
   combined brachytherapy + EBRT, the 56-day cap for squamous cervix, SABR
   (no acceleration), palliative, and a generic entry. Each entry gives the
   prolongation allowance (ideal / maximum), the tumour parameters and
   default OARs.
2. **Every method is generated**: no compensation; Saturdays;
   Saturdays + Sundays; BID; weekend + BID; same end date with fewer and
   larger fractions; prolongation with raised d; extra fractions. Dose-solved
   methods come in *match tumour* and *match late* variants.
3. **Rules exclude options, and the reason is always shown.**
   - RCR: BID with d > 2.2 Gy; BID on a chemotherapy day (5th-edition draft).
   - Site: overall-time cap; no acceleration.
   - OAR hard limits.
   - Local protocol: no Saturday, Sunday or BID; no dose change or extra
     fractions; maximum d; maximum fractions per week.
4. **Decision** in the RCR order of consideration:
   - prolongation ≤ ideal → nothing to do;
   - otherwise the first same-d weekend or BID option within the ideal;
   - otherwise prolongation ≤ maximum → accept it;
   - otherwise the first same-d option within the maximum;
   - otherwise the first dose-modified option within the tolerances
     (`max_tumour_deficit_pct`, `max_late_increase_pct`; not set by default,
     so a change of fraction size is a clinical decision);
   - otherwise **clinical decision**: the report lists the trade-off
     candidates (best match-tumour, best match-late, extra fractions).

The defaults allow everything. A **protocol file** describes what the
department can actually do and which trade-offs it accepts automatically,
and it can override or add sites (see `examples/protocol_example.yaml`).

## Ideas adopted from related tools (v0.6)

* **Trade-off map** (web app): every option as a point, tumour change against
  late-tissue change, with the tolerance region shaded. After the
  two-dimensional search of Putora et al. (2012).
* **Recoverable share**: how much of the uncompensated tumour loss the best
  feasible option recovers, without raising any late dose and with up to +5 %.
* **Local control, rule of thumb**: the tumour shortfall in days of
  repopulation times the RCR figure of 1.0–1.4 % per day. It is shown only
  when the tumour has a time factor and is not a TCP model.
* **Entered schedule**: type the schedule that was given (or your own) and it
  is evaluated beside the calculated options. It is saved in the input JSON as
  `custom_options`.
* **Retrospective validation**: `rtgap validate validation/cases --csv out.csv`
  compares past cases with the schedule that was given (see
  `validation/README.md`).
* **Benchmark for independent software**: `rtgap benchmark` writes reference
  BED/EQD2 values. Nine plain LQ schedules agree exactly with RadComp
  (`validation/benchmark.md`); the five time-corrected schedules still await
  LQL-Equiv or similar.

## Review round 2 (v0.5)

* **Incomplete repair is calculated, not only flagged.** Late-responding organs
  get a default repair half-time of 4.4 h (Bentzen, Saunders & Dische 1999),
  so two fractions on one day raise their EQD2. Set `repair_half_time_h: null`
  for complete repair.
* **Brachytherapy.** `brachy: {fractions: [{date, dose}]}` adds fixed HDR
  fractions: full dose to the primary level, `brachy_ratio` per organ, no
  external beam on those days, and they count in the overall time (the 56-day
  rule for cervix).
* **Uncertainty beside the decision.** The suggestion shows the range of
  outcomes over the parameter grid and is labelled robust or
  parameter-sensitive.
* **Check by hand.** Every schedule comes with its BED sum written out for the
  tumour and the reference organ, in the page and in the PDF, so a second
  physicist can verify it with a calculator.
* **Built-in self-test.** The web app re-runs 15 published values (Basic
  Clinical Radiobiology ch. 9, RCR 2019 Appendix B) at start-up and shows the
  result.
* Per-phase organ dose ratios in the web app (`0.9/0.1`), and a note where the
  generic RCR repopulation values are used outside head and neck.
* `docs/INTENDED_USE.md`: intended use, limitations and a commissioning
  checklist for a department.

## Clinical safeguards (v0.4)

* **Acute reactions.** Every option reports the peak 7-day dose (largest EQD2
  in any 7 consecutive days) against the plan. Weekend, BID and larger
  fractions raise it, and a note appears above +10 %. A department limit
  (`max_weekly_increase_pct`) can exclude options. This is the tool's own
  indicator, not an RCR quantity.
* **Cause of the interruption** (`gap.cause`). With `toxicity`, acceleration
  and larger fractions are never suggested automatically. With `machine`,
  the trace recalls the RCR advice to use a matched machine first.
* **No automatic change of fraction size by default.** The tolerances
  `max_tumour_deficit_pct` and `max_late_increase_pct` are unset by default,
  so dose-modified schedules are listed for a clinical decision. Same-dose
  weekend and BID options are still suggested on the RCR prolongation rule.
* **Optional time factors for category 2.** Breast (about 0.6 Gy/day, START
  analysis 2016) and prostate (0.31 Gy/day, Vogelius & Bentzen 2013) are
  offered as `time_factor_option` in the site library and are off by default.
  Without a time factor the trace states that the loss from prolongation is
  not quantified.
* The decision is labelled "suggested for discussion".

## Web application (v0.3)

`dist/index.html` is the whole application in one file. Open it in any
browser: it needs no installation and no network, so it also runs offline
on a department PC. It is rebuilt with `python web/build.py`.

* Greek and English interface and report.
* Site library, prescription with dose levels and phases, a calendar where
  you tap the missed days, radiobiological parameters, organs at risk and
  the department's constraints. Every method is always calculated and the
  constraints only exclude options, with the reason shown.
* Each decision step, rule and parameter carries a numbered reference.
* A chart of the cumulative time-corrected tumour EQD2: as prescribed,
  without compensation, and with the selected schedule.
* Robustness analysis and "if treatment resumes on…" scenarios.
* PDF report (Greek or English) with the complete input attached to the PDF
  as `rtgap-input.json`, its SHA-256 and sign-off lines. The input JSON uses
  the same schema as the Python package (`rtgap plan input.json`).
* Calculators for dose-per-fraction errors (Joiner) and BED/EQD2.

The JavaScript engine (`web/engine.js`) is a port of this package. It is
cross-validated against the Python implementation:

```bash
python web/xval/gen_ref.py   # 268 cases with the Python reference
node web/xval/xval.js        # compare the JS engine: 1806 schedules, 0 mismatches
```

## Also in v0.2

* **Dose levels and phases.** Use SIB (one phase, several levels) or sequential
  boosts (several phases). The plan is scaled as a whole, the primary level
  drives the decision, and every level is reported. Each level's repopulation
  uses its *own* overall time: a level finished in phase 1 is not penalised
  for a gap in the boost.
* **Robustness.** The case is re-run over 81 combinations of tumour α/β,
  repopulation rate, kick-off time and late α/β. The report shows the range
  of outcomes for the chosen schedule and how often the decision would
  change.
* **Unknown resume date.** `scenarios: {outage_start, days}`, or
  `--outage-start DATE --days N`, re-runs the decision for every possible
  resume day.
* **Greek public holidays.** `holidays: GR` in the prescription covers
  Orthodox Easter, Clean Monday, Holy Spirit Monday and the fixed dates.
* **Input checks.** Errors stop the calculation (missed date before the
  start, resume date before the gap, …). Warnings appear in the report
  (weekend marked as missed, unknown keys, unusual α/β, …).
* **Saveable record.** The HTML report embeds the complete input, its SHA-256,
  the software version and the time, plus sign-off lines (calculated,
  checked, approved). It prints cleanly to PDF. `rtgap extract report.html`
  recovers the input, and re-running it reproduces the result. `--json`
  writes machine-readable results.
* A reminder to re-plan or rescale in the TPS whenever d changes.

## Install

```bash
pip install -e ".[test]"          # only runtime dependency: PyYAML
```

## Usage

```bash
rtgap sites                                             # site library
rtgap plan examples/hn_machine_breakdown.yaml --html report.html
rtgap plan examples/hn_machine_breakdown.yaml --protocol examples/protocol_example.yaml --html report.html
rtgap plan examples/hn_sib_outage.yaml --html sib.html --json sib.json     # SIB + unknown resume date
rtgap plan examples/hn_sequential_boost.yaml --html seq.html
rtgap extract sib.html -o sib_input.json && rtgap plan sib_input.json      # reproduce a saved report
rtgap error --planned 70 --p 2 --error 8 --e 4          # Joiner eq. 9.3–9.4
rtgap eqd2 -n 33 -d 2 --ab 10 -T 38 --dprolif 0.7 --tk 21
```

Python API:

```python
import datetime as dt
from rtgap import GapPlanner, Prescription, Tissue, Constraints, decide, load_library

rx = Prescription(dt.date(2026, 10, 5), 35, 2.0, closed_dates={dt.date(2026, 10, 28)})
tumour = Tissue.tumour("HNSCC", 10, k_bed=0.9, kickoff_days=28)       # RCR generic values
oars = [Tissue("Late", 3), Tissue("Cord", 2, dose_ratio=0.65, max_eqd2=50)]
p = GapPlanner(rx, tumour, oars, missed_dates=[dt.date(2026, 11, 4), dt.date(2026, 11, 5)],
               constraints=Constraints(allow_saturday=True, allow_bid=True), category=1)
dec = decide(p)
print(dec.status, dec.headline)
for o in dec.feasible:
    print(o.title, o.dose_per_fraction, o.end_date, round(o.tumour.delta, 2))

site = load_library()["cervix_scc"]          # or build tissues/rules from the library
p2 = GapPlanner(rx, site.tumour_tissue(), site.oar_tissues(), missed_dates=[...], rules=site.rules())
```

Custom patterns (explicit dates and BID days) can be added in the case file.

## Model

* BED = Σ d (1 + d/(α/β)) per tissue, with d = dose ratio × prescribed fraction dose.
* Optional incomplete repair between same-day fractions (mono-exponential,
  Thames; for two equal fractions h₂ = θ = exp(−ln2·Δt/T½)). Overnight repair
  is assumed complete.
* Tumour: EQD2_T = EQD2 − D_prolif · (T − T_k) for T > T_k, where
  T = last − first fraction date (RCR convention: 35 fx Mon→Fri = 46 d).
  D_prolif (EQD2/day, *Basic Clinical Radiobiology*) and K (BED/day, RCR)
  are related by K = D_prolif (1 + 2/(α/β)). Either can be given.
* The tumour EQD2 is exactly quadratic in the new dose per fraction, so
  solutions are closed-form (positive root). Doses are rounded (default
  0.01 Gy) **before** evaluation. The unrounded value is shown in the report.
* Dose errors (Joiner 2004): D = P − E, d = (Pp − Ee)/(P − E). These restore
  every tissue at once, independent of α/β. They are valid only without
  incomplete repair and with an unchanged overall time.

## Validation

`pytest` reproduces published worked examples:

| Source | Case | Reproduced |
|--------|------|-----------|
| BCR ch. 9, Ex. 4 | 66 Gy/38 d ≡ 70.9 Gy/45 d (D_prolif 0.7) | ✓ |
| BCR ch. 9, Ex. 5 | 5×5 Gy, Wed missed → 2 × 6.7 Gy; bowel EQD2 37.5 → 38.9 Gy; fibrosis 45 → 48.5 Gy | ✓ |
| BCR ch. 9, Ex. 6 | 35×2 Gy, 2×4 Gy error → d = 1.74 Gy, 36 × 1.72 Gy | ✓ |
| RCR 2019 App. B | reference 70/35/46 d: BED₁₀ 67.8, BED₃ 116.7 | ✓ |
| RCR 2019 App. B, Ex. 3 | week 7 lost: weekend to day 51 → d = 2.62 Gy, BED₃ +6.7 %, 74.7 Gy EQD2; 2.3 Gy compromise −3.5 % / +3.1 % | ✓ |
| RCR 2019 App. B, Ex. 4 | weeks 6–7 lost: 3.22 Gy (−13.2 %), 2.57 Gy (BED 60.1), 1.87 Gy BID (61.9), 2.85 Gy to day 60 (BED₃ 138.9) | ✓ |

BCR = Joiner & van der Kogel (eds.), *Basic Clinical Radiobiology* (Bentzen & Joiner, ch. 9).

## Default parameters

The examples use the generic RCR (2019) values: tumour α/β = 10 Gy,
K = 0.9 Gy₁₀/day (≈ 0.75 Gy EQD2/day) after T_k = 28 days, late α/β = 3 Gy,
cord α/β = 2 Gy. These are generic values and not patient-specific
recommendations. The RCR 5th edition is in consultation, so the defaults
should be revisited when it is published.

## Roadmap

* DVH-based OAR evaluation from DICOM RT Dose (cf. O'Shea et al., JACMP 2022)
* Incomplete repair across consecutive BID days
* Dose errors on the second fraction of a BID day in the web app (the case file already supports `slot`)
* Update the library when the RCR 5th edition is final
* Retrospective validation on real cases and an independent second check

## References

* Bentzen SM, Joiner MC. The linear-quadratic approach in clinical practice. In: Joiner MC, van der Kogel AJ (eds.), *Basic Clinical Radiobiology*.
* The Royal College of Radiologists. *The timely delivery of radical radiotherapy: guidelines for the management of unscheduled treatment interruptions*, 4th ed. London: RCR, 2019.
* Haviland JS et al. The UK START trials: 10-year follow-up. *Lancet Oncol* 2013;14:1086–1094 (breast α/β 3.5 Gy).
* Vogelius IR, Bentzen SM. Diminishing returns from ultrahypofractionated radiation therapy for prostate cancer. *IJROBP* 2020;107:299–304 (α/β 1.6 Gy).
* The Royal College of Radiologists. *Management of unscheduled radiotherapy treatment interruptions*, 5th ed., draft for consultation.
* Joiner MC. A simple α/β-independent method to derive fully isoeffective schedules following changes in dose per fraction. *Int J Radiat Oncol Biol Phys* 2004;58:871–875.
* Thames HD. An "incomplete-repair" model for survival after fractionated and continuous irradiations. *Int J Radiat Biol* 1985;47:319–339.

## Licence

GNU AGPL-3.0-or-later; commercial licences on request. Copyright (C) 2026 Konstantinos Vasilopoulos.
