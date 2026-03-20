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

M.remove_duplicates = function(tbl)
  local result = {}
  local seen = {}

  for _, value in ipairs(tbl) do
    if not seen[value] then
      table.insert(result, value)
      seen[value] = true
    end
  end

  return result
end

-- https://neovim.discourse.group/t/reload-init-lua-and-all-require-d-scripts/971/11
M.ReloadConfig = function()
  local hls_status = vim.v.hlsearch
  local unloaded = 0
  local namespaces = { "^config", "^plugins", "^util" }

  for name, _ in pairs(package.loaded) do
    for _, ns in ipairs(namespaces) do
      if name:match(ns) then
        package.loaded[name] = nil
        unloaded = unloaded + 1
        break
      end
    end
  end

  if vim.loader and vim.loader.reset then
    pcall(vim.loader.reset)
  end

  local ok, err = pcall(dofile, vim.env.MYVIMRC)
  if not ok then
    vim.notify("Reload failed:\n" .. err, vim.log.levels.ERROR)
    return
  end

  if hls_status == 0 then
    vim.opt.hlsearch = false
  end

  vim.notify(("Neovim config reloaded (%d modules)"):format(unloaded), vim.log.levels.INFO)
end

return M

-- vim.api.nvim_set_keymap('n', '<Leader>vs', '<Cmd>lua ReloadConfig()<CR>', { silent = true, noremap = true })
-- vim.cmd('command! ReloadConfig lua ReloadConfig()')
