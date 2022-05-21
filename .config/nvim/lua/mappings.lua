local map = require('user.utils').map

--- Map leader to space
vim.g.mapleader = ","

local s = {silent = true}

-- Modes
--   normal_mode = "n",
--   insert_mode = "i",
--   visual_mode = "v",
--   visual_block_mode = "x",
--   term_mode = "t",
--   command_mode = "c",

-- Move text up and down
-- Normal
map("n", "<A-j>", ":m .+1<CR>==")
map("n", "<A-k>", ":m .-2<CR>==")
--Insert
map("i", "<A-j>", "<Esc>:m .+1<CR>==gi")
map("i", "<A-k>", "<Esc>:m .-2<CR>==gi")
-- Visual --
map("v", "<A-j>", ":m '>+1<CR>gv=gv")
map("v", "<A-k>", ":m '<-2<CR>gv=gv")

-- Telescope
map("n", "<Leader>1", ":Telescope sessions [save_current=true]<CR>")
map("n", "<leader>p", '<cmd>lua require("telescope.builtin").find_files()<cr>')
map("n", "<leader>r", '<cmd>lua require("telescope.builtin").registers()<cr>')
map("n", "<leader>g", '<cmd>lua require("telescope.builtin").live_grep()<cr>')
map("n", "<leader>l", [[<cmd>lua require('telescope.builtin').current_buffer_fuzzy_find()<cr>]], { silent = true })

map("n", "<leader>gc", [[<cmd>lua require('telescope.builtin').git_commits()<cr>]], { silent = true })
map("n", "<leader>gb", [[<cmd>lua require('telescope.builtin').git_branches()<cr>]], { silent = true })

map("n", "<leader>ca", '<cmd>lua require("telescope.builtin").lsp_code_actions()<cr>')
map("n", "<leader>cs", '<cmd>lua require("telescope.builtin").lsp_document_symbols()<cr>')
map("n", "<leader>cd", '<cmd>lua require("telescope.builtin").lsp_document_diagnostics()<cr>')
map("n", "<leader>cr", '<cmd>lua require("telescope.builtin").lsp_references()<cr>')
