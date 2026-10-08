local utils = {
  "marks",
  "session",
}

for _, util in ipairs(utils) do
  -- Surface failures instead of swallowing them: a broken util file previously
  -- just silently stopped registering its keymaps.
  local ok, err = pcall(require, "util." .. util)
  if not ok then
    vim.notify(("util.%s failed to load:\n%s"):format(util, err), vim.log.levels.ERROR, { title = "util" })
  end
end
