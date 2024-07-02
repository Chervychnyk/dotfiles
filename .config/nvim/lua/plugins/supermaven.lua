return {
  "supermaven-inc/supermaven-nvim",
  event = "InsertEnter",
  config = function()
    require("supermaven-nvim").setup({
      keymaps = {
        accept_suggestion = "<C-l>",
        clear_suggestion = "<C-h>",
        accept_word = "<C-p>"
      },
      ignore_filetypes = {
        dotenv = true,
        gitcommit = true,
        gitrebase = true,
        help = true,
        -- yaml = true,
        TelescopePrompt = true,
        TelescopeResults = true
      },
      color = {
        suggestion_color = "#808080",
        cterm = 244,
      },
    })

    local opts = { noremap = true, silent = true }
    vim.api.nvim_set_keymap("n", "<C-s>", ":lua require('supermaven-nvim.api').toggle()<CR>", opts)
  end,
}
