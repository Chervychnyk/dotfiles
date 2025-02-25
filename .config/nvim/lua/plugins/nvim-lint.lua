return {
  "mfussenegger/nvim-lint",
  event = { "BufReadPre", "BufNewFile" },
  config = function()
    local lint = require("lint")

    -- Check for docker-compose files and get the first one that exists
    local function get_docker_compose_file()
      local root = vim.fn.getcwd()
      local compose_files = {
        "/docker-compose.yml",
        "/docker-compose.yaml",
      }

      for _, file in ipairs(compose_files) do
        if vim.fn.filereadable(root .. file) == 1 then
          return root .. file
        end
      end
      return nil
    end

    -- Get Rails service name from docker-compose file
    local function get_rails_service_name()
      local compose_file = get_docker_compose_file()
      if not compose_file then return nil end

      local handle = io.open(compose_file, "r")
      if not handle then return "rails" end

      local content = handle:read("*a")
      handle:close()

      -- Check for common service names in order of preference
      local service_patterns = {
        "%s*rails:", -- rails service
        "%s*app:",   -- app service
        "%s*web:",   -- web service
      }

      for _, pattern in ipairs(service_patterns) do
        if content:match(pattern) then
          return pattern:match("%%s%*(.+):")
        end
      end

      return "rails" -- Default to 'rails' if no matching service found
    end

    local rubocop = lint.linters.rubocop

    -- Custom rubocop linter configuration
    lint.linters.rubocop = function()
      local current_file = vim.api.nvim_buf_get_name(0)
      local root = vim.fn.getcwd()

      local cmd = "bundle"
      local args = {
        "exec",
        "rubocop",
        '--format',
        'json',
        current_file,
      }

      if get_docker_compose_file() then
        cmd = "docker"
        local service_name = get_rails_service_name()
        args = {
          "compose",
          "run",
          "--no-deps",
          "--rm",
          service_name,
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
