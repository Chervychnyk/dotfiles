return {
  "nvim-neo-tree/neo-tree.nvim",
  branch = "v3.x",
  dependencies = {
    "nvim-lua/plenary.nvim",
    "MunifTanjim/nui.nvim",
    "nvim-tree/nvim-web-devicons",
  },
  keys = {
    { "<leader>e", "<cmd>Neotree toggle reveal position=left<cr>", desc = "Open Explorer" },
  },
  init = function()
    vim.g.loaded_netrw = 1
    vim.g.loaded_netrwPlugin = 1
  end,
  opts = {
    close_if_last_window = true,
    enable_git_status = true,
    enable_diagnostics = false,
    filesystem = {
      follow_current_file = { enabled = true },
      hijack_netrw_behavior = "disabled",
      filtered_items = {
        visible = true,
        hide_dotfiles = false,
        hide_gitignored = false,
        hide_by_name = {
          ".git",
          ".idea",
          "node_modules",
          ".DS_Store",
        },
      },
      window = {
        width = 40,
        mappings = {
          ["P"] = { "toggle_preview", config = { use_float = false } },
          ["<C-v>"] = "open_vsplit",
          ["<C-s>"] = "open_split",
          ["l"] = "open",
          ["h"] = "close_node",
          ["<tab>"] = "toggle_node",
        },
      },
    },
    window = {
      position = "left",
    },
  },
  config = function(_, opts)
    require("neo-tree").setup(opts)
  end,
}
