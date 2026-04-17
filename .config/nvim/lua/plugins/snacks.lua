return {
  "folke/snacks.nvim",
  lazy = false,
  opts = function()
    local icons = require "config.icons"

    return {
      explorer = {
        enabled = false
      },
      picker = {
        layout = {
          preset = "telescope",
          -- When reaching the bottom of the results in the picker, I don't want
          -- it to cycle and go back to the top
          cycle = false,
        },
        matcher = {
          frecency = true,
          smartcase = true,
        },
        previewers = {
          file = {
            max_size = 100 * 1024,
          },
        },
        sources = {
          explorer = {
            layout = {
              layout = {
                backdrop = false,
                width = 40,
                min_width = 40,
                height = 0,
                position = "left",
                border = "rounded",
                box = "vertical",
                { win = "list", border = "none" },
                {
                  win = "input",
                  height = 1,
                  border = "none",
                  title = "",
                  title_pos = "center",
                },
              },
            },
          }
        }
      },
      bigfile = {
        enabled = true,
        size = vim.g.max_file.size
      },
      dashboard = {
        preset = {
          -- Defaults to a picker that supports `fzf-lua`, `telescope.nvim` and `mini.pick`
          ---@type fun(cmd:string, opts:table)|nil
          pick = nil,
          keys = {
            {
              icon = " ",
              key = "f",
              desc = "Find File",
              action = function()
                Snacks.picker.files({
                  finder = "files",
                  format = "file",
                  show_empty = true,
                  hidden = true,
                  supports_live = true,
                  layout = "vscode",
                })
              end,
            },
            { icon = " ", key = "n", desc = "New File", action = ":ene | startinsert" },
            -- here we do not use g, cause g has some delay, because we alse use gg to go to first item/line
            { icon = icons.git.Repo, key = "p", desc = "Find Project", action = ":lua Snacks.picker.projects()" },
            {
              icon = " ",
              key = "t",
              desc = "Find Text",
              action = ":lua Snacks.dashboard.pick('live_grep')",
            },
            { icon = " ", key = "r", desc = "Recent Files", action = ":lua Snacks.dashboard.pick('oldfiles')" },
            { icon = icons.ui.Note, key = "o", desc = "Obsidian", action = ":ObsidianQuickSwitch" },
            {
              icon = " ",
              key = "c",
              desc = "Config",
              action = function()
                Snacks.picker.files({
                  finder = "files",
                  format = "file",
                  hidden = true,
                  cwd = vim.fn.stdpath("config"),
                  layout = "vscode",
                })
              end,
            },
            { icon = "󰒲 ", key = "L", desc = "Lazy", action = ":Lazy", enabled = package.loaded.lazy ~= nil },
            { icon = " ", key = "q", desc = "Quit", action = ":qa" },
          },
        },
        sections = {
          { section = "header" },
          { section = "keys",   gap = 1, padding = 1 },
          { section = "startup" }
        },
      },
      indent = {
        priority = 1,
        enabled = true,      -- enable indent guides
        char = "│",
        only_scope = false,  -- only show indent guides of the scope
        only_current = true, -- only show indent guides in the current window
      },
      input = { enabled = true },
      notifier = { enabled = true },
      quickfile = { enabled = true },
      scroll = { enabled = false },
      statuscolumn = { enabled = false },
      words = { enabled = true },
    }
  end,
  keys = {
    { "<leader>z",  function() Snacks.zen() end,                   desc = "Toggle Zen Mode" },
    { "<leader>Z",  function() Snacks.zen.zoom() end,              desc = "Toggle Zoom" },
    { "<leader>.",  function() Snacks.scratch() end,               desc = "Toggle Scratch Buffer" },
    { "<leader>S",  function() Snacks.scratch.select() end,        desc = "Select Scratch Buffer" },
    { "<leader>n",  function() Snacks.notifier.show_history() end, desc = "Notification History" },
    { "<leader>bd", function() Snacks.bufdelete() end,             desc = "Delete Buffer" },
    { "<leader>cR", function() Snacks.rename.rename_file() end,    desc = "Rename File" },
    { "<leader>un", function() Snacks.notifier.hide() end,         desc = "Dismiss All Notifications" },
    { "<leader>bl", function() Snacks.picker.buffers() end,        desc = "Buffers" },
    -- { "<leader>e",  function() Snacks.explorer({ hidden = true, ignored = true, exclude = { ".git" } }) end, desc = "File Explorer" },
    { "<leader>f",  group = "Find", nowait = true, remap = false },
    {
      "<leader>ff",
      function()
        Snacks.picker.files({
          finder = "files",
          format = "file",
          show_empty = true,
          hidden = true,
          supports_live = true,
          layout = "vscode",
        })
      end,
      desc = "Find Files",
    },
    {
      "<leader>fp",
      function()
        Snacks.picker.projects({
          dev = { "~/Projects", "~/Developer" },
        })
      end,
      desc = "Projects"
    },
    { "<leader>fr", function() Snacks.picker.recent() end,                            desc = "Recent" },
    { "<leader>ft", function() Snacks.picker.grep({ hidden = true }) end,             desc = "Grep" },
    { "<leader>fs", function() Snacks.picker.grep_word({ hidden = true }) end,        desc = "Visual selection or word", mode = { "n", "x" } },
    { "<leader>fl", function() Snacks.picker.resume() end,                            desc = "Resume" },
    { "<leader>fc", function() Snacks.picker.commands() end,                          desc = "Commands" },
    { "<leader>fC", function() Snacks.picker.colorschemes() end,                      desc = "Colorschemes" },
    { "<leader>fk", function() Snacks.picker.keymaps() end,                           desc = "Keymaps" },
    { "<leader>g",  group = "Git", nowait = true, remap = false },
    { "<leader>gC", function() Snacks.picker.git_log_file() end,                      desc = "Git Log File" },
    { "<leader>gb", function() Snacks.picker.git_branches({ layout = "select" }) end, desc = "Git Branches" },
    { "<leader>gc", function() Snacks.picker.git_log() end,                           desc = "Git Log" },
    { "<leader>gS", function() Snacks.picker.git_status() end,                        desc = "Git Status" },
    { "<leader>ls", function() Snacks.picker.lsp_symbols() end,                       desc = "LSP Symbols" },
    { "<leader>lS", function() Snacks.picker.lsp_workspace_symbols() end,             desc = "LSP Workspace Symbols" },
    { "<leader>lD", function() Snacks.picker.diagnostics() end,                       desc = "Diagnostics" },
    { "<leader>ld", function() Snacks.picker.diagnostics_buffer() end,                desc = "Buffer Diagnostics" },
  },
}
