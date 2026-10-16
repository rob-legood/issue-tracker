---
name: feature
description: Build one feature from docs/SPEC.md end to end, with tests written from the spec first, then the implementation, automated checks and an independent review. Run with /feature followed by the feature.
disable-model-invocation: true
argument-hint: "<feature from docs/SPEC.md>"
---

Build this feature: $ARGUMENTS

Work through these stages in order. Start each stage with a one-line note to the user. Wait for each subagent's result before you move to the next stage.

1. **Scope.** Find the feature in docs/SPEC.md and the endpoints it uses in docs/API.md. List the acceptance criteria you'll build against. If the request doesn't match the spec, or the spec leaves a decision open, ask the user before going further.
2. **Tests first.** Delegate to the test-writer subagent. Give it the feature, the acceptance criteria and the endpoints involved. Its tests should fail at this point, because the feature doesn't exist yet.
3. **Build.** Implement the server side first, then the client. Don't change the tests from stage 2 to make them pass. If you think a test is wrong, explain why and ask the user before changing it.
4. **Check.** Delegate to the test-runner subagent. Fix what fails and run it again, until typecheck, lint and tests all pass. If the same failure survives three attempts, stop and ask the user for direction.
5. **Review.** Delegate to the code-reviewer subagent. Fix every "must fix" item, then run the test-runner again. Note any "should fix" items you're leaving for later.
6. **Wrap up.** Commit with a message like `feat: <short description>`. Then tell the user, briefly: what was built, how many tests now pass, any review items left open, and how to try the feature in the browser.
