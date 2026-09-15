#!/usr/bin/env bash
set -euo pipefail

DOTFILES="${DOTFILES:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
NONINTERACTIVE="${DOTFILES_NONINTERACTIVE:-false}"
APPLY_MACOS="${DOTFILES_APPLY_MACOS:-ask}"
GIT_NAME_DEFAULT="Artem Chervychnyk"

# shellcheck source=lib/log.sh
source "$DOTFILES/scripts/lib/log.sh"

if ! command -v brew &>/dev/null; then
  warn "Homebrew is not available in PATH"
  exit 1
fi

info "Updating Homebrew and installing packages..."
brew update
brew bundle --file="$DOTFILES/Brewfile"

info "Installing custom versioned formulae from dotfiles..."
LOCAL_TAP="$(brew --repository)/Library/Taps/$USER/homebrew-versions"
mkdir -p "$LOCAL_TAP/Formula"
install_pinned() {
  local formula="$1" label="${2:-$1}" expected_version="${3:-}"

  cp "$DOTFILES/homebrew/Formula/$formula.rb" "$LOCAL_TAP/Formula/$formula.rb"
  if brew list --versions "$formula" >/dev/null 2>&1 &&
      brew info --json=v2 "$formula" | jq -e \
        --arg tap "$USER/versions" \
        --arg version "$expected_version" \
        '.formulae[0].tap == $tap and ($version == "" or any(.formulae[0].installed[]; .version == $version))' \
        >/dev/null; then
    success "$label already installed"
    return
  fi

  if brew list --versions "$formula" >/dev/null 2>&1; then
    info "Replacing $formula with $USER/versions/$formula..."
    brew uninstall --ignore-dependencies "$formula"
  fi
  brew install "$USER/versions/$formula"
  success "Installed $label"
}

install_pinned "openssl@1.1"
install_pinned taglib "taglib@1.13.1" "1.13.1"
brew pin taglib >/dev/null 2>&1 || true

brew cleanup
success "Packages installed"

info "Configuring Git..."
current_name=$(git config --global user.name 2>/dev/null || echo "")
current_email=$(git config --global user.email 2>/dev/null || echo "")

git_name=$(prompt_with_default "Git user.name" "${current_name:-$GIT_NAME_DEFAULT}")
git_email=$(prompt_with_default "Git user.email" "${current_email:-}")

if [[ -n "$git_email" ]]; then
  git config --global user.email "$git_email"
else
  warn "No email provided — skipping git email config"
fi
git config --global user.name "$git_name"

# Defensive default after the recent hook compromise: ignore per-repository hooks
# unless explicitly overridden for a trusted project.
mkdir -p "$HOME/.config/git/empty-hooks"
git config --global core.hooksPath "$HOME/.config/git/empty-hooks"
success "Git configured ($git_name${git_email:+ <$git_email>}) with global empty hooksPath"

if command -v bat &>/dev/null; then
  info "Building bat theme cache..."
  bat cache --build >/dev/null
  success "bat theme cache built"
fi

ZIM_HOME="$HOME/.zim"
ZIMFW="$ZIM_HOME/zimfw.zsh"
if [[ ! -s "$ZIMFW" ]] || ! zsh -n "$ZIMFW" >/dev/null 2>&1; then
  info "Downloading Zim framework..."
  curl -fsSL --create-dirs -o "$ZIMFW" \
    https://github.com/zimfw/zimfw/releases/latest/download/zimfw.zsh
fi
zsh -n "$ZIMFW"

info "Installing missing Zim modules and rebuilding init.zsh..."
ZIM_HOME="$ZIM_HOME" ZIM_CONFIG_FILE="$HOME/.zimrc" zsh "$ZIMFW" install
success "Zim installed"

mkdir -p "$HOME/projects" "$HOME/code" "$HOME/work"
success "Project directories ready"

mkdir -p "$HOME/.zsh" "$HOME/.config/k9s" "$HOME/.claude"
touch "$HOME/.zshrc.local" "$HOME/.aliases.local" "$HOME/.env.secrets"
chmod 600 "$HOME/.env.secrets"
success "Local override files ensured"

if [[ "$APPLY_MACOS" == yes ]] ||
   { [[ "$APPLY_MACOS" != no ]] && confirm "Apply macOS system preferences from .macos?" "N"; }; then
  info "Applying declarative macOS defaults from mise.toml..."
  mise bootstrap macos defaults apply -C "$DOTFILES" --yes
  info "Applying residual macOS preferences from .macos..."
  source "$DOTFILES/.macos"
  success "macOS preferences applied (some may require restart)"
else
  warn "Skipped macOS preferences"
fi

success "Post-bootstrap setup complete"
