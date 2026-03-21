# Enable profiling for performance monitoring
# zmodload zsh/zprof

# Zim setup
ZIM_HOME=${ZDOTDIR:-${HOME}}/.zim

# Download zimfw plugin manager if missing.
if [[ ! -e ${ZIM_HOME}/zimfw.zsh ]]; then
  curl -fsSL --create-dirs -o ${ZIM_HOME}/zimfw.zsh \
      https://github.com/zimfw/zimfw/releases/latest/download/zimfw.zsh
fi

# Load completion before Zim (required by omz plugins that use compdef)
# Cache compinit — only regenerate once daily
autoload -Uz compinit
if [[ -n ~/.zcompdump(#qN.mh+24) ]]; then
  compinit
else
  compinit -C
fi

# Install missing modules and update ${ZIM_HOME}/init.zsh if missing or outdated.
if [[ ! ${ZIM_HOME}/init.zsh -nt ${ZIM_CONFIG_FILE:-${ZDOTDIR:-${HOME}}/.zimrc} ]]; then
  source ${ZIM_HOME}/zimfw.zsh init
fi

# Initialize Zim
source ${ZIM_HOME}/init.zsh

# History configuration
HISTFILE=~/.zsh_history
HISTSIZE=50000
SAVEHIST=50000
setopt SHARE_HISTORY          # Share history between sessions
setopt HIST_IGNORE_DUPS       # Don't record duplicate entries
setopt HIST_IGNORE_ALL_DUPS   # Remove older duplicate entries
setopt HIST_IGNORE_SPACE      # Don't record commands starting with space
setopt HIST_REDUCE_BLANKS     # Remove unnecessary blanks
setopt INC_APPEND_HISTORY     # Write immediately, not on shell exit

# Prompt
eval "$(starship init zsh)"
setopt promptsubst

# Bat theme
export BAT_THEME=base16

# Completion and enhancement plugins are now handled by Zim
# Configure styles after Zim init
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
zstyle ':completion:*' menu no
zstyle ':fzf-tab:*' use-fzf-default-opts yes
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls --color $realpath'
zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview 'ls --color $realpath'

# Load machine-local overrides first
[[ -f ~/.config/shell.local.env ]] && source ~/.config/shell.local.env
[[ -f ~/.zshrc.local ]] && source ~/.zshrc.local

# Load secrets (API keys, tokens — chmod 600)
[[ -f ~/.env.secrets ]] && source ~/.env.secrets

# Load aliases
[[ -f ~/.aliases ]] && source ~/.aliases
[[ -f ~/.aliases.local ]] && source ~/.aliases.local

# Load FZF themes
[[ -f ~/.fzf.zsh ]] && source ~/.fzf.zsh

# FZF enhanced functions
# Search Rails routes
routes() {
  if [[ -f "bin/rails" ]]; then
    bin/rails routes | fzf --header="Rails Routes" --preview="echo {}" --preview-window=up:3:wrap
  else
    echo "Not in a Rails project"
  fi
}

# Project roots can be overridden in ~/.zshrc.local
: ${PROJECT_PATHS:="$HOME/projects $HOME/code $HOME/work"}

# Find and cd into project directory (only immediate project folders)
proj() {
  local -a roots
  local dir
  roots=(${=PROJECT_PATHS})
  dir=$(find ${roots[@]} -mindepth 1 -maxdepth 1 -type d 2>/dev/null | fzf --height=40% --reverse --preview="ls -la {}")
  if [[ -n "$dir" ]]; then
    cd "$dir"
  fi
}

# Search command history with fzf (alternative to atuin)
fh() {
  print -z $(fc -ln 1 | fzf --tac --no-sort --height=40% --reverse)
}

# Search and kill process
fkill() {
  local pid
  pid=$(ps -ef | sed 1d | fzf -m | awk '{print $2}')
  if [[ -n "$pid" ]]; then
    echo "$pid" | xargs kill -${1:-9}
  fi
}

# Search and checkout git branch (local and remote)
fbr() {
  local branches branch
  branches=$(git branch -a | grep -v HEAD) &&
  branch=$(echo "$branches" | fzf --height=40% --reverse +m) &&
  git checkout $(echo "$branch" | sed "s/.* //" | sed "s#remotes/[^/]*/##")
}

# Preview file with syntax highlighting
fp() {
  fzf --preview="bat --style=numbers --color=always --line-range :500 {}"
}

# Find in files with ripgrep and fzf
rga() {
  rg --color=always --line-number --no-heading --smart-case "${*:-}" |
    fzf --ansi \
        --delimiter : \
        --preview 'bat --style=numbers --color=always --highlight-line {2} {1}' \
        --preview-window 'up,60%,border-bottom,+{2}+3/3,~3' \
        --bind 'enter:become(nvim {1} +{2})'
}

# Atuin - magical shell history with fzf integration
if command -v atuin >/dev/null 2>&1; then
  eval "$(atuin init zsh --disable-up-arrow)"
  # Use Ctrl+R for atuin search with fzf-style interface
  bindkey '^r' atuin-search
fi

# Keybindings
bindkey '^l' autosuggest-accept
bindkey '^p' history-search-backward
bindkey '^n' history-search-forward
bindkey "^[a" beginning-of-line
bindkey "^[e" end-of-line

# User configuration
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# Preferred editor for local and remote sessions
if [[ -n $SSH_CONNECTION ]]; then
  export EDITOR='vim'
else
  export EDITOR='nvim'
fi

# Mise (runtime version manager — replaces asdf)
eval "$(mise activate zsh)"

# Erlang/Elixir build options
export ERL_AFLAGS="-kernel shell_history enabled"
export KERL_CONFIGURE_OPTIONS="--disable-debug --disable-silent-rules --enable-dynamic-ssl-lib --enable-gettimeofday-as-os-system-time --enable-kernel-poll --without-javac --without-wx --without-odbc"

# Tool-specific exports with presence checks
if command -v brew >/dev/null 2>&1; then
  : ${HOMEBREW_PREFIX:="$(brew --prefix 2>/dev/null)"}

  # OpenSSL (openssl@3 — 1.1 is EOL since Sep 2023)
  if [[ -d "$HOMEBREW_PREFIX/opt/openssl@3" ]]; then
    export PATH="$HOMEBREW_PREFIX/opt/openssl@3/bin:$PATH"
    export LDFLAGS="-L$HOMEBREW_PREFIX/opt/openssl@3/lib:${LDFLAGS:-}"
    export CPPFLAGS="-I$HOMEBREW_PREFIX/opt/openssl@3/include:${CPPFLAGS:-}"
    export PKG_CONFIG_PATH="$HOMEBREW_PREFIX/opt/openssl@3/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
    export RUBY_CONFIGURE_OPTS="--with-openssl-dir=$HOMEBREW_PREFIX/opt/openssl@3"
  fi

  # Readline
  if [[ -d "$HOMEBREW_PREFIX/opt/readline" ]]; then
    export LDFLAGS="-L$HOMEBREW_PREFIX/opt/readline/lib:${LDFLAGS:-}"
    export CPPFLAGS="-I$HOMEBREW_PREFIX/opt/readline/include:${CPPFLAGS:-}"
    export PKG_CONFIG_PATH="$HOMEBREW_PREFIX/opt/readline/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
  fi

  # Libffi
  if [[ -d "$HOMEBREW_PREFIX/opt/libffi" ]]; then
    export LDFLAGS="-L$HOMEBREW_PREFIX/opt/libffi/lib:${LDFLAGS:-}"
    export CPPFLAGS="-I$HOMEBREW_PREFIX/opt/libffi/include:${CPPFLAGS:-}"
    export PKG_CONFIG_PATH="$HOMEBREW_PREFIX/opt/libffi/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
  fi

  # Java / other libs
  [[ -d "$HOMEBREW_PREFIX/opt/openjdk/bin" ]] && export PATH="$HOMEBREW_PREFIX/opt/openjdk/bin:$PATH"

  if [[ -d "$HOMEBREW_PREFIX/opt/taglib@1.13.1" ]]; then
    export TAGLIB_DIR="$HOMEBREW_PREFIX/opt/taglib@1.13.1"
  elif [[ -d "$HOMEBREW_PREFIX/opt/taglib" ]]; then
    export TAGLIB_DIR="$HOMEBREW_PREFIX/opt/taglib"
  fi
fi

# Puppeteer
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
if command -v chromium >/dev/null 2>&1; then
  export PUPPETEER_EXECUTABLE_PATH="$(command -v chromium)"
fi

# Kubernetes
if [[ -z "${KUBECONFIG:-}" ]]; then
  typeset -a kubeconfigs
  [[ -f "$HOME/.kube/config.argo" ]] && kubeconfigs+=("$HOME/.kube/config.argo")
  [[ -f "$HOME/.kube/config.aws.auro" ]] && kubeconfigs+=("$HOME/.kube/config.aws.auro")
  [[ -f "$HOME/.kube/config" ]] && kubeconfigs+=("$HOME/.kube/config")
  [[ ${#kubeconfigs[@]} -gt 0 ]] && export KUBECONFIG="${(j/:/)kubeconfigs}"
fi

# Bitwarden
export BITWARDENCLI_APPDATA_DIR=~/.bw/

# Load custom functions
fpath=(~/.zsh/functions $fpath)
autoload -Uz unlock_bitwarden

# Load RVM if available
if [[ -s "$HOME/.rvm/scripts/rvm" ]]; then
  source "$HOME/.rvm/scripts/rvm"
  export PATH="$PATH:$HOME/.rvm/bin"
fi

# Consolidated PATH additions (add to end for proper precedence)
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/.yarn/bin:$PATH"

# zprof  # Uncomment to show profiling results

# bun completions
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

