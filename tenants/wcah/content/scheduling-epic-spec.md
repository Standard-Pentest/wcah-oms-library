# West Coast Animal Hospital: Scheduling System Epic Spec

*Prototyping brief. Hand this to the builder as the epic. It defines the problem, why the obvious solution fails, the cross-industry mechanisms worth stealing, the assumptions that must hold, and what to build first.*

---

## 0. Read this first: what this project actually is

The stated goal is a scheduling tool. The real problem underneath it is narrower and harder:

- **One person** builds the entire schedule for ~60 employees. Nobody else can.
- She reportedly starts from a **blank sheet** each week with **no fixed shifts or teams**.
- The rules that make a schedule valid live **entirely in her head** and were never written down.
- The stress radiates to everyone near it, and leadership wants the role **removed**, not merely eased.

That is a tacit-expertise-and-bus-factor problem, not a calendar problem. "Blank sheet every week" is almost certainly not literally true. Nobody schedules 60 people from genuinely random constraints indefinitely and stays functional. There is a template; it is mental and undocumented. What looks like starting from nothing is starting from a model she reconstructs from memory each week. **Externalizing that model is the project.** If her judgment were truly irreducible, no tool could replace her. If it is tacit-but-real, the tool is the mechanism that pulls it out of her head and encodes it.

So the first deliverable is not software. It is her ruleset: what makes a schedule valid or broken in her judgment. Until that exists, any prototype is a drag grid with no brain, and she remains the only person who can tell if the output is any good.

**The business case that funds this** is not "scheduling is stressful." It is: if she quits, gets sick, or takes a real vacation, the hospital cannot produce a schedule. The prototype should be able to answer that disaster scenario.

---

## 1. Relationship to the attached patient-flow prototype

The attached Fable prompt (triage board, walk-in cards, drag a Chihuahua onto Dr. Gibbings) is a **different product**. Patient flow is a real-time, all-day ops tool for front desk and techs. Staff scheduling is a bursty planning tool for one or two people plus lightweight self-service for everyone else. Different users, data, and failure modes.

What carries over, and why the earlier prototype is still a legitimate component sandbox:

- **Landing / lock-screen auth pattern**: reuse unchanged.
- **Drag-and-drop card system** (dnd-kit): reuse the engine. The card becomes an *unassigned shift* or an *employee*; the drop grid becomes a **resource timeline** (staff rows x time columns) instead of a room grid.
- **Design system** (slate-blue palette, Open Sans, shadcn/ui, subtle-shadow medical-clean aesthetic): reuse.

What does not carry over: the domain model, the state, and the core logic. Do not let the patient-flow board's visual charm pull the scheduling product toward being a prettier manual grid. The manual grid is the fallback, not the value.

---

## 2. Why straight optimization fails here

The naive engineering instinct is to model this as a constraint-satisfaction or integer-programming problem and solve it. That is necessary but nowhere near sufficient, for reasons that are well documented in nurse rostering and airline crew scheduling:

1. **The objective function is unknowable and contested.** There is no single cost to minimize. Coverage, fairness, morale, development, and unspoken social dynamics all trade off, and the weights live in a human's head. An experienced scheduler can reject an "obviously bad" roster on sight; the solver has no representation of why it is bad.
2. **Constraints are soft, relational, and contextual.** "Don't put A and B together this week" is not a hard rule a solver ingests cleanly. The expert's real value is handling the 5% of weird human cases, not solving the 95% a solver handles fine.
3. **Optimal schedules are brittle.** A tightly optimized roster has no slack; one call-out collapses it and forces a full re-rostering. Humans quietly build in buffer. Optimizing for tightness is optimizing for fragility.
4. **Legitimacy beats optimality.** People accept a worse schedule they had a voice in over a better one imposed on them. A mathematically optimal schedule that feels arbitrary damages trust more than it saves hours.

The takeaway: the optimizer is a component, not the product. The product is rule-capture, fair allocation, and recoverability.

---

## 3. Cross-industry mechanisms worth stealing

Four domains have solved pieces of this. None solved the whole thing for a small credentialed clinical practice.

**Airline preferential bidding (PBS).** Crew submit weighted preferences over trips and days off; the system builds each person's best-scoring schedule in a fixed priority order (seniority), subject to coverage and legal constraints. Post-award trip trading handles the rest, and a reserve pool absorbs disruption. *Steal:* preferences expressed as weighted bids rather than a claim-first free-for-all; a defensible priority order; a trading layer; a reserve buffer.

