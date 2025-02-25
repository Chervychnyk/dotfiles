-- NOTE: Prefer using : over <cmd> as the latter avoids going back in normal-mode.
-- see https://neovim.io/doc/user/map.html#:map-cmd
local mappings = {
  { mode = "n" },
  { "<leader>T",  group = "Treesitter",                               nowait = true,               remap = false },
  { "<leader>Ti", ":TSConfigInfo<cr>",                                desc = "Info",               nowait = true, remap = false },
  { "<leader>a",  group = "Avante",                                   nowait = true,               remap = false },
  { "<leader>b",  group = "Buffer",                                   nowait = true,               remap = false },
  { "<leader>l",  group = "LSP",                                      nowait = true,               remap = false },
  { "<leader>lI", "<cmd>Mason<cr>",                                   desc = "Mason Info",         nowait = true, remap = false },
  { "<leader>li", "<cmd>LspInfo<cr>",                                 desc = "Info",               nowait = true, remap = false },
  { "<leader>ll", "<cmd>lua vim.lsp.codelens.run()<cr>",              desc = "CodeLens Action",    nowait = true, remap = false },
  { "<leader>p",  group = "Plugins",                                  nowait = true,               remap = false },
  { "<leader>pS", "<cmd>Lazy clear<cr>",                              desc = "Status",             nowait = true, remap = false },
  { "<leader>pc", "<cmd>Lazy clean<cr>",                              desc = "Clean",              nowait = true, remap = false },
  { "<leader>pd", "<cmd>Lazy debug<cr>",                              desc = "Debug",              nowait = true, remap = false },
  { "<leader>pi", "<cmd>Lazy install<cr>",                            desc = "Install",            nowait = true, remap = false },
  { "<leader>pl", "<cmd>Lazy log<cr>",                                desc = "Log",                nowait = true, remap = false },
  { "<leader>pp", "<cmd>Lazy profile<cr>",                            desc = "Profile",            nowait = true, remap = false },
  { "<leader>ps", "<cmd>Lazy sync<cr>",                               desc = "Sync",               nowait = true, remap = false },
  { "<leader>pu", "<cmd>Lazy update<cr>",                             desc = "Update",             nowait = true, remap = false },
  { "<leader>q",  "<cmd>confirm q<CR>",                               desc = "Quit",               nowait = true, remap = false },
}

return {
  "folke/which-key.nvim",
  event = "VeryLazy",
  opts = {
    plugins = {
      marks = true, -- shows a list of your marks on ' and `
      presets = {
        operators = false,
        motions = true,
        text_objects = true,
        windows = true,
        nav = true,
        z = true,
        g = false,
      },
      registers = true,   -- shows your registers on " in NORMAL or <C-r> in INSERT mode
      spelling = {
        enabled = true,   -- enabling this will show WhichKey when pressing z= to select spelling suggestions
        suggestions = 20, -- how many suggestions should be shown in the list?
      },
    },
    icons = {
      mappings = false
    },
    keys = {
      scroll_down = "<c-d>", -- binding to scroll down inside the popup
      scroll_up = "<c-u>",   -- binding to scroll up inside the popup
    },
    win = {
      border = "none", -- none, single, double, shadow
      title = false
    },
    layout = {
      height = { min = 4, max = 25 },
      width = { min = 20, max = 50 },
      spacing = 3,
    },
    filter = function(mapping)
      return mapping.desc and mapping.desc ~= ""
    end,
    show_help = true,
  },
  config = function(_, setup)
    local which_key = require("which-key")

    which_key.setup(setup)
    which_key.add(mappings)
  end
}
