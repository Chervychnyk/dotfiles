local autocmd = vim.api.nvim_create_autocmd

local function augroup(name)
  return vim.api.nvim_create_augroup("config_" .. name, { clear = true })
end

-- Close helper/utility windows with `q`
autocmd("FileType", {
  group = augroup("close_with_q"),
  pattern = {
    "qf",
    "help",
    "man",
    "lspinfo",
    "query",
    "checkhealth",
    "startuptime",
  },
  desc = "Make helper windows easy to close",
  callback = function(args)
    vim.bo[args.buf].buflisted = false
    vim.keymap.set("n", "q", "<cmd>close<cr>", {
      buffer = args.buf,
      silent = true,
      nowait = true,
      desc = "Close window",
    })
  end,
})

-- Reload externally changed files.
-- BufEnter is deliberately absent: it made every buffer switch stat() the file,
-- and FocusGained already covers the case that matters -- a file changed while
-- you were in another application. TermClose/TermLeave cover leaving a pane.
autocmd({ "FocusGained", "TermClose", "TermLeave" }, {
  group = augroup("checktime"),
  desc = "Check for file changes on disk",
  callback = function()
    if vim.fn.mode() ~= "c" then
      vim.cmd.checktime()
    end
  end,
})

-- Keep the terminal/window title aligned with the current working directory
local function update_title()
  vim.opt.titlestring = vim.fn.fnamemodify(vim.uv.cwd() or vim.fn.getcwd(), ":t")
end

autocmd({ "VimEnter", "DirChanged" }, {
  group = augroup("title"),
  desc = "Refresh window title",
  callback = update_title,
})

-- Highlight on yank
autocmd("TextYankPost", {
  group = augroup("yank_highlight"),
  desc = "Highlight yanked text",
  callback = function()
    vim.hl.on_yank()
  end,
})

-- Writing-friendly buffers
autocmd("FileType", {
  group = augroup("writing"),
  pattern = { "gitcommit", "markdown", "NeogitCommitMessage" },
  desc = "Enable wrapping and spellcheck for prose",
  callback = function()
    vim.opt_local.wrap = true
    vim.opt_local.spell = true
  end,
})

-- Explicit custom extension mapping
autocmd({ "BufRead", "BufNewFile" }, {
  group = augroup("wpy_filetype"),
  pattern = "*.wpy",
  desc = "Treat WPy files as Vue",
  callback = function(args)
    vim.bo[args.buf].filetype = "vue"
  end,
})
