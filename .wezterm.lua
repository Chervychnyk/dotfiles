-- Pull in the wezterm API
local wezterm = require 'wezterm'
local appearance = require "appearance"
local projects = require 'projects'

-- This function returns the suggested title for a tab.
-- It prefers the title that was set via `tab:set_title()`
-- or `wezterm cli set-tab-title`, but falls back to the
-- title of the active pane in that tab.
local function tab_title(tab_info)
  local title = tab_info.tab_title
  -- if the tab title is explicitly set, take that
  if title and #title > 0 then
    return title
  end
  -- Otherwise, use the title from the active pane
  -- in that tab
  return tab_info.active_pane.title
end

wezterm.on(
  'format-tab-title',
  function(tab, tabs, panes, config, hover, max_width)
    local title = tab_title(tab)

    if tab.is_active then
      local panes_count = #panes
      if panes_count > 1 then
        title = title .. ' (' .. panes_count .. ')'
      elseif tab.active_pane.is_zoomed then
        title = title .. ' 🔍'
      end

      return {
        { Text = ' ' .. title .. ' ' },
      }
    end
    return title
  end
)

local function segments_for_right_status(window)
  return {
    window:active_workspace(),
    wezterm.strftime('%a %b %-d %H:%M'),
    wezterm.hostname(),
  }
end

wezterm.on('update-status', function(window, _)
  local SOLID_LEFT_ARROW = utf8.char(0xe0b2)
  local segments = segments_for_right_status(window)

  local color_scheme = window:effective_config().resolved_palette
  -- Note the use of wezterm.color.parse here, this returns
  -- a Color object, which comes with functionality for lightening
  -- or darkening the colour (amongst other things).
  local bg = wezterm.color.parse(color_scheme.background)
  local fg = color_scheme.foreground

  -- Each powerline segment is going to be coloured progressively
  -- darker/lighter depending on whether we're on a dark/light colour
  -- scheme. Let's establish the "from" and "to" bounds of our gradient.
  local gradient_to, gradient_from = bg
  if appearance.is_dark() then
    gradient_from = gradient_to:lighten(0.2)
  else
    gradient_from = gradient_to:darken(0.2)
  end

  -- Yes, WezTerm supports creating gradients, because why not?! Although
  -- they'd usually be used for setting high fidelity gradients on your terminal's
  -- background, we'll use them here to give us a sample of the powerline segment
  -- colours we need.
  local gradient = wezterm.color.gradient(
    {
      orientation = 'Horizontal',
      colors = { gradient_from, gradient_to },
    },
    #segments -- only gives us as many colours as we have segments.
  )

  -- We'll build up the elements to send to wezterm.format in this table.
  local elements = {}

  for i, seg in ipairs(segments) do
    local is_first = i == 1

    if is_first then
      table.insert(elements, { Background = { Color = 'none' } })
    end
    table.insert(elements, { Foreground = { Color = gradient[i] } })
    table.insert(elements, { Text = SOLID_LEFT_ARROW })

    table.insert(elements, { Foreground = { Color = fg } })
    table.insert(elements, { Background = { Color = gradient[i] } })
    table.insert(elements, { Text = ' ' .. seg .. ' ' })
  end

  window:set_right_status(wezterm.format(elements))
end)

-- This table will hold the configuration.
local config = {}

-- In newer versions of wezterm, use the config_builder which will
-- help provide clearer error messages
if wezterm.config_builder then
  config = wezterm.config_builder()
end

-- This is where you actually apply your config choices

-- For example, changing the color scheme:
config.color_scheme = 'Rosé Pine (Gogh)'
config.font = wezterm.font "Hack Nerd Font Mono"
config.font_size = 14
config.line_height = 1.2
config.adjust_window_size_when_changing_font_size = false
config.hide_tab_bar_if_only_one_tab = true

config.initial_cols = 140
config.initial_rows = 40

config.native_macos_fullscreen_mode = true
config.use_dead_keys = false

config.enable_scroll_bar = true
config.scrollback_lines = 20000

config.set_environment_variables = {
  PATH = '/opt/homebrew/bin:' .. os.getenv('PATH')
}

config.leader = { key = 'a', mods = 'CTRL', timeout_milliseconds = 1000 }

local function move_pane(key, direction)
  return {
    key = key,
    mods = 'CTRL|SHIFT',
    action = wezterm.action.ActivatePaneDirection(direction),
  }
end

config.keys = {
  {
    key = 'a',
    -- When we're in leader mode _and_ CTRL + A is pressed...
    mods = 'LEADER|CTRL',
    -- Actually send CTRL + A key to the terminal
    action = wezterm.action.SendKey { key = 'a', mods = 'CTRL' },
  },
  {
    key = ',',
    mods = 'CMD',
    action = wezterm.action.SpawnCommandInNewTab {
      cwd = wezterm.home_dir,
      args = { 'nvim', wezterm.config_file },
    },
  },
  {
    key = 'f',
    mods = 'LEADER',
    action = wezterm.action.ToggleFullScreen
  },
  {
    key = 'z',
    mods = 'LEADER',
    action = wezterm.action.TogglePaneZoomState,
  },
  {
    key = 'p',
    mods = 'LEADER',
    -- Present in to our project picker
    action = projects.choose_project(),
  },
  {
    key = 'w',
    mods = 'LEADER',
    -- Present a list of existing workspaces
    action = wezterm.action.ShowLauncherArgs { flags = 'FUZZY|WORKSPACES' },
  },
  {
    key = 'p',
    mods = 'LEADER',
    action = wezterm.action.PaneSelect
  },
  move_pane('j', 'Down'),
  move_pane('k', 'Up'),
  move_pane('h', 'Left'),
  move_pane('l', 'Right'),
  {
    key = '|',
    mods = 'CTRL|SHIFT',
    action = wezterm.action.SplitHorizontal { domain = 'CurrentPaneDomain' },
  },
  {
    key = '%',
    mods = 'CTRL|SHIFT',
    action = wezterm.action.SplitVertical { domain = 'CurrentPaneDomain' },
  },
  {
    key = 'w',
    mods = 'CMD',
    action = wezterm.action.CloseCurrentPane { confirm = true },
  },
  {
    key = 'E',
    mods = 'CTRL|SHIFT',
    action = wezterm.action.PromptInputLine {
      description = 'Enter new name for tab',
      action = wezterm.action_callback(function(window, pane, line)
        -- line will be `nil` if they hit escape without entering anything
        -- An empty string if they just hit enter
        -- Or the actual line of text they wrote
        if line then
          window:active_tab():set_title(line)
        end
      end),
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
