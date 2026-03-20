return {
  "nvim-neotest/neotest",
  dependencies = {
    "nvim-neotest/nvim-nio",
    "nvim-lua/plenary.nvim",
    "nvim-treesitter/nvim-treesitter",
    "olimorris/neotest-rspec",
    "nvim-neotest/neotest-jest",
    "marilari88/neotest-vitest",
    "nvim-neotest/neotest-python",
  },
  keys = {
    { "<leader>tr", function() require("neotest").run.run() end,                     desc = "Run nearest test" },
    { "<leader>tf", function() require("neotest").run.run(vim.fn.expand("%")) end,   desc = "Run current file" },
    { "<leader>tl", function() require("neotest").run.run_last() end,                desc = "Run last test" },
    { "<leader>ts", function() require("neotest").summary.toggle() end,              desc = "Toggle test summary" },
    { "<leader>to", function() require("neotest").output.open({ enter = true }) end, desc = "Open test output" },
    { "<leader>tO", function() require("neotest").output_panel.toggle() end,         desc = "Toggle output panel" },
    { "<leader>tS", function() require("neotest").run.stop() end,                    desc = "Stop test" },
    { "<leader>tw", function() require("neotest").watch.toggle() end,                desc = "Toggle watch" },
    { "<leader>td", function() require("neotest").run.run({ strategy = "dap" }) end, desc = "Debug nearest test" },
  },
  config = function()
    local docker = require("util.docker")
    local has_docker, service = docker.detect()

    -- RSpec adapter with Docker support
    local rspec_opts = {}
    if has_docker then
      rspec_opts = {
        rspec_cmd = function()
          return vim.tbl_flatten({
            "docker",
            "compose",
            "run",
            "--rm",
            service,
            "bundle",
            "exec",
            "rspec",
          })
        end,
        transform_spec_path = function(path)
          -- Transform absolute path to relative path for Docker container
          local root = vim.fn.getcwd()
          return string.gsub(path, "^" .. root .. "/", "")
        end,
      }
    end

    -- Jest/Vitest adapter with Docker support
    local jest_opts = {}
    local vitest_opts = {}

    if has_docker then
      -- Detect if project uses npm or yarn
      local package_manager = "npm"
      if vim.fn.filereadable("yarn.lock") == 1 then
        package_manager = "yarn"
      elseif vim.fn.filereadable("pnpm-lock.yaml") == 1 then
        package_manager = "pnpm"
      end

      jest_opts = {
        jestCommand = function()
          return vim.tbl_flatten({
            "docker",
            "compose",
            "run",
            "--rm",
            service,
            package_manager,
            "test",
            "--",
          })
        end,
        jestConfigFile = function()
          local file = vim.fn.findfile("jest.config.js", vim.fn.getcwd() .. ";")
          if file == "" then
            file = vim.fn.findfile("jest.config.ts", vim.fn.getcwd() .. ";")
          end
          return file
        end,
        cwd = function()
          return vim.fn.getcwd()
        end,
      }

      vitest_opts = {
        vitestCommand = function()
          return vim.tbl_flatten({
            "docker",
            "compose",
            "run",
            "--rm",
            service,
            package_manager,
            "test",
            "--",
          })
        end,
        vitestConfigFile = function()
          local file = vim.fn.findfile("vitest.config.js", vim.fn.getcwd() .. ";")
          if file == "" then
            file = vim.fn.findfile("vitest.config.ts", vim.fn.getcwd() .. ";")
          end
          return file
        end,
        cwd = function()
          return vim.fn.getcwd()
        end,
      }
    end

    -- Python pytest adapter with Docker support
    local python_opts = {}
    if has_docker then
      python_opts = {
        pytest_discover_instances = true,
        args = function()
          return {}
        end,
        python = function()
          -- Run pytest through Docker
          return vim.tbl_flatten({
            "docker",
            "compose",
            "run",
            "--rm",
            service,
            "python",
          })
        end,
      }
    end

    require("neotest").setup({
      adapters = {
        require("neotest-rspec")(rspec_opts),
        require("neotest-jest")(jest_opts),
        require("neotest-vitest")(vitest_opts),
        require("neotest-python")(python_opts),
      },
      discovery = {
        enabled = true,
        concurrent = 1,
      },
      running = {
        concurrent = true,
      },
      summary = {
        animated = true,
        enabled = true,
        expand_errors = true,
        follow = true,
        mappings = {
          attach = "a",
          clear_marked = "M",
          clear_target = "T",
          debug = "d",
          debug_marked = "D",
          expand = { "<CR>", "<2-LeftMouse>" },
          expand_all = "e",
          jumpto = "i",
          mark = "m",
          next_failed = "J",
          output = "o",
          prev_failed = "K",
          run = "r",
          run_marked = "R",
          short = "O",
          stop = "u",
          target = "t",
          watch = "w",
        },
      },
      output = {
        enabled = true,
        open_on_run = "short",
      },
      output_panel = {
        enabled = true,
        open = "botright split | resize 15",
      },
      quickfix = {
        enabled = true,
        open = false,
      },
      status = {
        enabled = true,
        virtual_text = true,
        signs = true,
      },
      strategies = {
        integrated = {
          width = 120,
          height = 40,
        },
      },
      icons = {
        passed = "✓",
        running = "●",
        failed = "✗",
        skipped = "⊘",
        unknown = "?",
        running_animated = { "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" },
      },
      highlights = {
        adapter_name = "NeotestAdapterName",
        border = "NeotestBorder",
        dir = "NeotestDir",
        expand_marker = "NeotestExpandMarker",
        failed = "NeotestFailed",
        file = "NeotestFile",
        focused = "NeotestFocused",
        indent = "NeotestIndent",
        marked = "NeotestMarked",
        namespace = "NeotestNamespace",
        passed = "NeotestPassed",
        running = "NeotestRunning",
        select_win = "NeotestWinSelect",
        skipped = "NeotestSkipped",
        target = "NeotestTarget",
        test = "NeotestTest",
        unknown = "NeotestUnknown",
      },
    })

    -- Notification when Docker is detected
    if has_docker then
      vim.notify(
        string.format("Neotest: Docker detected, using service '%s' for test execution", service),
        vim.log.levels.INFO
      )
    end
  end,
}
