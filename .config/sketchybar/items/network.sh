#!/bin/bash

sketchybar --add item network right \
           --set network icon="󰖩" \
                         update_freq=2 \
                         script="$PLUGIN_DIR/network.sh"
