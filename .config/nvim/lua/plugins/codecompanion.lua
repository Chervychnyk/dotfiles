return {
  "olimorris/codecompanion.nvim",
  dependencies = {
    "nvim-lua/plenary.nvim",
    "nvim-treesitter/nvim-treesitter",
    "hrsh7th/nvim-cmp",                      -- Optional: For using slash commands and variables in the chat buffer
    "nvim-telescope/telescope.nvim",         -- Optional: For using slash commands
    { "stevearc/dressing.nvim", opts = {} }, -- Optional: Improves `vim.ui.select`
  },
  keys = {
    { "<leader>ca", "<cmd>CodeCompanionActions<cr>",     desc = "CodeCompanion Actions", noremap = true, mode = { "n", "v" } },
    { "<leader>cc", "<cmd>CodeCompanionChat Toggle<cr>", desc = "CodeCompanion Chat",    noremap = true, mode = { "n", "v" } },
    { "<leader>ci", "<cmd>CodeCompanion<cr>",            desc = "CodeCompanion Inline",  noremap = true },
    { "ga",         "<cmd>CodeCompanionChat Add<cr>",    desc = "CodeCompanion Add",     noremap = true, mode = "v" },
  },
  config = function()
    require("codecompanion").setup({
      strategies = {
        chat = {
          adapter = "openrouter",
        },
        inline = {
          adapter = "openrouter",
        },
        agent = {
          adapter = "openrouter",
        },
      },
      adapters = {
        ollama = function()
          return require("codecompanion.adapters").extend("ollama", {
            schema = {
              model = {
                default = "qwen2.5-coder",
                choices = {
                  "codegeex4",
                  "yi-coder",
                  "qwen2.5-coder"
                }
              }
            },
          })
        end,
        openrouter = function()
          return require("codecompanion.adapters").extend("openai", {
            name = "openrouter",
            url = "https://openrouter.ai/api/v1/chat/completions",
            features = {
              tokens = false,
              vision = false,
            },
            env = {
              -- https://github.com/bitwarden/clients/issues/6689
              api_key = "cmd:bw get password OPENROUTER_API_KEY 2>/dev/null",
            },
            parameters = {
              provider = {
                allow_fallbacks = false,
              },
              stream = true,
            },
            schema = {
              model = {
                default = "openai/gpt-4o-mini",
                choices = {
                  "deepseek/deepseek-chat",
                  "openai/gpt-4o-mini",
                  "openai/gpt-4o",
                  "anthropic/claude-3.5-sonnet",
                  "google/gemini-pro-1.5-exp",
                  "qwen/qwen-2.5-72b-instruct"
                }
              },
            }
          })
        end,
      },
    })
  end
}
