return {
  {
    "nvim-mini/mini.comment",
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
      options = {
        -- custom_commentstring already computes the string on demand, so no
        -- `hooks.pre` update_commentstring call is needed on top of it.
        custom_commentstring = function()
          return require('ts_context_commentstring').calculate_commentstring() or vim.bo.commentstring
        end,
      },
    },
  },

}
