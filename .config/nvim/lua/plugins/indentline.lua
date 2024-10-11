return {
  "lukas-reineke/indent-blankline.nvim",
  main = "ibl",
  event = { "BufReadPre", "BufNewFile" },
  opts = {
    indent = { char = "▏" },
    scope = { show_start = false, show_end = false },
    exclude = {
      buftypes = {
        'terminal',
        'nofile',
        'quickfix',
        'prompt',
      },
      filetypes = {
        'lspinfo',
        'packer',
        'checkhealth',
        'help',
        'man',
        'alpha',
        'git',
        'markdown',
        'text',
        'terminal',
        'NvimTree',
        'Trouble'
      },
    },
  }
}
