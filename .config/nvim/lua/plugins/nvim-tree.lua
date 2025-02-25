local icons = require "config.icons"

return {
  "nvim-tree/nvim-tree.lua",
  cmd = { "NvimTreeToggle", "NvimTreeFocus", "NvimTreeOpen", "NvimTreeFindFile", "NvimTreeFindFileToggle" },
  keys = {
    { "<leader>e", "<cmd>NvimTreeFindFileToggle<CR>", desc = "Toggle flie explorer", nowait = true, remap = false },
  },
  opts = {
    disable_netrw = true,
    hijack_netrw = true,
    hijack_cursor = true,
    hijack_unnamed_buffer_when_opening = false,
    update_cwd = true,
    update_focused_file = {
      enable = true,
      update_root = false,
    },
    git = {
      enable = true,
      ignore = false,
      show_on_dirs = false,
      timeout = 300,
    },
    renderer = {
      add_trailing = false,
      group_empty = false,
      highlight_git = true,
      full_name = false,
      highlight_opened_files = "none",
      root_folder_label = ":t",
      indent_width = 2,
      indent_markers = {
        enable = false,
        inline_arrows = true,
        icons = {
          corner = "└",
          edge = "│",
          item = "│",
          none = " ",
        },
      },
      special_files = { "Gemfile", "mix.exs", "package.json", "README.md", "readme.md" },
      icons = {
        show = {
          file = true,
          folder = true,
          folder_arrow = true,
          git = false,
        },
        glyphs = {
          default = icons.ui.Text,
          symlink = icons.ui.FileSymlink,
          bookmark = icons.ui.BookMark,
          folder = {
            arrow_closed = icons.ui.ChevronShortRight,
            arrow_open = icons.ui.ChevronShortDown,
            default = icons.ui.Folder,
            open = icons.ui.FolderOpen,
            empty = icons.ui.EmptyFolder,
            empty_open = icons.ui.EmptyFolderOpen,
            symlink = icons.ui.FolderSymlink,
            symlink_open = icons.ui.FolderOpen,
          },
          git = {
            unstaged = icons.git.FileUnstaged,
            staged = icons.git.FileStaged,
            unmerged = icons.git.FileUnmerged,
            renamed = icons.git.FileRenamed,
            untracked = icons.git.FileUntracked,
            deleted = icons.git.FileDeleted,
            ignored = icons.git.FileIgnored,
          },
        },
      },
    },
    diagnostics = {
      enable = true,
      show_on_dirs = false,
      show_on_open_dirs = true,
      debounce_delay = 50,
      severity = {
        min = vim.diagnostic.severity.HINT,
        max = vim.diagnostic.severity.ERROR,
      },
      icons = {
        hint = icons.diagnostics.BoldHint,
        info = icons.diagnostics.BoldInformation,
        warning = icons.diagnostics.BoldWarning,
        error = icons.diagnostics.BoldError,
      },
    },
    view = {
      adaptive_size = false,
      centralize_selection = false,
      preserve_window_proportions = true,
      side = "left",
      width = 38,
    },
    filters = {
      dotfiles = false,
      custom = { ".idea", "^.git$", "^.DS_store$" },
    },
  }
}
