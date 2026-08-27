# Codex Auto Router

Quality-aware model routing for Codex.

> **Use the cheapest capable model without lowering the engineering quality bar.**

Codex Auto Router is an open-source routing skill/policy that decomposes software-engineering tasks and assigns each subtask to an appropriate model tier. It is designed to save premium-model quota while preserving verification, architecture, security, and correctness standards.

## Model ladder

| Tier | Role |
|---|---|
| **Spark** | Mechanical work, UI/layout, tiny/localized fixes, lightweight debugging |
| **Terra** | Normal coding, clear requirements, medium implementations |
| **Luna** | Complex debugging, multi-file changes, integrations, stronger reasoning |
| **GPT-5.5** | Compatibility/fallback, or tasks where evidence shows a better fit |
| **Sol + xhigh** | Architecture, extreme debugging, critical review, large-project planning, high-risk work |

Model labels are policy aliases. Map them to model IDs actually available in your Codex runtime. Never claim a model switch occurred unless the host/runtime actually supports and performs it.

## Core invariant

**Model downgrade never means quality downgrade.**

Acceptance criteria, project conventions, security constraints, architecture decisions, build/typecheck/lint expectations, tests, regression checks, and evidence requirements survive every handoff.

## How it works

1. Inspect before editing.
2. Score scope, reasoning difficulty, uncertainty, blast radius, reversibility, and verification difficulty.
3. Split heterogeneous work into independently routable subtasks.
4. Select the cheapest tier with enough capability and safety margin.
5. Print a compact routing decision.
6. Re-evaluate continuously while executing.
7. Escalate immediately when hidden complexity or risk appears.
8. Downgrade automatically when premium reasoning is no longer needed.
9. Run invariant quality gates.
10. Use stronger review selectively for risky changes.

A large project can start with Sol for architecture, delegate routine implementation to Terra/Spark, use Luna for integration debugging, and return to Sol for critical review.

## Priority

**Quality > correctness risk > efficiency > quota savings**

Quota savings count only when the same acceptance and verification standard is preserved.

## Install

Copy `SKILL.md` plus `references/` into the skill location supported by your Codex environment. See `SKILL.md` for the routing protocol and `references/routing-policy.md` for the detailed matrix.

## Example

```text
MODEL ROUTING
Task: Fix mobile navigation spacing
Complexity: LOW | Risk: LOW | Scope: LOCAL
Selected: Spark
Reason: Localized UI edit with clear acceptance criteria
Escalation: Spark -> Terra -> Luna -> Sol
Auto-switching: enabled when runtime supports it
Quality gates: build + relevant tests + regression check
```

```text
MODEL ROUTING
Task: Redesign order transaction architecture
Complexity: CRITICAL | Risk: HIGH | Scope: CROSS-SYSTEM
Selected: Sol | Reasoning: xhigh
Reason: Architecture and consistency decisions require premium reasoning
Delegation after architecture: allowed
Final critical review: Sol
```

## Contributing

Issues and pull requests are welcome. Routing changes should include concrete task examples and, where possible, benchmark or failure evidence rather than preference alone.

## License

MIT — see `LICENSE`.
