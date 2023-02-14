local M = {}

-- https://blog.devgenius.io/create-custom-keymaps-in-neovim-with-lua-d1167de0f2c2
-- https://oroques.dev/notes/neovim-init/
M.map = function(mode, lhs, rhs, opts)
  local options = { noremap = true }
  if opts then
    options = vim.tbl_extend("force", options, opts)
  end
  vim.api.nvim_set_keymap(mode, lhs, rhs, options)
end

-- https://neovim.discourse.group/t/reload-init-lua-and-all-require-d-scripts/971/11
M.ReloadConfig = function()
  local hls_status = vim.v.hlsearch
  for name, _ in pairs(package.loaded) do
    if name:match("^cnull") then
      package.loaded[name] = nil
    end
  end
  dofile(vim.env.MYVIMRC)
  if hls_status == 0 then
    vim.opt.hlsearch = false
  end
end

--   פּ ﯟ   some other good icons
M.kind_icons = {
  Namespace = "",
  Text = "",
  Method = "m",
  Function = "",
  Constructor = "",
  Field = "",
  Variable = "",
  Class = "ﴯ ",
  Interface = "",
  Module = "",
  Property = "",
  Unit = "",
  Value = "",
  Enum = "",
  Keyword = "",
  Snippet = "",
  Color = "",
  File = "",
  Reference = "",
  Folder = "",
  EnumMember = "",
  Constant = " ",
  Struct = "",
  Event = "",
  Operator = "",
  TypeParameter = "",
  Object = " ",
  Table = "",
  Tag = "",
  Array = "[]",
  Boolean = " ",
  Number = " ",
  Null = "ﳠ",
  String = " ",
  Calendar = "",
  Watch = " ",
  Package = "",
}
-- find more here: https://www.nerdfonts.com/cheat-sheet


return M

-- vim.api.nvim_set_keymap('n', '<Leader>vs', '<Cmd>lua ReloadConfig()<CR>', { silent = true, noremap = true })
-- vim.cmd('command! ReloadConfig lua ReloadConfig()')
