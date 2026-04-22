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
    "DressingSelect",
    "query",
    "checkhealth",
    "spectre_panel",
    "startuptime",
    "neotest-output",
    "neotest-summary",
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

-- Reload externally changed files
autocmd({ "FocusGained", "TermClose", "TermLeave", "BufEnter" }, {
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

-- Disable folds on dashboards/startup screens
autocmd("FileType", {
  group = augroup("startup_no_folds"),
  pattern = { "alpha", "snacks_dashboard" },
  desc = "Disable folds on startup buffers",
  callback = function()
    vim.opt_local.foldenable = false
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
