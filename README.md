# Codex Auto Router

Quality-aware parent/worker model routing for Codex.

> **Use the cheapest capable worker without lowering the engineering quality bar.**

Codex Auto Router decomposes software-engineering work, delegates bounded subtasks to model-specific workers, automatically escalates/downgrades as evidence changes, and keeps verification standards invariant across handoffs.

## Model ladder

| Tier | Role |
|---|---|
| **Spark** | Mechanical work, UI/layout, tiny/localized fixes, lightweight debugging |
| **Terra** | Normal coding, clear requirements, medium implementations |
| **Luna** | Complex debugging, multi-file semantic changes, integrations |
| **GPT-5.5** | Evidence-based compatibility/specialist fallback |
| **Sol + xhigh** | Architecture, extreme debugging, critical review, large-project planning, high-risk work |

Exact model IDs can change. The router must use models actually available in the current Codex runtime and report substitutions honestly.

## Verified runtime experiment

A real Codex runtime experiment verified the important underlying mechanism:

- parent: `gpt-5.6-sol / xhigh`;
- worker: `gpt-5.3-codex-spark / low`;
- task: localized game-HUD UI implementation;
- Spark actually modified the project through a separate worker rollout;
- parent verification afterward: typecheck PASS, lint PASS, 21/21 tests PASS, build PASS, browser interaction PASS.

The Spark worker's exact recorded checkpoint usage was 1,035,815 input tokens, including 973,440 cached input tokens, 5,766 output tokens, and 1,041,581 total tokens. These values describe that worker rollout, not a claim about whole-project savings.

This proves **model-specific parent → worker delegation is technically possible in the tested Codex runtime**. It does **not** by itself prove that the Auto Router policy is already selecting models correctly; dynamic routing remains a separate benchmark target.

## Core invariant

**Model downgrade never means quality downgrade.**

Acceptance criteria, project conventions, security constraints, architecture decisions, build/typecheck/lint expectations, tests, regression checks, and evidence requirements survive every handoff.

## How it works

1. Parent inspects the task/repository.
2. Assess semantic scope, uncertainty, blast radius, reversibility, and verification difficulty.
3. Split heterogeneous work into independently verifiable subtasks.
4. Select the cheapest safe worker.
5. Delegate through the runtime's real model-specific worker/subagent mechanism.
6. Batch coherent cheap work to avoid repeated context startup cost.
7. Re-evaluate as evidence changes.
8. Escalate immediately when hidden complexity/risk appears.
9. Downgrade after premium reasoning is complete and invariants are frozen.
10. Parent/integrator runs final quality gates.

A large project can use Sol briefly for architecture, Spark for a coherent UI batch, Terra for normal implementation, Luna for integration debugging, and Sol again only for genuinely critical review.

## Priority

**Quality > correctness risk > efficiency > premium-model exposure > total quota savings**

The project is particularly interested in reducing **Premium Token Exposure**: how much project processing actually requires Sol-class models. Total tokens can sometimes increase because workers reload context, so fewer total tokens is not the only useful optimization target.

## Worker batching

The verified Spark experiment also showed substantial cached context processing. Therefore Auto Router should not spawn a new worker for every tiny edit. Coherent work sharing model, subsystem, risk, and verification requirements should be batched when safe.

## Runtime truthfulness

Never claim a model switch because the policy recommended one. A routed task counts only when the runtime actually delegates to that worker/model. If model-specific delegation is unavailable, report the limitation rather than simulating routing.

## Install

Copy this repository as a skill directory into the skill location supported by your Codex environment, preserving `SKILL.md` and `references/` together. Confirm the skill appears in the available skill catalog before running routing benchmarks.

A GitHub repository existing remotely does **not** mean the skill is installed in a local Codex environment.

## Example

```text
MODEL ROUTING
Task: Fix mobile navigation spacing
Complexity: LOW | Risk: LOW | Scope: LOCAL
Selected worker: gpt-5.3-codex-spark
Effort: low
Reason: Localized UI edit with direct verification
Escalation: Spark -> Terra -> Luna -> Sol
```

```text
ROUTING UPDATE: Spark -> Luna
Trigger: visual symptom traced to cross-module state synchronization
Quality bar: unchanged
```

## Benchmark metrics

Routing experiments should report, when runtime evidence permits:

- actual parent/worker models and reasoning effort;
- actual spawn/delegation evidence;
- routing transitions;
- input/cached/output/total token checkpoints;
- Premium Token Exposure;
- Premium Execution Exposure when complete token totals are unavailable;
- false-cheap routing;
- unnecessary-premium routing;
- build/test/regression quality.

Never estimate missing token totals.

## Contributing

Issues and pull requests are welcome. Routing-policy changes should include concrete task examples and preferably runtime/benchmark evidence rather than model preference alone.

## License

MIT — see `LICENSE`.
