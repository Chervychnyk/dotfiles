local status_ok, configs = pcall(require, "nvim-treesitter.configs")
if not status_ok then
	return
end

configs.setup {
  ensure_installed = { "bash", "css", "erlang", "elixir", "go", "javascript", "html", "json", "lua", "proto", "ruby", "scss", "yaml" },
  sync_install = false,
  highlight = {
    enable = true,
    additional_vim_regex_highlighting = false,
  },
  autopairs = {
		enable = true,
	},
	indent = { enable = true, disable = { "css" } },
}
