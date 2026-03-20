#!/bin/bash

sketchybar --add item notifications right \
           --set notifications update_freq=10 \
                                icon=󰂚 \
                                icon.color=$YELLOW \
                                background.color=$BACKGROUND_1 \
                                script="$PLUGIN_DIR/notifications.sh" \
           --subscribe notifications system_woke
