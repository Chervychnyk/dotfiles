#!/usr/bin/env bash
set -euo pipefail

failures=0

ok() { printf "\033[0;32m[ok]\033[0m    %s\n" "$1"; }
warn() { printf "\033[0;33m[warn]\033[0m  %s\n" "$1"; }
fail() {
  printf "\033[0;31m[fail]\033[0m  %s\n" "$1"
  failures=$((failures + 1))
}
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
for cmd in brew git zsh nvim tmux zellij ghostty ssh gh jq mise atuin docker colima; do
  check_cmd "$cmd"
done

if command -v brew >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  if brew list --versions taglib | grep -Eq '^taglib 1\.13\.1( |$)' &&
      brew list --pinned | grep -qx taglib &&
      brew info --json=v2 taglib | jq -e --arg tap "$USER/versions" \
        '.formulae[0].tap == $tap' >/dev/null; then
    ok "taglib 1.13.1 installed from $USER/versions and pinned"
  else
    fail "taglib 1.13.1 from $USER/versions is missing or not pinned"
  fi
fi

echo ""
echo "== Symlinked config =="
for path in \
  "$HOME/.zshrc" \
  "$HOME/.zprofile" \
  "$HOME/.aliases" \
  "$HOME/.zsh/functions" \
  "$HOME/.tmux.conf" \
  "$HOME/.config/nvim" \
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
echo "== Zsh / Zim =="
zsh_config_dir="${ZDOTDIR:-$HOME}"
zim_home="$zsh_config_dir/.zim"
zim_config="${ZIM_CONFIG_FILE:-$zsh_config_dir/.zimrc}"
zimfw="$zim_home/zimfw.zsh"
zim_init="$zim_home/init.zsh"

for file in "$zsh_config_dir/.zprofile" "$zsh_config_dir/.zshrc" "$zim_config"; do
  if [[ -e "$file" ]] && zsh -n "$file"; then
    ok "$file syntax"
  else
    fail "$file missing or invalid"
  fi
done

zsh_functions="$HOME/.zsh/functions"
for function_name in cache_shell_init routes proj fkill fbr fp rga unlock_bitwarden; do
  function_file="$zsh_functions/$function_name"
  if [[ -e "$function_file" ]] && zsh -n "$function_file"; then
    ok "$function_file syntax"
  else
    fail "$function_file missing or invalid"
  fi
done

if [[ -s "$zimfw" ]] && zsh -n "$zimfw"; then
  ok "$zimfw valid"
else
  fail "$zimfw missing or invalid"
fi

if [[ -s "$zim_init" ]] && zsh -n "$zim_init"; then
  ok "$zim_init valid"
  if [[ "$zim_init" -nt "$zim_config" ]]; then
    ok "Zim init is current"
  else
    warn "Zim init is stale (run: zimfw install)"
  fi
else
  fail "$zim_init missing or invalid"
fi

if [[ -s "$zimfw" ]] && zim_list=$(ZIM_HOME="$zim_home" ZIM_CONFIG_FILE="$zim_config" \
    zsh -dfc 'zstyle ":zim" disable-version-check yes; source "$1" list -q' _ "$zimfw" \
    2>&1); then
  ok "Zim module config loads"
  if [[ "$zim_list" == *"(not installed)"* ]]; then
    warn "Zim modules are missing (run: zimfw install)"
  else
    ok "Zim modules are installed"
  fi
else
  fail "Zim module config failed to load"
  [[ -n "${zim_list:-}" ]] && printf '%s\n' "$zim_list"
fi

zim_probe_dir=$(mktemp -d)
if zim_probe_output=$(PATH=/usr/bin:/bin ZDOTDIR="$zim_probe_dir" /bin/zsh -dfc \
    'source "$1"; (( $+functions[compdef] && $+functions[_git] && $+functions[git_current_branch] ))' _ "$zim_init" 2>&1) &&
    [[ -z "$zim_probe_output" ]]; then
  ok "Zim runtime initialization"
else
  fail "Zim runtime initialization failed"
  [[ -n "$zim_probe_output" ]] && printf '%s\n' "$zim_probe_output"
fi
rm -rf "$zim_probe_dir"

echo ""
echo "== Interactive Zsh =="
run_zsh_pty() {
  TERM="${TERM:-xterm-256color}" /usr/bin/script -q /dev/null /bin/zsh -lic "$1" </dev/null
}
normalize_pty_output() {
  tr -d '\004\010\r' | sed 's/^\^D//'
}

startup_sentinel=__DOTFILES_STARTUP_OK__
if startup_output=$(run_zsh_pty "print -r -- $startup_sentinel" 2>&1 | normalize_pty_output) &&
    [[ "$startup_output" == "$startup_sentinel" ]]; then
  ok "Interactive Zsh starts quietly"
else
  fail "Interactive Zsh failed or emitted output"
  [[ -n "$startup_output" ]] && printf '%s\n' "$startup_output"
fi

required_functions='compdef _git git_current_branch cache_shell_init routes proj fkill fbr fp rga unlock_bitwarden'
function_sentinel=__DOTFILES_FUNCTIONS_OK__
function_probe='for fn in ${(z)REQUIRED_FUNCTIONS}; do (( $+functions[$fn] )) || { print -r -- "missing function: $fn"; exit 1; }; done; print -r -- '$function_sentinel
if function_probe_output=$(REQUIRED_FUNCTIONS="$required_functions" run_zsh_pty "$function_probe" 2>&1 | normalize_pty_output) &&
    [[ "$function_probe_output" == "$function_sentinel" ]]; then
  ok "Required Zsh functions load"
else
  fail "Required Zsh functions did not load"
  [[ -n "$function_probe_output" ]] && printf '%s\n' "$function_probe_output"
fi

if command -v atuin >/dev/null 2>&1; then
  atuin_sentinel=__DOTFILES_ATUIN_OK__
  atuin_probe='for map in emacs viins; do [[ "$(bindkey -M "$map" "^R")" == *atuin-search* ]] || { print -r -- "Atuin is not bound to Ctrl-R in $map"; exit 1; }; done; print -r -- '$atuin_sentinel
  if atuin_probe_output=$(run_zsh_pty "$atuin_probe" 2>&1 | normalize_pty_output) &&
      [[ "$atuin_probe_output" == "$atuin_sentinel" ]]; then
    ok "Atuin owns Ctrl-R in emacs and viins keymaps"
  else
    fail "Atuin Ctrl-R bindings are missing"
    [[ -n "$atuin_probe_output" ]] && printf '%s\n' "$atuin_probe_output"
  fi
fi

if startup_ms=$(/bin/zsh -fc '
    zmodload zsh/datetime
    start=$EPOCHREALTIME
    TERM=${TERM:-xterm-256color} /usr/bin/script -q /dev/null /bin/zsh -lic : </dev/null >/dev/null 2>&1
    exit_status=$?
    elapsed=$(( (EPOCHREALTIME - start) * 1000 ))
    (( exit_status == 0 )) || exit $exit_status
    printf "%.0f\n" $elapsed
  ' 2>/dev/null) && [[ "$startup_ms" =~ ^[0-9]+$ ]]; then
  if (( startup_ms <= 300 )); then
    ok "Warm interactive Zsh startup: ${startup_ms}ms"
  else
    fail "Warm interactive Zsh startup exceeds 300ms: ${startup_ms}ms"
  fi
else
  fail "Could not measure warm interactive Zsh startup"
fi

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
if (( failures > 0 )); then
  echo "Healthcheck complete with $failures failure(s). Review failures and warnings above."
  exit 1
fi

echo "Healthcheck complete. Review warnings above."
