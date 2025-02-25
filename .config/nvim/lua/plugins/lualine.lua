local icons = require "config.icons"

local conditions = {
  buffer_not_empty = function()
    return vim.fn.empty(vim.fn.expand('%:t')) ~= 1
  end,
  hide_in_width = function()
    return vim.fn.winwidth(0) > 80
  end,
  check_git_workspace = function()
    local filepath = vim.fn.expand('%:p:h')
    local gitdir = vim.fn.finddir('.git', filepath .. ';')
    return gitdir and #gitdir > 0 and #gitdir < #filepath
  end,
}

local branch = { 'b:gitsigns_head', icon = '' }

local diff = {
  "diff",
  colored = true,
  symbols = { added = icons.git.LineAdded, modified = icons.git.LineModified, removed = icons.git.LineRemoved }, -- Changes the symbols used by the diff.
}

local function lsp_servers()
  local buf_clients = vim.lsp.get_clients({ bufnr = 0 })

  if next(buf_clients) == nil then
    return "Inactive"
  end

  local buf_client_names = {}

  for _, client in pairs(buf_clients) do
    table.insert(buf_client_names, client.name)
  end

  return table.concat(buf_client_names, ", ")
end

local copilot_status = function()
  local disabled = require('copilot.client').is_disabled()

  if disabled then
    return "%#CopilotDisabled# "
  end

  local auto_trigger_enabled = vim.b.copilot_suggestion_auto_trigger == nil and
      require('copilot.config').get("suggestion").auto_trigger
      or
      vim.b.copilot_suggestion_auto_trigger

  if auto_trigger_enabled then
    return "%#CopilotEnabled# "
  else
    return "%#CopilotSleep# "
  end
end

local has_nvim_10 = vim.fn.has('nvim-0.10.0') > 0

if has_nvim_10 then
  vim.api.nvim_create_autocmd({ 'LspProgress' }, {
    command = 'redrawstatus'
  })
end

return {
  "nvim-lualine/lualine.nvim",
  config = function()
    require("lualine").setup({
      options = {
        icons_enabled = true,
        theme = "auto",
        globalstatus = true,
        component_separators = { left = "", right = "" },
        section_separators = { left = "", right = "" },
        disabled_filetypes = { "alpha", "Avante", "AvanteInput", "codecompanion", "qf", "lazy", "NeogitStatus", "NvimTree", "Outline", "snacks_picker_input", "TelescopePrompt", "TelescopeResults", "Trouble" },
        always_divide_middle = true,
      },
      sections = {
        lualine_a = { 'mode' },
        lualine_b = {
          branch,
          diff
        },
        lualine_c = {
          { "filetype", icon_only = true, padding = { left = 1, right = 0 } },
          {
            'filename',
            cond = conditions.buffer_not_empty,
          },
        },
        lualine_x = {
          "diagnostics",
          {
            lsp_servers,
            icon = "",
            color = { gui = "none" },
          },
          copilot_status
        },
        lualine_y = { "progress" },
        lualine_z = { "location" },
      }
    })
  end
}
