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

## Commissioning checklist for a department
1. Read the method section and the references, and agree on the site
   parameters (alpha/beta, repopulation, kick-off) and on the constraints
   (weekend, BID, maximum dose per fraction, tolerances).
2. Run the built-in self-test and `pytest`; record the version and results.
3. Recalculate at least five cases by hand, or with another tool, using the
   "check by hand" block, and file the comparison.
4. Recalculate past interruptions of the department and compare with what was
   decided at the time.
5. Decide who may use the tool, who checks each report, and where reports are
   filed. Each report carries the input checksum and sign-off lines.
6. Repeat steps 2 and 3 after every update of the software or of the RCR
   guidance.
