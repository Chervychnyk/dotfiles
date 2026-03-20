# dotfiles

Personal macOS development environment bootstrap and configuration.

## What this repo manages

- shell: zsh, zim, aliases, fzf, atuin, starship
- editors: Neovim, Vim, Zed
- terminals: Ghostty, WezTerm, tmux, Zellij
- macOS UX: AeroSpace, SketchyBar, `.macos`
- tooling: k9s, yazi, PostgreSQL CLI config, Pi agent config
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
- installs a custom Homebrew formula for legacy TagLib 1.13.1 (`taglib-legacy`)
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
- `mise doctor` (if installed)
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

## Custom Homebrew formulae

This repo vendors one custom formula:

- `homebrew/Formula/taglib-legacy.rb`

It is installed by `setup.sh` as `taglib-legacy` and pinned so Homebrew does not upgrade it.
`~/.zshrc` also prefers `TAGLIB_DIR` from `taglib-legacy` when available.

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
- if you move the repo somewhere other than `~/dotfiles`, `setup.sh` will still work.
