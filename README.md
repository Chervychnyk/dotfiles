# dotfiles

Personal macOS development environment bootstrap and configuration.

## What this repo manages

- shell: zsh, zim, aliases, fzf, atuin, starship
- editors: Neovim, Vim, Zed
- terminals: Ghostty, WezTerm, tmux, Zellij
- macOS UX: AeroSpace, SketchyBar, declarative mise defaults, residual `.macos`
- tooling: mise, hk, fnox, k9s, yazi, worktrunk, PostgreSQL CLI config, Pi agent config
- packages/apps: `Brewfile`

## Quick start on a new Mac

```bash
xcode-select --install
git clone <your-dotfiles-repo> ~/dotfiles
cd ~/dotfiles
./setup.sh
```

For mostly non-interactive setup:

```bash
./setup.sh --yes
```

`--yes` is forwarded to `mise bootstrap` and also accepts defaults in the post-bootstrap script. It applies `.macos` by default, matching the old setup behavior. Use `./setup.sh --yes --no-macos` to keep the run non-interactive but skip macOS defaults.

After setup, run:

```bash
./healthcheck.sh
```

## Pi agent config

This repo links `pi/` to `~/.pi`. See `pi/README.md` for the Pi runtime map, safety stack, custom agents, extension settings, and verification commands.

## Restore agent skills

This repo tracks skill source references in `skills-lock.json`. On a new machine, restore them after `./setup.sh` has installed Node/npm:

```bash
cd ~/dotfiles
npx skills@latest experimental_install
```

The skills CLI also keeps global install metadata at `~/.agents/.skill-lock.json`. After adding or updating global skills, refresh the tracked lockfile with:

```bash
cp ~/.agents/.skill-lock.json ~/dotfiles/skills-lock.json
```

Useful checks:

```bash
npx skills@latest list -g -a pi -a claude-code
npx skills@latest update -g
```

## What `setup.sh` does

`setup.sh` is now a small first-stage installer. It:

- installs Xcode Command Line Tools if needed
- installs Homebrew if needed
- writes `~/.config/shell.local.env` with detected `HOMEBREW_PREFIX`
- installs `mise` if needed
- delegates the rest of the machine convergence to `mise bootstrap -C "$DOTFILES" --skip macos-defaults`

`setup.sh` skips mise's top-level macOS defaults phase so the existing one-time macOS prompt/`--macos`/`--no-macos` semantics stay intact. If enabled, `scripts/bootstrap-post.sh` first runs `mise bootstrap macos defaults apply -C "$DOTFILES" --yes`, then applies the residual `.macos` script.

`mise.toml` owns tracked dotfile symlinks and scalar non-privileged macOS defaults. The `bootstrap` task runs `scripts/bootstrap-post.sh`, which preserves the custom setup that is not yet declarative:

- installs formulae/casks from `Brewfile`
- installs OpenSSL 1.1 and TagLib 1.13.1 from the `$USER/versions` Homebrew tap
- configures Git user name/email and the defensive global empty `core.hooksPath`
- builds the `bat` theme cache when `bat` is installed
- installs Zim if missing
- prepares common local directories (`~/projects`, `~/code`, `~/work`)
- creates local override files if missing:
  - `~/.zshrc.local`
  - `~/.aliases.local`
  - `~/.env.secrets`
- optionally applies declarative macOS defaults from `mise.toml` and residual defaults from `.macos`

## mise bootstrap checks

Preview what mise would change without mutating files:

```bash
mise bootstrap -C ~/dotfiles --dry-run
```

Check managed dotfile/package/tool/defaults status:

```bash
mise bootstrap -C ~/dotfiles status
mise bootstrap -C ~/dotfiles status --missing
mise bootstrap -C ~/dotfiles dotfiles status
mise bootstrap macos defaults status -C ~/dotfiles
```

Direct `mise bootstrap -C ~/dotfiles` applies declarative macOS defaults during its normal `macos-defaults` phase, before the `bootstrap` task asks whether to run the residual `.macos` script. To preview or run the setup path without live macOS defaults changes, skip that phase:

```bash
mise bootstrap -C ~/dotfiles --skip macos-defaults --dry-run
```

To apply only declarative macOS defaults:

```bash
mise bootstrap macos defaults apply -C ~/dotfiles --yes
```

