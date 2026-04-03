return {
  "obsidian-nvim/obsidian.nvim",
  version = "*", -- recommended, use latest release instead of latest commit
  lazy = true,
  ft = "markdown",
  opts = {
    dir = vim.fn.expand("$HOME") .. "/vaults/second-brain",
    completion = { nvim_cmp = false, blink = true, min_chars = 2 },
    daily_notes = {
      folder = "Journal",
      date_format = "%Y/%B/%d %B %Y",
      alias_format = "%d %M %Y",
      template = "Daily note"
    },
    disable_frontmatter = true,
    templates = {
      folder = "Templates",
    },
    open = {
      use_advanced_uri = true,
      func = function(uri)
        vim.ui.open(uri, { cmd = { "open", "-a", "/Applications/Obsidian.app" } })
      end,
    },
  },
  config = function(_, opts)
    require("obsidian").setup(opts)
  end
}
