local function setup_handlers()
  -- Create an autocmd group for CodeCompanion events
  local group = vim.api.nvim_create_augroup("CodeCompanionEvents", { clear = true })

  -- Create an autocmd that listens for CodeCompanion events
  vim.api.nvim_create_autocmd({ "User" }, {
    pattern = "CodeCompanionRequest*",
    group = group,
    callback = function(request)
      if request.match == "CodeCompanionRequestStarted" then
        vim.notify("Generating response...", vim.log.levels.INFO, {
          id = "codecompanion-" .. request.data.id,
          title = "CodeCompanion",
          timeout = false,
          hide_from_history = false,
        })
      elseif request.match == "CodeCompanionRequestFinished" then
        vim.notify("Complete", nil, {
          id = "codecompanion-" .. request.data.id,
          title = "CodeCompanion",
          timeout = 3000
        }) -- Dismiss the notification
      end
    end
  })
end

return {
  "olimorris/codecompanion.nvim",
  dependencies = {
    "nvim-lua/plenary.nvim",
    "nvim-treesitter/nvim-treesitter",
  },
  keys = {
    { "<leader>ca", "<cmd>CodeCompanionActions<cr>",     desc = "CodeCompanion Actions", noremap = true, mode = { "n", "v" } },
    { "<leader>cc", "<cmd>CodeCompanionChat Toggle<cr>", desc = "CodeCompanion Chat",    noremap = true, mode = { "n", "v" } },
    { "<leader>ci", "<cmd>CodeCompanion<cr>",            desc = "CodeCompanion Inline",  noremap = true },
    { "ga",         "<cmd>CodeCompanionChat Add<cr>",    desc = "CodeCompanion Add",     noremap = true, mode = "v" },
  },
  config = function()
    local prompts_dir = vim.fn.expand("$HOME/prompts")

    require("codecompanion").setup({
      strategies = {
        chat = {
          adapter = "copilot",
          slash_commands = {
            ["file"] = {
              opts = {
                contains_code = true,
                max_lines = 1000,
                provider = "snacks", -- default|telescope|mini_pick|fzf_lua|snacks 
              },
            },
          }
        },
        inline = {
          adapter = "copilot",
        },
        agent = {
          adapter = "copilot",
        },
      },
      adapters = {
        ollama = function()
          return require("codecompanion.adapters").extend("ollama", {
            schema = {
              model = {
                default = "opencoder",
                choices = {
                  "opencoder",
                  "yi-coder",
                  "qwen2.5-coder:7b",
                }
              },
            },
          })
        end,
        openrouter = function()
          return require("codecompanion.adapters").extend("openai_compatible", {
            name = "openrouter",
            env = {
              -- https://github.com/bitwarden/clients/issues/6689
              api_key = "cmd:bw get password --nointeraction OPENROUTER_API_KEY 2>/dev/null",
              url = "https://openrouter.ai",
              chat_url = "/api/v1/chat/completions"
            },
            parameters = {
              provider = {
                allow_fallbacks = false,
              },
              stream = true,
            },
            schema = {
              model = {
                default = "anthropic/claude-3-5-haiku",
                choices = {
                  "openai/gpt-4o-mini",
                  "openai/gpt-4o",
                  "deepseek/deepseek-chat",
                  "anthropic/claude-3.5-sonnet",
                  "anthropic/claude-3-5-haiku",
                  "qwen/qwen-2.5-coder-32b-instruct"
                }
              },
            }
          })
        end,
      },
      display = {
        chat = {
          show_header_separator = false,
        }
      },
      prompt_library = {
        ["Wechat Developer"] = {
          strategy = "chat",
          description = "Prompt for developing Wechat Mini Programs",
          opts = {
            adapter = {
              name = "copilot",
              model = "claude-3.5-sonnet",
            },
            mapping = "<LocalLeader>cw",
            short_name = "wechat",
          },
          prompts = {
            {
              role = "system",
              content = function(_context)
                local wechat_prompt_path = prompts_dir .. '/wechat_developer.md'
                local default_prompt =
                "You are expert at developing Wechat Mini Programs. Please follow official documentation and guidelines."

                local ok, lines = pcall(vim.fn.readfile, wechat_prompt_path)
                if ok and #lines > 0 then
                  return table.concat(lines, "\n")
                end
                return default_prompt
              end,
              opts = {
                contains_code = true,
                visible = false
              }
            },
            {
              role = "user",
              content = "I want you to ",
              opts = {
                auto_submit = false,
              },
            },
          }
        }
      }
    })

    setup_handlers()

    vim.api.nvim_set_keymap("n", "<leader>cw", "", {
      callback = function()
        require("codecompanion").prompt("wechat")
      end,
      noremap = true,
      silent = true,
    })
  end
}
