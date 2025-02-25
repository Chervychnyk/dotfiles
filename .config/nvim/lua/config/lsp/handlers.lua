local icons = require("config.icons")
local M = {}

M.setup = function()
  local config = {
    -- disable virtual text
    virtual_text = false,
    -- show signs
    signs = {
      text = {
        [vim.diagnostic.severity.ERROR] = icons.diagnostics.Error,
        [vim.diagnostic.severity.WARN] = icons.diagnostics.Warning,
        [vim.diagnostic.severity.HINT] = icons.diagnostics.Hint,
        [vim.diagnostic.severity.INFO] = icons.diagnostics.Information,
      },
    },
    update_in_insert = false,
    underline = false,
    severity_sort = true,
    float = {
      focusable = true,
      style = "minimal",
      border = "rounded",
      header = "",
      prefix = "",
    },
  }

  vim.diagnostic.config(config)

  -- vim.lsp.handlers["textDocument/hover"] = vim.lsp.with(vim.lsp.handlers.hover, { border = "rounded" })
  -- vim.lsp.handlers["textDocument/signatureHelp"] = vim.lsp.with(vim.lsp.handlers.signature_help, { border = "rounded" })
  require("lspconfig.ui.windows").default_options.border = "rounded"
end

local function lsp_keymaps(bufnr)
  -- Mappings.
  local map = function(mode, l, r, opts)
    opts = opts or {}
    opts.silent = true
    opts.buffer = bufnr
    vim.keymap.set(mode, l, r, opts)
  end

  map("n", "gd", vim.lsp.buf.definition, { desc = "Go to definition" })
  map("n", "K", vim.lsp.buf.hover)
  map("n", "<leader>rn", vim.lsp.buf.rename, { desc = "Rename symbol" })
  map("n", "gr", function() Snacks.picker.lsp_references() end, { desc = "Show references" })
  map('n', 'gi', vim.lsp.buf.implementation, { desc = "Go to implementation" })
  map('n', 'gD', vim.lsp.buf.type_definition, { desc = "Go to type definition" })
  map("n", "[d", vim.diagnostic.goto_prev, { desc = "Previous diagnostic" })
  map("n", "]d", vim.diagnostic.goto_next, { desc = "Next diagnostic" })
  map("n", "sd", vim.diagnostic.open_float, { desc = "Open diagnostics in float" })
  map({ "n", "v" }, "<leader>la", vim.lsp.buf.code_action, { desc = "Code actions" })
  map('n', '<leader>lh', function()
    vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled {})
  end, { desc = 'Toggle inlay hints' })
end

M.on_attach = function(client, bufnr)
  lsp_keymaps(bufnr)

  if client.supports_method "textDocument/inlayHint" then
    vim.lsp.inlay_hint.enable(true)
  end
end

function M.capabilities()
  local capabilities = vim.lsp.protocol.make_client_capabilities()
  capabilities.textDocument.completion.completionItem.snippetSupport = true
  capabilities.textDocument.completion.completionItem.resolveSupport = {
    properties = {
      "documentation",
      "detail",
      "additionalTextEdits",
    },
  }
  capabilities.textDocument.foldingRange = {
    dynamicRegistration = false,
    lineFoldingOnly = true,
  }

  capabilities.workspace.didChangeWatchedFiles = {
    dynamicRegistration = false,
  }

  local status_ok, blink_cmp = pcall(require, "blink.cmp")
  if not status_ok then
    return capabilities
  end

  return vim.tbl_deep_extend("force", capabilities, blink_cmp.get_lsp_capabilities())
end

return M
