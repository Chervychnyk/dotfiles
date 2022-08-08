local status_ok, configs = pcall(require, "nvim-treesitter.configs")
if not status_ok then
  return
end

vim.cmd [[
autocmd BufRead,BufNewFile *.wpy set filetype=vue
]]

configs.setup {
  ensure_installed = { "bash", "css", "dockerfile", "eex", "elixir", "erlang", "go", "html", "javascript", "json", "lua",
    "markdown", "proto", "ruby", "scss", "typescript", "vue", "yaml" },
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
