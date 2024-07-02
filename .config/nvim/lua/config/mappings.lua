local map = require('config.utils').map

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

-- Window management
map("n", "<leader>sv", "<C-w>v", { desc = "Split window vertically" })                   -- split window vertically
map("n", "<leader>sh", "<C-w>s", { desc = "Split window horizontally" })                 -- split window horizontally
map("n", "<leader>se", "<C-w>=", { desc = "Make splits equal size" })                    -- make split windows equal width & height
map("n", "<leader>sx", "<cmd>close<CR>", { desc = "Close current split" })               -- close current split window

map("n", "<leader>to", "<cmd>tabnew<CR>", { desc = "Open new tab" })                     -- open new tab
map("n", "<leader>tx", "<cmd>tabclose<CR>", { desc = "Close current tab" })              -- close current tab
map("n", "<leader>tn", "<cmd>tabn<CR>", { desc = "Go to next tab" })                     --  go to next tab
map("n", "<leader>tp", "<cmd>tabp<CR>", { desc = "Go to previous tab" })                 --  go to previous tab
map("n", "<leader>tf", "<cmd>tabnew %<CR>", { desc = "Open current buffer in new tab" }) --  move current buffer to new tab

-- Switch between windows
map("n", "<C-h>", "<C-w>h", { desc = "Move window left" })
map("n", "<C-l>", "<C-w>l", { desc = "Move window right" })
map("n", "<C-j>", "<C-w>j", { desc = "Move window down" })
map("n", "<C-k>", "<C-w>k", { desc = "Move window up" })

-- Resize with vim navigation
map("n", "<C-A-k>", ":resize -2<CR>", { silent = true })
map("n", "<C-A-j>", ":resize +2<CR>", { silent = true })
map("n", "<C-A-l>", ":vertical resize -2<CR>", { silent = true })
map("n", "<C-A-h>", ":vertical resize +2<CR>", { silent = true })

-- Navigate buffers
map("n", "<S-l>", ":bnext<CR>", { silent = true })
map("n", "<S-h>", ":bprevious<CR>", { silent = true })

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
map("x", "J", ":move '>+1<CR>gv-gv", { silent = true })
map("x", "K", ":move '<-2<CR>gv-gv", { silent = true })
map("x", "<A-j>", ":move '>+1<CR>gv-gv", { silent = true })
map("x", "<A-k>", ":move '<-2<CR>gv-gv", { silent = true })
