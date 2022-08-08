local status_ok, which_key = pcall(require, "which-key")
if not status_ok then
  return
end

local setup = {
  plugins = {
    marks = true, -- shows a list of your marks on ' and `
    presets = {
      operators = false,
      motions = true,
      text_objects = true,
      windows = true,
      nav = true,
      z = true,
      g = true,
    },
    registers = true, -- shows your registers on " in NORMAL or <C-r> in INSERT mode
    spelling = {
      enabled = true, -- enabling this will show WhichKey when pressing z= to select spelling suggestions
      suggestions = 20, -- how many suggestions should be shown in the list?
    },
  },
  icons = {
    breadcrumb = "»",
    separator = "➜",
    group = "+",
  },
  popup_mappings = {
    scroll_down = "<c-d>", -- binding to scroll down inside the popup
    scroll_up = "<c-u>", -- binding to scroll up inside the popup
  },
  window = {
    border = "none", -- none, single, double, shadow
    position = "bottom", -- bottom, top
    margin = { 1, 0, 1, 0 },
    padding = { 2, 2, 2, 2 },
  },
  layout = {
    height = { min = 4, max = 25 },
    width = { min = 20, max = 50 },
    spacing = 3,
  },
  ignore_missing = true, -- enable this to hide mappings for which you didn't specify a label
  hidden = { "<silent>", "<cmd>", "<Cmd>", "<CR>", "call", "lua", "^:", "^ " },
  show_help = true,
}

local opts = {
  mode = "n",
  prefix = "<leader>",
  buffer = nil,
  silent = true,
  noremap = true,
  nowait = true,
}

-- NOTE: Prefer using : over <cmd> as the latter avoids going back in normal-mode.
-- see https://neovim.io/doc/user/map.html#:map-cmd
local mappings = {
  ["e"] = { ":NvimTreeToggle <cr>", "Toogle File Tree" },
  ["f"] = { ":Telescope grep_string <cr>", "Find Word" },
  ["F"] = { ":Telescope live_grep theme=ivy <cr>", "Find Text" },
  ["o"] = {
    "<cmd>lua require('telescope.builtin').find_files(require('telescope.themes').get_dropdown{previewer = false})<cr>",
    "Find Files",
  },
  ["P"] = { "<cmd>lua require('telescope').extensions.projects.projects()<cr>", "Projects" },
  ["w"] = { "<cmd>w!<CR>", "Save" },
  ["q"] = { "<cmd>q!<CR>", "Quit" },
  b = {
    name = "Buffer",
    l = { "<cmd>lua require('telescope.builtin').buffers(require('telescope.themes').get_dropdown{previewer = false})<cr>", "List Buffers" },
    b = { ":b#<cr>", "Previous" },
    d = { ":bd<cr>", "Delete" },
    n = { ":bn<cr>", "Next" },
    p = { ":bp<cr>", "Previous" },
    m = { "<cmd>TZFocus<cr>", "Maximize Current Buffer" },
    z = { "<cmd>TZAtaraxis<cr>", "Toggle Zen Mode" }
  },
  g = {
    name = "Git",
    j = { "<cmd>lua require 'gitsigns'.next_hunk()<cr>", "Next Hunk" },
    k = { "<cmd>lua require 'gitsigns'.prev_hunk()<cr>", "Prev Hunk" },
    l = { "<cmd>lua require 'gitsigns'.blame_line()<cr>", "Blame" },
    p = { "<cmd>lua require 'gitsigns'.preview_hunk()<cr>", "Preview Hunk" },
    r = { "<cmd>lua require 'gitsigns'.reset_hunk()<cr>", "Reset Hunk" },
    R = { "<cmd>lua require 'gitsigns'.reset_buffer()<cr>", "Reset Buffer" },
    s = { "<cmd>lua require 'gitsigns'.stage_hunk()<cr>", "Stage Hunk" },
    u = {
      "<cmd>lua require 'gitsigns'.undo_stage_hunk()<cr>",
      "Undo Stage Hunk",
    },
    o = { "<cmd>Telescope git_status<cr>", "Open changed file" },
    b = { "<cmd>Telescope git_branches<cr>", "Checkout branch" },
    c = { "<cmd>Telescope git_commits<cr>", "Checkout commit" },
    d = {
      "<cmd>Gitsigns diffthis HEAD<cr>",
      "Diff",
    },
  },
  p = {
    name = "Packer",
    c = { ":PackerCompile<cr>", "Compile" },
    i = { ":PackerInstall<cr>", "Install" },
    s = { ":PackerSync<cr>", "Sync" },
    S = { ":PackerStatus<cr>", "Status" },
    u = { ":PackerUpdate<cr>", "Update" },
  },
  l = {
    name = "LSP",
    a = { ":Telescope lsp_code_actions<cr>", "Code Action" },
    d = {
      ":Telescope diagnostics<cr>",
      "Workspace Diagnostics",
    },
    s = {
      ":Telescope lsp_document_symbols<cr>",
      "Document Symbols"
    },
    S = {
      ":Telescope lsp_dynamic_workspace_symbols<cr>",
      "Workspace Symbols"
    },
    f = { ":lua vim.lsp.buf.formatting()<cr>", "Format" },
    i = { ":LspInfo<cr>", "Info" },
    I = { ":Mason<cr>", "Installer Info" },
    r = { ":lua vim.lsp.buf.rename()<cr>", "Rename" },
  },
  s = {
    name = "Search",
    b = { ":Telescope git_branches <cr>", "Checkout branch" },
    c = { ":Telescope git_commits <cr>", "Commits" },
    C = { ":Telescope git_status <cr>", "Changes" },
    h = { ":Telescope help_tags<cr>", "Find Help" },
    M = { ":Telescope man_pages<cr>", "Man Pages" },
    r = { ":Telescope oldfiles <cr>", "Open Recent File" },
    R = { ":Telescope registers <cr>", "Registers" },
  },
}

which_key.setup(setup)
which_key.register(mappings, opts)
