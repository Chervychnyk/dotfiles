#!/bin/bash

sketchybar -m --add item vpn right \
  --subscribe vpn vpn_update \
  --set vpn icon=󰞁 \
    label.drawing=off \
    update_freq=5 \
    script="$PLUGIN_DIR/vpn.sh" \
    click_script="$PLUGIN_DIR/vpn_toggle.sh"
