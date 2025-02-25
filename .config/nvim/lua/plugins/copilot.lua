return {
  "zbirenbaum/copilot.lua",
  cmd = "Copilot",
  event = "InsertEnter",
  config = function()
    require("copilot").setup({
      suggestion = {
        enabled = false,
        auto_trigger = false,
        keymap = {
          accept = "<C-l>",
          dismiss = "<C-x>",
        },
      },
      panel = {
        enabled = false,
      },
      filetypes = {
        codecompanion = false,
        dotenv = false,
        gitcommit = false,
        gitrebase = false,
        help = false,
        TelescopePrompt = false,
        TelescopeResults = false,
        yaml = function()
          -- disable for credentials.yml in Rails application
          if string.match(vim.fs.basename(vim.api.nvim_buf_get_name(0)), "^credentials.*") then
            return false
          end
          return true
        end
      },
      copilot_node_command = vim.fn.expand("$HOME") .. "/.nvm/versions/node/v20.11.0/bin/node",
    })

    vim.cmd [[
      command! CopilotToggle lua require("copilot.suggestion").toggle_auto_trigger()
    ]]

    vim.api.nvim_set_keymap('n', '<leader>ct', ':CopilotToggle<CR>',
      { desc = "Toggle Copilot suggestions", noremap = true, silent = true })
  end
}