**Course Match / A-CEEI (Wharton).** Give every participant an equal budget of fake money; they bid on combinations of what they want; a market-clearing algorithm allocates. Demonstrated fair and efficient at ~1,700 students, with large gains in perceived fairness, and roughly strategy-proof at scale because no individual moves prices. *Steal:* equal fake-money budgets as a fairness engine for contested shifts (who gets the good Saturdays off). *Caveat to design around:* participants find it genuinely hard to report preferences correctly, and approximate solutions can violate capacity. A 60-person practice is a small market, so strategy-proofness is weaker than at Wharton scale; expect some gaming and design for it.

**Stable matching / deferred acceptance (residency match, kidney exchange).** Produce an assignment where no employee-shift pair would both rather swap than keep what they have. *Steal:* stability as a legitimacy property. A schedule with no blocking pairs is one nobody can point at and say "obviously I should have had that instead."

**Firefighting and lean manufacturing.** Firefighters run self-managed shift-trade systems as a core cultural institution; lean lines use demand-leveling (heijunka) rather than person-by-person optimization. *Steal:* trading as a first-class, rule-checked feature, not an afterthought; and anchoring the schedule to **demand** (the appointment book) rather than to preferences alone.

---

## 4. Assumptions challenged

The brief asked to challenge assumptions. These are the ones the project is quietly resting on. Each is a place it can fail.

- **"Self-scheduling will fix the bottleneck."** Wrong, and backwards. Controlled evidence shows moving from manager-built to self-scheduling *lowered* perceived procedural justice and damaged the manager-staff relationship, producing "selfish scheduling" where good shifts get grabbed and nights and weekends go unfilled. A shift-claiming board is not the answer. The allocation mechanism must have structure.
- **"Preferences should drive the schedule."** Only partly. If preferences drive it, the clinic can end up staffed against demand: everyone wants Tuesday off, but Tuesday is the busiest surgery day. **Demand from the practice-management system (PIMS: Cornerstone, ezyVet, Avimark, whatever they run) should anchor staffing; preferences allocate within demand-satisfying options, not over them.** No off-the-shelf scheduler integrates with a PIMS. This is the most likely source of real differentiation and the strongest reason to build rather than buy.
- **"We need a solver."** Maybe not first. A good extracted template plus a rule-checked swap market may collapse most of the manual hours before any optimizer exists. Build the brain (rules) before the muscle (optimization).
- **"Never been done is the goal."** Novelty for its own sake is a trap. The value is fit to this clinic, not originality. The defensible innovation here is the *assembly*, not any single mechanism (see next section).
- **"Consolidate scheduling under one person / keep it with one person."** The current single-owner setup is the bug, not a constraint to preserve. But the fix is not a different single owner; it is encoding the judgment so the role dissolves.

---

## 5. The proposed system

A **rule-driven scheduling co-pilot with an internal shift market and a robustness-first objective.** The honest novelty claim: no individual mechanism below is new, but the combination, aimed at a small credential-constrained clinical practice with PIMS-driven demand, has no precedent I can find. That is the real "never been done," and it is defensible. Anything stronger is marketing.

Three layers:

### Layer 1: The rule engine (the extracted brain)

An editable, human-readable rulebook, not a black box. This *is* the scheduler's expertise, externalized. Two rule types:

- **Hard constraints** (never violate): credential minimums per shift (a DVM ratio, a licensed tech on surgery days), max hours, legally required rest, hard unavailability.
- **Soft preferences** (weighted, tradeable): individual day preferences, who-with-whom, reliability weightings, development goals.

The rulebook is a first-class artifact the org reads, edits, and argues with. When a schedule is rejected, the reason traces to a rule. This is what removes the scheduler: the judgment becomes inspectable policy that anyone can run.

### Layer 2: The internal shift market (fair allocation without a human arbiter)

For contested allocations (desirable days off, weekend distribution), run an equal-budget fake-money mechanism inspired by Course Match. Everyone gets the same budget per period and bids on what they care about. This does three things: reveals genuine preference intensity (bidding costs something), distributes fairly by construction (equal incomes), and removes the need for a human to arbitrate, which is exactly the role being eliminated. Given the small-market caveat, cap gaming with simple guardrails and a stable-matching pass so the result has no obvious blocking pairs.

