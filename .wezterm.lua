-- Pull in the wezterm API
local wezterm = require 'wezterm'

-- This table will hold the configuration.
local config = {}

-- In newer versions of wezterm, use the config_builder which will
-- help provide clearer error messages
if wezterm.config_builder then
  config = wezterm.config_builder()
end

-- This is where you actually apply your config choices

config.color_scheme = 'Everforest Dark Hard (Gogh)'
config.font = wezterm.font "Hack Nerd Font Mono"
config.font_size = 16
config.line_height = 1.2
config.adjust_window_size_when_changing_font_size = false
config.hide_tab_bar_if_only_one_tab = true

config.initial_cols = 140
config.initial_rows = 40

config.native_macos_fullscreen_mode = true
config.use_dead_keys = false
config.window_decorations = 'RESIZE'

config.enable_scroll_bar = true
config.scrollback_lines = 20000

local homebrew_prefix = os.getenv('HOMEBREW_PREFIX')
if not homebrew_prefix or homebrew_prefix == '' then
  if wezterm.target_triple and wezterm.target_triple:find('apple') then
    homebrew_prefix = '/opt/homebrew'
  else
    homebrew_prefix = '/usr/local'
  end
end

config.set_environment_variables = {
  PATH = homebrew_prefix .. '/bin:' .. os.getenv('PATH')
}

config.keys = {
  {
    key = ',',
    mods = 'CMD',
    action = wezterm.action.SpawnCommandInNewTab {
      cwd = wezterm.home_dir,
      args = { 'nvim', wezterm.config_file },
    },
  },
  -- Make Option-Left equivalent to Alt-b which many line editors interpret as backward-word
  { key = 'LeftArrow',  mods = 'OPT', action = wezterm.action.SendString '\x1bb' },
  -- Make Option-Right equivalent to Alt-f; forward-word
  { key = 'RightArrow', mods = 'OPT', action = wezterm.action.SendString '\x1bf' },
}

config.mouse_bindings = {
  {
    event = { Up = { streak = 1, button = "Left" } },
    mods = 'CTRL',
    action = wezterm.action.OpenLinkAtMouseCursor
  }
}


config.window_frame = {
  font = wezterm.font { family = 'Hack', weight = 'Bold' },
  font_size = 14.0
}

-- Use the defaults as a base
config.hyperlink_rules = wezterm.default_hyperlink_rules()

-- make task numbers clickable
-- the first matched regex group is captured in $1.
table.insert(config.hyperlink_rules, {
  regex = [[\b([A-Z]{2,4}-\d+)\b]],
  format = 'https://mind-studios.atlassian.net/browse/$1',
  highlight = 1,
})

-- and finally, return the configuration to wezterm
return config
