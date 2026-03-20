#!/bin/bash

# Get WiFi SSID using the same method as the Lua implementation
WIFI_NAME=$(networksetup -listpreferredwirelessnetworks en0 | sed -n '2p' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

# Check if actually connected (has IP address)
IP_ADDR=$(ipconfig getifaddr en0 2>/dev/null)

if [ -n "$IP_ADDR" ] && [ -n "$WIFI_NAME" ]; then
  sketchybar --set "$NAME" label="$WIFI_NAME" drawing=on
else
  sketchybar --set "$NAME" label="Disconnected" drawing=on
fi
