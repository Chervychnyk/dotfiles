#!/usr/bin/env bash
# Shared bootstrap logging and prompt helpers.
# Sourced by setup.sh and scripts/bootstrap-post.sh so both stages print
# identically. Callers must define NONINTERACTIVE before using the prompts.

info()    { printf "\033[0;34m[info]\033[0m  %s\n" "$1"; }
success() { printf "\033[0;32m[ok]\033[0m    %s\n" "$1"; }
warn()    { printf "\033[0;33m[warn]\033[0m  %s\n" "$1"; }

prompt_with_default() {
  local prompt="$1" default_value="$2" result

  if [[ "${NONINTERACTIVE:-false}" == true ]]; then
    printf '%s' "$default_value"
    return 0
  fi

  read -rp "$prompt [$default_value]: " result
  printf '%s' "${result:-$default_value}"
}

confirm() {
  local prompt="$1" default="${2:-N}" reply

  if [[ "${NONINTERACTIVE:-false}" == true ]]; then
    [[ "$default" =~ ^[Yy]$ ]]
    return
  fi

  read -rp "$prompt [$default] " reply
  reply="${reply:-$default}"
  [[ "$reply" =~ ^[Yy]$ ]]
}
