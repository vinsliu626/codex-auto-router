# Routing Policy

This reference expands the decision rules in `SKILL.md`.

## Decision dimensions

Classify the work using evidence from the repository, not prompt length.

| Dimension | Low | Medium | High/Critical |
|---|---|---|---|
| Scope | 1–3 local files | coherent feature/module | cross-system / broad repository |
| Reasoning | mechanical/obvious | moderate implementation | architecture/unknown root cause |
| Uncertainty | known pattern | some discovery | ambiguous behavior/invariants |
| Blast radius | cosmetic/local | feature behavior | auth/data/production/shared core |
| Reversibility | easy revert | normal rollback | migration/destructive/external side effects |
| Verification | direct/local | integration tests | difficult, distributed, incomplete oracle |

These are signals, not a numeric permission system. A single critical-risk signal may justify Sol immediately.

## Default selection

### Spark

Choose when all material signals are low and verification is easy. Typical work: CSS, spacing, copy, assets, localized obvious fixes, mechanical changes.

### Terra

Choose when requirements and architecture are clear but implementation is more than mechanical. Typical work: normal feature coding, CRUD, ordinary endpoints/components, medium implementations.

### Luna

Choose when reasoning, integration, or debugging is meaningfully difficult but the task does not require premium architecture/risk reasoning. Typical work: multi-file semantic fixes, complex integration, state bugs, unfamiliar paths.

### Sol + xhigh

Choose whenever architecture, critical risk, difficult consistency, security boundaries, destructive changes, high blast radius, extreme ambiguity, or critical review materially enters the task.

### GPT-5.5

Use only as a measured specialist/fallback. It is not part of the mandatory escalation chain.

## Scope is not just file count

One line in an authorization predicate may be higher risk than 30 lines of CSS. Ten generated files may still be mechanical. Judge semantic blast radius.

## Automatic escalation examples

### Spark -> Terra

A requested button adjustment also requires a small established component behavior change across several files. Requirements remain clear and local.

### Spark -> Luna

A visual stale-state bug turns out to come from client cache invalidation and asynchronous state synchronization.

### Terra -> Luna

An ordinary endpoint implementation causes integration tests to fail across multiple services and the root cause is not obvious.

### Any tier -> Sol

Investigation reveals transaction isolation, permission boundaries, schema migration risk, concurrency, irreversible production operations, or an architectural decision.

## Automatic downgrade examples

### Sol -> Terra/Spark

Sol determines the architecture, interfaces, invariants, migration strategy, and acceptance criteria. Remaining tasks are deterministic implementation or UI work. Hand off the frozen decisions; do not make the cheaper model rediscover architecture.

### Luna -> Spark

Luna identifies a root cause and the remaining fix is a bounded mechanical replacement plus tests.

## Handoff packet

Every downgrade/delegation should preserve:

```text
SUBTASK
Goal:
Selected tier:
Files/areas:
Frozen decisions:
Must-preserve invariants:
Acceptance criteria:
Known risks:
Required checks:
Do not change:
```

The receiving model must not reinterpret frozen architecture unless new evidence invalidates it; if that happens, escalate.

## Quality-aware decomposition

Prefer boundaries that can be independently verified. Do not split work merely to maximize cheap-model usage if doing so obscures system invariants or creates coordination risk.

Good split:

- architecture/invariants -> Sol
- isolated UI -> Spark
- ordinary service implementation -> Terra
- integration/debugging -> Luna
- critical final review -> Sol

Bad split:

- five agents independently changing the same transaction protocol without a shared invariant
- Spark changing database behavior because the diff is small
- Sol doing hundreds of repetitive copy/layout edits after design decisions are frozen

## Uncertainty rule

When uncertain between adjacent tiers, prefer the stronger tier if the cost of a wrong change is meaningful. Prefer the cheaper tier only when failure is easy to detect, easy to reverse, and cannot silently corrupt state.

## Quality review matrix

| Implementation | Default review |
|---|---|
| Spark cosmetic/local | Spark self-review + automated checks |
| Spark semantic | Terra/Luna if blast radius warrants |
| Terra ordinary | self-review; Luna for meaningful semantic risk |
| Luna complex | Luna/stronger independent review as needed |
| Architecture/security/data consistency | Sol |
| Sol critical implementation | Sol critical review + verification evidence |

Reviewer strength is driven by risk, not prestige.

## Anti-patterns

Do not:

- route by file count alone
- use Sol for every task “to be safe”
- use Spark for a high-risk one-line change
- retry a weak tier indefinitely
- downgrade acceptance criteria
- skip tests because a cheaper model made the patch
- claim a switch happened when the runtime cannot switch models
- force GPT-5.5 into the chain without evidence
- treat model benchmarks as permanent facts; capabilities and availability change
