local util = require 'lspconfig.util'

local function get_typescript_server_path(root_dir)
  local global_ts = vim.fn.expand("$HOME") .. "/.nvm/versions/node/v20.11.0/lib/node_modules/typescript/lib"
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

vim.api.nvim_create_autocmd('LspAttach', {
  group = vim.api.nvim_create_augroup('LspAttachConflicts', { clear = true }),
  desc = 'Prevent tsserver and volar conflict',
  callback = function(args)
    if not (args.data and args.data.client_id) then
      return
    end

    local active_clients = vim.lsp.get_clients()
    local client = vim.lsp.get_client_by_id(args.data.client_id)

    if client == nil then
      return
    end

    if client.name == 'volar' then
      for _, c in ipairs(active_clients) do
        if c.name == 'tsserver' then
          c.stop()
        end
      end
    elseif client.name == 'tsserver' then
      for _, c in ipairs(active_clients) do
        if c.name == 'volar' then
          client.stop()
        end
      end
    end
  end,
})

return {
  filetypes = { "javascript", "javascriptreact", "typescript", "typescriptreact", "vue", "json" },
  init_options = {
    vue = {
      hybridMode = false,
    },
    typescript = {
      tsdk = get_typescript_server_path(vim.fn.getcwd())
    }
  },
  root_dir = util.root_pattern("nuxt.config.js", "nuxt.config.ts", "vue.config.js", "vue.config.ts"),
  -- on_new_config = function(new_config, new_root_dir)
  --   new_config.init_options.typescript.tsdk = get_typescript_server_path(new_root_dir)
  -- end,
}