### Layer 3: Robustness-first objective (design for the call-out, not the ideal week)

Optimize for **recoverability**, not tightness. Borrow the airline reserve-crew idea: deliberately schedule slack and identify, for each shift, who can back-fill without breaking a hard constraint. The system's headline number is not "how optimal" but "how many single call-outs can this week absorb before it breaks." This directly attacks the brittleness that forces weekly firefighting.

### Workflow: human-authored, machine-checked

The machine does **not** silently generate the final schedule and hand it down (that is the legitimacy failure). It drafts, then continuously flags violations and suggests repairs as the human reviews, keeping authorship with a person while preventing the failures. Over time, as trust in the rulebook grows, the draft needs less human touch, and the role dissolves gradually rather than in one risky leap. Start as co-pilot regardless of the end goal, because you must extract the rules to build either a co-pilot or full automation, and the co-pilot validates those rules against reality every week instead of betting everything on getting them right up front.

---

## 6. Prototype architecture

Reuse from the existing prototype: auth/lock flow, dnd-kit, design system.

New core:

- **Resource-timeline view**: staff rows x day/time columns. Two realistic paths: FullCalendar resource-timeline, or a custom CSS-grid week view. Custom grid is more work but avoids fighting a library's opinions; pick based on how custom the interactions get.
- **Rulebook editor**: CRUD over hard constraints and weighted soft preferences, human-readable, with each rule linkable to a violation message.
- **Constraint checker**: runs on every edit, highlights violations at the seams (e.g. "assigning Kayla to kennel Saturday drops surgery below tech minimum"), suggests repairs. This is the demo centerpiece.
- **Bid interface**: equal-budget preference bidding for a scheduling period; a clearing pass; a stability check.
- **Robustness panel**: per-week "single-call-out absorption" score and a back-fill map.
- **Demand input (stubbed for prototype)**: a mock PIMS demand curve per day. Real PIMS integration is a later epic; stub it now so the demand-anchoring logic is real even if the data source is fake.

Draggable cards = unassigned shifts and employees. Drop zones = timeline slots and doctor columns. Same interaction grammar as the walk-in board, different meaning.

---

## 7. Phasing

1. **Rule extraction** (interviews; see companion interview guides). No code. Output: the hard/soft ruleset.
2. **Rulebook + constraint checker** on a static resource-timeline view. Proves the brain works: load last week's real schedule, watch it flag the same problems the scheduler would flag. This alone justifies the project.
3. **Robustness scoring + repair suggestions.** Attacks the call-out chaos.
4. **Internal shift market** for contested allocations.
5. **Demand anchoring** via PIMS integration.

Wedge = phases 1 and 2. If the constraint checker can independently catch the failures the scheduler catches, the tacit knowledge is extractable and the whole thesis holds. If it cannot, you have found a much harder and more interesting problem, and you want to know that before building layers 2 through 5.

---

## 8. Open questions to resolve before or during phase 1

- Blank sheet or broken rotation? If she maintains a mental rotation, a template engine collapses most hours before any market exists. If truly from scratch, rule extraction is the entire game.
- Which PIMS do they run, and does it expose booked appointments via API? This gates demand anchoring.
- How many of the 60 are credential-constrained or cross-trained across departments? These are where collisions live and where off-the-shelf tools fail.
- Can she explain last week's schedule decision by decision? If yes, rules are extractable. If she genuinely cannot, that is the signal the judgment may be partly irreducible, which changes the whole approach.
- What is the current baseline: hours per week on scheduling, split between building and reacting? Capture the "before" number now for the days-to-minutes claim; it cannot be reconstructed later.

---

## 9. Where this collapses back to "buy, don't build"

State the kill condition honestly. If none of the following hold, the answer is to configure Deputy/Sling/7shifts and stop:

- Coverage is credential-constrained in ways generic tools model crudely. **(Likely true here.)**
- The schedule should be demand-driven off the PIMS. **(The real differentiator, unverified.)**
- The pain is genuinely tacit-expertise extraction and bus-factor, not just swap chaos. **(Appears true.)**

The build case rests on the credential and PIMS-demand angles. Validate the PIMS integration is feasible early. If booked-appointment data cannot be reached, the strongest reason to build weakens and the project should be re-examined.
