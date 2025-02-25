# Set the directory we want to store Zinit and plugins
ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"

# Download Zinit if it is not there yet
if [ ! -d "$ZINIT_HOME" ]; then
  mkdir -p "$(dirname $ZINIT_HOME)"
  git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
fi

# Source/Load Zinit
source "${ZINIT_HOME}/zinit.zsh" \
  && autoload -Uz _zinit \
  && (( ${+_comps} )) \
  && _comps[zinit]=_zinit

# Prompt
zinit ice as"command" from"gh-r" \
          atclone"./starship init zsh > init.zsh; ./starship completions zsh > _starship" \
          atpull"%atclone" src"init.zsh"
zinit light starship/starship

setopt promptsubst

zinit lucid for \
  atinit"HIST_STAMPS=dd.mm.yyyy" \
  OMZL::history.zsh

# Snippets
zinit wait lucid for \
  OMZL::clipboard.zsh \
  OMZL::compfix.zsh \
  OMZL::completion.zsh \
  OMZL::correction.zsh \
  atinit"
    zstyle ':omz:alpha:lib:git' async-prompt no
  " \
  OMZL::git.zsh \
  OMZP::aws \
  OMZP::command-not-found \
  OMZP::docker-compose \
  OMZP::git \
  OMZP::fzf \
  OMZP::kubectl \
  atinit"
    zstyle ':omz:plugins:ssh-agent' quiet yes
    export SHORT_HOST='local'
  " \
  OMZP::ssh-agent \
  OMZP::sudo \
  OMZP::asdf \
  atinit"
    zstyle ':omz:plugins:nvm' lazy yes
    zstyle ':omz:plugins:nvm' autoload yes
    zstyle ':omz:plugins:nvm' silent-autoload yes 
  " \
  OMZP::nvm \
  atinit'
    export PYENV_ROOT="$HOME/.pyenv"
    [[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"
    eval "$(pyenv init --path)"
  ' \
  OMZP::pyenv

# Plugins
# Install and configure fzf
zinit ice as"command" from"gh-r" 
zinit light junegunn/fzf

zinit ice as"command" from"gh-r" sbin
zinit light zellij-org/zellij

zinit ice wait lucid as"program" from"gh-r" \
      mv"bat* -> bat" pick"bat/bat" \
      atload"export BAT_THEME=base16"
zinit light sharkdp/bat

zinit ice wait as"command" from"gh-r" lucid \
  mv"zoxide* -> zoxide" \
  atclone"./zoxide init zsh > init.zsh" \
  atpull"%atclone" src"init.zsh" nocompile'!'
zinit light ajeetdsouza/zoxide

zinit wait lucid for \
    light-mode atinit"ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=20" atload"_zsh_autosuggest_start" \
  zsh-users/zsh-autosuggestions \
    light-mode atinit"
      typeset -gA FAST_HIGHLIGHT; FAST_HIGHLIGHT[git-cmsg-len]=100;
      zpcompinit; zpcdreplay" \
  zdharma-continuum/fast-syntax-highlighting \
    atpull'zinit creinstall -q .' \
    atinit"
      zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
      zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
      zstyle ':completion:*' menu no" \
    blockf light-mode \
  zsh-users/zsh-completions \
    atinit"
      zstyle :history-search-multi-word page-size 10
      zstyle :history-search-multi-word highlight-color fg=red,bold
      zstyle :plugin:history-search-multi-word reset-prompt-protect 1" \
    bindmap"^R -> ^H" \
  zdharma-continuum/history-search-multi-word \
    atinit"
      zstyle ':fzf-tab:*' use-fzf-default-opts yes
      zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls --color $realpath'
      zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview 'ls --color $realpath'" \
  Aloxaf/fzf-tab
 
# Load aliases
[[ -f ~/.aliases ]] && source ~/.aliases

# Keybindings
bindkey '^l' autosuggest-accept
bindkey '^p' history-search-backward
bindkey '^n' history-search-forward
bindkey "^[a" beginning-of-line
bindkey "^[e" end-of-line

# Soho vibes for fzf
export FZF_DEFAULT_OPTS="
	--color=fg:#908caa,bg:#191724,hl:#ebbcba
	--color=fg+:#e0def4,bg+:#26233a,hl+:#ebbcba
	--color=border:#403d52,header:#31748f,gutter:#191724
	--color=spinner:#f6c177,info:#9ccfd8
	--color=pointer:#c4a7e7,marker:#eb6f92,prompt:#908caa"

# User configuration
export PATH="$HOME/.local/bin:$PATH"
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export TERM="xterm-256color"
export DISPLAY=:0.0

# Preferred editor for local and remote sessions
if [[ -n $SSH_CONNECTION ]]; then
  export EDITOR='vim'
else
  export EDITOR='nvim'
fi

# export JAVA_HOME=`/usr/libexec/java_home -v 1.8`
# export ANDROID_HOME=$HOME/Library/Android/sdk
# export PATH=$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools:$PATH
# export PATH=$HOME/flutter/bin:$PATH 

export ASDF_DIR="$HOME/.asdf"
export ERL_AFLAGS="-kernel shell_history enabled"
export KERL_CONFIGURE_OPTIONS="--disable-debug --disable-silent-rules --enable-dynamic-ssl-lib --enable-gettimeofday-as-os-system-time --enable-kernel-poll --without-javac --without-wx --without-odbc"

export PATH="$HOME/.asdf/installs/elixir/1.12/.mix/escripts:$PATH"
export PATH="$HOME/.yarn/bin:$PATH"

# OpenSSL
export PATH="/opt/homebrew/opt/openssl@1.1/bin:$PATH"
export LDFLAGS="-L/opt/homebrew/opt/openssl@1.1/lib:$LDFLAGS"
export CPPFLAGS="-I/opt/homebrew/opt/openssl@1.1/include:$CPPFLAGS"
export PKG_CONFIG_PATH="/opt/homebrew/opt/openssl@1.1/lib/pkgconfig:$PKG_CONFIG_PATH"
export RUBY_CONFIGURE_OPTS="--with-openssl-dir=$(brew --prefix openssl@1.1)"
export optflags="-Wno-error=implicit-function-declaration"

# Readline
export LDFLAGS="-L/opt/homebrew/opt/readline/lib:$LDFLAGS"
export CPPFLAGS="-I/opt/homebrew/opt/readline/include:$CPPFLAGS"
export PKG_CONFIG_PATH="/opt/homebrew/opt/readline/lib/pkgconfig:$PKG_CONFIG_PATH"

# Libffi
export LDFLAGS="-L/opt/homebrew/opt/libffi/lib:$LDFLAGS"
export CPPFLAGS="-I/opt/homebrew/opt/libffi/include:$CPPFLAGS"
export PKG_CONFIG_PATH="/opt/homebrew/opt/libffi/lib/pkgconfig:$PKG_CONFIG_PATH"

export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=`which chromium`

export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
export PATH="/opt/homebrew/opt/postgresql@14/bin:$PATH"
export PATH="/opt/homebrew/opt/mysql@5.7/bin:$PATH"

# Add RVM to PATH for scripting. Make sure this is the last PATH variable change.
export PATH="$HOME/.rvm/bin:$PATH"

export TAGLIB_DIR="$(brew --prefix taglib)"
export KUBECONFIG=$HOME/.kube/config.ovh.products:$HOME/.kube/config

export BITWARDENCLI_APPDATA_DIR=~/.bw/

# Load custom functions
fpath=(~/.zsh/functions $fpath)
autoload -Uz unlock_bitwarden set_openrouter_key
