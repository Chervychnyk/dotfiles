return {
  {
    "echasnovski/mini.comment",
    event = "VeryLazy",
    dependencies = {
      {
        "JoosepAlviste/nvim-ts-context-commentstring",
        lazy = true,
        opts = {
          enable_autocmd = false,
        },
      },
    },
    opts = {
      hooks = {
        pre = function()
          require('ts_context_commentstring.internal').update_commentstring({})
        end
      },
      options = {
        custom_commentstring = function()
          return require('ts_context_commentstring').calculate_commentstring() or vim.bo.commentstring
        end,
      },
    },
  },

}
