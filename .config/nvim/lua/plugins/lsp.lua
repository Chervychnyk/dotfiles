return {
  {
    "neovim/nvim-lspconfig",
    dependencies = {
      {
        "williamboman/mason-lspconfig.nvim",
        cmd = { "LspInstall", "LspUninstall" },
        opts = {
          ensure_installed = { "elixirls", "jsonls", "lua_ls", "tsserver", "volar" },
        },
        config = function(_, opts)
          local mason_lspconfig = require "mason-lspconfig"

          mason_lspconfig.setup(opts)

          mason_lspconfig.setup_handlers({
            -- The first entry (without a key) will be the default handler
            -- and will be called for each installed server that doesn't have
            -- a dedicated handler.
            function(server_name) -- default handler (optional)
              local server_opts = {
                on_attach = require("user.lsp.handlers").on_attach,
                capabilities = require("user.lsp.handlers").capabilities,
              }
              local has_custom_opts, server_custom_opts = pcall(require, "user.lsp.settings." .. server_name)
              if has_custom_opts then
                server_opts = vim.tbl_deep_extend("force", server_opts, server_custom_opts)
              end
              require("lspconfig")[server_name].setup(server_opts)
            end,
          })
        end
      },
    },
    config = function()
      require("user.lsp.handlers").setup()
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
