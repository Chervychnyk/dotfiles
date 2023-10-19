return {
  -- My plugins here
  "nvim-lua/plenary.nvim",
  "lewis6991/impatient.nvim",
  "folke/which-key.nvim",

  -- Git
  "sindrets/diffview.nvim",

  -- Colorschemes
  "EdenEast/nightfox.nvim",
  "rebelot/kanagawa.nvim",
  { "catppuccin/nvim", name = "catppuccin" },
  { 'projekt0n/github-nvim-theme' },

  { "Pocco81/true-zen.nvim" },
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
