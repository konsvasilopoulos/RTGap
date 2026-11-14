# rtgap: intended use, limitations and commissioning

## Intended use
rtgap supports a medical physicist and a radiation oncologist when an
external beam radiotherapy course has been interrupted without planning. It
lists the compensation methods of the RCR guidance, calculates their
radiobiological consequences with the linear-quadratic model, and shows which
options the site rules and the department's constraints exclude.

It does not prescribe. The output is a suggestion for discussion, and the
treating clinician decides. It is not a medical device and carries no CE mark.
A department that wants to use it clinically must treat it as in-house
software under its own quality system (in the EU: MDR Article 5(5)).

## What the model does not cover
* Organs at risk are point doses (a dose ratio to the prescription), not DVHs.
* Acute reactions are represented only by the peak 7-day dose, which is this
  tool's own indicator.
* Repopulation parameters are generic. Outside head and neck they are an
  assumption.
* Incomplete repair is modelled within a day (mono-exponential), not between
  consecutive days.
* Concurrent chemotherapy is not modelled, apart from the rule about BID on
  chemotherapy days.
* Brachytherapy fractions are fixed in date and dose and are not re-optimised.
* The LQ model is uncertain at large doses per fraction and is not meant for
  SABR.
* A change of dose per fraction always needs a new or rescaled plan in the TPS.
* Dose errors are corrected with the Joiner method, which restores every tissue
  exactly only without a time factor and without incomplete repair, and only
  for the reference dose level. Rounding the number of fractions leaves small
  differences, which the tables show. A dose error is entered as the dose to
  the reference level; every level is assumed to scale with it (an output or
  MU error), not a geometric miss.
* An earlier change of plan is described by one date, a number of fractions
  and a dose per fraction. More complex histories need the delivered fractions
  listed one by one (`gap.delivered` in the case file).
* The RCR 5th edition is used only as its draft for consultation, on request
  (`guidance: rcr5_draft`); the published 2019 edition is the default. The
  draft rules were transcribed from the consultation text and must be checked
  against the final edition when it is published.
* The department protocol of the web app is kept in this browser on this
  device. Export it as a file to keep a record and to share it.

## Commissioning checklist for a department
1. Read the method section and the references, and agree on the site
   parameters (alpha/beta, repopulation, kick-off) and on the constraints
   (weekend, BID, maximum dose per fraction, tolerances).
2. Save the agreed constraints and site values as the department protocol,
   export the protocol file and file it with the commissioning record.
3. Run the built-in self-test and `pytest`; record the version and results.
4. Recalculate at least five cases by hand, or with another tool, using the
   "check by hand" block, and file the comparison.
5. Recalculate past interruptions of the department and compare with what was
   decided at the time, including courses with more than one interruption
   and any dose errors.
6. Decide who may use the tool, who checks each report, and where reports are
   filed. Each report carries the input checksum and sign-off lines.
7. Repeat steps 3 and 4 after every update of the software or of the RCR
   guidance.
