return {
  "nvimtools/none-ls.nvim",
  opts = function()
    local null_ls = require "null-ls"
    local formatting = null_ls.builtins.formatting
    local diagnostics = null_ls.builtins.diagnostics

    return {
      debug = false,
      sources = {
        formatting.mix,
        formatting.prettier.with({ extra_args = { "--no-semi", "--single-quote", "--jsx-single-quote" } }),
        -- formatting.eslint,
        formatting.rubocop,

        -- diagnostics.eslint,
        diagnostics.commitlint,
        diagnostics.rubocop
      },
    }
  end
}
