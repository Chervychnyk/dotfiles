local util = require 'lspconfig.util'

-- Function to get the TypeScript server path
local function get_typescript_server_path(root_dir)
  local home_dir = vim.fn.expand("$HOME")
  local global_ts = home_dir .. "/.nvm/versions/node/v20.11.0/lib/node_modules/typescript/lib"
  local found_ts = ''

  local function check_dir(path)
    found_ts = util.path.join(path, 'node_modules', 'typescript', 'lib')
    if util.path.exists(found_ts) then
      return path
    end
  end

  if util.search_ancestors(root_dir, check_dir) then
    return found_ts
  else
    return global_ts
  end
end

-- Return the configuration for the Volar LSP
return {
  init_options = {
    vue = {
      hybridMode = false,
    },
    typescript = {
      tsdk = get_typescript_server_path(vim.fn.getcwd())
    }
  },
  root_dir = util.root_pattern("nuxt.config.js", "nuxt.config.ts", "vue.config.js", "vue.config.ts", "wepy.config.js"),
  -- Uncomment the following lines if you want to dynamically update the TypeScript SDK path
  -- on_new_config = function(new_config, new_root_dir)
  --   new_config.init_options.typescript.tsdk = get_typescript_server_path(new_root_dir)
  -- end,
}
