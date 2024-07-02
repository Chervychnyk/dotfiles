return {
  "goolord/alpha-nvim",
  opts = function()
    local dashboard = require("alpha.themes.dashboard")
    local icons = require "config.icons"

    local function button(sc, txt, keybind, keybind_opts)
      local b = dashboard.button(sc, txt, keybind, keybind_opts)
      b.opts.hl_shortcut = "Macro"
      return b
    end

    dashboard.section.header.val = {
      "                                                     ",
      "  ███╗   ██╗███████╗ ██████╗ ██╗   ██╗██╗███╗   ███╗ ",
      "  ████╗  ██║██╔════╝██╔═══██╗██║   ██║██║████╗ ████║ ",
      "  ██╔██╗ ██║█████╗  ██║   ██║██║   ██║██║██╔████╔██║ ",
      "  ██║╚██╗██║██╔══╝  ██║   ██║╚██╗ ██╔╝██║██║╚██╔╝██║ ",
      "  ██║ ╚████║███████╗╚██████╔╝ ╚████╔╝ ██║██║ ╚═╝ ██║ ",
      "  ╚═╝  ╚═══╝╚══════╝ ╚═════╝   ╚═══╝  ╚═╝╚═╝     ╚═╝ ",
      "                                                     ",
    }
    dashboard.section.buttons.val = {
      button("f", icons.ui.Files .. " Find file", ":Telescope find_files <CR>"),
      button("n", icons.ui.NewFile .. " New file", ":ene <BAR> startinsert <CR>"),
      -- button("s", icons.ui.SignIn .. " Load session", ":lua require('persistence').load()<CR>"),
      button("p", icons.git.Repo .. " Find project", ":lua require('telescope').extensions.projects.projects()<CR>"),
      button("r", icons.ui.History .. " Recent files", ":Telescope oldfiles <CR>"),
      button("t", icons.ui.Text .. " Find text", ":Telescope live_grep <CR>"),
      button("o", icons.ui.Note .. " Obsidian", ":ObsidianQuickSwitch <CR>"),
      button("c", icons.ui.Gear .. " Config", ":e ~/.config/nvim/init.lua <CR>"),
      button("q", icons.ui.SignOut .. " Quit", ":qa<CR>"),
    }

    local fortune = require("alpha.fortune")
    dashboard.section.footer.val = fortune()

    dashboard.section.header.opts.hl = "String"
    dashboard.section.buttons.opts.hl = "Macro"
    dashboard.section.footer.opts.hl = "Type"

    dashboard.opts.opts.noautocmd = true
    return dashboard
  end,

  config = function(_, dashboard)
    require("alpha").setup(dashboard.config)

    vim.api.nvim_create_autocmd("User", {
      pattern = "LazyVimStarted",
      callback = function()
        local stats = require("lazy").stats()
        local ms = (math.floor(stats.startuptime * 100 + 0.5) / 100)
        dashboard.section.footer.val = "Loaded " .. stats.count .. " plugins in " .. ms .. "ms"
        pcall(vim.cmd.AlphaRedraw)
      end,
    })

    vim.api.nvim_create_autocmd({ "User" }, {
      pattern = { "AlphaReady" },
      callback = function()
        vim.cmd [[
          set laststatus=0 | autocmd BufUnload <buffer> set laststatus=3
        ]]
      end,
    })
  end
}
