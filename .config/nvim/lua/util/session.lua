-- Session persistence: one session file per project root, so window layout,
-- split sizes, folds, cursor positions and numbered marks survive a restart.
--
-- Saving is automatic on exit. Restoring never is: opening Neovim in a project
-- you have worked in before should give you a clean start, not yesterday's
-- layout you now have to unpick. The saved layout is there when you want it --
-- <leader>rs, the dashboard entry, or :SessionRestore -- and all three only
-- appear once a session actually exists for this project.
local M = {}

local function session_path()
  local cwd = vim.fn.getcwd()
  -- Keep it one flat file per project; anything outside a word, dot or dash
  -- becomes a dash so a nested path stays a valid filename.
  local name = cwd:gsub("[^%w%.%-]", "-")
  return vim.fn.stdpath("data") .. "/sessions/" .. name .. ".vim"
end

-- A nested nvim inherits $NVIM and shares its parent's session path, so it must
-- neither overwrite nor inherit that session.
local function is_nested()
  return vim.fn.exists("$NVIM") == 1
end

--- Whether this project has a saved session to restore.
--- Gates the dashboard entry and the keymap so neither appears when there is
--- nothing to restore.
---@return boolean
function M.available()
  if is_nested() then
    return false
  end
  return vim.fn.filereadable(session_path()) == 1
end

--- Restore the saved session. Always an explicit, user-initiated action, so
--- there is no argument guard: opening a file and still choosing to restore is
--- a legitimate thing to do.
---@return boolean restored
function M.restore()
  local path = session_path()
  if vim.fn.filereadable(path) == 0 then
    vim.notify("No saved session for " .. vim.fn.getcwd(), vim.log.levels.WARN, { title = "Session" })
    return false
  end

  vim.cmd("source " .. vim.fn.fnameescape(path))
  vim.notify("Session restored", vim.log.levels.INFO, { title = "Session" })
  return true
end

function M.save(force)
  if is_nested() and not force then
    return
  end

  local path = session_path()
  vim.fn.mkdir(vim.fn.fnamemodify(path, ":h"), "p")
  -- `!` overwrites silently; without it a second :qa asks for confirmation.
  vim.cmd("mksession! " .. vim.fn.fnameescape(path))
end

function M.delete()
  local path = session_path()
  if vim.fn.filereadable(path) == 1 then
    vim.fn.delete(path)
    vim.notify("Deleted session for " .. vim.fn.getcwd(), vim.log.levels.INFO, { title = "Session" })
  end
end

local group = vim.api.nvim_create_augroup("config_session", { clear = true })

vim.api.nvim_create_autocmd("VimLeavePre", {
  group = group,
  desc = "Save the session before exiting",
  callback = function()
    M.save()
  end,
})

vim.api.nvim_create_autocmd("VimEnter", {
  group = group,
  desc = "Expose <leader>rs when this project has a saved session",
  callback = function()
    -- VimEnter rather than load time, because it is the first point where the
    -- cwd is settled, and the session file is named after it. Skipped entirely
    -- when there is no session, so the keymap stays out of which-key for
    -- projects that have never been saved.
    vim.schedule(function()
      if M.available() then
        vim.keymap.set("n", "<leader>rs", function()
          M.restore()
        end, { desc = "Restore session", silent = true })
      end
    end)
  end,
})

vim.api.nvim_create_user_command("SessionSave", function()
  M.save(true)
end, { desc = "Write the session file now" })

vim.api.nvim_create_user_command("SessionRestore", function()
  M.restore()
end, { desc = "Restore the session file for this project" })

vim.api.nvim_create_user_command("SessionDelete", function()
  M.delete()
end, { desc = "Delete the session file for this project" })

return M
