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

    -- Resizing splits. Plain <A-h/j/k/l> is the obvious chord, but OmniWM binds
    -- Option+H/J/K/L to window focus and wins them. ctrl+alt is the one
    -- modifier family Herdr's docs single out as left free by terminals, and it
    -- is immune to the macOS option-key composing that mangles plain alt chords.
    -- It also mirrors the <C-h/j/k/l> navigation chord one modifier across.
    -- These accept a range: `10<C-A-h>` resizes left by `(10 * default_amount)`.
    --
    -- Known gap: resizing at a split edge that touches the pane border reaches
    -- herdr through `herdr pane resize --amount`, which reads its argument as a
    -- fraction of the pane area while smart-splits passes `default_amount` in
    -- cells. The pane therefore snaps to its minimum or maximum rather than
    -- stepping once. Resizing inside Neovim is unaffected.
    vim.keymap.set('n', '<C-A-h>', require('smart-splits').resize_left)
    vim.keymap.set('n', '<C-A-j>', require('smart-splits').resize_down)
    vim.keymap.set('n', '<C-A-k>', require('smart-splits').resize_up)
    vim.keymap.set('n', '<C-A-l>', require('smart-splits').resize_right)
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
