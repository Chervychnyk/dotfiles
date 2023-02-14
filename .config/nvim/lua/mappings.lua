local map = require('user.utils').map

--- Map leader to space
vim.g.mapleader = ","
vim.g.maplocalleader = ","

-- Modes
--   normal_mode = "n",
--   insert_mode = "i",
--   visual_mode = "v",
--   visual_block_mode = "x",
--   term_mode = "t",
--   command_mode = "c",

-- Switch between windows
map("n", "<C-h>", "<C-w>h", { desc = " window left" })
map("n", "<C-l>", "<C-w>l", { desc = " window right" })
map("n", "<C-j>", "<C-w>j", { desc = " window down" })
map("n", "<C-k>", "<C-w>k", { desc = " window up" })

-- Resize with arrows
map("n", "<A-Up>", ":resize -2<CR>")
map("n", "<A-Down>", ":resize +2<CR>")
map("n", "<A-Left>", ":vertical resize -2<CR>")
map("n", "<A-Right>", ":vertical resize +2<CR>")

-- Navigate buffers
map("n", "<S-l>", ":bnext<CR>")
map("n", "<S-h>", ":bprevious<CR>")

-- Stay in indent mode
-- Visual --
map("v", "<", "<gv")
map("v", ">", ">gv")

-- Move text up and down
-- Normal
map("n", "<A-j>", "<Esc>:m .+1<CR>==gi")
map("n", "<A-k>", "<Esc>:m .-2<CR>==gi")
-- Visual --
map("v", "<A-j>", ":m .+1<CR>==")
map("v", "<A-k>", ":m .-2<CR>==")
-- Visual Block --
map("x", "J", ":move '>+1<CR>gv-gv")
map("x", "K", ":move '<-2<CR>gv-gv")
map("x", "<A-j>", ":move '>+1<CR>gv-gv")
map("x", "<A-k>", ":move '<-2<CR>gv-gv")
