local parsers = {
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

local textobjects = {
  ["af"] = "@function.outer",
  ["if"] = "@function.inner",
  ["at"] = "@class.outer",
  ["it"] = "@class.inner",
  ["ac"] = "@call.outer",
  ["ic"] = "@call.inner",
  ["aa"] = "@parameter.outer",
  ["ia"] = "@parameter.inner",
  ["al"] = "@loop.outer",
  ["il"] = "@loop.inner",
  ["ai"] = "@conditional.outer",
  ["ii"] = "@conditional.inner",
  ["a/"] = "@comment.outer",
  ["i/"] = "@comment.inner",
  ["ab"] = "@block.outer",
  ["ib"] = "@block.inner",
  ["as"] = "@statement.outer",
  ["is"] = "@scopename.inner",
  ["aA"] = "@attribute.outer",
  ["iA"] = "@attribute.inner",
  ["aF"] = "@frame.outer",
  ["iF"] = "@frame.inner",
}

local function map_textobjects()
  local select = require("nvim-treesitter-textobjects.select")
  local move = require("nvim-treesitter-textobjects.move")
  local swap = require("nvim-treesitter-textobjects.swap")

  for lhs, query in pairs(textobjects) do
    vim.keymap.set({ "x", "o" }, lhs, function()
      select.select_textobject(query, "textobjects")
    end, { desc = "Treesitter textobject " .. lhs })
  end

  vim.keymap.set("n", "<leader>a", function()
    swap.swap_next("@parameter.inner")
  end, { desc = "Swap next parameter" })

  vim.keymap.set("n", "<leader>A", function()
    swap.swap_previous("@parameter.inner")
  end, { desc = "Swap previous parameter" })

  vim.keymap.set({ "n", "x", "o" }, "]m", function()
    move.goto_next_start("@function.outer", "textobjects")
  end, { desc = "Next function start" })
  vim.keymap.set({ "n", "x", "o" }, "]]", function()
    move.goto_next_start("@class.outer", "textobjects")
  end, { desc = "Next class start" })
  vim.keymap.set({ "n", "x", "o" }, "]M", function()
    move.goto_next_end("@function.outer", "textobjects")
  end, { desc = "Next function end" })
  vim.keymap.set({ "n", "x", "o" }, "][", function()
    move.goto_next_end("@class.outer", "textobjects")
  end, { desc = "Next class end" })
  vim.keymap.set({ "n", "x", "o" }, "[m", function()
    move.goto_previous_start("@function.outer", "textobjects")
  end, { desc = "Previous function start" })
  vim.keymap.set({ "n", "x", "o" }, "[[", function()
    move.goto_previous_start("@class.outer", "textobjects")
  end, { desc = "Previous class start" })
  vim.keymap.set({ "n", "x", "o" }, "[M", function()
    move.goto_previous_end("@function.outer", "textobjects")
  end, { desc = "Previous function end" })
  vim.keymap.set({ "n", "x", "o" }, "[]", function()
    move.goto_previous_end("@class.outer", "textobjects")
  end, { desc = "Previous class end" })
end

return {
  {
    "nvim-treesitter/nvim-treesitter",
    branch = "main",
    build = ":TSUpdate",
    lazy = false,
    config = function()
      local nvim_treesitter = require("nvim-treesitter")

      nvim_treesitter.setup({})
      -- nvim_treesitter.install(parsers)

      local ts_group = vim.api.nvim_create_augroup("treesitter_012", { clear = true })

      vim.api.nvim_create_autocmd("FileType", {
        group = ts_group,
        callback = function(args)
          pcall(vim.treesitter.start, args.buf)

          if vim.bo[args.buf].filetype ~= "css" then
            vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
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
        "<leader>TI",
        function()
          require("nvim-treesitter").install(parsers)
        end,
        desc = "Install parsers",
      },
      {
        "<leader>Tu",
        "<cmd>TSUpdate<cr>",
        desc = "Update parsers",
      },
    },
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
              set_jumps = true,
            },
          })

          map_textobjects()
        end,
      },
      {
        "nvim-treesitter/nvim-treesitter-context",
        opts = { mode = "cursor" },
      },
    },
  },
}
