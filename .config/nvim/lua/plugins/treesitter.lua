local languages = {
  "bash",
  "css",
  "diff",
  "dockerfile",
  "eex",
  "elixir",
  "erlang",
  "go",
  "html",
  "javascript",
  "jsdoc",
  "json",
  "json5",
  "lua",
  "luadoc",
  "markdown",
  "markdown_inline",
  "proto",
  "python",
  "pug",
  "query",
  "regex",
  "ruby",
  "scss",
  "sql",
  "toml",
  "typescript",
  "vim",
  "vimdoc",
  "vue",
  "yaml",
}

-- Indentation is only taken from tree-sitter for languages whose grammar ships
-- a query for it. Overwriting `indentexpr` for every filetype clobbered the
-- settings that some filetypes set for themselves.
local indent_from_ts = {
  bash = true,
  css = true,
  elixir = true,
  erlang = true,
  go = true,
  html = true,
  javascript = true,
  json = true,
  lua = true,
  python = true,
  ruby = true,
  rust = true,
  sql = true,
  toml = true,
  typescript = true,
  vue = true,
}

return {
  {
    "nvim-treesitter/nvim-treesitter",
    branch = "main",
    build = ":TSUpdate",
    lazy = false,
    dependencies = {
      {
        "nvim-treesitter/nvim-treesitter-textobjects",
        branch = "main",
        lazy = false,
        config = function()
          require("nvim-treesitter-textobjects").setup({
            select = {
              lookahead = true,
            },
            move = {
              set_jumps = false,
            },
          })
        end,
      },
      {
        "nvim-treesitter/nvim-treesitter-context",
        opts = { mode = "cursor" },
      },
    },
    config = function()
      local ts = require("nvim-treesitter")

      -- Install only what is missing. install() already skips parsers that are
      -- present, but calling it unconditionally still spins up its async
      -- machinery on every startup; this reduces the steady state to one
      -- directory read.
      local installed = {}
      for _, lang in ipairs(ts.get_installed()) do
        installed[lang] = true
      end
      local missing = vim.tbl_filter(function(lang)
        return not installed[lang]
      end, languages)
      if #missing > 0 then
        ts.install(missing)
      end

      local augroup = vim.api.nvim_create_augroup("treesitter.setup", { clear = true })

      vim.api.nvim_create_autocmd("FileType", {
        group = augroup,
        callback = function(args)
          local buf = args.buf
          local filetype = args.match

          local language = vim.treesitter.language.get_lang(filetype) or filetype
          if not vim.treesitter.language.add(language) then
            return
          end

          vim.wo.foldmethod = "expr"
          vim.wo.foldexpr = "v:lua.vim.treesitter.foldexpr()"

          vim.treesitter.start(buf, language)

          if indent_from_ts[language] then
            vim.bo[buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
          end
        end,
      })
    end,
    keys = {
      {
        "<leader>Ti",
        "<cmd>InspectTree<cr>",
        desc = "Inspect tree",
      },
      {
        "<leader>Tu",
        "<cmd>TSUpdate<cr>",
        desc = "Update parsers",
      },
    },
  },
}
