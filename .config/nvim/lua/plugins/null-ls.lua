return {
  "nvimtools/none-ls.nvim",
  dependencies = {
    "nvimtools/none-ls-extras.nvim",
  },
  event = { "BufReadPre", "BufNewFile" },
  opts = function()
    local null_ls = require "null-ls"
    local formatting = null_ls.builtins.formatting
    local diagnostics = null_ls.builtins.diagnostics

    -- local augroup = vim.api.nvim_create_augroup("LspFormatting", {})

    return {
      debug = false,
      sources = {
        require("none-ls.formatting.eslint"),
        formatting.black,
        formatting.erb_lint,
        formatting.mix,
        formatting.prettier.with({ extra_args = { "--no-semi", "--single-quote", "--jsx-single-quote" } }),
        formatting.rubocop,

        require("none-ls.diagnostics.eslint"),
        diagnostics.erb_lint,
        diagnostics.commitlint,
        diagnostics.rubocop,
        diagnostics.ruff
      },
      on_attach = function(client, bufnr)
        -- if client.supports_method("textDocument/formatting") then
        --   vim.api.nvim_clear_autocmds({ group = augroup, buffer = bufnr })
        --   vim.api.nvim_create_autocmd("BufWritePre", {
        --     group = augroup,
        --     buffer = bufnr,
        --     callback = function()
        --       vim.lsp.buf.format({ bufnr = bufnr })
        --     end
        --   })
        -- end
      end
    }
  end
}
