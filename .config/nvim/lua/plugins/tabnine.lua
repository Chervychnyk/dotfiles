return {
  'codota/tabnine-nvim',
  build = "./dl_binaries.sh",
  config = function()
    require('tabnine').setup({
      disable_auto_comment = true,
      accept_keymap = "<C-l>",
      dismiss_keymap = "<C-h>",
      debounce_ms = 300,
      suggestion_color = { gui = "#808080", cterm = 244 },
      exclude_filetypes = { "TelescopePrompt", "NvimTree", "DressingInput", "toggleterm", "dotenv", "yaml" },
      log_file_path = nil, -- absolute path to Tabnine log file
    })
  end
}
