return {
  -- My plugins here
  "nvim-lua/plenary.nvim",

  -- Git
  {
    'akinsho/git-conflict.nvim',
    version = "*",
    event = { "BufReadPost", "BufNewFile" },
    config = true
  },

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
          "markdown",
          "markdown_inline",
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
