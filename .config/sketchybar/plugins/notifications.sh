#!/bin/bash

source "$CONFIG_DIR/colors.sh"

# Count apps with badge notifications using lsappinfo
# This counts any app in the Dock that has a non-empty StatusLabel (badge)
COUNT=$(lsappinfo -all list | grep -o '"StatusLabel"={ "label"="[^"]*" }' | grep -v '""' | grep -v 'kCFNULL' | wc -l | tr -d ' ')

# Fallback if command fails
if [ -z "$COUNT" ] || [ "$COUNT" = "" ]; then
    COUNT=0
fi

# Set color and visibility based on count
if [ "$COUNT" -gt 0 ]; then
    ICON_COLOR=$YELLOW
    LABEL="$COUNT"
    DRAWING=on
else
    ICON_COLOR=$GREY
    LABEL=""
    DRAWING=off
fi

sketchybar --set "$NAME" \
           icon.color="$ICON_COLOR" \
           label="$LABEL" \
           drawing="$DRAWING"
