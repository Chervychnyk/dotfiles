local docker = require("util.docker")

-- Root markers identifying a project, most specific first. Anything past ".git"
-- is only a fallback so that a repo without a compose file still resolves.
local function project_root(bufnr)
  return vim.fs.root(bufnr, { "docker-compose.yml", "docker-compose.yaml", "Dockerfile", ".git" })
    or vim.fn.getcwd()
end

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
  config = function()
    local conform = require("conform")
    local util = require("conform.util")

    conform.setup({
      formatters_by_ft = {
        javascript = { "eslint", "prettier" },
        typescript = { "eslint", "prettier" },
        javascriptreact = { "eslint", "prettier" },
        typescriptreact = { "eslint", "prettier" },
        vue = { "eslint", "prettier" },
        python = { "ruff_format" },
        eruby = { "erb_lint" },
        elixir = { "mix" },
        -- Resolved per buffer, not per session. Deciding once at config time
        -- meant whichever project happened to be open first decided the
        -- formatter for every other project in the session.
        ruby = function(bufnr)
          local has_docker = docker.detect(project_root(bufnr))
          return has_docker and { "docked_rubocop" } or { "rubocop" }
        end,
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
          -- The service name belongs to the buffer's own project, so it has to
          -- be resolved per run rather than captured at startup.
          args = function(_, ctx)
            local _, service = docker.detect(project_root(ctx.bufnr))
            return {
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
            }
          end,
          cwd = util.root_file({
            "Dockerfile",
            "docker-compose.yml",
            "docker-compose.yaml",
          }),
          exit_codes = { 0, 1 },
        },
      },
      format_on_save = function(bufnr)
        if vim.bo[bufnr].buftype ~= "" then
          return nil
        end

        return { timeout_ms = 3000, lsp_format = "fallback" }
      end,
    })
  end,
}
