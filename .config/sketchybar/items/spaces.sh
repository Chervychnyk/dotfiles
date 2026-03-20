#!/bin/bash

sketchybar --add item aerospace_mode left \
  --subscribe aerospace_mode aerospace_mode_change \
  --set aerospace_mode icon="" \
  script="$CONFIG_DIR/plugins/aerospace_mode.sh" \
  icon.color="$WHITE" \
  icon.padding_left=4 \
  drawing=off

for sid in $(aerospace list-workspaces --all); do
  monitor=$(aerospace list-windows --workspace "$sid" --format "%{monitor-appkit-nsscreen-screens-id}")

  if [ -z "$monitor" ]; then
    monitor="1"
  fi

  sketchybar --add item space."$sid" left \
    --subscribe space."$sid" aerospace_workspace_change aerospace_window_change display_change system_woke mouse.entered mouse.exited \
    --set space."$sid" \
    display="$monitor" \
    padding_right=6 \
    icon="$sid" \
    label.padding_left=0 \
    label.padding_right=8 \
    icon.padding_left=8 \
    icon.padding_right=6 \
    background.drawing=on \
    label.font="sketchybar-app-font:Regular:16.0" \
    background.color=$BACKGROUND_1 \
    background.border_color=$BACKGROUND_2 \
    background.border_width=2 \
    background.drawing=on \
    background.corner_radius=5 \
    background.height=25 \
    click_script="aerospace workspace $sid" \
    script="$CONFIG_DIR/plugins/aerospace.sh $sid"
done

sketchybar --add item space_separator left \
  --set space_separator icon="|" \
  icon.color="$WHITE" \
  icon.padding_left=4 \
  icon.padding_right=7 \
  label.drawing=off \
  background.drawing=off
