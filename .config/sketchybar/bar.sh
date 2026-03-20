#!/bin/bash

bar=(
  height=39
  color=$BAR_COLOR
  shadow=on
  position=top
  sticky=on
  topmost=on
  padding_right=10
  padding_left=10
  corner_radius=10
  margin=10
  blur_radius=20
)

sketchybar --bar "${bar[@]}"
