# Playbook: building the issue tracker with agents

This guide covers the first two phases of the project. Each step gives you a prompt to paste into Claude Code, what to expect, and a checkpoint. Do the steps in order, because each one builds a habit the next one relies on.

## What's in this kit

| File | What it's for |
| --- | --- |
| `CLAUDE.md` | Instructions every agent reads at startup: layout, commands, rules and the definition of done |
| `docs/SPEC.md` | What the app does: data model, features in build order, and what's out of scope |
| `docs/API.md` | The contract between client and server. In phase 4, it's what lets two agents build both sides at once |
| `.claude/agents/test-runner.md` | Runs the checks and reports only failures. Uses Haiku, the lowest-cost model, to save usage |
| `.claude/agents/test-writer.md` | Writes tests from the spec before the code exists |
| `.claude/agents/code-reviewer.md` | Reviews changes without editing anything |
| `.claude/skills/feature/SKILL.md` | The `/feature` command: tests, then build, then check, then review, then commit |
| `PLAYBOOK.md` | This guide. It's for you; the agents don't load it |

## Before you start (about 10 minutes)

1. In PowerShell, check that Node.js and Git are installed: `node -v` and `git --version`. If either is missing, install the LTS version of Node from nodejs.org and Git from git-scm.com.
2. Update Claude Code with `claude update`. Some features in this kit need a recent version.
3. Create a folder such as `C:\dev\issue-tracker`. Right-click the zip, choose **Extract All**, and pick that folder as the destination, so `CLAUDE.md` sits directly inside it.
4. Open PowerShell in that folder and run `claude`.

You don't need to install MongoDB yet. Tests use an in-memory database, and the dev server falls back to one when no database is configured. You can connect a real one later (MongoDB Atlas has a free tier); ask Claude to walk you through it when you're ready.

## Habits that make this agentic

- **Describe outcomes, not keystrokes.** Say what you want and how you'll know it's done, then let Claude choose the steps.
- **Let Claude check itself.** When it says it's done, it should already have run the checks. If it didn't, ask why.
- **Plan before big changes.** Press Shift+Tab until the status bar shows plan mode, or start a prompt with `/plan`. Claude researches and proposes without editing until you approve.
- **Interrupt early.** Press Esc to stop Claude mid-step and redirect it. `/rewind` takes the conversation and code back to an earlier point.
- **Start fresh between features** with `/clear`. CLAUDE.md reloads automatically, so nothing important is lost, and shorter conversations use less of your plan.
- **Commit at every checkpoint**, so any mistake is easy to undo.

Recent versions of Claude Code usually start in auto mode, shown in the status bar. A safety check approves routine actions, so Claude can work through a task without stopping to ask about each command. If you'd rather approve each action while you're learning, press Shift+Tab to switch to manual mode.

## Phase 1: Foundation (you drive, Claude verifies)

### Step 1: Confirm Claude read the kit

```text
Read CLAUDE.md, docs/SPEC.md and docs/API.md. In five bullets, tell me what we're building, what the definition of done is, and which subagents and skills this project has. Don't write any code yet.
```

**Expect:** a summary that names the three subagents and `/feature`. If they're missing, quit and restart Claude Code from the project folder.

### Step 2: Start version control

```text
Initialize a git repository here. Add a .gitignore for a Node, Vite and TypeScript monorepo that covers node_modules, dist, coverage, .env files and .claude/settings.local.json. Commit everything as "chore: add agent starter kit".
```

**Checkpoint:** `git log` shows one commit.

### Step 3: Plan the scaffold

Switch to plan mode with Shift+Tab, then paste:

```text
Plan the project scaffold described in CLAUDE.md: npm workspaces for client, server and shared; root scripts for dev, test, typecheck and lint; ESLint for TypeScript and Vue; a server test setup using mongodb-memory-server; a GET /api/health endpoint with a passing Supertest test; and a Vue home page that calls it and shows the status, with a passing component test. Don't build any issue features yet.
```

**Expect:** a plan that lists the packages, files and scripts. Read it, and ask about anything you don't understand ("why this package?"). If something looks wrong, choose **No, keep planning** and say what to change. When it looks right, approve it.

