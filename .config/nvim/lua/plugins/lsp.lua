local icons = require("config.icons")

return {
  "neovim/nvim-lspconfig",
  dependencies = {
    "williamboman/mason.nvim",
    "williamboman/mason-lspconfig.nvim",
    "WhoIsSethDaniel/mason-tool-installer.nvim",
  },

  event = { "BufReadPre", "BufNewFile" },

  config = function()
    local servers = {
      "basedpyright",
      "cssls",
      "dockerls",
      "docker_compose_language_service",
      "elixirls",
      "emmet_ls",
      -- "gitlab_ci_ls",
      "jsonls",
      "lemminx",
      -- "lexical",
      "lua_ls",
      "marksman",
      "ruby_lsp",
      "ruff",
      -- "solargraph",
      "vtsls",
      "vue_ls",
      "yamlls",
    }

    -- ========================================
    -- Diagnostic Configuration
    -- ========================================
    local diagnostic_config = {
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

    vim.diagnostic.config(diagnostic_config)

    -- Set rounded borders for LSP windows
    require("lspconfig.ui.windows").default_options.border = "rounded"

    -- ========================================
    -- LSP Keymaps
    -- ========================================
    local function lsp_keymaps(bufnr)
      local map = function(mode, l, r, opts)
        opts = opts or {}
        opts.silent = true
        opts.buffer = bufnr
        vim.keymap.set(mode, l, r, opts)
      end

      map("n", "gd", vim.lsp.buf.definition, { desc = "Go to definition" })
      map("n", "K", vim.lsp.buf.hover)
      map("n", "<leader>rn", vim.lsp.buf.rename, { desc = "Rename symbol" })
      map("n", "gr", function()
        Snacks.picker.lsp_references()
      end, { desc = "Show references" })
      map("n", "gi", vim.lsp.buf.implementation, { desc = "Go to implementation" })
      map("n", "gD", vim.lsp.buf.type_definition, { desc = "Go to type definition" })
      map("n", "[d", function()
        vim.diagnostic.jump({ count = -1 })
      end, { desc = "Previous diagnostic" })
      map("n", "]d", function()
        vim.diagnostic.jump({ count = 1 })
      end, { desc = "Next diagnostic" })
      map("n", "sd", vim.diagnostic.open_float, { desc = "Open diagnostics in float" })
      map({ "n", "v" }, "<leader>la", vim.lsp.buf.code_action, { desc = "Code actions" })
      map("n", "<leader>lh", function()
        local filter = { bufnr = bufnr }
        vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled(filter), filter)
      end, { desc = "Toggle inlay hints" })
    end

    -- ========================================
    -- LSP on_attach
    -- ========================================
    local function on_attach(client, bufnr)
      lsp_keymaps(bufnr)

      if client:supports_method("textDocument/inlayHint") then
        vim.lsp.inlay_hint.enable(true, { bufnr = bufnr })
      end
    end

    -- ========================================
    -- LSP Capabilities
    -- ========================================
    local function capabilities()
      local caps = vim.lsp.protocol.make_client_capabilities()
      caps.textDocument.completion.completionItem.snippetSupport = true
      caps.textDocument.completion.completionItem.resolveSupport = {
        properties = {
          "documentation",
          "detail",
          "additionalTextEdits",
        },
      }
      caps.textDocument.foldingRange = {
        dynamicRegistration = false,
        lineFoldingOnly = true,
      }

      caps.workspace.didChangeWatchedFiles = {
        dynamicRegistration = false,
      }

      -- Integrate with blink.cmp if available
      local status_ok, blink_cmp = pcall(require, "blink.cmp")
      if status_ok then
        return vim.tbl_deep_extend("force", caps, blink_cmp.get_lsp_capabilities())
      end

      return caps
    end

    -- ========================================
    -- Mason Setup
    -- ========================================
    local mason = require("mason")
    local mason_lspconfig = require("mason-lspconfig")
    local mason_tool_installer = require("mason-tool-installer")

    -- Enable mason and configure icons
    mason.setup({
      ui = {
        icons = {
          package_installed = "✓",
          package_pending = "➜",
          package_uninstalled = "✗",
        },
      },
    })

    -- List of servers for mason to install
    mason_lspconfig.setup({
      ensure_installed = servers,
      automatic_enable = false,
    })

    -- Mason tool installer for formatters and linters
    mason_tool_installer.setup({
      ensure_installed = {
        "prettier", -- prettier formatter
        "stylua", -- lua formatter
        "black", -- python formatter
        "ruff", -- python formatter
        "eslint_d",
      },
    })

    -- ========================================
    -- LSP Server Configuration
    -- ========================================
    local base_capabilities = capabilities()

    for _, server_name in ipairs(servers) do
      local opts = {
        on_attach = on_attach,
        capabilities = vim.deepcopy(base_capabilities),
      }

      -- Load server-specific configuration if available.
      local has_custom_opts, server_custom_opts = pcall(require, "config.lsp.settings." .. server_name)
      if has_custom_opts then
        opts = vim.tbl_deep_extend("force", opts, server_custom_opts)
      end

      vim.lsp.config(server_name, opts)
      vim.lsp.enable(server_name)
    end
  end,
}
