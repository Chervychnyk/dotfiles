local mason_present, mason = pcall(require, "mason")
if not mason_present then
	return
end

mason.setup({
  ui = {
    icons = {
      server_installed = "✓",
      server_pending = "➜",
      server_uninstalled = "✗"
    }
  }
})

local installer_present, lsp_installer = pcall(require, "mason-lspconfig")
if not installer_present then
	return
end

local servers = { "elixirls", "jsonls", "sumneko_lua" }

lsp_installer.setup({
	ensure_installed = servers,
})

local lspconfig = require("lspconfig")

for _, server in pairs(servers) do
	local opts = {
		on_attach = require("user.lsp.handlers").on_attach,
		capabilities = require("user.lsp.handlers").capabilities,
	}
	local has_custom_opts, server_custom_opts = pcall(require, "user.lsp.settings." .. server)
	if has_custom_opts then
		opts = vim.tbl_deep_extend("force", opts, server_custom_opts)
	end
	lspconfig[server].setup(opts)
end
