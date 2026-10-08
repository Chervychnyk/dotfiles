local icons = require "config.icons"

return {
  {
    "saghen/blink.cmp",
    dependencies = {
      "rafamadriz/friendly-snippets",
    },
    event = "InsertEnter",
    version = "*",
    opts = {
      appearance = {
        use_nvim_cmp_as_default = false,
        nerd_font_variant = "mono",
      },

      enabled = function()
        return not vim.tbl_contains({ "neo-tree", "snacks_picker_input" }, vim.bo.filetype)
            and vim.bo.buftype ~= "prompt"
            and vim.b.completion ~= false
      end,

      cmdline = {
        enabled = false,
      },

      completion = {
        accept = { auto_brackets = { enabled = true } },

        documentation = {
          auto_show = true,
          auto_show_delay_ms = 250,
          treesitter_highlighting = true,
          window = { border = "rounded" },
        },

        list = { selection = { preselect = false } },

        menu = {
          border = "rounded",

          draw = {
            columns = {
              { "kind_icon", "label", gap = 1 },
              { "kind" },
            },
            components = {
              kind_icon = {
                text = function(item)
                  local kind = icons.kind[item.kind] or ""
                  return kind .. " "
                end,
                highlight = "CmpItemKind",
              },
              label = {
                text = function(item)
                  return item.label
                end,
                highlight = "CmpItemAbbr",
              },
              kind = {
                text = function(item)
                  return item.kind
                end,
                highlight = "CmpItemKind",
              },
            },
          },
        },
      },

      keymap = {
        preset = "enter",
        ['<C-c>'] = { "cancel", "fallback" },
        ['<Tab>'] = { "select_next", "snippet_forward", "fallback" },
        ['<S-Tab>'] = { "select_prev", "snippet_backward", "fallback" },
      },

      -- Experimental signature help support
      signature = {
        enabled = true,
        window = { border = "rounded" },
      },

      sources = {
        -- codecompanion is configured but deliberately not a default source: it
        -- is an LLM round-trip against OpenRouter, and leaving it in made every
        -- completion request in every buffer network-bound. Enable it per
        -- buffer with vim.b.completion, or add it back to a per_filetype list.
        default = { "lsp", "path", "snippets", "buffer" },
        per_filetype = {
          markdown = { "buffer", "path" },
        },
        providers = {
          lsp = {
            min_keyword_length = 2, -- Number of characters required before LSP completion starts.
            score_offset = 0, -- Adjust LSP item ranking relative to other sources.
          },
          snippets = {
            min_keyword_length = 1,
          },
          buffer = {
            min_keyword_length = 3,
            max_items = 5,
            opts = {
              get_bufnrs = function()
                return vim.tbl_filter(function(bufnr)
                  return vim.bo[bufnr].buftype == ''
                end, vim.api.nvim_list_bufs())
              end
            }
          },
          codecompanion = {
            name = "CodeCompanion",
            module = "codecompanion.providers.completion.blink",
          },
        },
      },
    },
  }
}
