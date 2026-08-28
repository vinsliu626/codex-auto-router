---
name: codex-auto-router
description: Quality-aware Codex parent/worker model router. Automatically decomposes engineering work, delegates bounded subtasks to model-specific workers, escalates/downgrades as evidence changes, batches cheap work, and preserves invariant quality gates.
---

# Codex Auto Router

Use a strong parent/orchestrator to route each engineering subtask to the cheapest **actually executable** model worker that can complete it reliably without reducing the quality bar.

## Governing priority

1. Quality and acceptance criteria
2. Correctness, security, and regression risk
3. Execution efficiency
4. Premium-model exposure
5. Total quota/token savings

Never optimize quota ahead of correctness.

## Verified execution model

Codex runtimes can support a parent task delegating a subtask to a model-specific child/worker. This project has runtime evidence of a `gpt-5.6-sol / xhigh` parent delegating a localized UI implementation to `gpt-5.3-codex-spark / low`; the Spark worker modified the project and the parent subsequently verified typecheck, lint, 21/21 tests, build, and browser behavior.

Therefore, when the current runtime exposes equivalent model-specific delegation/subagent capability, **perform real delegation**. Do not merely recommend a tier in prose.

Runtime capabilities can change. Before relying on a model-specific worker, use the actual delegation mechanism available in the current runtime and verify the worker identity from runtime evidence when observable.

If the runtime cannot perform model-specific delegation:

- state that limitation;
- do not pretend routing occurred;
- use the safest available execution path;
- record `DYNAMIC MODEL ROUTING: NOT AVAILABLE`.

## Parent/orchestrator responsibilities

The parent owns:

- understanding the user goal;
- reading repository/project instructions;
- identifying acceptance criteria and invariants;
- decomposition and routing;
- risk and blast-radius assessment;
- worker handoff packets;
- escalation/downgrade decisions;
- integration across workers;
- final quality gates and completion report.

The parent should not personally perform large amounts of cheap mechanical implementation when a suitable cheaper worker is available.

## Required preflight

Before meaningful edits, inspect enough of the repository to understand:

- requested outcome and acceptance criteria;
- project instructions and conventions;
- affected files/subsystems;
- test/build/lint/typecheck commands;
- data/security/production implications;
- whether work should be decomposed;
- whether the runtime can spawn/delegate to explicit model workers.

Do not classify complexity from prompt wording alone. A visual symptom can hide a cross-system state bug.

## Routing tiers

Exact model IDs may evolve. Prefer the available model matching each tier; record substitutions truthfully.

### Spark — lightweight worker

Default target: `gpt-5.3-codex-spark`, low reasoning when sufficient.

Delegate bounded, low-risk, easily verified work such as:

- UI/CSS/layout/responsive tweaks;
- copy/text/assets;
- mechanical refactors with no semantic change;
- obvious localized bug fixes;
- lint/type/import fixes with a clear cause;
- small functions/tests following established patterns.

Do not use file count as the primary risk signal. Many generated/mechanical files can remain cheap; a one-line authorization change cannot.

Spark must stop and return `ESCALATION_REQUIRED` when investigation reveals architecture, database semantics, security boundaries, cross-subsystem coupling, unclear root cause, expanding blast radius, or difficult verification.

### Terra — normal implementation worker

Use for:

- ordinary feature implementation;
- clear requirements in established architecture;
- medium coding work;
- straightforward API/components/CRUD;
- multi-step implementation with moderate reasoning and clear verification.

Use an appropriate available Terra model/effort configured by the runtime. Record the exact worker identity actually used.

### Luna — complex implementation/debugging worker

Use for:

- complex debugging;
- multi-file semantic changes;
- integration work;
- state synchronization;
- unfamiliar code paths;
- non-trivial test failures;
- stronger reasoning where architecture itself is not the main unknown.

Record the exact available Luna model/effort actually used.

### GPT-5.5 — evidence-based fallback/specialist

GPT-5.5 is not a mandatory rung. Use it only when:

- a primary tier is unavailable/degraded; or
- task/repository benchmark evidence indicates materially better reliability.

### Sol — premium reasoning

Use the strongest available Sol model with `xhigh` (or the highest supported effort) when **any one** material Sol-class condition exists:

- architecture/system-design decisions;
- large-project planning/decomposition;
- extreme or ambiguous debugging with unknown root cause;
- critical correctness review;
- security/auth/payment/permission boundaries;
- meaningful database migration/transaction/consistency risk;
- concurrency/race/distributed-state problems;
- destructive/difficult-to-reverse operations;
- production incidents/high blast radius;
- cross-system changes with hard-to-contain failure modes;
- ambiguity that could cause expensive rework;
- weaker workers produced contradictory evidence or failed to converge;
- user explicitly requires maximum-quality reasoning.

Do not make Sol artificially difficult to trigger. Avoiding a serious regression is more important than quota savings.

## Decompose and delegate

Route per subtask, not per user request.

A heterogeneous project should commonly look like:

1. Sol parent/worker: architecture and invariants when genuinely needed.
2. Spark worker: isolated UI/mechanical batch.
3. Terra worker: ordinary implementation batch.
4. Luna worker: integration/complex debugging.
5. Sol: only critical final review where risk warrants it.

Do not keep the entire project on Sol after premium reasoning is complete. Do not keep Spark after evidence reveals deeper complexity.

## Batch cheap work

Worker startup/context processing can be expensive even for cheap models. Avoid spawning a fresh worker for every tiny edit.

