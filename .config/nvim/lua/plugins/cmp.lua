local check_backspace = function()
  local col = vim.fn.col "." - 1
  return col == 0 or vim.fn.getline("."):sub(col, col):match "%s"
end


return {
  -- cmp plugins
  {
    "hrsh7th/nvim-cmp", -- The completion plugin
    dependencies = {
      "hrsh7th/cmp-nvim-lsp",
      "hrsh7th/cmp-buffer",  -- buffer completions
      "hrsh7th/cmp-path",    -- path completions
      "hrsh7th/cmp-cmdline", -- cmdline completions
      "saadparwaiz1/cmp_luasnip",
      {
        "L3MON4D3/LuaSnip",
        dependencies = {
          "rafamadriz/friendly-snippets",
        },
      },
      "hrsh7th/cmp-nvim-lua",
    },
    event = "InsertEnter",
    config = function()
      local cmp = require "cmp"
      local luasnip = require "luasnip"
      require("luasnip/loaders/from_vscode").lazy_load()

      luasnip.filetype_extend("ruby", { "rails" })

      local icons = require("config.icons")

      cmp.setup({
        snippet = {
          expand = function(args)
            -- vim.fn["vsnip#anonymous"](args.body)
            luasnip.lsp_expand(args.body) -- For `luasnip` users.
            -- vim.fn["UltiSnips#Anon"](args.body)
          end,
        },
        mapping = cmp.mapping.preset.insert {
          ["<C-k>"] = cmp.mapping(cmp.mapping.select_prev_item(), { "i", "c" }),
          ["<C-j>"] = cmp.mapping(cmp.mapping.select_next_item(), { "i", "c" }),
          ["<Down>"] = cmp.mapping(cmp.mapping.select_next_item(), { "i", "c" }),
          ["<Up>"] = cmp.mapping(cmp.mapping.select_prev_item(), { "i", "c" }),
          ["<C-b>"] = cmp.mapping(cmp.mapping.scroll_docs(-1), { "i", "c" }),
          ["<C-f>"] = cmp.mapping(cmp.mapping.scroll_docs(1), { "i", "c" }),
          ["<C-Space>"] = cmp.mapping.complete(),
          ["<C-e>"] = cmp.mapping.close(),
          -- Accept currently selected item. If none selected, `select` first item.
          -- Set `select` to `false` to only confirm explicitly selected items.
          ["<CR>"] = cmp.mapping.confirm { select = true },
          ["<Tab>"] = cmp.mapping(function(fallback)
            if cmp.visible() then
              cmp.select_next_item()
            elseif luasnip.expandable() then
              luasnip.expand()
            elseif luasnip.expand_or_jumpable() then
              luasnip.expand_or_jump()
            elseif check_backspace() then
              fallback()
            else
              fallback()
            end
          end, {
            "i",
            "s",
          }),
          ["<S-Tab>"] = cmp.mapping(function(fallback)
            if cmp.visible() then
              cmp.select_prev_item()
            elseif luasnip.jumpable(-1) then
              luasnip.jump(-1)
            else
              fallback()
            end
          end, {
            "i",
            "s",
          }),
        },
        formatting = {
          fields = { "kind", "abbr", "menu" },
          format = function(_entry, vim_item)
            -- Kind icons
            -- vim_item.kind = string.format("%s", icons[vim_item.kind])
            vim_item.kind = string.format('%s %s', icons.kind[vim_item.kind], vim_item.kind) -- This concatonates the icons with the name of the item kind
            return vim_item
          end,
        },
        sources = {
          {
            name = "nvim_lsp",
            entry_filter = function(entry, ctx)
              local kind = require("cmp.types.lsp").CompletionItemKind[entry:get_kind()]
              if kind == "Snippet" and ctx.prev_context.filetype == "java" then
                return false
              end

              if ctx.prev_context.filetype == "markdown" then
                return true
              end

              if kind == "Text" then
                return false
              end

              return true
            end,
          },
          { name = "luasnip" },
          { name = "nvim_lua" },
          { name = "buffer" },
          { name = "path" },
          { name = "treesitter" }
        },
        confirm_opts = {
          behavior = cmp.ConfirmBehavior.Replace,
          select = false,
        },
        window = {
          completion = {
            border = "rounded",
            winhighlight = "Normal:Pmenu,CursorLine:PmenuSel,FloatBorder:FloatBorder,Search:None",
            col_offset = -3,
            side_padding = 1,
            scrollbar = false,
            scrolloff = 8,
          },
          documentation = {
            border = "rounded",
            winhighlight = "Normal:Pmenu,FloatBorder:FloatBorder,Search:None",
          },
        },
      })
    end
  }
}
