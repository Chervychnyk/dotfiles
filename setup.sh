#!/usr/bin/env bash
set -euo pipefail

DOTFILES="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NONINTERACTIVE=false
APPLY_MACOS="ask"

for arg in "$@"; do
  case "$arg" in
    --yes|-y)
      NONINTERACTIVE=true
      APPLY_MACOS="yes"
      ;;
    --no-macos)
      APPLY_MACOS="no"
      ;;
    --macos)
      APPLY_MACOS="yes"
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--yes|-y] [--macos|--no-macos]" >&2
      exit 1
      ;;
  esac
done

# shellcheck source=scripts/lib/log.sh
source "$DOTFILES/scripts/lib/log.sh"

brew_shellenv() {
  if [[ -x "/opt/homebrew/bin/brew" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x "/usr/local/bin/brew" ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

info "Using dotfiles from $DOTFILES"

if ! xcode-select -p &>/dev/null; then
  info "Installing Xcode Command Line Tools..."
  xcode-select --install
  if [[ "$NONINTERACTIVE" == true ]]; then
    warn "Finish Xcode CLI installation, then rerun setup.sh"
    exit 1
  fi
  echo "Press Enter after Xcode CLI tools finish installing..."
  read -r
else
  success "Xcode CLI tools already installed"
fi

if ! command -v brew &>/dev/null; then
  info "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  brew_shellenv
  success "Homebrew installed"
else
  brew_shellenv
  success "Homebrew already installed"
fi

if ! command -v brew &>/dev/null; then
  warn "Homebrew is not available in PATH after installation"
  exit 1
fi

mkdir -p "$HOME/.config"
printf 'export HOMEBREW_PREFIX="%s"\n' "$(brew --prefix)" > "$HOME/.config/shell.local.env"
success "Wrote $HOME/.config/shell.local.env"

if ! command -v mise &>/dev/null; then
  info "Installing mise..."
  brew install mise
  success "mise installed"
else
  success "mise already installed"
fi

mise_args=(bootstrap -C "$DOTFILES" --skip macos-defaults)
if [[ "$NONINTERACTIVE" == true ]]; then
  mise_args+=(--yes)
fi

info "Running mise bootstrap..."
DOTFILES="$DOTFILES" \
DOTFILES_NONINTERACTIVE="$NONINTERACTIVE" \
DOTFILES_APPLY_MACOS="$APPLY_MACOS" \
  mise "${mise_args[@]}"

echo ""
success "Setup complete! See README.md for post-install and migration checklist."
