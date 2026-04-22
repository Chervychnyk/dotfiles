return {
  "mfussenegger/nvim-lint",
  event = { "BufReadPre", "BufNewFile" },
  config = function()
    local lint = require("lint")
    local docker = require("util.docker")
    local augroup = vim.api.nvim_create_augroup("config_lint", { clear = true })

    local rubocop = lint.linters.rubocop

    -- Run RuboCop either on the host or through docker compose, depending on project layout.
    lint.linters.rubocop = function()
      local current_file = vim.api.nvim_buf_get_name(0)
      local root = vim.fs.root(current_file, { "Gemfile", ".git", "docker-compose.yml", "docker-compose.yaml" })
        or vim.fn.getcwd()

      local has_docker, service = docker.detect(root)

      local cmd = "bundle"
      local args = {
        "exec",
        "rubocop",
        "--format",
        "json",
        current_file,
      }

      if has_docker then
        cmd = "docker"
        args = {
          "compose",
          "run",
          "--no-deps",
          "--rm",
          service,
          "bundle",
          "exec",
          "rubocop",
          "--format",
          "json",
          function()
            return vim.fs.relpath(root, current_file) or current_file
          end,
        }
      end

      return {
        cmd = cmd,
        args = args,
        stdin = false,
        ignore_exitcode = true,
        parser = rubocop.parser,
      }
    end

    lint.linters_by_ft = {
      javascript = { "eslint" },
      typescript = { "eslint" },
      javascriptreact = { "eslint" },
      typescriptreact = { "eslint" },
      vue = { "eslint" },
      eruby = { "erb_lint" },
      ruby = { "rubocop" },
      python = { "ruff" },
    }

    vim.api.nvim_create_autocmd({ "BufReadPost", "BufWritePost", "InsertLeave" }, {
      group = augroup,
      desc = "Run configured linters for the current buffer",
      callback = function(args)
        lint.try_lint(nil, { bufnr = args.buf })
      end,
    })
  end,
}
