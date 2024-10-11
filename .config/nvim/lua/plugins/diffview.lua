return {
  "sindrets/diffview.nvim",
  event = "VeryLazy",
  cmd = { "DiffviewOpen", "DiffviewClose", "DiffviewToggleFiles", "DiffviewFocusFiles" },
  keys = {
    { "<leader>gd", function()
      if vim.t.diffview_view_initialized then
        return vim.cmd.DiffviewClose()
      end

      return vim.cmd.DiffviewOpen()
    end, { silent = true, desc = "Toggle diff" } },
    { "<leader>gh", ":DiffviewFileHistory %<CR>", { silent = true, desc = "Git file history" } },
  }
}
