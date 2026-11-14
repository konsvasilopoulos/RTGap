# Changelog

## 1.8.0 — 2026-11-14
* The presentation page opens at the start of every visit to the hosted site (once per browser
  session; not in the installed app and not for links that carry a case).
* Accessibility: arrow keys in the calendar and between tabs, focus kept after a tap and inside
  dialogs, spoken status of the decision, calendar days labelled with their state, skip link.
* Print view of the page: case summary, decision and all four result sections on white.

## 1.7.0 — 2026-11-14
* Installable app (PWA): manifest, icons and a service worker, so the hosted app opens offline.
* Backup and restore of all saved cases and the department protocol in one file.
* Compare two schedules side by side: values with the better one marked, both calendars.
* Undo and redo (buttons and Ctrl+Z / Ctrl+Y).
* Presentation page (welcome.html), shown on the first visit to the hosted site.

## 1.6.0 — 2026-11-14
* Department audit of the saved cases: share of courses within the RCR allowance per category,
  table of all cases, CSV export (web app).
* Import of many patients from a CSV file (template included) into the saved cases.
* User guide inside the Documentation panel: five walk-throughs that open ready examples.

## 1.5.0 — 2026-11-14
* LQ-L model as an option (`model: lql`, `lql_dt_factor`, default 2 × α/β; Astrahan 2008): linear
  above the transition dose for every tissue, in both engines, including the hand-check worksheet.
* Before the start: closed days inside the planned course, what they cost, the suggested
  compensation and a comparison of start days (web app).
* Machine-outage list as PDF and CSV. Contact address in the footer.
* 75 Python tests; JavaScript engine cross-validated on 928 cases (6136 schedules), no mismatches.

## 1.4.0 — 2026-11-14
* Machine outage triage: the outage days are applied to every case saved on the device and the
  patients are listed by priority (category, tumour dose at stake) with the suggestion for each
  and the extra weekend or BID sessions the suggestions would need.
* Method, references and self-test moved from the bottom of the page into a Documentation panel;
  the reference pop-up links to the full list.

## 1.3.0 — 2026-11-14
* Web app: read-out tiles, results in four tabs (schedule, options, analysis, report), section
  navigation, first-visit guide, About panel, light/dark theme switch.
* Link that carries a case (no server, no identifying text) and cases saved on the device.
* README shortened; the detailed notes moved to docs/REFERENCE.md.

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
