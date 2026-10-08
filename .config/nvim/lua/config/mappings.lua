local map = require("config.utils").map

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

-- Navigate buffers
map("n", "<leader>bn", ":bn<cr>", { desc = "Next buffer" })
map("n", "<leader>bp", ":bp<cr>", { desc = "Previous buffer" })

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

-- Pane movement and resizing are not mapped here: <C-h/j/k/l> and
-- <C-A-h/j/k/l> belong to smart-splits.nvim, which crosses from Neovim splits
-- into herdr panes. See lua/plugins/smart-splits.lua.

map("t", "<leader><Esc>", "<C-\\><C-n>")

-- Stay in indent mode
-- Visual --
map("v", "<", "<gv")
map("v", ">", ">gv")

-- Move text up and down
-- Normal
map("n", "<leader>mj", "<Esc>:m .+1<CR>==gi", { desc = "Move line down" })
map("n", "<leader>mk", "<Esc>:m .-2<CR>==gi", { desc = "Move line up" })
-- Visual --
map("v", "<A-j>", ":m .+1<CR>==")
map("v", "<A-k>", ":m .-2<CR>==")
-- Visual Block --
map("x", "J", ":move '>+1<CR>gv-gv", { silent = true })
map("x", "K", ":move '<-2<CR>gv-gv", { silent = true })
map("x", "<A-j>", ":move '>+1<CR>gv-gv", { silent = true })
map("x", "<A-k>", ":move '<-2<CR>gv-gv", { silent = true })

map("n", "<leader>nh", "<cmd>nohlsearch<CR>", { desc = "No Highlight", silent = true })
map("n", "<leader>uu", "<cmd>packadd nvim.undotree | Undotree<CR>", { desc = "Show undo tree", silent = true })
