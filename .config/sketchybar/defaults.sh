#!/bin/bash

defaults=(
  icon.font="$FONT:Bold:16.0"
  icon.color=$ICON_COLOR
  icon.padding_left=10
  icon.padding_right=4
  label.font="$FONT:Semibold:15.0"
  label.color=$LABEL_COLOR
  label.padding_left=4
  label.padding_right=10
  padding_right=$PADDINGS
  padding_left=$PADDINGS
  background.height=30
  background.corner_radius=9
  background.color=$BACKGROUND_1
  popup.background.border_width=2
  popup.background.corner_radius=9
  popup.background.border_color=$POPUP_BORDER_COLOR
  popup.background.color=$POPUP_BACKGROUND_COLOR
  popup.blur_radius=20
  popup.background.shadow.drawing=on
)

sketchybar --default "${defaults[@]}"

# Custom events
sketchybar --add event aerospace_workspace_change
sketchybar --add event aerospace_mode_change
sketchybar --add event aerospace_window_change
sketchybar --add event display_volume_change
sketchybar --add event input_change 'AppleSelectedInputSourcesChangedNotification'  
