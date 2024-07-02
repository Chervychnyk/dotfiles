return {
  {
    "nvim-telescope/telescope.nvim",
    cmd = "Telescope",
    version = false, -- telescope did only one release, so use HEAD for now
    dependencies = {
      {
        "nvim-telescope/telescope-fzf-native.nvim",
        build = "make",
        enabled = vim.fn.executable("make") == 1,
        config = function()
          require("telescope").load_extension("fzf")
        end,
      },
      "folke/todo-comments.nvim"
    },
    opts = function()
      local actions = require("telescope.actions")
      local action_state = require('telescope.actions.state')
      local previewers = require('telescope.previewers')
      local previewers_utils = require('telescope.previewers.utils')
      local icons = require('config.icons')


      local function filename_first(_, path)
        local tail = vim.fs.basename(path)
        local parent = vim.fs.dirname(path)
        if parent == "." then
          return tail
        end
        return string.format("%s\t\t%s", tail, parent)
      end

      local truncate_large_files = function(filepath, bufnr, opts)
        filepath = vim.fn.expand(filepath)
        opts = opts or {}

        local max_size = vim.g.max_file.size

        vim.loop.fs_stat(filepath, function(_, stat)
          if not stat then return end
          if stat.size > max_size then
            local cmd = { "head", "-c", max_size, filepath }
            previewers_utils.job_maker(cmd, bufnr, opts)
          else
            previewers.buffer_previewer_maker(filepath, bufnr, opts)
          end
        end)
      end

      return {
        defaults = {
          buffer_previewer_maker = truncate_large_files,

          prompt_prefix = icons.ui.Telescope .. " ",
          selection_caret = icons.ui.Forward .. " ",
          entry_prefix = "   ",
          initial_mode = "insert",
          select_strategy = "reset",
          sorting_strategy = "ascending",
          color_devicons = true,
          set_env = { ["COLORTERM"] = "truecolor" }, -- default = nil,
          layout_config = {
            prompt_position = "top",
            preview_cutoff = 120,
          },
          path_display = { "absolute" },

          vimgrep_arguments = {
            "rg",
            "--color=never",
            "--no-heading",
            "--with-filename",
            "--line-number",
            "--column",
            "--smart-case",
            "--hidden",
            "--glob=!.git/",
          },

          mappings = {
            i = {
              ["<C-n>"] = actions.cycle_history_next,
              ["<C-p>"] = actions.cycle_history_prev,

              ["<C-j>"] = actions.move_selection_next,
              ["<C-k>"] = actions.move_selection_previous,

              ["<C-c>"] = actions.close,

              ["<Down>"] = actions.move_selection_next,
              ["<Up>"] = actions.move_selection_previous,

              ["<CR>"] = actions.select_default,
              ["<C-x>"] = actions.select_horizontal,
              ["<C-v>"] = actions.select_vertical,
              ["<C-t>"] = actions.select_tab,

              ["<C-u>"] = actions.preview_scrolling_up,
              ["<C-d>"] = actions.preview_scrolling_down,

              ["<PageUp>"] = actions.results_scrolling_up,
              ["<PageDown>"] = actions.results_scrolling_down,

              ["<Tab>"] = actions.toggle_selection + actions.move_selection_worse,
              ["<S-Tab>"] = actions.toggle_selection + actions.move_selection_better,
              ["<C-q>"] = actions.send_to_qflist + actions.open_qflist,
              ["<M-q>"] = actions.send_selected_to_qflist + actions.open_qflist,
              ["<C-l>"] = actions.complete_tag,
              ["<C-_>"] = actions.which_key, -- keys from pressing <C-/>
            },

            n = {
              ["<esc>"] = actions.close,
              ["<CR>"] = actions.select_default,
              ["<C-x>"] = actions.select_horizontal,
              ["<C-v>"] = actions.select_vertical,
              ["<C-t>"] = actions.select_tab,

              ["<Tab>"] = actions.toggle_selection + actions.move_selection_worse,
              ["<S-Tab>"] = actions.toggle_selection + actions.move_selection_better,
              ["<C-q>"] = actions.send_to_qflist + actions.open_qflist,
              ["<M-q>"] = actions.send_selected_to_qflist + actions.open_qflist,

              ["j"] = actions.move_selection_next,
              ["k"] = actions.move_selection_previous,
              ["H"] = actions.move_to_top,
              ["M"] = actions.move_to_middle,
              ["L"] = actions.move_to_bottom,

              ["<Down>"] = actions.move_selection_next,
              ["<Up>"] = actions.move_selection_previous,
              ["gg"] = actions.move_to_top,
              ["G"] = actions.move_to_bottom,

              ["<C-u>"] = actions.preview_scrolling_up,
              ["<C-d>"] = actions.preview_scrolling_down,

              ["<PageUp>"] = actions.results_scrolling_up,
              ["<PageDown>"] = actions.results_scrolling_down,

              ["?"] = actions.which_key,
            },
          },
        },
        pickers = {
          buffers = {
            theme = "dropdown",
            previewer = false,
            initial_mode = "normal",
            mappings = {
              i = {
                ["<C-d>"] = actions.delete_buffer,
              },
              n = {
                ["dd"] = actions.delete_buffer,
              },
            },
          },

          colorscheme = {
            enable_preview = true,
          },

          find_files = {
            find_command = { 'rg', '--files', '--hidden', '-g', '!.git/' },
            theme = 'dropdown',
            previewer = false,
            path_display = filename_first
          },

          git_branches = {
            theme = 'dropdown',
            pattern = '--sort=-committerdate',
          },

          git_commits = {
            theme = "ivy",
            mappings = {
              i = {
                ["<C-o>"] = function(prompt_bufnr)
                  actions.close(prompt_bufnr)
                  local value = action_state.get_selected_entry().value
                  require("gitsigns").diffthis(value)
                  -- vim.cmd('DiffviewOpen ' .. value .. '~1..' .. value)
                end,
              }
            }
          },

          git_stash = {
            theme = 'ivy',
            mappings = {
              i = {
                ['<C-o>'] = function(prompt_bufnr)
                  actions.close(prompt_bufnr)
                  local value = action_state.get_selected_entry().value
                  vim.api.nvim_command('vertical G stash show -p ' .. value)
                end,
                ['<C-x>'] = function(prompt_bufnr)
                  actions.close(prompt_bufnr)
                  local value = action_state.get_selected_entry().value
                  vim.api.nvim_command('G stash pop ' .. value)
                end,
              },
            },
          },

          lsp_references = {
            theme = "dropdown",
            initial_mode = "normal",
          },

          lsp_definitions = {
            theme = "dropdown",
            initial_mode = "normal",
          },

          lsp_declarations = {
            theme = "dropdown",
            initial_mode = "normal",
          },

          lsp_implementations = {
            theme = "dropdown",
            initial_mode = "normal",
          },
        },
        extensions = {
          -- Your extension configuration goes here:
          -- extension_name = {
          --   extension_config_key = value,
          -- }
          -- please take a look at the readme of the extension you want to configure
        },
      }
    end
  },
}
