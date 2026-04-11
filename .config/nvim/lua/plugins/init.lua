return {
  -- My plugins here
  "nvim-lua/plenary.nvim",

  {
    "brenoprata10/nvim-highlight-colors",
    event = { "BufReadPost", "BufNewFile" },
    opts = {
      render = "background",
      enable_hex = true,
      enable_short_hex = true,
      enable_rgb = true,
      enable_hsl = true,
      enable_hsl_without_function = true,
      enable_var_usage = true,
      enable_named_colors = false,
      enable_tailwind = true,
      exclude_filetypes = {},
      exclude_buftypes = {},
    },
  },

  {
    -- Make sure to set this up properly if you have lazy=true
    'MeanderingProgrammer/render-markdown.nvim',
    opts = {
      file_types = { "markdown", "codecompanion" },
    },
    ft = { "markdown", "codecompanion" },
  },

  -- Rails navigation and commands
  {
    "tpope/vim-rails",
    ft = { "ruby", "eruby", "haml", "slim" },
    cmd = {
      "Rails",
      "Rake",
      "A",
      "R",
      "Emodel",
      "Econtroller",
      "Eview",
      "Ehelper",
      "Espec",
      "Emigration",
    },
    keys = {
      { "<leader>ra", "<cmd>A<cr>", desc = "Rails alternate file" },
      { "<leader>rr", "<cmd>R<cr>", desc = "Rails related file" },
      { "<leader>rm", "<cmd>Emodel<cr>", desc = "Rails model" },
      { "<leader>rc", "<cmd>Econtroller<cr>", desc = "Rails controller" },
      { "<leader>rv", "<cmd>Eview<cr>", desc = "Rails view" },
      { "<leader>rs", "<cmd>Espec<cr>", desc = "Rails spec" },
    },
  },


}
