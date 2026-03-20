return {
  "kristijanhusak/vim-dadbod-ui",
  dependencies = {
    { "tpope/vim-dadbod", lazy = true },
    { "kristijanhusak/vim-dadbod-completion", ft = { "sql", "mysql", "plsql" }, lazy = true },
  },
  cmd = { "DBUI", "DBUIToggle", "DBUIAddConnection", "DBUIFindBuffer" },
  keys = {
    { "<leader>du", "<cmd>DBUIToggle<cr>", desc = "Toggle DBUI" },
    { "<leader>df", "<cmd>DBUIFindBuffer<cr>", desc = "Find DBUI buffer" },
    { "<leader>dr", "<cmd>DBUIRenameBuffer<cr>", desc = "Rename DBUI buffer" },
    { "<leader>dl", "<cmd>DBUILastQueryInfo<cr>", desc = "Last query info" },
  },
  init = function()
    -- DBUI configuration
    vim.g.db_ui_use_nerd_fonts = 1
    vim.g.db_ui_show_database_icon = 1
    vim.g.db_ui_force_echo_notifications = 1
    vim.g.db_ui_win_position = "left"
    vim.g.db_ui_winwidth = 40

    -- Auto-complete setup
    vim.g.db_ui_auto_execute_table_helpers = 1

    -- Save location for queries
    vim.g.db_ui_save_location = vim.fn.stdpath("data") .. "/db_ui_queries"

    -- Default table helpers
    vim.g.db_ui_table_helpers = {
      postgresql = {
        Count = "select count(*) from {table}",
        Describe = "\\d+ {table}",
      },
      mysql = {
        Count = "select count(*) from {table}",
        Describe = "describe {table}",
      },
    }
  end
}
