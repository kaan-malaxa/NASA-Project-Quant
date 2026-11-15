# FireRosetta · Start here

NASA Space Apps Challenge 2026 · Harmonization of MODIS and VIIRS Hot Spots
Plan v2 · Saturday 14 Nov 2026 · supersedes the build sections of the Draft v1 charter

**Deadline:** we submit Sunday 22:00 Eastern (the window closes at 23:59). About 30 working hours.

## What is in this bundle

| File | Read it if you are | What it is |
|---|---|---|
| `AGENTS.md` (repo root) | everyone, and every AI assistant | Binding rules: ownership, science honesty, engineering, wording |
| `plan/00_START_HERE.md` | everyone | This page: kickoff, first 90 minutes, how to use the prompts |
| `plan/01_ARCHITECTURE.md` | everyone | System design, scope, six workstreams, toolchain for three OSes, timeline and gates, testing, risks |
| `plan/02_CONTRACTS.md` | everyone | Every endpoint, command, config file, data file, route and component interface |
| `plan/03_SCIENCE_DECISIONS.md` | everyone (R3 owns it) | Every scientific choice, locked, with reasons |
| `plan/roles/R1 … R6` | the person with that role | Your mission, ownership, what the others do, tools, **pre-built prompts for every stage**, standalone tests, fallbacks |
| `plan/REPORTS.md` | everyone once; R1, R2, R3 during the build | Research findings, the 42 contradictions and flaws found in Draft v1 with their fixes, competitor update, items to verify, and the report templates you fill in |

Unzip the bundle at the root of the new repository so that `AGENTS.md` sits at the root and everything else under `plan/`.

## The six roles (assign names now)

| Role | Works on | Name |
|---|---|---|
| **R1** | Contracts, calendar statistics, export; scope owner | ________ |
| **R2** | Data engineering on Saturday; README, video and submission on Sunday | ________ |
| **R3** | Tier 1 harmonization and validation; science owner | ________ |
| **R4** | Planted-truth simulator and the Tier 2 eyesight curve | ________ |
| **R5** | Web app, screens, downloads, deploy | ________ |
| **R6** | Charts and design system | ________ |

Suggested fit: R1 someone comfortable with statistics in Python and with saying no; R2 the most organised person, good on camera or with words; R3 the strongest science background; R4 someone who enjoys modelling; R5 the strongest React developer; R6 the best eye for design who can write D3.

## Kickoff, 16:00–16:30 (everyone together)

1. Assign roles (table above). The draft charter's author should take R1 (scope owner).
2. **R2, immediately, before anything else:** submit the FIRMS archive requests and start country downloads (R2's file, §7). This is the only step that cannot be made faster later.
3. R2 creates the public GitHub repository `firerosetta`, unzips this bundle into it, pushes, and adds everyone as collaborators.
4. Everyone installs: Git, **uv**, **Node.js LTS (22+)**, an editor (`01_ARCHITECTURE.md` §6.1). Windows users also run `git config --global core.longpaths true` and `git config --global core.autocrlf false`.
5. Everyone clones, creates a branch `r<n>/setup`, opens their role file, and pastes their **Session primer** into their AI assistant.
6. R1 reads `REPORTS.md` §5 aloud: the eleven things we still have to verify, and who owns each.

## The first two hours (the only part where order matters)

```
16:30  R2  push pyproject.toml + pipeline/__init__.py   (by 16:45, so everyone can run pytest)
       R5  web scaffold                                 (on main by 17:00)
       R3  science.yaml                                 (on main by 17:15)
       R1  JSON Schemas                                 (on main by 17:15)
       R4  simulator, FIRMS-format writer first
       R6  30 minutes of wireframes while waiting for the scaffold
17:00  R6  component stubs                              (on main by 17:30, so R5's pages compile)
17:45  R2  pipeline/common/ + run.py + CI               (on main)
18:00  R4  tiny synthland files handed to R2
18:15  R1  sample data for three regions on main        (web team switches to it)
18:30  GATE A — stand-up — contracts frozen
```

Until `pipeline/common/` lands at 17:45, R1, R3 and R4 read YAML directly and switch to `common.config` afterwards. Nobody waits.

## How to use the pre-built prompts

1. Start every AI session by pasting your role's **Session primer**. It makes the assistant read `AGENTS.md`, the contracts, the science decisions and your role file before it writes anything.
2. Paste **one prompt at a time**, in order (A1, A2, B1 …). Each prompt names the files it may touch, the contract sections that define its inputs and outputs, the tests to write, and the acceptance commands.
3. Do not accept "done" without the pasted output of the acceptance commands.
4. If the assistant wants to edit a file outside your folders, add a dependency, rename a field or change a scientific constant: **stop**. Post the request in the team chat for the owner.
5. If a prompt and reality disagree (a real file has different columns, a number looks impossible), the assistant must report, not improvise. You take it to the owner: R1 for contracts, R3 for science, R2 for data.
6. When a prompt is finished, commit on your branch, open a pull request when your tests are green, and merge at the next gate (or sooner).
7. Prompts marked **Should** start only after your **Must** prompts are merged.

Each prompt is written for a capable coding assistant of any brand. Nothing in this plan requires a paid tool.

## Gates at a glance

| Gate | When | In one line |
|---|---|---|
| A | Sat 18:30 | Foundations on main; sample site deployed; contracts frozen |
| B | Sat 23:00 | Simulated region runs end to end; us real through Tier 1; Must screens on sample data |
| C | Sun 10:00 | Three regions real; validation real; site off sample data |
| D | Sun 14:00 | Should features merged or cut |
| E | Sun 17:00 | Feature freeze; reproducible on a second OS; numbers signed |
| — | Sun 19:00 | Video recorded |
| — | Sun 22:00 | **Submitted** |

Full criteria: `01_ARCHITECTURE.md` §8. R1 logs each gate in `REPORTS.md` §7.1.

## Five rules that matter most

1. **Never type a result.** Numbers and result sentences come from pipeline files.
2. **Missing is not zero.** No data is drawn hatched and left out of statistics.
3. **Stay in your folders.** Ask the owner for anything else.
4. **Contracts are frozen at 18:30 Saturday.** Changes go through R1.
5. **Report bad results.** A weak number explained honestly beats a strong number nobody believes.

## Who to ask

| Question about | Ask |
|---|---|
| A field, a file shape, scope, what to cut | R1 |
| Raw data, columns, downloads, `common/` helpers, Python dependencies | R2 |
| Any scientific constant, method or wording of a result | R3 |
| The simulator, `truth.json`, the eyesight curve | R4 |
| Routes, URL parameters, web dependencies, deployment | R5 |
| Colours, chart behaviour, component props | R6 |
