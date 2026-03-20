#!/bin/bash
set -e

# Check for required commands
if ! command -v jq &> /dev/null; then
  echo ":default:"
  exit 0
fi

APP_NAME="$1"
ICON_MAP_FILE="$CONFIG_DIR/icon_map.json"

# Check if icon map file exists
if [ ! -f "$ICON_MAP_FILE" ]; then
  echo ":default:"
  exit 0
fi

# Look up icon from JSON file
icon_result=$(jq -r --arg app "$APP_NAME" '.[$app] // ":default:"' "$ICON_MAP_FILE")

echo "$icon_result"
