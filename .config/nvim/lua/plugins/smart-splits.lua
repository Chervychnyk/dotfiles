return {
  -- Upstream moved to the smart-splits-nvim org; herdr support (and the
  -- matching herdr plugin) only exists on the new repo.
  'smart-splits-nvim/smart-splits.nvim',
  -- Not lazy-loaded: the plugin must be loaded before it can detect the herdr
  -- mux backend, otherwise the first navigation inside a pane stays Neovim-only.
  lazy = false,
  opts = {
    -- Ignored buffer types (only while resizing)
    ignored_buftypes = {
      "nofile",
      "terminal",
      "prompt",
      "popup",
    },
    -- Ignored filetypes (only while resizing)
    ignored_filetypes = {
      "nofile",
      "quickfix",
      "qf",
      "prompt",
      "snacks_picker",   -- Snacks picker filetype
      "snacks_input",    -- Snacks input filetype
      "snacks_win",      -- General snacks window
      "TelescopePrompt", -- If you also use telescope
      "neo-tree",
      "Outline",
      "help",
    },
    float_win_behavior = 'previous',
    cursor_follows_swapped_bufs = true,
    -- Keep the cursor on the same screen row when hopping left/right, so the
    -- cursor stays put across panes instead of jumping to each buffer's line 1.
    move_cursor_same_row = true,
    -- Default number of lines/columns to resize by at a time
    default_amount = 3,
    -- Disable multiplexer navigation in certain contexts
    disable_multiplexer_nav_when_zoomed = true,
    -- Log level for debugging
    log_level = "info",
  },
  config = function(_, opts)
    require("smart-splits").setup(opts)

    -- resizing splits
    -- these keymaps will also accept a range,
    -- for example `10<A-h>` will `resize_left` by `(10 * config.default_amount)`
    vim.keymap.set('n', '<A-h>', require('smart-splits').resize_left)
    vim.keymap.set('n', '<A-j>', require('smart-splits').resize_down)
    vim.keymap.set('n', '<A-k>', require('smart-splits').resize_up)
    vim.keymap.set('n', '<A-l>', require('smart-splits').resize_right)
    -- moving between splits
    vim.keymap.set('n', '<C-h>', require('smart-splits').move_cursor_left)
    vim.keymap.set('n', '<C-j>', require('smart-splits').move_cursor_down)
    vim.keymap.set('n', '<C-k>', require('smart-splits').move_cursor_up)
    vim.keymap.set('n', '<C-l>', require('smart-splits').move_cursor_right)
    vim.keymap.set('n', '<C-\\>', require('smart-splits').move_cursor_previous)
    -- swapping buffers between windows
    vim.keymap.set('n', '<leader><leader>h', require('smart-splits').swap_buf_left)
    vim.keymap.set('n', '<leader><leader>j', require('smart-splits').swap_buf_down)
    vim.keymap.set('n', '<leader><leader>k', require('smart-splits').swap_buf_up)
    vim.keymap.set('n', '<leader><leader>l', require('smart-splits').swap_buf_right)
  end
}
