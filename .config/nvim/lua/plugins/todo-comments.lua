return {
  "folke/todo-comments.nvim",
  event = { "BufReadPre", "BufNewFile" },
  dependencies = { "nvim-lua/plenary.nvim" },
  keys = {
    {
      "<leader>fT",
      function()
        -- Search exactly what jump_next/jump_prev will jump to. The plugin's
        -- own keyword config is the source of truth; a hardcoded list here
        -- drifted from it, so the picker could find comments that jumping
        -- skipped and vice versa.
        Snacks.picker.todo_comments({
          keywords = vim.tbl_keys(require("todo-comments.config").keywords),
        })
      end,
      desc = "Todo/Fix/Fixme",
    },
  },
  config = function()
    local todo_comments = require("todo-comments")

    vim.keymap.set("n", "]t", function()
      todo_comments.jump_next()
    end, { desc = "Next todo comment" })

    vim.keymap.set("n", "[t", function()
      todo_comments.jump_prev()
    end, { desc = "Previous todo comment" })

    todo_comments.setup()
  end
}