Existing files that are not already the expected symlinks will show as conflicts. Review them before overwriting. To intentionally adopt the repo version for conflicting dotfiles, run:

```bash
mise bootstrap -C ~/dotfiles --force-dotfiles
```

`setup.sh` does not pass `--force-dotfiles`; first runs should be reviewed rather than overwriting local files automatically.

## Monthly Zim maintenance

Check for updates once a month, then update modules and Zim itself:

```bash
zimfw check
zimfw update
zimfw upgrade
zimfw uninstall
```

`zimfw uninstall` removes modules that are no longer listed in `.zimrc`.

## Migration checklist

### Before moving to a new laptop

#### 1. Commit and tag
- commit all desired dotfiles changes
- optionally create a tag like `pre-laptop-migration`

#### 2. Back up local-only files
These are intentionally **not** stored in this repo:

- `~/.env.secrets`
- `~/.zshrc.local`
- `~/.aliases.local`
- `~/.ssh/`
- `~/.gnupg/`
- `~/.kube/`
- `~/.aws/` / `~/.config/gcloud/` / other cloud credentials
- app-specific state you care about

#### 3. Verify critical access before migration
- GitHub SSH works: `ssh -T git@github.com`
- Bitwarden login works
- Kubernetes contexts are accessible
- required API keys are still available
- browser/dev app profiles are synced/exported

#### 4. Review `Brewfile`
- remove apps you no longer need
- confirm paid/licensed apps can be reinstalled
- check MAS apps are still available

## Post-install checklist on the new Mac

### Core tools
- `./healthcheck.sh`
- `brew --version`
- `git --version`
- `zsh --version`
- `nvim +checkhealth`

### Access and credentials
- `ssh -T git@github.com`
- `bw login` / `bw unlock`
- `kubectl config get-contexts`
- `gh auth status`

### Dev environment
- `mise doctor`
- `hk --version`
- `fnox --version`
- `colima start --cpu 4 --memory 8 --disk 60`
- `docker context use colima`
- `docker ps`
- `docker compose version`
- `psql --version`
- `atuin status`

### UI tools
- Ghostty opens with expected theme/font
- AeroSpace starts at login
- SketchyBar items render correctly
- k9s opens without cluster-specific junk in config

## Git worktrees (worktrunk)

