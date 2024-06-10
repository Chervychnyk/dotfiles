return {
  "williamboman/mason-lspconfig.nvim",
  dependencies = {
    "williamboman/mason.nvim",
    "nvim-lua/plenary.nvim",
  },
  config = function()
    require("mason").setup({
      ui = {
        icons = {
          package_installed = "✓",
          package_uninstalled = "✗",
          package_pending = "⟳",
        },
      },
    })

    require("mason-lspconfig").setup({
      ensure_installed = {
        "dockerls",
        "docker_compose_language_service",
        "elixirls",
        "gitlab_ci_ls",
        "jsonls",
        "lua_ls",
        "ruby_lsp",
        "tsserver",
        "volar",
      }
    })
  end
}
