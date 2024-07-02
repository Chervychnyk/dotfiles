return {
  "nvimtools/none-ls.nvim",
  dependencies = {
    "nvimtools/none-ls-extras.nvim",
  },
  opts = function()
    local null_ls = require "null-ls"
    local formatting = null_ls.builtins.formatting
    local diagnostics = null_ls.builtins.diagnostics

    return {
      debug = false,
      sources = {
        require("none-ls.formatting.eslint"),
        formatting.erb_lint,
        formatting.mix,
        formatting.prettier.with({ extra_args = { "--no-semi", "--single-quote", "--jsx-single-quote" } }),
        formatting.rubocop,

        require("none-ls.diagnostics.eslint"),
        diagnostics.erb_lint,
        diagnostics.commitlint,
        diagnostics.rubocop
      },
    }
  end
}
