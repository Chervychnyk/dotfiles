local augroup = vim.api.nvim_create_augroup
local autocmd = vim.api.nvim_create_autocmd

autocmd({ "FileType" }, {
  pattern = {
    "netrw",
    "qf",
    "git",
    "help",
    "man",
    "lspinfo",
    "DressingSelect",
    "Trouble",
    "query",
    "",
  },
  callback = function()
    vim.cmd [[
      nnoremap <silent> <buffer> q :close<CR>
      set nobuflisted
    ]]
  end,
})

autocmd({ "BufWinEnter" }, {
  pattern = { "*" },
  callback = function()
    vim.cmd "checktime"
  end,
})

autocmd({ "BufWinEnter" }, {
  pattern = { "*" },
  callback = function()
    local dirname = vim.fn.getcwd():match "([^/]+)$"
    vim.opt.titlestring = dirname
  end,
})

autocmd({ "TextYankPost" }, {
  callback = function()
    vim.highlight.on_yank { higroup = "Visual", timeout = 40 }
  end,
})

autocmd({ "FileType" }, {
  desc = "Disable folding in alpha buffers",
  group = augroup("alpha", { clear = true }),
  pattern = { "alpha" },
  callback = function()
    vim.opt_local.nofoldenable = true
  end
})

autocmd({ "FileType" }, {
  pattern = { "gitcommit", "markdown", "NeogitCommitMessage" },
  callback = function()
    vim.opt_local.wrap = true
    vim.opt_local.spell = true
  end,
})

autocmd({ "BufRead", "BufNewFile" }, {
  pattern = "*.wpy",
  callback = function()
    vim.cmd("setfiletype vue")
  end
})
