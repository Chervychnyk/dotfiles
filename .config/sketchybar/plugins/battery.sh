#!/bin/bash

source "$CONFIG_DIR/colors.sh"

PERCENTAGE="$(pmset -g batt | grep -Eo "\d+%" | cut -d% -f1)"
CHARGING="$(pmset -g batt | grep 'AC Power')"

if [ "$PERCENTAGE" = "" ]; then
  exit 0
fi

# Set icon based on percentage
case "${PERCENTAGE}" in
  9[0-9]|100) ICON=""
  ;;
  [6-8][0-9]) ICON=""
  ;;
  [3-5][0-9]) ICON=""
  ;;
  [1-2][0-9]) ICON=""
  ;;
  *) ICON=""
esac

# Set color based on charging status and percentage
if [[ "$CHARGING" != "" ]]; then
  ICON=""
  ICON_COLOR=$GREEN
else
  # Color based on battery level
  if [ "${PERCENTAGE}" -ge 60 ]; then
    ICON_COLOR=$GREEN
  elif [ "${PERCENTAGE}" -ge 20 ]; then
    ICON_COLOR=$YELLOW
  else
    ICON_COLOR=$RED
  fi
fi

# The item invoking this script (name $NAME) will get its icon and label
# updated with the current battery status
sketchybar --set "$NAME" \
           icon="$ICON" \
           icon.color="$ICON_COLOR" \
           label="${PERCENTAGE}%"
