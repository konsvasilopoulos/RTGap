# Changelog

## 1.2.0 — 2026-11-14
* RCR edition switch: `guidance: rcr2019` (default) or `rcr5_draft`, in the case, the protocol and the
  web app. Draft rules for 1-week and 3-week breast schedules and medulloblastoma; BID on chemotherapy
  days per edition. Site notes for glioblastoma, ependymoma and bladder state both editions.
* SABR resumes on non-consecutive days after an interruption (both editions).
* 69 Python tests; JavaScript engine cross-validated on 651 cases (4323 schedules), no mismatches.

## 1.1.0 — 2026-11-14
* Several interruptions in one course: the prolongation counts over the whole course; earlier
  catch-up fractions (`extra_delivered`) and an earlier change of plan (`plan_change`) are entered.
* Dose errors inside the gap workflow (`dose_errors`): generalised Joiner correction on the regular
  or an accelerated calendar, with same-count alternatives; new decision branch and trace.
* Resume-date scenarios start from the latest interruption and keep the earlier history.
* Department protocol in the web app: save, export, import; per-site values; status of the case
  against the protocol. Protocol files work with the Python command line.
* Treatment sheet for radiographers (PDF).
* Simpler header; advanced inputs fold away with a one-line summary; "?" help for the
  radiobiological terms; copy-summary button; floating decision bar on desktop.
* 63 Python tests; JavaScript engine cross-validated on 428 cases (2879 schedules), no mismatches.

## 1.0.0 — 2026-11-14
First public release.
* Web application in one file (Greek and English), runs offline; PDF report with the input attached.
* LQ engine with repopulation, incomplete repair within a day, dose levels and phases, brachytherapy fractions.
* RCR 2019 site library (26 entries) and decision order; department constraints exclude options with the reason shown.
* Peak 7-day dose indicator, gap cause, opt-in dose-change tolerances, optional category-2 time factors.
* Robustness grid, resume-date scenarios, trade-off map, recoverable share, local-control rule of thumb.
* Hand-check worksheet, built-in self-test (15 published values), retrospective `validate` and `benchmark` commands.
* Python reference package with 54 tests; JavaScript engine cross-validated on 268 cases.
* Licence changed from MIT to AGPL-3.0-or-later with commercial licensing available.

## 0.1 – 0.6 — November 2026
Development versions.
