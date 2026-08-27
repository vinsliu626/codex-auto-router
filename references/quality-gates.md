# Quality Gates

Model routing changes compute allocation, not the definition of done.

## Universal gate

Before completion:

- Re-read the user request and acceptance criteria.
- Inspect the final diff.
- Confirm no unrelated changes were introduced.
- Run applicable repository-native verification.
- Report exactly what was and was not verified.

## Code changes

Use applicable checks in roughly this order:

1. formatter (if repository requires it)
2. compile/build
3. typecheck
4. lint/static analysis
5. focused tests for changed behavior
6. integration/regression tests proportional to blast radius
7. direct functional validation of acceptance criteria

Do not invent commands. Discover them from project documentation/configuration or established repository usage.

## UI work

For UI/layout changes, automated compilation alone is not sufficient when visual verification is available. Check relevant viewport/state/theme combinations required by the task. Preserve accessibility and responsive behavior when applicable.

## Database/data changes

Require stronger evidence for migrations, transactions, constraints, destructive changes, or consistency behavior. Prefer Sol routing for meaningful risk. Verify rollback/reversibility where applicable and never run destructive production operations merely to test a theory.

## Security/auth/permissions

Treat changes to authentication, authorization, secrets, payment boundaries, privilege checks, tenant isolation, or sensitive data as high risk. Require Sol-level reasoning/review when materially affected, plus targeted negative tests where feasible.

## Debugging

A patch is not complete merely because the original symptom disappears. Establish a plausible root cause and add or run a regression test when practical. If the model cannot explain why the fix works, escalate rather than layering speculative patches.

## Failed checks

When a check fails:

- determine whether failure is caused by the patch
- fix local understood failures at the current tier once
- escalate when failures expose deeper complexity or do not converge
- never hide pre-existing failures; distinguish them with evidence when possible

## Blocked checks

If environment/tooling prevents verification, report the exact blocked check and reason. Do not translate “not run” into PASS.

## Completion evidence template

```text
VERIFICATION
Diff review: PASS
Build: PASS (`<command>`)
Typecheck: PASS (`<command>`)
Focused tests: PASS (`<command>`)
Regression tests: NOT RUN — <reason>
Manual/visual acceptance: PASS | NOT AVAILABLE
Remaining risk: <none or concise description>
```

Only include checks relevant to the project; never fabricate results.
