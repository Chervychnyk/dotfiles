return {
  "folke/trouble.nvim",
  dependencies = {
    "nvim-tree/nvim-web-devicons",
    "folke/todo-comments.nvim"
  },
  cmd = "Trouble",
  keys = {
    { "<leader>xx", "<cmd>Trouble diagnostics toggle<CR>",                     desc = "Diagnostics (Trouble)" },
    { "<leader>xb", "<cmd>Trouble diagnostics toggle filter.buf=0<CR>",        desc = "Buffer Diagnostics (Trouble)" },
    { "<leader>xq", "<cmd>Trouble qflist toggle<CR>",                          desc = "Quickfix List (Trouble)" },
    { "<leader>xl", "<cmd>Trouble loclist toggle<<CR>",                        desc = "Location List (Trouble)" },
    { "<leader>xt", "<cmd>Trouble todo filter = {tag = {TODO,FIX,FIXME}}<CR>", desc = "Project Todos (Trouble)" },
  },
}
