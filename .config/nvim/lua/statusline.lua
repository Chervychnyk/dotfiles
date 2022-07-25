local status_ok, lualine = pcall(require, "lualine")
if not status_ok then
	return
end

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

local branch = {
	"branch",
	icons_enabled = true,
	icon = "",
}

local diagnostics = {
  'diagnostics',

  -- Table of diagnostic sources, available sources are:
  --   'nvim_lsp', 'nvim_diagnostic', 'coc', 'ale', 'vim_lsp'.
  -- or a function that returns a table as such:
  --   { error=error_cnt, warn=warn_cnt, info=info_cnt, hint=hint_cnt }
  sources = { 'nvim_diagnostic', 'nvim_lsp' },
  symbols = { error = ' ', warn = ' ', info = ' ' },
  colored = true,           -- Displays diagnostics status in color if set to true.
  update_in_insert = false, -- Update diagnostics in insert mode.
  always_visible = false,   -- Show diagnostics even if there are none.
}

local diff = {
	"diff",
	colored = true,
	symbols = { added = " ", modified = " ", removed = " " }, -- changes diff symbols
  cond = conditions.hide_in_width
}

local lsp_status = { 
	function()
    local msg = 'No Active Lsp'
    local buf_ft = vim.api.nvim_buf_get_option(0, 'filetype')
    local clients = vim.lsp.get_active_clients()
    if next(clients) == nil then
        return msg
    end
    for _, client in ipairs(clients) do
        local filetypes = client.config.filetypes
        if filetypes and vim.fn.index(filetypes, buf_ft) ~= -1 then
          return client.name
        end
    end
    return msg
	end,
	icon = ' LSP:',
  cond = conditions.hide_in_width
}

lualine.setup({
  options = {
		icons_enabled = true,
		theme = "nightfly",
		component_separators = { left = "", right = "" },
		section_separators = { left = "", right = "" },
		disabled_filetypes = { "alpha", "dashboard", "NvimTree", "Outline" },
		always_divide_middle = true,
	},
  sections = {
    lualine_a = { 'mode' },
    lualine_b = { 
      branch, 
      diagnostics,
      {
        'filename',
        cond = conditions.buffer_not_empty,      
      },
    },
    lualine_c = {},
    lualine_x = {
      diff,
      'encoding',
      'filetype'

    },
    lualine_y = { "location" },
    lualine_z = { "progress" }
  },
  inactive_sections = {
		lualine_a = {},
		lualine_b = {},
		lualine_c = { "filename" },
		lualine_x = { "location" },
		lualine_y = {},
		lualine_z = {},
	},
  extensions = { "nvim-tree" },
})
