return {
  {
    "nvim-treesitter/nvim-treesitter",
    build = ":TSUpdate",
    event = { "BufReadPost", "BufNewFile" },
    opts = {
      ensure_installed = {
        "bash", "css", "dockerfile", "eex", "elixir", "erlang",
        "go", "html", "javascript", "json", "lua", "markdown",
        "proto", "ruby", "scss", "typescript", "vue", "yaml"
      },
      sync_install = false,
      highlight = {
        enable = true,
        disable = function(_, bufnr) return vim.b[bufnr].large_buf end,
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
    },
    config = function(_, opts)
      require("nvim-treesitter.configs").setup(opts)
    end
  },

  {
    "nvim-treesitter/nvim-treesitter-context",
    enabled = true,
    opts = { mode = "cursor" },
  },

}
