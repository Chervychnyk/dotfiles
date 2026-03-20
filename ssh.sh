#!/usr/bin/env bash
set -euo pipefail

SSH_DIR="$HOME/.ssh"
KEY_NAME="${1:-id_ed25519}"
KEY_PATH="$SSH_DIR/$KEY_NAME"
CONFIG_PATH="$SSH_DIR/config"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

echo "Generating a new SSH key..."
read -rp "Email for SSH key comment: " ssh_email

if [[ -z "$ssh_email" ]]; then
  echo "Email is required" >&2
  exit 1
fi

if [[ -e "$KEY_PATH" ]]; then
  echo "Key already exists at $KEY_PATH" >&2
  exit 1
fi

ssh-keygen -t ed25519 -a 100 -f "$KEY_PATH" -C "$ssh_email"

eval "$(ssh-agent -s)"

if ! grep -q "IdentityFile ~/.ssh/$KEY_NAME" "$CONFIG_PATH" 2>/dev/null; then
  cat >> "$CONFIG_PATH" <<EOF

Host *
  AddKeysToAgent yes
  UseKeychain yes
  IdentityFile ~/.ssh/$KEY_NAME
EOF
  echo "Updated $CONFIG_PATH"
else
  echo "$CONFIG_PATH already contains ~/.ssh/$KEY_NAME"
fi

chmod 600 "$CONFIG_PATH"

if ssh-add --help 2>&1 | grep -q -- '--apple-use-keychain'; then
  ssh-add --apple-use-keychain "$KEY_PATH"
else
  ssh-add "$KEY_PATH"
fi

if command -v pbcopy >/dev/null 2>&1; then
  pbcopy < "$KEY_PATH.pub"
  echo "Public key copied to clipboard"
fi

echo "Public key: $KEY_PATH.pub"
echo "Next: add it to GitHub/GitLab and verify with: ssh -T git@github.com"
