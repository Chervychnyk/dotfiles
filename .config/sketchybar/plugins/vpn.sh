#!/bin/bash

# Get the first WireGuard profile
WG_PROFILE=$(scutil --nc list | grep -i "wireguard" | head -n 1 | sed -E 's/.*"(.+)".*/\1/')

if [[ -n "$WG_PROFILE" ]]; then
  # Check if currently connected (check first line only)
  STATUS=$(scutil --nc status "$WG_PROFILE" | head -n 1)

  if [[ "$STATUS" == "Connected" ]]; then
    # Active shield icon
    sketchybar -m --set vpn icon=󰞀 \
                            label="" \
                            drawing=on
  else
    # Disabled shield icon
    sketchybar -m --set vpn icon=󰞁 \
                            label="" \
                            drawing=on
  fi
else
  # No WireGuard profile found, hide the item
  sketchybar -m --set vpn drawing=off
fi
