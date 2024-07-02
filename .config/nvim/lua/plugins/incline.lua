local icons = require("config.icons")

local function get_diagnostic_label(props)
  local diagnostic_icons = {
    error = icons.diagnostics.Error,
    warn = icons.diagnostics.Warning,
    info = icons.diagnostics.Information,
    hint = icons.diagnostics.Hint
  }
  local label = {}

  for severity, icon in pairs(diagnostic_icons) do
    local n = #vim.diagnostic.get(props.buf, { severity = vim.diagnostic.severity[string.upper(severity)] })
    if n > 0 then
      table.insert(label, { ' ' .. icon .. ' ' .. n .. ' ', group = 'DiagnosticSign' .. severity })
    end
  end

  return label
end

local function get_git_diff(props)
  local git_icons = { added = icons.git.LineAdded, changed = icons.git.LineModified, removed = icons.git.LineRemoved }
  local labels = {}
  local success, signs = pcall(vim.api.nvim_buf_get_var, props.buf, "gitsigns_status_dict")

  if success then
    for name, icon in pairs(git_icons) do
      if tonumber(signs[name]) and signs[name] > 0 then
        table.insert(labels, { icon .. " " .. signs[name] .. " ", group = "Diff" .. name })
      end
    end
  end

  return labels
end

return {
  "b0o/incline.nvim",
  enabled = true,
  event = "BufEnter",
  config = function()
    local helpers = require("incline.helpers")

    require("incline").setup({
      hide = {
        cursorline = true,
        focused_win = true,
        only_win = true,
      },
      window = {
        margin = {
          horizontal = 0,
        },
        padding = 0,
        placement = {
          horizontal = "right",
          vertical = "top",
        },
      },
      render = function(props)
        local filename = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(props.buf), ':t')
        if filename == '' then
          filename = '[No Name]'
        end

        local ft_icon, ft_color = require("nvim-web-devicons").get_icon_color(filename)

        local buffer = {
          { get_git_diff(props) },
          { get_diagnostic_label(props) },
          ft_icon and { " " .. ft_icon .. " ", guibg = ft_color, guifg = helpers.contrast_color(ft_color) },
          " ",
          { filename }
        }
        return buffer
      end,
    })
  end,
}
