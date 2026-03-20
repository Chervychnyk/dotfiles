#!/bin/bash

# Get the first WireGuard profile
WG_PROFILE=$(scutil --nc list | grep -i "wireguard" | head -n 1 | sed -E 's/.*"(.+)".*/\1/')

if [[ -n "$WG_PROFILE" ]]; then
  # Check if currently connected (check first line only)
  STATUS=$(scutil --nc status "$WG_PROFILE" | head -n 1)

  if [[ "$STATUS" == "Connected" ]]; then
    # Disconnect
    scutil --nc stop "$WG_PROFILE"
  else
    # Connect
    scutil --nc start "$WG_PROFILE"
  fi

  # Wait a moment for connection status to update, then refresh the vpn item
  sleep 1
  sketchybar --trigger vpn_update
fi
