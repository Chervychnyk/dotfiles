return {
  {
    "rebelot/kanagawa.nvim",
    priority = 1000,
    config = function()
      require("kanagawa").setup({
        theme = "wave",
        transparent = true,
        overrides = function(colors)
          local theme = colors.theme
          return {
            FloatBorder = { fg = theme.ui.special, bg = "none" },
            PmenuSel = { fg = "none", bg = theme.ui.bg_p2 },
          }
        end,
      })
    end,
  },
}
