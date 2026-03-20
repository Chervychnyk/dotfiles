#!/bin/sh

sketchybar --add item keyboard right \
           --set keyboard icon="" update_freq=1 script="$PLUGIN_DIR/keyboard.sh" \
           --subscribe keyboard input_change      
