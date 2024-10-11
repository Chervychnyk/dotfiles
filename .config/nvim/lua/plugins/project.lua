return {
  "ahmedkhalf/project.nvim",
  event = "VeryLazy",
  opts = {
    active = true,

    on_config_done = nil,

    manual_mode = false,

    detection_methods = { "pattern" },
    patterns = { ".git", ".obsidian", ".svn", "Makefile", "Gemfile", "package.json", ".nvmrc", "mix.exs",
      ".tool-versions", "!=.ruby-lsp", "!^deps", "!^node_modules" },

    show_hidden = false,
    silent_chdir = true,
    scope_chdir = "global",

    ignore_lsp = {},
    exclude_dirs = { "~/.continue" },

    datapath = vim.fn.stdpath("data"),
  },
  config = function(_, opts)
    require("project_nvim").setup(opts)

    local tele_status_ok, telescope = pcall(require, "telescope")
    if not tele_status_ok then
      return
    end

    telescope.load_extension('projects')
  end
}