### Step 4: Build the scaffold

After you approve, Claude installs packages and writes files, which takes a few minutes. Before it says it's done, it should hand the checks to the test-runner subagent. This is your first look at a second agent: a short report comes back instead of pages of logs. If Claude skipped the checks:

```text
Run all the checks through the test-runner and fix anything that fails.
```

Then see the result for yourself. Open a second PowerShell window in the project folder, run `npm run dev`, and go to http://localhost:5173. The page should show the server's health status.

**Checkpoint:** a commit for the scaffold. If there isn't one, ask Claude to commit it.

### Step 5: First feature, in one session

```text
Build SPEC features 1 and 2: creating an issue, and listing issues newest first with pagination (no filters yet). Do the server first, then the client. Write tests as you go, follow the definition of done, then commit and summarize what you built.
```

**Watch the loop:** Claude writes code, runs checks, reads the failures, fixes them and runs the checks again. That loop is the core of agentic work. Claude isn't only writing code; it's proving the code works.

**Checkpoint:** in the browser, create a few issues and check that they appear in the list.

### Step 6: Have a second agent review it

```text
Use the code-reviewer subagent to review the last commit.
```

**Expect:** a verdict with must-fix items, from an agent that didn't write the code and can't edit it. Then:

```text
Fix the must-fix items from the review, run the checks, and commit.
```

That's your first multi-agent loop: one agent builds, another reviews, and the first fixes what the second found. Run `/clear` before moving on.

## Phase 2: Specialists do the routine work

### Step 7: Run the full pipeline with /feature

```text
/feature view, edit, close and reopen an issue (SPEC features 3 to 5)
```

**What happens:**

1. Claude finds the feature in the spec and lists acceptance criteria.
2. The test-writer writes tests from the spec, and they fail because the feature doesn't exist yet. That's intended: the tests describe the target, and they come from an agent that isn't writing the code.
3. Claude builds the feature until the test-runner reports everything passing.
4. The code-reviewer reviews the work, and Claude fixes the must-fix items.
5. Claude commits and tells you how to try the feature.

**Your job:** answer questions, skim the review, and try the feature in the browser.

### Step 8: Finish the MVP

Run `/clear`, then one `/feature` for each remaining item, clearing between them:

```text
/feature filter, search and sort the issue list (SPEC feature 6)
```

```text
/feature comments (SPEC feature 7)
```

```text
/feature delete an issue (SPEC feature 8)
```

When these are done, you have the full MVP, built mostly by agents checking each other's work.

## Using your Pro plan well

- Every subagent draws on your plan's usage, and `/feature` uses three of them. If you hit your limit partway through, wait for the reset and then say: `Continue the /feature run where you left off.`
- Run `/usage` to see where you stand.
- Use `/clear` between features. Long conversations cost more per message.
- The test-runner runs on Haiku on purpose, because running checks doesn't need a stronger model.

## When something goes wrong

- **Claude says it's done but a check fails:** ask it to show you the test-runner's report, and point it to the definition of done in CLAUDE.md.
- **The same error keeps coming back:** press Esc, then ask Claude to explain the error and suggest two possible causes before it changes more code.
- **Claude edits tests to make them pass:** point to the rule in the `/feature` skill and ask it to undo the test change.
- **A subagent isn't being used:** name it in your prompt ("use the test-runner subagent"). If Claude says it doesn't exist, restart Claude Code from the project folder.
- **Things got messy:** use `/rewind` to go back to an earlier point, or ask Claude to discard everything since the last commit.

## What's next

When the MVP works, come back to the conversation where you got this kit. The next phases are:

- **Phase 3, automatic quality gates:** hooks that run typecheck and lint after every edit, and a check that stops Claude from finishing while tests fail. On Windows, these are written in Node.js.
- **Phase 4, parallel work:** two sessions building the client and server halves of a new feature at the same time, each in its own git worktree, both working from docs/API.md. On a Pro plan, two agents at once is a sensible ceiling. The kanban board under "Later" in the spec makes a good first test.
