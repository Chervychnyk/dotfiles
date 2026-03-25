---
name: agents-md
description: Create or update AGENTS.md for Rails, Node.js, or Python projects, especially docker-compose based repos. Use when asked to create AGENTS.md, CLAUDE.md, agent docs, repo instructions, or concise project-specific guidance for coding agents.
---

# Maintaining AGENTS.md

Create concise, high-signal agent instructions for the current repository.

## Goal

- Keep `AGENTS.md` short, concrete, and project-specific
- Prefer command tables and file paths over prose
- Target 40-80 lines; avoid exceeding 120
- Document how this repo is actually worked on: Docker Compose, npm, Rails, Nest, Hono, Vue, Python

## File Setup

1. Create or update `AGENTS.md` at repo root
2. If `CLAUDE.md` does not exist, create symlink: `ln -s AGENTS.md CLAUDE.md`
3. If repo already has agent docs, merge instead of duplicating

## Before Writing

Inspect the repository first.

### 1. Detect stack

Look for:
- Rails: `Gemfile`, `config/application.rb`, `bin/rails`
- Node: `package.json`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`
- Vue: `vite.config.*`, `nuxt.config.*`, `src/`, `app.vue`
- Nest: `nest-cli.json`, `src/main.ts`
- Hono: `hono`, `src/app.*`, `src/index.*`
- Python: `pyproject.toml`, `requirements.txt`, `uv.lock`, `poetry.lock`
- Docker: `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, `compose.yaml`, `Dockerfile*`

### 2. Detect command style

Determine the canonical way commands are run:
- `docker compose exec ...`
- `docker compose run --rm ...`
- `bin/dev`, `bin/rails`, `bin/rake`
- `npm run ...`, `pnpm ...`, `yarn ...`
- `pytest`, `ruff`, `mypy`, `uv run ...`

Prefer the repo's existing command style. If the app normally runs in Docker, document Docker commands first.

### 3. Detect quality gates

Check for:
- Rails: RSpec, Minitest, RuboCop, Brakeman, StandardRB
- Node: ESLint, Biome, Prettier, Vitest, Jest, Playwright, TypeScript
- Python: pytest, ruff, mypy, pyright
- CI: GitHub Actions, GitLab CI, Makefile, scripts in `package.json`

### 4. Detect structure and conventions

Identify only the conventions that matter for an agent:
- app location
- test location
- background jobs
- API routes/controllers
- frontend app location
- shared packages / monorepo layout
- whether commands must be run inside a named service container

## Writing Rules

- Use headers + bullets + tables only
- No long paragraphs
- No generic advice
- Do not restate linter rules already enforced by config
- Prefer exact commands that work in this repo
- Prefer file-scoped commands where available
- Reference existing docs instead of copying them
- Include service names exactly as defined in compose files
- Prefer these common service names when examples are needed and the repo matches them: `rails`, `web`, `app`, `worker`

## Recommended Sections

Include only sections that are true for the repo.

### Stack

Example:

```markdown
## Stack
- Rails app in `apps/api`
- Vue frontend in `apps/web`
- Commands run via `docker compose`
```

### Setup / Runtime

Document the minimum working commands.

Rails/docker example:

```markdown
## Setup / Runtime
- Start: `docker compose up -d`
- App shell: `docker compose exec rails bash`
- Server: `docker compose exec rails bundle exec rails s`
- Rails console: `docker compose exec rails bundle exec rails c`
- DB migrate: `docker compose exec rails bundle exec rails db:migrate`
```

Frontend example:

```markdown
## Setup / Runtime
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
```

### File-Scoped Commands

Always prefer these over full-suite commands when possible.

```markdown
## File-Scoped Commands
| Task | Command |
|------|---------|
| Ruby spec | `docker compose exec rails bundle exec rspec spec/models/user_spec.rb` |
| Ruby lint | `docker compose exec rails bundle exec rubocop app/models/user.rb` |
| TS test | `npm run vitest -- src/foo.test.ts` |
| TS lint | `npm run eslint -- src/foo.ts` |
| Python test | `docker compose exec app uv run pytest tests/test_users.py` |
| Python lint | `docker compose exec app uv run ruff check app/users.py` |
```

### Project Conventions

Keep this brief and path-based.

Examples:
- API controllers in `app/controllers/api/`
- Service objects in `app/services/`
- Vue components in `src/components/`
- Nest modules under `src/modules/`
- Hono routes in `src/routes/`
- Python app code in `app/`, tests in `tests/`

### Validation

List only the main checks an agent should run before finishing.

```markdown
## Validation
- Targeted tests for changed files first
- Run project linter for touched files
- Run full suite only when changes cross boundaries or user asks
```

### Commit Attribution

Always include:

```markdown
## Commit Attribution
AI commits MUST include:
`Co-Authored-By: <agent name> <noreply@example.com>`
```

## Stack-Specific Guidance

### Rails

Prefer documenting:
- container/service name, usually `rails`, `web`, `app`, or `worker`
- `bundle exec rails s`, `bundle exec rails c`, and `bundle exec rails db:migrate` command style
- `bundle exec rspec` command style
- RuboCop/Brakeman if actually used
- where models, controllers, services, jobs, serializers, and specs live

Avoid documenting Rails basics.

### Node.js

Document the actual package manager and scripts from `package.json`.

For Vue/Nest/Hono repos, capture:
- dev/build/test/lint/typecheck scripts
- whether frontend uses npm directly instead of Docker
- source and test directories
- monorepo package boundaries if present

### Python

Document:
- env/tool runner: prefer `uv` when present; otherwise use the repo's actual toolchain
- test and lint commands
- app/test paths
- migration or task runner commands if present

### Docker Compose

When Docker is the default workflow:
- put Docker commands first
- use exact service names
- prefer `docker compose exec` for existing containers
- prefer `docker compose run --rm` for one-off tasks when that is the repo norm
- mention any required startup dependency like DB/Redis only if essential

## Anti-Patterns

Do not include:
- welcome text
- explanations of why AGENTS.md exists
- duplicated README setup
- copied formatter rules
- vague instructions like "run tests" or "follow best practices"
- commands that do not match the repo's real workflow
- huge command catalogs

## Output Shape

Use this structure when possible:

```markdown
# Agent Instructions

## Stack

## Setup / Runtime

## File-Scoped Commands

## Project Conventions

## Validation

## Commit Attribution
```
