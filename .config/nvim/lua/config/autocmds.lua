local augroup = vim.api.nvim_create_augroup
local autocmd = vim.api.nvim_create_autocmd

-- Close helper/utility windows with `q`
autocmd("FileType", {
  group = augroup("close_with_q", { clear = true }),
  pattern = {
    "qf",
    "help",
    "man",
    "lspinfo",
    "DressingSelect",
    "Trouble",
    "trouble",
    "query",
    "checkhealth",
    "spectre_panel",
    "startuptime",
    "neotest-output",
    "neotest-summary",
  },
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
  group = augroup("checktime", { clear = true }),
  callback = function()
    if vim.fn.mode() ~= "c" then
      vim.cmd("checktime")
    end
  end,
})

-- Keep terminal/window title aligned with current working directory
local function update_title()
  local cwd = vim.fn.getcwd()
  vim.opt.titlestring = vim.fn.fnamemodify(cwd, ":t")
end

autocmd({ "VimEnter", "BufEnter", "DirChanged" }, {
  group = augroup("title", { clear = true }),
  callback = update_title,
})

-- Highlight on yank
autocmd("TextYankPost", {
  group = augroup("yank_highlight", { clear = true }),
  callback = function()
    vim.highlight.on_yank()
  end,
})

-- Disable folds on dashboards/startup screens
autocmd("FileType", {
  group = augroup("startup_no_folds", { clear = true }),
  pattern = { "alpha", "snacks_dashboard" },
  callback = function()
    vim.opt_local.foldenable = false
  end,
})

-- Writing-friendly buffers
autocmd("FileType", {
  group = augroup("writing", { clear = true }),
  pattern = { "gitcommit", "markdown", "NeogitCommitMessage" },
  callback = function()
    vim.opt_local.wrap = true
    vim.opt_local.spell = true
  end,
})

-- Explicit custom extension mapping
autocmd({ "BufRead", "BufNewFile" }, {
  group = augroup("wpy_filetype", { clear = true }),
  pattern = "*.wpy",
  callback = function()
    vim.bo.filetype = "vue"
  end,
})
