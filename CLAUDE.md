# Issue Tracker

A single-team issue tracker built on the MEVN stack (MongoDB, Express, Vue, Node) in TypeScript.

- What to build: @docs/SPEC.md
- API contract, the source of truth for client and server: @docs/API.md

## Layout

An npm workspaces monorepo:

- `client/`: Vue 3 + Vite, `<script setup lang="ts">`, Pinia, Vue Router
- `server/`: Express 5 + Mongoose, run with tsx in development
- `shared/`: TypeScript types for API requests and responses, imported by both sides with `import type`
- `docs/`: product spec and API contract

## Commands (run from the repo root)

- `npm install`
- `npm run dev`: server on port 3000 and client on port 5173 together. Vite proxies `/api` to the server, so there is no CORS setup.
- `npm test`: all client and server tests
- `npm run typecheck`: tsc for server and shared, vue-tsc for client
- `npm run lint`
- One side only: add `-w server` or `-w client`, for example `npm test -w server`

## Definition of done

A task is finished only when `npm run typecheck`, `npm run lint` and `npm test` all pass. If one fails, keep working, or tell the user plainly what is failing and why. Never describe work as done while a check fails.

In the main conversation, run checks through the test-runner subagent so long output stays out of the conversation.

## Rules

- Follow docs/API.md exactly. If an endpoint has to change, update docs/API.md and the types in `shared/` in the same change, and call it out in your summary.
- Every new endpoint, store action or component gets tests in the same change. Test files sit next to the code they test, named `*.test.ts`.
- Server tests use Vitest, Supertest and mongodb-memory-server. Tests never connect to a real database.
- Client tests use Vitest and Vue Test Utils, with the modules in `client/src/api/` mocked.
- Validate every request body and query string with zod. Return errors in the format docs/API.md defines.
- Express 5 passes errors from async route handlers to the error middleware by itself. Don't wrap handlers in try/catch just to call `next(err)`.
- Keep API calls in `client/src/api/` and shared state in Pinia stores. Components never call fetch directly.
- Comments live in their own collection and reference their issue. Don't embed them in issues.
- Configuration comes from environment variables in `server/.env`, which is never committed. Keep `server/.env.example` current. If `MONGODB_URI` is unset in development, start an in-memory MongoDB and log a warning that data won't persist.
- Development happens on Windows. npm scripts must work in PowerShell and cmd, so use packages such as `rimraf`, `cross-env` and `concurrently` instead of Unix-only commands. Write helper scripts in Node.js, not bash.
- Commit after each working step with a short conventional message (`feat: …`, `fix: …`, `test: …`, `chore: …`). Don't push unless asked.
- Build only what the current task asks for. Add new ideas under "Later" in docs/SPEC.md instead of building them.
