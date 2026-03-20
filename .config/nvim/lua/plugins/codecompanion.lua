return {
  "olimorris/codecompanion.nvim",
  dependencies = {
    "nvim-lua/plenary.nvim",
    "nvim-treesitter/nvim-treesitter",
    "ravitemer/codecompanion-history.nvim",
    "franco-ruggeri/codecompanion-spinner.nvim",
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
          adapter = "openrouter",
          slash_commands = {
            ["buffer"] = {
              keymaps = {
                modes = {
                  i = "<C-b>",
                  n = { "<C-b>", "gb" }
                }
              }
            },
            ["file"] = {
              keymaps = {
                modes = {
                  i = "<C-f>",
                  n = { "<C-f>", "gf" }
                }
              },
              opts = {
                contains_code = true,
                max_lines = 1000,
                provider = "snacks", -- default|telescope|mini_pick|fzf_lua|snacks
              },
            },
          },
        },
        inline = {
          adapter = "openrouter",
        },
        agent = {
          adapter = "openrouter",
        },
      },
      extensions = {
        history = {
          enabled = true,
          opts = {
            -- Keymap to open history from chat buffer (default: gh)
            keymap = "gh",
            -- Keymap to save the current chat manually (when auto_save is disabled)
            save_chat_keymap = "sc",
            -- Save all chats by default (disable to save only manually using 'sc')
            auto_save = true,
            -- Number of days after which chats are automatically deleted (0 to disable)
            expiration_days = 0,
            -- Picker interface ("telescope" or "snacks" or "fzf-lua" or "default")
            picker = "snacks",
            ---Automatically generate titles for new chats
            auto_generate_title = true,
            title_generation_opts = {
              ---Adapter for generating titles (defaults to current chat adapter)
              adapter = "openrouter",       -- "copilot"
              ---Model for generating titles (defaults to current chat model)
              model = "openai/gpt-4o-mini", -- "gpt-4o"
            },
            ---On exiting and entering neovim, loads the last chat on opening chat
            continue_last_chat = false,
            ---When chat is cleared with `gx` delete the chat from history
            delete_on_clearing_chat = false,
            ---Directory path to save the chats
            dir_to_save = vim.fn.stdpath("data") .. "/codecompanion-history",
            ---Enable detailed logging for history extension
            enable_logging = false,
          }
        },
        spinner = {},
      },
      adapters = {
        http = {
          openrouter = function()
            return require("codecompanion.adapters").extend("openai_compatible", {
              env = {
                url = "https://openrouter.ai/api",
                -- https://github.com/bitwarden/clients/issues/6689
                api_key = "cmd:bw get password --nointeraction OPENROUTER_API_KEY 2>/dev/null",
                chat_url = "/v1/chat/completions",
              },
              parameters = {
                provider = {
                  allow_fallbacks = false,
                },
                stream = true,
              },
              handlers = {
                parse_message_meta = function(self, data)
                  local extra = data.extra
                  if extra and extra.reasoning then
                    data.output.reasoning = { content = extra.reasoning }
                    if data.output.content == "" then
                      data.output.content = nil
                    end
                  end
                  return data
                end,
              },
            })
          end,
          ollama = function()
            return require("codecompanion.adapters").extend("ollama", {
              schema = {
                model = {
                  default = "rnj-1",
                  choices = {
                    "rnj-1",
                    "deepcoder"
                  }
                },
                num_ctx = {
                  default = 16384,
                },
              },
            })
          end,
        },
      },
      memory = {
        opts = {
          chat = {
            enabled = true,
          },
        },
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
              name = "openrouter",
              model = "claude-sonnet-4",
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

    vim.api.nvim_set_keymap("n", "<leader>cw", "", {
      callback = function()
        require("codecompanion").prompt("wechat")
      end,
      noremap = true,
      silent = true,
    })
  end
}
