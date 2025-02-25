return {
  "akinsho/bufferline.nvim",
  event = "VeryLazy",
  keys = {
    { "<Tab>",   "<Cmd>BufferLineCycleNext<CR>", desc = "Next tab" },
    { "<S-Tab>", "<Cmd>BufferLineCyclePrev<CR>", desc = "Prev tab" },
  },
  opts = {
    options = {
      mode = "tabs",
      -- separator_style = "slant",
      show_buffer_close_icons = false,
      show_close_icon = false,
      diagnostics = 'nvim_lsp',
      -- show_tab_indicators = true,
      -- enforce_regular_tabs = true,
      always_show_bufferline = false,
      -- indicator = {
      -- 	style = 'underline',
      -- },
      close_command = function(n)
        Snacks.bufdelete(n)
      end,
      right_mouse_command = function(n)
        Snacks.bufdelete(n)
      end,
      custom_filter = function(bufnr)
        -- if the result is false, this buffer will be shown, otherwise, this
        -- buffer will be hidden.

        -- filter out filetypes you don't want to see
        local exclude_ft = { "alpha", "git", "qf", "Avante", "AvanteInput", "NeogitStatus", "NvimTree",
          "TelescopePrompt", "TelescopeResults", "snacks_picker_input" }
        local cur_ft = vim.bo[bufnr].filetype

        local should_filter = vim.tbl_contains(exclude_ft, cur_ft)
        return not should_filter
      end,
      diagnostics_indicator = function(_, _, diag)
        local icons = require("config.icons").diagnostics
        local ret = (diag.error and icons.BoldError .. ' ' .. diag.error .. ' ' or '')
            .. (diag.warning and icons.BoldWarning .. ' ' .. diag.warning or '')
        return vim.trim(ret)
      end,
      offsets = {
        {
          filetype = 'NvimTree',
          text = "File Explorer",
          highlight = 'Directory',
          text_align = 'center',
          separator = true,
        },
      },
    },
  },
}
