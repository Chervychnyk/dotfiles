local catppuccin_present, catppuccin = pcall(require, "catppuccin")

if not catppuccin_present then
  return
end

vim.g.catppuccin_flavour = "macchiato" -- latte, frappe, macchiato, mocha

catppuccin.setup()

vim.cmd [[colorscheme catppuccin]]
