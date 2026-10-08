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
          -- Layout keys belong directly on `layout`. Snacks reads backdrop, box
          -- and position from the outer table and only treats the nested
          -- `layout` key as the window list, so nesting everything one level
          -- deeper silently dropped all but the window list.
          explorer = {
            layout = {
              backdrop = false,
              width = 40,
              min_width = 40,
              height = 0,
              position = "left",
              border = "rounded",
              box = "vertical",
              layout = {
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
          -- No `pick`: find/live-grep are wired to fff below rather than
          -- snacks' default picker, so there is nothing for it to launch.
          keys = {
            {
              icon = " ",
              key = "f",
              desc = "Find File",
              action = function()
                require("fff").find_files()
              end,
            },
            { icon = " ", key = "n", desc = "New File", action = ":ene | startinsert" },
            -- here we do not use g, cause g has some delay, because we alse use gg to go to first item/line
            { icon = icons.git.Repo, key = "p", desc = "Find Project", action = ":lua Snacks.picker.projects()" },
            {
              icon = " ",
              key = "t",
              desc = "Find Text",
              action = function()
                require("fff").live_grep()
              end,
            },
            { icon = " ", key = "r", desc = "Recent Files", action = ":lua Snacks.dashboard.pick('oldfiles')" },
            {
              -- Sessions are saved on exit but never restored automatically, so
              -- this is one of three ways to bring the layout back (the others
              -- are <leader>rs and :SessionRestore). Gated on `available()` so
              -- the dashboard does not advertise a no-op.
              icon = icons.ui.History,
              key = "s",
              desc = "Restore Session",
              action = function()
                require("util.session").restore()
              end,
              enabled = require("util.session").available(),
            },
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
    -- <leader>e belongs to neo-tree, so snacks.explorer is not a duplicate.
    { "<leader>f",  group = "Find", nowait = true, remap = false },
    {
      "<leader>fp",
      function()
        -- PROJECT_PATHS is exported by .zshrc so the shell and the picker agree
        -- on where projects live. Hardcoding a second list here had drifted:
        -- it pointed at ~/Developer, which does not exist, and omitted ~/code
        -- and ~/work.
        Snacks.picker.projects({
          dev = vim.split(vim.env.PROJECT_PATHS or "", " ", { trimempty = true }),
        })
      end,
      desc = "Projects"
    },
    { "<leader>fr", function() Snacks.picker.recent() end,                            desc = "Recent" },
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
