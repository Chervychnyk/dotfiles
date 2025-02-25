local icons = require "config.icons"

return {
  {
    'saghen/blink.compat',
    -- use the latest release, via version = '*', if you also use the latest release for blink.cmp
    version = '*',
    -- lazy.nvim will automatically load the plugin when it's required by blink.cmp
    lazy = true,
    -- make sure to set opts so that lazy.nvim calls blink.compat's setup
    opts = {
      impersonate_nvim_cmp = true,
    },
  },

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
        return not vim.tbl_contains(
              { "DressingInput", "DressingSelect", "NvimTree", "TelescopePrompt", "snacks_picker_input" }, vim.bo
              .filetype)
            and vim.bo.buftype ~= "prompt"
            and vim.b.completion ~= false
      end,

      cmdline = {
        enabled = false
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
        default = function(ctx)
          local success, node = pcall(vim.treesitter.get_node)
          if vim.bo.filetype == 'AvanteInput' then
            return { "avante_commands", "avante_mentions", "avante_files", "buffer", "path" }
          elseif vim.bo.filetype == 'markdown' then
            return { "obsidian", "obsidian_new", "obsidian_tags", "buffer", "path" }
          elseif success and node and vim.tbl_contains({ 'comment', 'line_comment', 'block_comment' }, node:type()) then
            return { 'buffer' }
          else
            return { "lsp", "path", "snippets", "buffer", "codecompanion" }
          end
        end,
        providers = {
          lsp = {
            min_keyword_length = 2, -- Number of characters to trigger porvider
            score_offset = 0,       -- Boost/penalize the score of the items
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
          avante_commands = {
            name = "avante_commands",
            module = "blink.compat.source",
            score_offset = 90, -- show at a higher priority than lsp
            opts = {},
          },
          avante_files = {
            name = "avante_commands",
            module = "blink.compat.source",
            score_offset = 100, -- show at a higher priority than lsp
            opts = {},
          },
          avante_mentions = {
            name = "avante_mentions",
            module = "blink.compat.source",
            score_offset = 1000, -- show at a higher priority than lsp
            opts = {},
          },
          obsidian = {
            name = "obsidian",
            module = "blink.compat.source",
          },
          obsidian_new = {
            name = "obsidian_new",
            module = "blink.compat.source",
          },
          obsidian_tags = {
            name = "obsidian_tags",
            module = "blink.compat.source",
          },
        },
      },
    },
  }
}
