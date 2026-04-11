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

local branch = { 'b:gitsigns_head', icon = icons.git.Branch }

local diff = {
  "diff",
  colored = true,
  symbols = { added = icons.git.LineAdded, modified = icons.git.LineModified, removed = icons.git.LineRemoved },
}

local diagnostics = {
  "diagnostics",
  sources = { "nvim_diagnostic" },
  symbols = {
    error = icons.diagnostics.BoldError .. " ",
    warn = icons.diagnostics.BoldWarning .. " ",
    info = icons.diagnostics.BoldInformation .. " ",
    hint = icons.diagnostics.BoldHint .. " ",
  },
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

local function lsp_status()
  local status = vim.lsp.status()
  if status == nil or status == "" then
    return nil
  end

  return status
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
        disabled_filetypes = { "alpha", "codecompanion", "qf", "lazy", "NeogitStatus", "neo-tree", "Outline", "snacks_picker_input", "snacks_picker_list", "TelescopePrompt", "TelescopeResults" },
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
            symbols = {
              modified = icons.ui.Circle,
              readonly = icons.ui.Lock,
              unnamed = icons.ui.NewFile,
            },
          },
        },
        lualine_x = {
          diagnostics,
          {
            lsp_status,
            color = { gui = "none" },
          },
          {
            lsp_servers,
            icon = icons.ui.Watches,
            color = { gui = "none" },
          },
        },
        lualine_y = {
          { 'progress', icon = icons.ui.Target },
        },
        lualine_z = {
          { 'location', icon = icons.ui.LineNumber },
        },
      }
    })
  end
}
