local configs = require("lspconfig.configs")
local util = require("lspconfig.util")

local lexical_config = {
  filetypes = { "elixir", "eelixir", "heex", "surface" },
  cmd = {
    vim.fn.stdpath("data") .. "/lsp/lexical/bin/start_lexical.sh" },
  settings = {},
}

if not configs.lexical then
  configs.lexical = {
    default_config = {
      filetypes = lexical_config.filetypes,
      cmd = lexical_config.cmd,
      root_dir = function(fname)
        return util.root_pattern("mix.exs", ".git")(fname) or vim.loop.os_homedir()
      end,
      -- optional settings
      settings = lexical_config.settings,
    },
  }
end

return {}
