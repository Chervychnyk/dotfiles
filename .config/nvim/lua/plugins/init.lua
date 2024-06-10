return {
  -- My plugins here
  "nvim-lua/plenary.nvim",

  -- Git
  {
    "sindrets/diffview.nvim",
    event = "VeryLazy",
    cmd = { "DiffviewOpen", "DiffviewClose", "DiffviewToggleFiles", "DiffviewFocusFiles" },
  },
  { 'akinsho/git-conflict.nvim', version = "*", config = true },

  {
    'NvChad/nvim-colorizer.lua',
 event = { "BufReadPost", "BufNewFile" },
    config = function()
      require("colorizer").setup {
        filetypes = {
          "typescript",
          "typescriptreact",
          "javascript",
          "javascriptreact",
          "css",
          "html",
          "astro",
          "lua",
        },
        user_default_options = {
          names = false,
          rgb_fn = true,
          hsl_fn = true,
          tailwind = "both",
        },
        buftypes = {},
      }
    end
  },
}
