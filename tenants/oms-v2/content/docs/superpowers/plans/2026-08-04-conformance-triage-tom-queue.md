# Conformance triage — Tom queue

**RESOLVED 2026-08-04.** Tom's ruling: *"In a rotation definition if it says any
or blank for a given day, then there's no constraint."* Blank rotation cells do
not constrain availability, so the general-eligibility fills below are engine
behavior working as intended. All nine schedule extras and all seven coverage
rows were annotated `intended` in `conformance/aug02/annotations.json` citing
this ruling, and the baseline was ratcheted. The entries below are retained as
the evidence record behind those annotations.

---

- **Dimino, Aaron — Mon + Tue RVT extras**
  - Trace: roster `Wed Thu Fri Sat`; oracle Mon/Tue blank; selected `rotation-dimino-aaron-base` has only Wed ADMIN and Thu/Fri/Sat Surgery cells.
  - Actual assignments: both are `DENTAL_TECH` general eligibility fills (rank 3); Mon is +10h and Tue +20h over target.
  - Open question: should general eligibility fill be allowed to schedule an RVT outside every standing/rotation day, including beyond target hours, or should availability be limited to selected rotation cells? This is engine-wide behavior, so an Aug 2-only seed patch would hide the underlying policy.

- **Gallegos, Angie — Sun + Mon RVT extras**
  - Trace: roster `Tue Thu Fri Sat`; oracle Sun/Mon blank; selected `rotation-gallegos-angie-base` has only Tue/Thu/Fri/Sat Surgery cells.
  - Actual assignments: both are `DENTAL_TECH` general eligibility fills (rank 3); Mon is +9.5h over target.
  - Open question: should general eligibility fill treat blank standing/rotation days as available? The workbook week and transcription both leave Sun/Mon off, but `autoAssign: true` dental eligibility makes Angie eligible every day.

- **Gardner, Theresa — Sat RVT extra**
  - Trace: roster `Mon Tue Wed Thu Fri`; oracle Sat blank; selected `rotation-gardner-theresa-base` has Mon/Tue/Wed/Fri Surgery cells (Thu PB is intentionally absent from LV role cells).
  - Actual assignment: Sat is a `DENTAL_TECH` general eligibility fill (rank 3), keeping her at target after Aug 2–4 unpaid time off.
  - Open question: may the solver replace time-off hours on any blank day, or only on an explicit makeup/available day? A solver-policy change would affect weeks beyond Aug 2.

- **Quinonez, Mariel — Fri RVT extra**
  - Trace: roster `Mon Tue Wed Thu`; oracle Fri blank; selected `rotation-quinonez-mariel-base` has Mon/Tue/Wed Surgery and Thu ADMIN cells.
  - Actual assignment: Fri is a `DENTAL_TECH` general eligibility fill (rank 3), +10h over target.
  - Open question: should a blank day be solver-available despite the four-day transcribed pattern and resulting target-hours overage?

- **Ross, Shana — Wed + Thu RVT extras**
  - Trace: Aug 2 selects `rotation-ross-shana-cadence-0`, containing Sun Surgery, Mon Surgery, and Fri Room Tech only; oracle is the same plus Tue PB. Wed/Thu are absent.
  - Actual assignments: both are `DENTAL_TECH` general eligibility fills (rank 3); Wed is +10h and Thu +20h over target.
  - Open question: should blank days outside the selected alternating rotation row be eligible for general fill? Fixing this in row selection would be incorrect because row 0 is selected and rendered faithfully.

- **Sharko, Chloe — Wed RVT extra**
  - Trace: roster `Sun Mon Tue Fri`; oracle Wed blank; selected `rotation-sharko-chloe-base` has Sun Surgery, Mon/Tue Room Tech, and Fri Dental Monitor cells.
  - Actual assignment: Wed is a `DENTAL_TECH` general eligibility fill (rank 3), +10h over target.
  - Open question: should general eligibility fill schedule a blank day beyond the transcribed pattern and target hours?

- **Coverage — RVT OVER on Sun, Mon, Tue, Wed, Thu, Fri, Sat**
  - All seven rows remain unannotated because their contributing extra cells above are queued. They follow the queued cell verdicts per Task 3 Step 5.

- **Shared evidence / policy question**
  - `src/seed/buildSeed.js` grants every RVT except Teagan Dental Tech eligibility with `autoAssign: true`; this predates and is preserved by Tom's Approach B commit `4d1de56`.
  - `src/engine/generate.js` general eligibility fill treats any day without an existing assignment or explicit `unavailableDays` entry as available and may schedule over target when all candidates would exceed target.
  - Should blank rotation cells mean unavailable, or is a separate availability model required? Either correction changes engine semantics outside Aug 2, so the scope guard requires Tom's verdict.
