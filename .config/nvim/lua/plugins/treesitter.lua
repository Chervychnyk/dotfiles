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
      require('nvim-treesitter').install(languages)

      vim.api.nvim_create_autocmd("FileType", {
        group = vim.api.nvim_create_augroup('treesitter.setup', {}),
        callback = function(args)
          local buf = args.buf
          local filetype = args.match

          local language = vim.treesitter.language.get_lang(filetype) or filetype
          if not vim.treesitter.language.add(language) then
            return
          end

          vim.wo.foldmethod = 'expr'
          vim.wo.foldexpr = 'v:lua.vim.treesitter.foldexpr()'

          vim.treesitter.start(buf, language)

          vim.bo[buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
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