Batch subtasks when they share:

- the same target tier/model;
- the same subsystem/context;
- compatible risk level;
- compatible verification requirements.

Prefer one Spark UI batch containing several coherent UI fixes over several independent Spark workers that repeatedly reload the same repository context.

Do **not** batch unrelated tasks merely to reduce worker count if doing so obscures invariants or increases coordination risk.

## Worker handoff packet

Every delegated worker receives enough context to execute without rediscovering architecture:

```text
SUBTASK
Goal:
Selected worker/model:
Reasoning effort:
Files/areas:
Frozen decisions:
Must-preserve invariants:
Acceptance criteria:
Known risks:
Required checks:
Do not change:
Escalation triggers:
```

A cheaper worker must not reinterpret frozen architecture. If new evidence invalidates it, stop and escalate.

## Automatic escalation

Do not ask the user for permission for routine model upgrades/downgrades when the runtime supports them.

Escalate when:

- scope expands beyond the selected tier;
- assumptions become uncertain;
- tests reveal a deeper root cause;
- a worker fails to converge after one understood self-correction;
- architecture/security/data semantics appear;
- the worker cannot coherently explain the failure;
- verification becomes difficult/ambiguous.

Default conceptual ladder:

`Spark -> Terra -> Luna -> Sol`

GPT-5.5 remains a lateral evidence-based fallback.

Workers should return evidence and an escalation reason rather than blindly continuing speculative patches.

## Automatic downgrade

Downgrade when:

- hard reasoning/design is complete;
- interfaces and invariants are frozen;
- remaining work is bounded/mechanical;
- acceptance criteria are explicit;
- a cheaper worker can safely implement and verify it.

Example: Sol designs persistence invariants, then hands ordinary implementation to Terra and isolated presentation work to Spark.

## Retry policy

- One local, understood self-correction at the current tier is acceptable.
- Repeated unexplained failure triggers escalation.
- High-risk domains skip cheap experimentation and route upward immediately.
- Never keep a weak worker retrying simply to avoid premium quota.

## Quality invariants across handoffs

Every worker inherits the same:

- user requirements;
- repository instructions;
- acceptance criteria;
- architectural invariants;
- security/privacy constraints;
- conventions;
- compatibility requirements;
- test expectations;
- no-regression requirement.

**Model downgrade never means quality downgrade.**

## Parent-owned verification gates

A worker saying `DONE` is not sufficient.

The parent/integrator must perform or verify the strongest applicable checks:

1. inspect final diff;
2. build/compile;
3. typecheck;
4. lint/static analysis;
5. focused tests;
6. broader regression tests proportional to blast radius;
7. direct acceptance validation;
8. unintended file/config/schema change check;
9. visual/browser validation for UI when available.

Never say PASS for a check that was not actually run.

See `references/quality-gates.md`.

## Hybrid review policy

- Spark cosmetic/local: worker self-check + parent automated/visual verification normally suffices.
- Terra ordinary: parent review; Luna review when semantic risk warrants it.
- Luna complex: stronger independent review when risk is meaningful.
- Architecture/security/data consistency/high risk: Sol review.
- Sol implementation still requires explicit verification evidence.

Do not burn Sol review quota on cosmetic changes without hidden risk.

## Routing transparency

For meaningful work, emit a compact routing block:

```text
MODEL ROUTING
Task: <short task>
Complexity: LOW|MEDIUM|HIGH|CRITICAL
Risk: LOW|MEDIUM|HIGH
Scope: LOCAL|MULTI-FILE|CROSS-SYSTEM
Selected worker: <tier / exact model if known>
Effort: <actual requested effort>
Reason: <one sentence>
Escalation: <path>
Quality gates: <planned checks>
```

On a real transition:

```text
ROUTING UPDATE: Spark -> Luna
Trigger: visual symptom traced to cross-module state synchronization.
Worker execution: requested via runtime delegation.
Quality bar: unchanged.
```

Do not call a recommendation an execution.

## Runtime evidence and usage accounting

When observable, record:

- parent model and effort;
- child/worker model and effort;
- spawn/delegation evidence;
- actual transitions;
- input tokens;
- cached input tokens;
- output tokens;
- reasoning output tokens;
- total tokens.

Never estimate missing token usage.

If the runtime exposes only incomplete checkpoints, label them as checkpoints rather than whole-task totals.

For router evaluation, distinguish:

- **Total Token Processing**: all model token processing when exactly available;
- **Premium Token Exposure**: token processing performed by premium/Sol workers;
- **Premium Execution Exposure**: proportion of meaningful development stages executed by Sol when exact tokens are unavailable.

Do not claim a percentage of token savings without complete authoritative usage data.

## Completion report

Report:

- parent model actually used, if observable;
- workers actually used, if observable;
- meaningful routing transitions;
- files/subsystems changed;
- verification actually executed and results;
- token/usage evidence exactly as exposed;
- unresolved risks/checks not run.

Include a validity block for routing experiments:

```text
ROUTER VALIDITY
AUTO ROUTER INSTALLED: YES|NO
AUTO ROUTER EXECUTED: YES|NO
MODEL-SPECIFIC WORKER DELEGATION: YES|NO
DYNAMIC MODEL ROUTING VERIFIED: YES|NO
EXACT WHOLE-TASK TOKEN USAGE: YES|NO
```

## Detailed policy

Read `references/routing-policy.md` when classification is ambiguous or work mixes risk levels. Read `references/quality-gates.md` before completing substantial work.
