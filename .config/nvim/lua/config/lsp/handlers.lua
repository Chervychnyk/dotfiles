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
    underline = true,
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

  vim.lsp.handlers["textDocument/hover"] = vim.lsp.with(vim.lsp.handlers.hover, { border = "rounded" })
  vim.lsp.handlers["textDocument/signatureHelp"] = vim.lsp.with(vim.lsp.handlers.signature_help, { border = "rounded" })
  require("lspconfig.ui.windows").default_options.border = "rounded"
end

local function lsp_highlight_document(client)
  -- Set autocommands conditional on server_capabilities
  local status_ok, illuminate = pcall(require, "illuminate")
  if not status_ok then
    return
  end
  illuminate.on_attach(client)
  -- end
end

-- set quickfix list from diagnostics in a certain buffer, not the whole workspace
local set_qflist = function(buf_num, severity)
  local diagnostics = nil
  diagnostics = vim.diagnostic.get(buf_num, { severity = severity })

  local qf_items = vim.diagnostic.toqflist(diagnostics)
  vim.fn.setqflist({}, ' ', { title = 'Diagnostics', items = qf_items })

  -- open quickfix by default
  vim.cmd [[copen]]
end

local function lsp_keymaps(bufnr)
  -- Mappings.
  local map = function(mode, l, r, opts)
    opts = opts or {}
    opts.silent = true
    opts.buffer = bufnr
    vim.keymap.set(mode, l, r, opts)
  end

  map("n", "gd", vim.lsp.buf.definition, { desc = "go to definition" })
  map("n", "K", vim.lsp.buf.hover)
  map("n", "<C-k>", vim.lsp.buf.signature_help)
  map("n", "<space>rn", vim.lsp.buf.rename, { desc = "varialbe rename" })
  map("n", "gr", vim.lsp.buf.references, { desc = "show references" })
  map("n", "[d", vim.diagnostic.goto_prev, { desc = "previous diagnostic" })
  map("n", "]d", vim.diagnostic.goto_next, { desc = "next diagnostic" })
  -- this puts diagnostics from opened files to quickfix
  map("n", "<space>qw", vim.diagnostic.setqflist, { desc = "put window diagnostics to qf" })
  -- this puts diagnostics from current buffer to quickfix
  map("n", "<space>qb", function() set_qflist(bufnr) end, { desc = "put buffer diagnostics to qf" })
  map({ "n", "v" }, "<space>ca", vim.lsp.buf.code_action, { desc = "LSP code action" })
  map("n", "<space>wa", vim.lsp.buf.add_workspace_folder, { desc = "add workspace folder" })
  map("n", "<space>wr", vim.lsp.buf.remove_workspace_folder, { desc = "remove workspace folder" })
  map("n", "<space>wl", function()
    vim.inspect(vim.lsp.buf.list_workspace_folders())
  end, { desc = "list workspace folder" })
  map('n', '<leader>lh', function()
    vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled {})
  end, { desc = 'LSP inlay hints' })
end

M.on_attach = function(client, bufnr)
  lsp_keymaps(bufnr)
  lsp_highlight_document(client)

  if client.supports_method "textDocument/inlayHint" then
    vim.lsp.inlay_hint.enable(true)
  end
end

function M.capabilities()
  local status_ok, cmp_nvim_lsp = pcall(require, "cmp_nvim_lsp")
  if status_ok then
    return cmp_nvim_lsp.default_capabilities()
  end

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

  return capabilities
end

return M
