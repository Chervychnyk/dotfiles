local status_ok, indent_blankline = pcall(require, "indent_blankline")
if not status_ok then
	return
end

indent_blankline.setup({
  char = "▏",
  use_treesitter = true,
	show_current_context = true,
  show_first_indent_level = true,
  show_trailing_blankline_indent = false,
  filetype_exclude = {
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
  },
  buftype_exclude = {
    'terminal',
    'nofile',
    'quickfix',
    'prompt',
  },
})
