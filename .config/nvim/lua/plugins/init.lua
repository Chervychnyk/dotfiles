return {
  -- My plugins here
  "nvim-lua/plenary.nvim",
  {
    "RRethy/vim-illuminate",
    event = "VeryLazy",
    config = function()
      require("illuminate").configure {
        filetypes_denylist = {
          "mason",
          "qf",
          "minifiles",
          "alpha",
          "NvimTree",
          "lazy",
          "Trouble",
          "netrw",
          "DiffviewFiles",
          "Outline",
          "TelescopePrompt",
        },
      }
    end
  },

  -- Git
  {
    "sindrets/diffview.nvim",
    event = "VeryLazy",
    cmd = { "DiffviewOpen", "DiffviewClose", "DiffviewToggleFiles", "DiffviewFocusFiles" },
  },

  -- Colorschemes
  "EdenEast/nightfox.nvim",
  "rebelot/kanagawa.nvim",
  'projekt0n/github-nvim-theme',
  { "catppuccin/nvim",  name = "catppuccin" },
  { 'rose-pine/neovim', name = 'rose-pine' },

  {
    'NvChad/nvim-colorizer.lua',
    config = function()
      require('colorizer').setup()
    end
  },
  {
    "folke/todo-comments.nvim",
    config = function()
      require("todo-comments").setup()
    end
  },
  {
    "folke/trouble.nvim",
    dependencies = {
      "nvim-tree/nvim-web-devicons"
    },
    config = function()
      require("trouble").setup()
    end
  }
}
