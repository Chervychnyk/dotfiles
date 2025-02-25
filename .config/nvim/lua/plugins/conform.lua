return {
  "stevearc/conform.nvim",
  event = { "BufReadPre", "BufNewFile" },
  keys = {
    {
      "<leader>lf",
      function()
        require("conform").format({ async = true, lsp_format = "fallback" })
      end,
      mode = "",
      desc = "Format buffer",
    },
  },
  opts = {
  },
  config = function()
    local util = require("conform.util")

    require("conform").setup({
      formatters_by_ft = {
        javascript = { "eslint", "prettier" },
        typescript = { "eslint", "prettier" },
        javascriptreact = { "eslint", "prettier" },
        typescriptreact = { "eslint", "prettier" },
        vue = { "eslint", "prettier" },
        python = { "black" },
        ruby = { "rubocop" },
        eruby = { "erb_lint" },
        elixir = { "mix" },
      },
      formatters = {
        eslint = {
          command = util.from_node_modules("eslint"),
          args = { "--fix", "$FILENAME" },
          cwd = util.root_file({
            "package.json",
          }),
        },
        prettier = {
          prepend_args = { "--no-semi", "--single-quote", "--jsx-single-quote" },
        },
        rubocop = {
          command = "rubocop",
          args = {
            "-a",
            "-f",
            "quiet",
            "--stderr",
            "--stdin",
            "$FILENAME",
          },
          exit_codes = { 0, 1 },
        }
      },
    })
  end,
}
