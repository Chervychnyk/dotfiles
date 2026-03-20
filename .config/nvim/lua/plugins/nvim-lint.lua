return {
  "mfussenegger/nvim-lint",
  event = { "BufReadPre", "BufNewFile" },
  config = function()
    local lint = require("lint")
    local docker = require("util.docker")

    local rubocop = lint.linters.rubocop

    -- Custom rubocop linter configuration
    lint.linters.rubocop = function()
      local current_file = vim.api.nvim_buf_get_name(0)
      local root = vim.fn.getcwd()

      local has_docker, service = docker.detect(root)

      local cmd = "bundle"
      local args = {
        "exec",
        "rubocop",
        '--format',
        'json',
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
          '--format',
          'json',
          function() return string.sub(current_file, #root + 2) end,
        }
      end

      return {
        cmd = cmd,
        args = args,
        stdin = true,
        ignore_exitcode = true,
        parser = rubocop.parser
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

    -- Create an autocmd to trigger linting
    vim.api.nvim_create_autocmd({ "BufWritePost", "BufReadPost" }, {
      callback = function()
        lint.try_lint()
      end,
    })
  end,
}
