return {
  "yetone/avante.nvim",
  event = "VeryLazy",
  lazy = false,
  dependencies = {
    "nvim-treesitter/nvim-treesitter",
    "nvim-lua/plenary.nvim",
    "MunifTanjim/nui.nvim",
    --- The below dependencies are optional,
    "echasnovski/mini.icons",
    "zbirenbaum/copilot.lua", -- for providers='copilot'
    {
      -- support for image pasting
      "HakonHarnes/img-clip.nvim",
      event = "VeryLazy",
      opts = {
        -- recommended settings
        default = {
          embed_image_as_base64 = false,
          prompt_for_file_name = false,
          drag_and_drop = {
            insert_mode = true,
          },
        },
      },
    },
  }, -- set this if you want to always pull the latest change
  -- if you want to build from source then do `make BUILD_FROM_SOURCE=true`
  build = "make",
  version = false,
  config = function()
    require("avante").setup({
      provider = "copilot",
      copilot = {
        model = "claude-3.5-sonnet",
      },
      file_selector = {
        provider = "snacks",
      },
      vendors = {
        ollama = {
          __inherited_from = "openai",
          api_key_name = "",
          endpoint = "127.0.0.1:11434/v1",
          model = "opencoder:8b",
        },
        openrouter = {
          __inherited_from = "openai",
          endpoint = "https://openrouter.ai/api/v1",
          model = "deepseek/deepseek-chat",
          api_key_name = { "bw", "get", "password", "--nointeraction", "OPENROUTER_API_KEY", "2>/dev/null" },
        },
      }
    })
  end,
}
