local wezterm = require 'wezterm'
local module = {}

local function split_words(input)
  local result = {}
  for word in string.gmatch(input or '', '%S+') do
    table.insert(result, word)
  end
  return result
end

local function uniq_paths(paths)
  local seen = {}
  local result = {}
  for _, path in ipairs(paths) do
    if path ~= '' and not seen[path] then
      seen[path] = true
      table.insert(result, path)
    end
  end
  return result
end

local function project_roots()
  local configured = os.getenv('PROJECT_PATHS')
  if configured and configured ~= '' then
    return split_words(configured)
  end

  return {
    wezterm.home_dir .. '/projects',
    wezterm.home_dir .. '/code',
    wezterm.home_dir .. '/work',
  }
end

local function project_dirs()
  local projects = {
    wezterm.home_dir .. '/dotfiles',
  }

  for _, root in ipairs(project_roots()) do
    for _, dir in ipairs(wezterm.glob(root .. '/*')) do
      table.insert(projects, dir)
    end
  end

  return uniq_paths(projects)
end

function module.choose_project()
  local choices = {}
  for _, value in ipairs(project_dirs()) do
    table.insert(choices, { label = value })
  end

  return wezterm.action.InputSelector {
    title = 'Projects',
    choices = choices,
    fuzzy = true,
    action = wezterm.action_callback(function(child_window, child_pane, id, label)
      if not label then return end

      child_window:perform_action(wezterm.action.SwitchToWorkspace {
        name = label:match('([^/]+)$'),
        spawn = { cwd = label },
      }, child_pane)
    end),
  }
end

return module
