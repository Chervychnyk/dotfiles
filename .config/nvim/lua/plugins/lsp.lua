return {
  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },
    config = function()
      local lspconfig = require "lspconfig"

      require("config.lsp.handlers").setup()

      local servers = {
        "dockerls",
        "docker_compose_language_service",
        "elixirls",
        -- "gitlab_ci_ls",
        "jsonls",
        "lua_ls",
        "ruby_lsp",
        "tsserver",
        "volar",
      }

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
