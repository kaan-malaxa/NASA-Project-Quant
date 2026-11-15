# FireYearClock · 10-second test (R6, prompt B2)

**Status: NOT YET RUN.** Fill in the results below after testing with two people. Do not edit the
results afterwards to make them look better (AGENTS.md science rule 8 applies to usability too).

## Setup
- Build: `#/gallery` (or `#/r/<region>?view=clock`) on the deployed site or `npm run dev`.
- Region: use the repaired real US publication (`#/r/us?view=clock`). Record the selected analysis years
  and publication code version. The test remains unrun until both people supply actual answers.
- Lens `harmonized`, mode `activity`, whole record, laptop screen, no hover.
- Testers: two teammates who have **not** seen the clock before (not R6).

## Protocol (per tester, separately)
1. Show the clock for **10 seconds**, then hide it. Say nothing about how to read it.
2. Ask: **"When is peak season?"** Write the answer word for word.
3. Ask: **"Which year was worst?"** Write the answer word for word.
4. Show the clock again and ask what, if anything, confused them. Write it down.

**Pass rule:** a tester passes when (a) the peak-season answer names the right months (compare with
`season.json → windows[0].label` and the centre text), and (b) the worst-year answer matches the year
with the highest annual total in `trend.json → annual` (harmonized), within ±1 year. **Both testers
must pass both questions.**

## Results

| | Tester A | Tester B |
|---|---|---|
| Role (R1–R5) | | |
| Region id shown | | |
| "When is peak season?" (verbatim) | | |
| Correct? (expected: ……) | | |
| "Which year was worst?" (verbatim) | | |
| Correct? (expected: ……) | | |
| What confused them | | |

## Decision
- [ ] Both passed: the clock stays the default view (`view=clock`).
- [ ] Either failed: **tell R5 to default `view` to `"months"`** (their one-line change); keep the clock as a
  toggle and as the video's hero shot (role file §11).

Message for the team chat if it failed:
> R6: the clock failed the 10-second test (details in design/clock_test.md). R5, please change the default
> `view` to "months"; the clock stays as a toggle.

Tested by: ………… Date/time (UTC): …………
