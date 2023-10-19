return {
  {
    "nvim-treesitter/nvim-treesitter",
    build = ":TSUpdate",
    event = "VeryLazy",
    cmd = { "TSUpdateSync", "TSUpdate", "TSInstall" },
    opts = {
      ensure_installed = {
        "bash", "css", "dockerfile", "eex", "elixir", "erlang",
        "go", "html", "javascript", "json", "lua", "markdown",
        "proto", "ruby", "scss", "typescript", "vue", "yaml"
      },
      sync_install = false,
      highlight = {
        enable = true,
        additional_vim_regex_highlighting = false,
      },
      context_commentstring = {
        enable = true,
        enable_autocmd = false,
      },
      rainbow = {
        enable = true,
        disable = { "html" },
        extended_mode = false,
        max_file_lines = nil,
      },
      autopairs = { enable = true },
      autotag = { enable = true },
      incremental_selection = { enable = true },
      indent = { enable = true, disable = { "css" } },

    }
  },

  {
    "nvim-treesitter/nvim-treesitter-context",
    enabled = true,
    opts = { mode = "cursor" },
  },

}
