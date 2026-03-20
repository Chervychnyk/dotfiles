local docker = require("util.docker")

return {
  "stevearc/conform.nvim",
  event = { "BufReadPre", "BufNewFile" },
  keys = {
    {
      "<leader>lf",
      function()
        require("conform").format({ async = true, lsp_format = "fallback" })
      end,
      desc = "Format buffer",
    },
  },
  opts = {
  },
  config = function()
    local util = require("conform.util")

    local has_docker, service = docker.detect()

    require("conform").setup({
      formatters_by_ft = {
        javascript = { "eslint", "prettier" },
        typescript = { "eslint", "prettier" },
        javascriptreact = { "eslint", "prettier" },
        typescriptreact = { "eslint", "prettier" },
        vue = { "eslint", "prettier" },
        python = { "black" },
        ruby = has_docker and { "docked_rubocop" } or { "rubocop" },
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
        docked_rubocop = {
          command = "docker",
          args = {
            "compose",
            "run",
            "--rm",
            service,
            "bundle",
            "exec",
            "rubocop",
            "--server",
            "-a",
            "-f",
            "quiet",
            "--stderr",
            "--stdin",
            "$RELATIVE_FILEPATH",
          },
          cwd = util.root_file({
            "Dockerfile",
            "docker-compose.yml"
          }),
          exit_codes = { 0, 1 },
        }
      },
    })
  end,
}
