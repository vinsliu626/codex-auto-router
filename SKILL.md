---
name: codex-auto-router
description: Quality-aware model routing for Codex engineering tasks. Routes subtasks across Spark, Terra, Luna, GPT-5.5, and Sol while preserving invariant engineering quality gates.
---

# Codex Auto Router

Route every engineering task to the cheapest model tier that can complete it reliably **without reducing the quality bar**.

## Governing priority

Apply this order strictly:

1. Quality and acceptance criteria
2. Correctness, security, and regression risk
3. Execution efficiency
4. Quota/token savings

Never optimize quota ahead of correctness.

## Runtime truthfulness

This skill is a routing policy, not proof that the host can change models.

- Use actual model/subagent selection when the runtime exposes it.
- If model switching is unavailable, state the intended tier and continue using the safest available capability.
- Never claim a switch, delegation, reasoning level, test, build, or review occurred unless it actually occurred.
- Treat Spark/Terra/Luna/Sol as configurable tier aliases when exact model IDs differ by environment.

## Required preflight

Before meaningful edits, inspect enough of the repository to understand:

- requested outcome and acceptance criteria
- project instructions and conventions
- affected files/subsystems
- test/build/lint/typecheck commands
- data/security/production implications
- whether the task is homogeneous or should be decomposed

Do not classify complexity from the user's wording alone. A request that sounds small may hide cross-system impact.

## Routing tiers

### Spark — lightweight execution

Prefer Spark for bounded, low-risk, easily verified work:

- UI/CSS/layout/responsive tweaks
- copy/text/assets
- mechanical refactors with no semantic change
- obvious localized bug fixes
- lint/type/import errors with clear cause
- small functions or tests with established patterns
- typically 1–3 tightly related files

Spark must stop and escalate if investigation reveals database semantics, architecture changes, cross-subsystem coupling, security-sensitive behavior, unclear root cause, or expanding blast radius.

### Terra — normal implementation

Prefer Terra for:

- ordinary feature implementation
- clear requirements and established architecture
- medium-sized coding work
- straightforward API/components/CRUD
- multi-step implementation where reasoning is moderate and verification is clear

### Luna — complex implementation/debugging

Prefer Luna for:

- complex debugging
- multi-file semantic changes
- integration work
- state synchronization
- unfamiliar code paths
- non-trivial test failures
- stronger reasoning where architecture itself is not the main unknown

### GPT-5.5 — evidence-based fallback/specialist

Do not route to GPT-5.5 merely to use every model.

Use it when:

- a primary tier is unavailable or degraded, or
- repository/task-specific evidence or current benchmark evidence indicates materially better reliability for the task.

Keep the same quality gates.

### Sol + xhigh — premium reasoning

Use Sol with the highest supported reasoning effort when **any one** of these conditions is materially present:

- architecture or system-design decisions
- large-project planning/decomposition
- extreme/ambiguous debugging with unknown root cause
- critical correctness review
- security/auth/payment/permissions boundaries
- database migrations or transaction/consistency semantics with meaningful risk
- concurrency/race/distributed-state problems
- destructive or difficult-to-reverse operations
- production incidents or high blast radius
- cross-system changes where failure modes are hard to contain
- requirements whose ambiguity can cause expensive rework
- a weaker tier has produced contradictory evidence or failed to converge
- user explicitly requires maximum-quality reasoning

Do not make Sol artificially hard to trigger. Premium quota is cheaper than corrupting a large project.

## Decompose before routing

Model selection is per subtask, not necessarily per user request.

Example:

1. Sol: understand architecture and define invariants.
2. Spark: implement isolated UI work.
3. Terra: implement ordinary service/component changes.
4. Luna: integrate and debug cross-file behavior.
5. Sol: review only critical architecture/security/consistency portions.

Do not keep an entire large task on Sol after the reasoning-heavy phase has ended. Conversely, do not keep Spark merely because the task began as a UI change.

## Automatic switching

Do not ask the user for permission to upgrade or downgrade models during execution when the runtime supports automatic routing.

### Escalate immediately when

- scope expands beyond the selected tier
- assumptions become uncertain
- tests expose a deeper root cause
- multiple attempted fixes fail to converge
- architectural/security/data semantics appear
- the selected model cannot explain the failure coherently
- verification becomes difficult or ambiguous

Default escalation ladder:

`Spark -> Terra -> Luna -> Sol`

GPT-5.5 is a lateral evidence-based fallback, not a mandatory rung.

### Downgrade when

- the hard reasoning/design decision is complete
- remaining work is mechanical and bounded
- interfaces/invariants are frozen
- acceptance criteria are explicit
- a cheaper tier can execute and verify safely

A downgrade must include a handoff packet containing relevant decisions, invariants, files, acceptance criteria, known risks, and required verification.

## Retry policy

Do not waste quota by endlessly retrying the same tier.

- One ordinary self-correction is acceptable when failure is local and understood.
- Escalate after repeated failure, contradictory patches, unexplained test failures, or uncertainty about root cause.
- For high-risk domains, skip cheap experimentation and route upward immediately.

## Quality invariants across handoffs

Every model inherits the same:

- user requirements
- repository instructions
- acceptance criteria
- architectural invariants
- security/privacy constraints
- style/conventions
- compatibility requirements
- test expectations
- no-regression requirement

**Model downgrade never means quality downgrade.**

A cheaper implementation model is not allowed to simplify requirements merely because it has less reasoning capacity.

## Verification gates

Before declaring a subtask complete, perform the strongest applicable checks available in the repository:

1. inspect the diff
2. build/compile where applicable
3. typecheck where applicable
4. lint/static analysis where applicable
5. run focused tests
6. run broader regression tests when blast radius warrants them
7. verify acceptance criteria directly
8. check for unintended file/config/schema changes

Never say PASS for a check that was not run. Report unavailable or blocked checks explicitly.

See `references/quality-gates.md`.

## Hybrid review policy

Use review proportional to risk.

- Trivial/local Spark work: self-review + applicable automated verification is normally enough.
- Medium Terra work: self-review; Luna review when semantic blast radius is meaningful.
- Luna integration/debugging: stronger independent review when risk is non-trivial.
- Architecture/security/data-consistency/high-risk work: Sol review.
- Sol implementation does not waive verification; critical work still requires explicit diff and evidence review.

Do not burn Sol quota reviewing cosmetic changes unless hidden risk justifies it.

## Routing transparency

At the start of meaningful work, emit a compact block such as:

```text
MODEL ROUTING
Task: <short task>
Complexity: LOW|MEDIUM|HIGH|CRITICAL
Risk: LOW|MEDIUM|HIGH
Scope: LOCAL|MULTI-FILE|CROSS-SYSTEM
Selected: <tier> [reasoning if applicable]
Reason: <one sentence>
Escalation: <path>
Quality gates: <planned checks>
```

When switching tiers, emit only a short update:

```text
ROUTING UPDATE: Spark -> Luna
Trigger: UI symptom originates in cross-module state synchronization.
Quality bar: unchanged.
```

Avoid noisy routing commentary for every tiny action.

## Completion report

Report:

- tiers/models actually used (only if known)
- meaningful routing changes and why
- files/subsystems changed
- verification actually executed and results
- unresolved risks or checks not run

Never report estimated quota savings as fact unless the runtime exposes reliable usage data.

## Detailed policy

Read `references/routing-policy.md` when classification is ambiguous or a task mixes multiple risk levels. Read `references/quality-gates.md` before finishing substantial work.
