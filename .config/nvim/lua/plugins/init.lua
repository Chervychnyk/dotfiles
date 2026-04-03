return {
  -- My plugins here
  "nvim-lua/plenary.nvim",

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
          "scss",
          "html",
          "astro",
          "vue",
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

  -- Projectionist for custom navigation patterns
  {
    "tpope/vim-projectionist",
    dependencies = { "tpope/vim-rails" },
    event = "VeryLazy",
    config = function()
      vim.g.projectionist_heuristics = {
        ["docker-compose.yml|docker-compose.yaml"] = {
          ["app/*.rb"] = {
            alternate = "spec/{}_spec.rb",
            type = "source",
          },
          ["spec/*_spec.rb"] = {
            alternate = "app/{}.rb",
            type = "test",
          },
          ["lib/*.rb"] = {
            alternate = "spec/lib/{}_spec.rb",
            type = "source",
          },
        },
      }
    end,
  },

}
