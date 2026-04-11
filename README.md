# dotfiles

Personal macOS development environment bootstrap and configuration.

## What this repo manages

- shell: zsh, zim, aliases, fzf, atuin, starship
- editors: Neovim, Vim, Zed
- terminals: Ghostty, WezTerm, tmux, Zellij
- macOS UX: AeroSpace, SketchyBar, `.macos`
- tooling: mise, hk, fnox, k9s, yazi, PostgreSQL CLI config, Pi agent config
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

After setup, run:

```bash
./healthcheck.sh
```

## What `setup.sh` does

- installs Homebrew if needed
- installs formulae/casks from `Brewfile`
- installs `mise`, `hk`, and `fnox` for reproducible tools, hooks, and secrets workflows
- installs TagLib 1.13.1 from the `$USER/versions` Homebrew tap
- writes `~/.config/shell.local.env` with detected `HOMEBREW_PREFIX`
- creates symlinks for tracked config files
- installs Zim and NVM if missing
- prepares common local directories (`~/projects`, `~/code`, `~/work`)
- creates local override files if missing:
  - `~/.zshrc.local`
  - `~/.aliases.local`
  - `~/.env.secrets`
- optionally applies macOS defaults from `.macos`

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
- WezTerm launches and project picker works
- AeroSpace starts at login
- SketchyBar items render correctly
- k9s opens without cluster-specific junk in config

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

## Custom Homebrew tap

This setup expects a custom Homebrew tap for legacy formulae:

- tap: `$USER/versions`
- formula: `$USER/versions/taglib@1.13.1`

`setup.sh` taps it, installs `taglib@1.13.1`, and pins it.
`~/.zshrc` also prefers `TAGLIB_DIR` from `taglib@1.13.1` when available.

### Creating or updating the tap

If the tap does not exist yet:

```bash
brew tap-new $USER/versions
cd "$(brew --repository $USER/versions)"
mkdir -p Formula
```

Add the formula as:

```text
Formula/taglib@1.13.1.rb
```

If you already have the tap locally, open its checkout directly:

```bash
cd "$(brew --repository $USER/versions)"
```

Then add or edit formula files under `Formula/`, commit, and push the tap repo.

You can try extracting the historical formula automatically first:

```bash
brew extract --version=1.13.1 taglib $USER/versions
```

If that does not work, create the formula file manually in the tap.

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
