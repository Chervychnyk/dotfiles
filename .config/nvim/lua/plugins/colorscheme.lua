return {
  -- Colorschemes
  -- "EdenEast/nightfox.nvim",
  -- "rebelot/kanagawa.nvim",
  -- 'projekt0n/github-nvim-theme',
  -- { "catppuccin/nvim", name = "catppuccin" },
  {
    'rose-pine/neovim',
    name = 'rose-pine',
    config = function()
      require("rose-pine").setup({
        highlight_groups = {
          CopilotDisabled = { fg = "muted" },
          CopilotEnabled = { fg = "foam" },
          CopilotSleep = { fg = "iris" },
        },
      })
    end
  },
}