[worktrunk](https://worktrunk.dev) wraps `git worktree` so a branch and its
working directory are the same thing. It is installed from the `Brewfile`; the
user config lives in `.config/worktrunk/config.toml` and is symlinked to
`~/.config/worktrunk`.

Shell integration (the `wt` function that can `cd`, plus completions) is
already initialized by the tracked line at the end of `.zshrc`. Do not run
`wt config shell install`; it would append a duplicate initialization line to
the symlinked file.

### Daily commands

```bash
wt switch -c feat/thing   # create branch + worktree, cd into it
wt switch                 # interactive picker with diff preview
wt switch ^               # back to the default branch
wt switch -               # previous worktree
wt list                   # all worktrees with status
wt step commit            # stage + LLM-written Conventional Commit message
wt merge                  # squash, rebase, merge, then remove the worktree
wt remove                 # drop a worktree and its branch
```

### Layout

Worktrees are created at `<repo>/.worktrees/<branch>`. `.worktrees/` is ignored
globally via `.config/git/ignore`, so no per-repo `.gitignore` edits are needed,
and `$PROJECT_PATHS` / the autoloaded `proj` picker still show one entry per project.

### Per-project config

Each repo can commit its own `.config/wt.toml`. This is where setup that a fresh
worktree needs belongs — a new worktree has no `node_modules`, no `.env`, no
compiled assets:

```toml
# .config/wt.toml
pre-start = "npm ci"          # blocking: runs before the worktree is usable
post-start = "npm run dev"    # background: dev server, watchers
pre-merge = "npm test"        # blocking: failure aborts the merge

[step.copy-ignored]
exclude = [".cache/", "node_modules/"]   # gitignored files to skip copying in
```

Project hooks require approval on first run; approvals are stored per machine in
`~/.config/worktrunk/approvals.toml` (gitignored here).

Note: global `core.hooksPath` points at an empty directory (see
`scripts/bootstrap-post.sh`), so repo-local git hooks never fire. worktrunk's
`pre-commit` hook is separate from git hooks and is the practical place to run
formatters and linters.

### Parallel agents

The reason worktrunk exists — each agent gets its own directory, so they do not
fight over the working tree:

```bash
wt switch -x claude -c feat/auth -- 'Add user authentication'
wt switch -x claude -c fix/pagination -- 'Fix the pagination bug'
```

### herdr plugin

[herdr-worktrunk](https://github.com/devashish2203/herdr-worktrunk) drives all of
this from inside herdr, so a worktree arrives as a workspace instead of a
directory you have to go find:

```bash
herdr plugin install devashish2203/herdr-worktrunk
```

Keys are bound in `.config/herdr/config.toml`:

| Key | Action |
| --- | --- |
| `prefix+shift+g` | `worktrunk.open` — fzf picker: switch to or create a worktree |
| `prefix+shift+c` | `worktrunk.open-current` — same, branching off the current branch |
| `prefix+shift+m` | `worktrunk.merge` — merge this worktree, then remove it |
| `prefix+ctrl+d` | `worktrunk.remove` — remove this worktree, after a confirm |

The plugin's own README suggests `prefix+shift+d` for remove; that is
`close_workspace` in this config, so remove moved to `prefix+ctrl+d`.

Plugin settings are tracked here at
`.config/herdr/plugins/config/worktrunk/config.toml` — the picker is a popup
sized like the lazygit and yazi popups, worktrees open as workspaces, and merge
flags are left to the worktrunk config. herdr reads that file on every picker
invocation, so edits take effect without a reload.

Plugin *code* stays untracked (`.config/herdr/plugins/*` is gitignored, with
`config/` negated back in), so the install command above is part of setting up a
new machine.

## Local overrides

Use these files for machine-specific or secret configuration:

- `~/.zshrc.local`
- `~/.aliases.local`
- `~/.env.secrets`
- `~/.config/shell.local.env`

Examples of what belongs there:
- machine-specific paths
- work-only environment variables
- experimental aliases
- API keys and tokens
- custom `KUBECONFIG`

## jdx ecosystem notes

This setup now includes the core parts of the jdx workflow that fit well in dotfiles:

- `mise` for runtime versions, env loading, and tasks
- `hk` for Git hooks, ideally driven by project `mise.toml`
- `fnox` for secrets management when you want something more structured than a single sourced env file

Recommended usage:

- keep global machine secrets in `~/.env.secrets` when simple shell exports are enough
- use `fnox` mainly for per-project or encrypted secrets
- use `hk` with `HK_MISE=1` in project repos so hooks run with the correct `mise` toolchain

Example project-level `mise.toml` snippets:

```toml
[tools]
hk = "latest"
fnox = "latest"

[env]
HK_MISE = 1
```

For automatic `fnox` secret loading via `mise`, add the plugin in the project:

```toml
[plugins]
fnox-env = "https://github.com/jdx/mise-env-fnox"

[env]
_.fnox-env = { tools = true }
```

## Custom Homebrew formulae

Legacy formulae are stored in this repo for software that still needs them:

- `homebrew/Formula/openssl@1.1.rb`
- `homebrew/Formula/taglib.rb`

`scripts/bootstrap-post.sh` copies them into a local Homebrew tap named `$USER/versions`, installs them during `mise bootstrap`, and pins TagLib 1.13.1. `~/.zshrc` sets `TAGLIB_DIR` to its Homebrew prefix when installed.

## Colima / Docker on the new machine

This setup is intended to use **Colima** instead of Docker Desktop.

Typical first-run flow:

```bash
colima start --cpu 4 --memory 8 --disk 60
docker context use colima
docker ps
docker compose version
```

Helpful aliases already exist in `.aliases`:
- `colima-start`
- `colima-status`
- `colima-stop`
- `colima-restart`

## SSH bootstrap

Use:

```bash
./ssh.sh
```

It will:
- prompt for email
- create an Ed25519 key
- update `~/.ssh/config` safely
- add key to macOS keychain when supported
- copy the public key to clipboard

## Notes

- `k9s/config.yml` is intentionally kept generic; current context and temp paths should stay machine-local.
- `.macos` keeps safer defaults now; review it before applying on a fresh machine.
- `.macos` also includes extra animation-reduction defaults inspired by Nate Berkopec's setup for lower-latency UI behavior.
- if you move the repo somewhere other than `~/dotfiles`, `setup.sh` will still work.
