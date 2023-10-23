return {
  {
    "neovim/nvim-lspconfig",
    dependencies = {
      {
        {
          "williamboman/mason.nvim",
          cmd = {
            "Mason",
            "MasonInstall",
            "MasonUninstall",
            "MasonUninstallAll",
            "MasonLog",
          },
          build = ":MasonUpdate",
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
          end
        },

        {
          "williamboman/mason-lspconfig.nvim",
          cmd = { "LspInstall", "LspUninstall" },
          config = function()
            require("mason-lspconfig").setup({
              ensure_installed = { "elixirls", "jsonls", "lua_ls", "tsserver", "volar" }
            })
          end
        },
      }
    },
    config = function()
      local lspconfig = require "lspconfig"

      require("user.lsp.handlers").setup()

      local servers = { "elixirls", "jsonls", "lexical", "lua_ls", "tsserver", "volar" }

      for _, server in pairs(servers) do
        local server_opts = {
          on_attach = require("user.lsp.handlers").on_attach,
          capabilities = require("user.lsp.handlers").capabilities(),
        }

        local has_custom_opts, server_custom_opts = pcall(require, "user.lsp.settings." .. server)
        if has_custom_opts then
          server_opts = vim.tbl_deep_extend("force", server_opts, server_custom_opts)
        end

        lspconfig[server].setup(server_opts)
      end
    end
  },
  {
    "nvimtools/none-ls.nvim",
    opts = function()
      local null_ls = require "null-ls"
      local formatting = null_ls.builtins.formatting
      -- https://github.com/jose-elias-alvarez/null-ls.nvim/tree/main/lua/null-ls/builtins/diagnostics
      local diagnostics = null_ls.builtins.diagnostics

      return {
        debug = false,
        sources = {
          -- formatting.prettier.with({ extra_args = { "--no-semi", "--single-quote", "--jsx-single-quote" } }),
          formatting.eslint,
          formatting.rubocop,

          diagnostics.eslint,
          diagnostics.rubocop
        },
      }
    end
  },
}
