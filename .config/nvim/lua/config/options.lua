-- Shared "large file" limits used by plugins like snacks.nvim and gitsigns.nvim.
vim.g.max_file = { size = 1024 * 100, lines = 10000 }

-- Search the current buffer as you type the pattern.
vim.opt.incsearch = true
-- Highlight all matches for the last search pattern.
vim.opt.hlsearch = true
-- Ignore case in searches unless the pattern contains uppercase letters.
vim.opt.ignorecase = true
vim.opt.smartcase = true

-- Use the system clipboard for yank / paste.
vim.opt.clipboard = "unnamedplus"
-- Enable mouse support in all modes.
vim.opt.mouse = "a"
-- Hide the command line when idle; Neovim 0.12 handles this well.
vim.opt.cmdheight = 0
-- Ask for confirmation instead of failing on modified buffers.
vim.opt.confirm = true
-- Disable the old ruler display; statusline/UIs already cover this.
vim.opt.ruler = false
-- Disable the legacy showcmd area; cmdheight=0 makes it unnecessary.
vim.opt.showcmd = false

-- Completion popup behavior tuned for Neovim 0.12 + blink/native popup menus.
vim.opt.completeopt = { "menu", "menuone", "noselect", "popup", "fuzzy", "nearest" }
-- Use rounded borders for popup menus.
vim.opt.pumborder = "rounded"
-- Limit popup menu height so it stays compact.
vim.opt.pumheight = 5
-- Keep popup menu width under control.
vim.opt.pummaxwidth = 40
-- Use rounded borders for generic floating windows in 0.12.
vim.opt.winborder = "rounded"

-- Keep markdown code fences and other concealed text visible.
vim.opt.conceallevel = 0
-- Show line numbers.
vim.opt.number = true
-- Do not highlight the current line.
vim.opt.cursorline = false
-- Always keep the sign column visible to avoid text shifting.
vim.opt.signcolumn = "yes"
-- Keep some context above and below the cursor while scrolling.
vim.opt.scrolloff = 8
-- Keep some context left and right of the cursor while side-scrolling.
vim.opt.sidescrolloff = 8
-- Do not wrap long lines by default.
vim.opt.wrap = false
-- Preserve indentation on wrapped lines when wrapping is enabled locally.
vim.opt.breakindent = true
-- Hide end-of-buffer tildes for a cleaner look.
vim.opt.fillchars = { eob = " " }
-- Folds stay off. Tree-sitter still sets foldmethod/foldexpr per buffer, so
-- `setlocal foldenable` is all it takes to use them in a specific buffer. This
-- used to be guarded by a FileType autocmd that disabled folds on dashboard
-- buffers, which was redundant given the global default.
vim.opt.foldenable = false

-- Open horizontal splits below the current window.
vim.opt.splitbelow = true
-- Open vertical splits to the right of the current window.
vim.opt.splitright = true
-- Keep swap files. Neovim does not create them for buffers without a file
-- (terminals, quickfix, plugin buffers), so this costs nothing in normal use
-- but leaves a recovery file to inspect after a crash. With 'backup' and
-- 'writebackup' off there was previously nothing to recover from.
vim.opt.swapfile = true
-- Disable backup files.
vim.opt.backup = false
-- Disable writebackup files.
vim.opt.writebackup = false
-- Enable persistent undo across sessions.
vim.opt.undofile = true
-- Reduce mapped-sequence wait time.
vim.opt.timeoutlen = 300
-- Faster CursorHold-style updates for plugins and diagnostics.
vim.opt.updatetime = 500
-- Enable truecolor in supported terminals.
vim.opt.termguicolors = true

-- Expand tabs into spaces.
vim.opt.expandtab = true
-- Use two spaces for each indentation level.
vim.opt.shiftwidth = 2

-- Allow the terminal/window title to be updated.
vim.opt.title = true
-- Default title text; autocmds.lua updates this when the cwd changes.
vim.opt.titlestring = "%t"

vim.api.nvim_create_user_command("ReloadConfig", function()
  require("config.utils").ReloadConfig()
end, {})

vim.filetype.add({
  extension = {
    env = "dotenv",
  },
  filename = {
    [".env"] = "dotenv",
    ["env"] = "dotenv",
  },
  pattern = {
    ["[jt]sconfig.*.json"] = "jsonc",
    ["%.env%.[%w_.-]+"] = "dotenv",
  },
})
