return {
  "neanias/everforest-nvim",
  version = false,
  lazy = false,
  priority = 1000, -- make sure to load this before all the other start plugins
  -- Optional; default configuration will be used if setup isn't called.
  config = function()
    require("everforest").setup({
      background = "hard",
    })
    -- setup() only merges config; it does not load the palette. colors/
    -- everforest.lua calls require("everforest").load(), which is what
    -- actually applies it. Applying it here rather than from a separate
    -- config.colorscheme module keeps the colorscheme in one place.
    vim.cmd.colorscheme("everforest")
  end,
}
