# Homebrew (must be first — other tools depend on it being in PATH)
eval "$(/opt/homebrew/bin/brew shellenv)"

# Pyenv PATH setup (runs once per login session, not every shell)
export PYENV_ROOT="$HOME/.pyenv"
[[ -d "$PYENV_ROOT/bin" ]] && export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init --path)"
