return {
  "neovim/nvim-lspconfig",
  dependencies = {
    "williamboman/mason.nvim",
    "williamboman/mason-lspconfig.nvim",
    "WhoIsSethDaniel/mason-tool-installer.nvim",
  },

  event = { "BufReadPre", "BufNewFile" },
  config = function()
    local mason = require("mason")
    local mason_lspconfig = require("mason-lspconfig")
    local mason_tool_installer = require("mason-tool-installer")

    -- enable mason and configure icons
    mason.setup({
      ui = {
        icons = {
          package_installed = "✓",
          package_pending = "➜",
          package_uninstalled = "✗",
        },
      },
    })

    mason_lspconfig.setup({
      -- list of servers for mason to install
      ensure_installed = {
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
        -- "solargraph",
        "ts_ls",
        "volar",
      },
    })

    mason_tool_installer.setup({
      ensure_installed = {
        "prettier", -- prettier formatter
        "stylua",   -- lua formatter
        "black",    -- python formatter
        "ruff",     -- python formatter
        "eslint_d",
      },
    })

    require("config.lsp.handlers").setup()

    local lspconfig = require "lspconfig"

    mason_lspconfig.setup_handlers({
      function(server_name)
        local opts = {
          on_attach = require("config.lsp.handlers").on_attach,
          capabilities = require("config.lsp.handlers").capabilities(),
        }

        local has_custom_opts, server_custom_opts = pcall(require, "config.lsp.settings." .. server_name)
        if has_custom_opts then
          opts = vim.tbl_deep_extend("force", opts, server_custom_opts)
        end

        lspconfig[server_name].setup(opts)
      end,
    })
  end
}
