local icons = require "config.icons"
local remove_duplicates = require("config.utils").remove_duplicates

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

  local null_ls_installed, null_ls = pcall(require, "null-ls")
  local buf_client_names = {}

  for _, client in pairs(buf_clients) do
    if client.name == "null-ls" then
      if null_ls_installed then
        for _, source in ipairs(null_ls.get_source({ filetype = vim.bo.filetype })) do
          table.insert(buf_client_names, source.name)
        end
      end
    else
      table.insert(buf_client_names, client.name)
    end
  end

  return table.concat(remove_duplicates(buf_client_names), ", ")
end

local function supermaven_status()
  local enabled = require("supermaven-nvim.api").is_running()
  local icon = enabled and "●" or "○"

  return icon .. " Supermaven"
end

local has_nvim_10 = vim.fn.has('nvim-0.10.0') > 0

if has_nvim_10 then
  vim.api.nvim_create_autocmd({ 'LspProgress' }, {
    command = 'redrawstatus'
  })
end

return {
  "nvim-lualine/lualine.nvim",
  opts = {
    options = {
      icons_enabled = true,
      theme = "auto",
      globalstatus = true,
      component_separators = { left = "", right = "" },
      section_separators = { left = "", right = "" },
      disabled_filetypes = { "alpha", "qf", "lazy", "NeogitStatus", "NvimTree", "Outline", "TelescopePrompt", "TelescopeResults" },
      always_divide_middle = true,
    },
    sections = {
      lualine_a = { 'mode' },
      lualine_b = {
        branch,
        diff
      },
      lualine_c = {
        { "filetype", icon_only = true, padding = { left = 1, right = 0 }, separator = " " },
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
        supermaven_status
      },
      lualine_y = { "progress" },
      lualine_z = { "location" },
    }
  }
}
