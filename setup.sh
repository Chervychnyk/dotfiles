#!/usr/bin/env bash
set -euo pipefail

DOTFILES="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NONINTERACTIVE=false
APPLY_MACOS="ask"
GIT_NAME_DEFAULT="Artem Chervychnyk"

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

info()    { printf "\033[0;34m[info]\033[0m  %s\n" "$1"; }
success() { printf "\033[0;32m[ok]\033[0m    %s\n" "$1"; }
warn()    { printf "\033[0;33m[warn]\033[0m  %s\n" "$1"; }

prompt_with_default() {
  local prompt="$1" default_value="$2" result

  if [[ "$NONINTERACTIVE" == true ]]; then
    printf '%s' "$default_value"
    return 0
  fi

  read -rp "$prompt [$default_value]: " result
  printf '%s' "${result:-$default_value}"
}

confirm() {
  local prompt="$1" default="${2:-N}" reply

  if [[ "$NONINTERACTIVE" == true ]]; then
    [[ "$default" =~ ^[Yy]$ ]]
    return
  fi

  read -rp "$prompt [$default] " reply
  reply="${reply:-$default}"
  [[ "$reply" =~ ^[Yy]$ ]]
}

link_file() {
  local src="$1" dst="$2"
  local dst_dir
  dst_dir=$(dirname "$dst")

  [[ -d "$dst_dir" ]] || mkdir -p "$dst_dir"

  if [[ -e "$dst" || -L "$dst" ]]; then
    if [[ -L "$dst" && "$(readlink "$dst")" == "$src" ]]; then
      return 0
    fi
    mv "$dst" "${dst}.backup.$(date +%s)"
    warn "Backed up existing $dst"
  fi

  ln -s "$src" "$dst"
  success "Linked $dst → $src"
}

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

info "Updating Homebrew and installing packages..."
brew update
brew bundle --file="$DOTFILES/Brewfile"

info "Installing TagLib 1.13.1 from custom tap..."
brew tap $USER/versions
if brew list --versions taglib >/dev/null 2>&1; then
  success "taglib@1.13.1 already installed"
else
  brew install $USER/versions/taglib
  success "Installed taglib@1.13.1"
fi
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
success "Git configured ($git_name${git_email:+ <$git_email>})"

info "Creating symlinks..."

link_file "$DOTFILES/.zshrc"        "$HOME/.zshrc"
link_file "$DOTFILES/.zprofile"     "$HOME/.zprofile"
link_file "$DOTFILES/.aliases"      "$HOME/.aliases"
link_file "$DOTFILES/.zimrc"        "$HOME/.zimrc"
link_file "$DOTFILES/.fzf.zsh"      "$HOME/.fzf.zsh"

link_file "$DOTFILES/.vimrc"        "$HOME/.vimrc"
link_file "$DOTFILES/.config/nvim"  "$HOME/.config/nvim"

link_file "$DOTFILES/.wezterm.lua"  "$HOME/.wezterm.lua"
link_file "$DOTFILES/wezterm"       "$HOME/.config/wezterm"
link_file "$DOTFILES/ghostty"       "$HOME/.config/ghostty"

link_file "$DOTFILES/.tmux.conf"    "$HOME/.tmux.conf"
link_file "$DOTFILES/zellij"        "$HOME/.config/zellij"

link_file "$DOTFILES/.config/starship.toml" "$HOME/.config/starship.toml"
link_file "$DOTFILES/.config/atuin"         "$HOME/.config/atuin"
link_file "$DOTFILES/.config/aerospace"     "$HOME/.config/aerospace"
link_file "$DOTFILES/.config/sketchybar"    "$HOME/.config/sketchybar"
link_file "$DOTFILES/.config/yazi"          "$HOME/.config/yazi"
link_file "$DOTFILES/.config/zed"           "$HOME/.config/zed"
link_file "$DOTFILES/k9s"                   "$HOME/.config/k9s"

link_file "$DOTFILES/.psqlrc"       "$HOME/.psqlrc"
link_file "$DOTFILES/.macos"        "$HOME/.macos"
link_file "$DOTFILES/pi"            "$HOME/.pi"

success "All symlinks created"

if [[ ! -d "$HOME/.zim" ]]; then
  info "Installing Zim..."
  curl -fsSL --create-dirs -o "$HOME/.zim/zimfw.zsh" \
    https://github.com/zimfw/zimfw/releases/latest/download/zimfw.zsh
  zsh -c "source $HOME/.zim/zimfw.zsh init && zimfw install"
  success "Zim installed"
else
  success "Zim already installed"
fi


mkdir -p "$HOME/projects" "$HOME/code" "$HOME/work"
success "Project directories ready"

mkdir -p "$HOME/.zsh/functions" "$HOME/.config/k9s"
touch "$HOME/.zshrc.local" "$HOME/.aliases.local" "$HOME/.env.secrets"
chmod 600 "$HOME/.env.secrets"
success "Local override files ensured"

case "$APPLY_MACOS" in
  yes)
    should_apply=true
    ;;
  no)
    should_apply=false
    ;;
  *)
    if confirm "Apply macOS system preferences from .macos?" "N"; then
      should_apply=true
    else
      should_apply=false
    fi
    ;;
esac

if [[ "$should_apply" == true ]]; then
  info "Applying macOS preferences..."
  source "$DOTFILES/.macos"
  success "macOS preferences applied (some may require restart)"
else
  warn "Skipped macOS preferences"
fi

echo ""
success "🎉 Setup complete! See README.md for post-install and migration checklist."
