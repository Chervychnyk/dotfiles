# Enable profiling for performance monitoring
# zmodload zsh/zprof

# Zim setup
ZIM_HOME=${ZDOTDIR:-${HOME}}/.zim

# Download zimfw plugin manager if missing.
if [[ ! -e ${ZIM_HOME}/zimfw.zsh ]]; then
  curl -fsSL --create-dirs -o ${ZIM_HOME}/zimfw.zsh \
      https://github.com/zimfw/zimfw/releases/latest/download/zimfw.zsh
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

# Autoload shell helpers and interactive functions
fpath=("$HOME/.zsh/functions" $fpath)
autoload -Uz cache_shell_init routes proj fkill fbr fp rga unlock_bitwarden

# Prompt
cache_shell_init starship starship init zsh

# Bat theme
export BAT_THEME="Everforest Dark"

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

# Project roots can be overridden in ~/.zshrc.local
: ${PROJECT_PATHS:="$HOME/projects $HOME/code $HOME/work"}

# Atuin - magical shell history with fzf integration
if command -v atuin >/dev/null 2>&1; then
  cache_shell_init atuin atuin init zsh --disable-up-arrow
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
cache_shell_init mise mise activate zsh

# Erlang/Elixir build options
export ERL_AFLAGS="-kernel shell_history enabled"
export KERL_CONFIGURE_OPTIONS="--disable-debug --disable-silent-rules --enable-dynamic-ssl-lib --enable-gettimeofday-as-os-system-time --enable-kernel-poll --without-javac --without-wx --without-odbc"

# Tool-specific exports with presence checks
if command -v brew >/dev/null 2>&1; then
  : ${HOMEBREW_PREFIX:="$(brew --prefix 2>/dev/null)"}

  # OpenSSL (openssl@3 — 1.1 is EOL since Sep 2023)
  if [[ -d "$HOMEBREW_PREFIX/opt/openssl@3" ]]; then
    export PATH="$HOMEBREW_PREFIX/opt/openssl@3/bin:$PATH"
    export LDFLAGS="-L$HOMEBREW_PREFIX/opt/openssl@3/lib ${LDFLAGS:-}"
    export CPPFLAGS="-I$HOMEBREW_PREFIX/opt/openssl@3/include:${CPPFLAGS:-}"
    export PKG_CONFIG_PATH="$HOMEBREW_PREFIX/opt/openssl@3/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
    export RUBY_CONFIGURE_OPTS="--with-openssl-dir=$HOMEBREW_PREFIX/opt/openssl@3"
  fi

  # Readline
  if [[ -d "$HOMEBREW_PREFIX/opt/readline" ]]; then
    export LDFLAGS="-L$HOMEBREW_PREFIX/opt/readline/lib ${LDFLAGS:-}"
    export CPPFLAGS="-I$HOMEBREW_PREFIX/opt/readline/include:${CPPFLAGS:-}"
    export PKG_CONFIG_PATH="$HOMEBREW_PREFIX/opt/readline/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
  fi

  # Libffi
  if [[ -d "$HOMEBREW_PREFIX/opt/libffi" ]]; then
    export LDFLAGS="-L$HOMEBREW_PREFIX/opt/libffi/lib ${LDFLAGS:-}"
    export CPPFLAGS="-I$HOMEBREW_PREFIX/opt/libffi/include:${CPPFLAGS:-}"
    export PKG_CONFIG_PATH="$HOMEBREW_PREFIX/opt/libffi/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
  fi

  # TagLib
  if [[ -d "$HOMEBREW_PREFIX/opt/taglib" ]]; then
    export TAGLIB_DIR="$HOMEBREW_PREFIX/opt/taglib"
  fi
fi

# Android SDK + JDK (React Native / Expo)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
# JAVA_HOME is managed by mise (global java@temurin-17). RN 0.83 / Expo 55 pins
# the Gradle toolchain to JDK 17; Android Studio's bundled JBR is 21, which makes
# Gradle try to auto-provision 17 via foojay and crash on Gradle 9.0. Don't
# hardcode JBR here — let mise provide JDK 17.
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

# Puppeteer
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
if command -v chromium >/dev/null 2>&1; then
  export PUPPETEER_EXECUTABLE_PATH="$(command -v chromium)"
fi

# Kubernetes
if [[ -z "${KUBECONFIG:-}" ]]; then
  typeset -a kubeconfigs
  kubeconfigs=("$HOME"/.kube/config*(N-.))
  [[ ${#kubeconfigs[@]} -gt 0 ]] && export KUBECONFIG="${(j/:/)kubeconfigs}"
fi
export K9S_FOLDER="$HOME/Library/Application Support/k9s"

# Bitwarden
export BITWARDENCLI_APPDATA_DIR=~/.bw/

# Consolidated PATH additions (add to end for proper precedence)
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/.yarn/bin:$PATH"

for _f in ${HOME}/.config/herdr/plugins/github/herdr-automatic-rename-*/shell/hook.zsh(N); do
  source $_f; break
done
unset _f

# zprof  # Uncomment to show profiling results

if command -v wt >/dev/null 2>&1; then
  cache_shell_init worktrunk wt config shell init zsh
fi
