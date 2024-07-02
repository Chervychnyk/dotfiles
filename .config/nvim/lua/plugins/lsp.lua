return {
  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },
    dependencies = {
      "williamboman/mason.nvim",
      "williamboman/mason-lspconfig.nvim",
    },
    config = function()
      require("config.lsp.handlers").setup()

      require("mason").setup({
        ui = {
          icons = {
            package_installed = "✓",
            package_uninstalled = "✗",
            package_pending = "⟳",
          },
        },
      })

      local servers = {
        "basedpyright",
        "cssls",
        "dockerls",
        "docker_compose_language_service",
        "elixirls",
        "emmet_ls",
        -- "gitlab_ci_ls",
        "jsonls",
        "lemminx",
        -- "lexical",
        "lua_ls",
        "marksman",
        "ruby_lsp",
        "tsserver",
        "volar",
      }


      require("mason-lspconfig").setup({
        ensure_installed = servers
      })

      local lspconfig = require "lspconfig"

      for _, server in pairs(servers) do
        local server_opts = {
          on_attach = require("config.lsp.handlers").on_attach,
          capabilities = require("config.lsp.handlers").capabilities(),
        }

        local has_custom_opts, server_custom_opts = pcall(require, "config.lsp.settings." .. server)
        if has_custom_opts then
          server_opts = vim.tbl_deep_extend("force", server_opts, server_custom_opts)
        end

        lspconfig[server].setup(server_opts)
      end
    end
  }
}
