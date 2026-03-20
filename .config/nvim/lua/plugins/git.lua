local icons = require("config.icons")

return {
  -- Gitsigns - Git decorations and hunk actions
  {
    "lewis6991/gitsigns.nvim",
    event = "BufEnter",
    cmd = "Gitsigns",
    config = function()
      require("gitsigns").setup({
        signs = {
          add = {
            text = icons.ui.BoldLineMiddle,
          },
          change = {
            text = icons.ui.BoldLineDashedMiddle,
          },
          delete = {
            text = icons.ui.TriangleShortArrowRight,
          },
          topdelete = {
            text = icons.ui.TriangleShortArrowRight,
          },
          changedelete = {
            text = icons.ui.BoldLineMiddle,
          },
        },
        watch_gitdir = {
          interval = 1000,
          follow_files = true,
        },
        attach_to_untracked = true,
        current_line_blame_formatter = "<author>, <author_time:%Y-%m-%d> - <summary>",
        update_debounce = 200,
        max_file_length = vim.g.max_file.lines,
        preview_config = {
          border = "rounded",
          style = "minimal",
          relative = "cursor",
          row = 0,
          col = 1,
        },
        on_attach = function(bufnr)
          local gs = require("gitsigns")

          local function map(mode, l, r, opts)
            opts = opts or {}
            opts.buffer = bufnr
            vim.keymap.set(mode, l, r, opts)
          end

          -- Navigation
          map("n", "]c", function()
            if vim.wo.diff then
              vim.cmd.normal({ "]c", bang = true })
            else
              gs.nav_hunk("next")
            end
          end, { silent = true })

          map("n", "[c", function()
            if vim.wo.diff then
              vim.cmd.normal({ "[c", bang = true })
            else
              gs.nav_hunk("prev")
            end
          end, { silent = true })

          -- Actions
          map("n", "<leader>gs", gs.stage_hunk, { desc = "Stage hunk" })
          map("n", "<leader>gr", gs.reset_hunk, { desc = "Reset hunk" })
          map("v", "<leader>gs", function()
            gs.stage_hunk({ vim.fn.line("."), vim.fn.line("v") })
          end, { desc = "Stage hunk" })
          map("v", "<leader>gr", function()
            gs.reset_hunk({ vim.fn.line("."), vim.fn.line("v") })
          end, { desc = "Reset hunk" })
          map("n", "<leader>gB", gs.stage_buffer, { desc = "Stage buffer" })
          map("n", "<leader>gu", gs.undo_stage_hunk, { desc = "Undo stage hunk" })
          map("n", "<leader>gR", gs.reset_buffer, { desc = "Reset buffer" })
          map("n", "<leader>gp", gs.preview_hunk, { desc = "Preview hunk" })
          map("n", "<leader>gl", function()
            gs.blame_line({ full = true })
          end, { desc = "Git blame" })
        end,
      })
    end,
  },

  -- Diffview - Advanced diff and merge tool
  {
    "sindrets/diffview.nvim",
    event = "VeryLazy",
    cmd = { "DiffviewOpen", "DiffviewClose", "DiffviewToggleFiles", "DiffviewFocusFiles" },
    keys = {
      {
        "<leader>gd",
        function()
          if vim.t.diffview_view_initialized then
            return vim.cmd.DiffviewClose()
          end

          return vim.cmd.DiffviewOpen()
        end,
        silent = true,
        desc = "Toggle diff",
      },
      { "<leader>gh", ":DiffviewFileHistory %<CR>", silent = true, desc = "Git file history" },
    },
  },

  -- Neogit - Magit-like Git interface
  {
    "neogitorg/neogit",
    cmd = "Neogit",
    keys = {
      { "<leader>gg", "<cmd>Neogit<cr>", desc = "Neogit" },
    },
    config = function()
      require("neogit").setup({
        auto_show_console = false,
        process_spinner = false,
        disable_signs = false,
        disable_context_highlighting = false,
        disable_commit_confirmation = true,
        disable_insert_on_commit = "auto",
        -- Neogit refreshes its internal state after specific events, which can be expensive depending on the repository size.
        -- Disabling `auto_refresh` will make it so you have to manually refresh the status after you open it.
        auto_refresh = true,
        disable_builtin_notifications = false,
        use_magit_keybindings = false,
        -- Change the default way of opening neogit
        kind = "tab",
        -- Change the default way of opening the commit popup
        commit_popup = {
          kind = "split",
        },
        -- Change the default way of opening popups
        popup = {
          kind = "split",
        },
        -- customize displayed signs
        signs = {
          -- { CLOSED, OPENED }
          section = { icons.ui.ChevronShortRight, icons.ui.ChevronShortDown },
          item = { icons.ui.ChevronShortRight, icons.ui.ChevronShortDown },
          hunk = { "", "" },
        },
        integrations = {
          diffview = true,
        },
      })
    end,
  },
}
