return {
  "epwalsh/obsidian.nvim",
  version = "*", -- recommended, use latest release instead of latest commit
  cmd = {
    "ObsidianNew",
    "ObsidianWorkspace",
    "ObsidianQuickSwitch",
    "ObsidianFollowLink",
    "ObsidianBacklinks",
    "ObsidianToday",
    "ObsidianYesterday",
    "ObsidianTemplate",
    "ObsidianSearch",
    "ObsidianLink",
    "ObsidianLinkNew"
  },
  opts = {
    dir = vim.fn.expand("$HOME") .. "/Library/Mobile Documents/iCloud~md~obsidian/Documents/Second Brain",
    completion = { nvim_cmp = true, min_chars = 2 },
    daily_notes = {
      folder = "Journal",
      date_format = "%Y/%B/%d %B %Y",
      alias_format = "%d %M %Y",
      template = "Daily note"
    },
    disable_frontmatter = true,
    templates = {
      subdir = "Templates",
    },
    follow_url_func = function(url)
      vim.fn.jobstart({ "open", url })
    end,
    use_advanced_uri = true,
    open_app_foreground = true,
  },
  config = function(_, opts)
    require("obsidian").setup(opts)
  end
}
