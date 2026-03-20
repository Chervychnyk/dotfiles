#!/usr/bin/env bash
set -euo pipefail

ok() { printf "\033[0;32m[ok]\033[0m    %s\n" "$1"; }
warn() { printf "\033[0;33m[warn]\033[0m  %s\n" "$1"; }
fail() { printf "\033[0;31m[fail]\033[0m  %s\n" "$1"; }
check_cmd() {
  local cmd="$1"
  local name="${2:-$1}"
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$name: $(command -v "$cmd")"
  else
    fail "$name not found"
  fi
}

check_path() {
  local path="$1"
  if [[ -e "$path" || -L "$path" ]]; then
    ok "$path exists"
  else
    fail "$path missing"
  fi
}

echo "== Core commands =="
for cmd in brew git zsh nvim tmux zellij ghostty wezterm ssh gh mise docker colima; do
  check_cmd "$cmd"
done

if command -v brew >/dev/null 2>&1; then
  if brew list --versions taglib >/dev/null 2>&1; then
    ok "taglib@1.13.1 installed"
  else
    warn "taglib@1.13.1 missing"
  fi
fi

echo ""
echo "== Symlinked config =="
for path in \
  "$HOME/.zshrc" \
  "$HOME/.zprofile" \
  "$HOME/.aliases" \
  "$HOME/.wezterm.lua" \
  "$HOME/.tmux.conf" \
  "$HOME/.config/nvim" \
  "$HOME/.config/wezterm" \
  "$HOME/.config/ghostty" \
  "$HOME/.config/zellij" \
  "$HOME/.config/k9s" \
  "$HOME/.pi"; do
  check_path "$path"
done

echo ""
echo "== Local-only files =="
for path in \
  "$HOME/.env.secrets" \
  "$HOME/.zshrc.local" \
  "$HOME/.aliases.local" \
  "$HOME/.config/shell.local.env"; do
  if [[ -e "$path" ]]; then
    ok "$path present"
  else
    warn "$path missing"
  fi
done

echo ""
echo "== Access / auth =="
if ssh -o BatchMode=yes -o ConnectTimeout=5 -T git@github.com >/tmp/dotfiles_ssh_check 2>&1; then
  ok "GitHub SSH reachable"
else
  if grep -q "successfully authenticated" /tmp/dotfiles_ssh_check 2>/dev/null; then
    ok "GitHub SSH authenticated"
  else
    warn "GitHub SSH not verified (run: ssh -T git@github.com)"
  fi
fi

if command -v gh >/dev/null 2>&1; then
  if gh auth status >/tmp/dotfiles_gh_auth 2>&1; then
    ok "gh auth configured"
  else
    warn "gh auth not configured"
  fi
fi

echo ""
echo "== Runtime checks =="
if command -v brew >/dev/null 2>&1; then
  ok "brew prefix: $(brew --prefix)"
fi

if command -v nvim >/dev/null 2>&1; then
  if nvim --headless '+quit' >/dev/null 2>&1; then
    ok "nvim starts"
  else
    warn "nvim failed to start cleanly"
  fi
fi

if command -v colima >/dev/null 2>&1; then
  if colima status >/tmp/dotfiles_colima_status 2>&1; then
    if grep -qi 'running' /tmp/dotfiles_colima_status; then
      ok "colima is running"
    else
      warn "colima installed but not running"
    fi
  else
    warn "could not determine colima status"
  fi
fi

if command -v docker >/dev/null 2>&1; then
  if docker context ls >/tmp/dotfiles_docker_contexts 2>&1; then
    ok "docker contexts available"
  else
    warn "docker context command failed"
  fi

  if docker compose version >/dev/null 2>&1; then
    ok "docker compose available"
  else
    warn "docker compose unavailable"
  fi
fi

if [[ -d "$HOME/.kube" ]]; then
  ok "~/.kube present"
else
  warn "~/.kube missing"
fi

if [[ -d "$HOME/.ssh" ]]; then
  ok "~/.ssh present"
else
  warn "~/.ssh missing"
fi

if [[ -d "$HOME/.gnupg" ]]; then
  ok "~/.gnupg present"
else
  warn "~/.gnupg missing"
fi

echo ""
echo "Healthcheck complete. Review warnings above."
