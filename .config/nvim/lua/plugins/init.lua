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
    "OXY2DEV/markview.nvim",
    lazy = false,
    dependencies = {
      "nvim-tree/nvim-web-devicons",
    },
    opts = {
      markdown = {
        code_blocks = {
          pad_amount = 4,
          pad_char = " ",
        },
      },
      preview = {
        callbacks = {
          on_splitview_open = function(_, _, win)
            vim.wo[win].conceallevel = 3
            vim.wo[win].concealcursor = "n"
            vim.wo[win].spell = false
          end,
        },
        filetypes = { "markdown", "codecompanion" },
        icon_provider = "devicons",
        max_buf_lines = 5000,
        modes = { "n", "no", "c" },
        hybrid_modes = { "n" },
      },
    },
    config = function(_, opts)
      vim.treesitter.language.register("markdown", "codecompanion")
      require("markview").setup(opts)
    end,
    keys = {
      { "<leader>mp", "<cmd>Markview Toggle<cr>", desc = "Toggle markdown preview" },
      { "<leader>ms", "<cmd>Markview splitToggle<cr>", desc = "Toggle markdown split preview" },
    },
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
