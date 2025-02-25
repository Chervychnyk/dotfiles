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
          "yaml"
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

  {
    -- Make sure to set this up properly if you have lazy=true
    'MeanderingProgrammer/render-markdown.nvim',
    opts = {
      file_types = { "markdown", "codecompanion", "Avante" },
    },
    ft = { "markdown", "codecompanion", "Avante" },
  },

}
