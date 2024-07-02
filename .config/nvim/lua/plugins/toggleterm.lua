return {
  "akinsho/toggleterm.nvim",
  event = "VeryLazy",
  config = function()
    require("toggleterm").setup({
      open_mapping = [[<C-t>]],
      shade_filetypes = { "none" },
      start_in_insert = true,
      insert_mappings = true,
      persist_size = false,
      direction = "horizontal",
      close_on_exit = true, -- close the terminal window when the process exits
      shell = nil,          -- change the default shell
      float_opts = {
        border = "rounded",
        winblend = 0,
        highlights = {
          border = "Normal",
          background = "Normal",
        },
      },
      size = function(term)
        if term.direction == "horizontal" then
          return math.floor(vim.o.lines * 0.3)
        elseif term.direction == "vertical" then
          return math.floor(vim.o.columns * 0.4)
        end
      end,
    })

    vim.api.nvim_create_autocmd({ "TermEnter" }, {
      pattern = { "*" },
      callback = function()
        vim.cmd "startinsert"

        local opts = { noremap = true, silent = true }

        vim.api.nvim_buf_set_keymap(0, "t", '<esc>', [[<C-\><C-n>]], opts)
        vim.api.nvim_buf_set_keymap(0, "t", 'jk', [[<C-\><C-n>]], opts)
        vim.api.nvim_buf_set_keymap(0, "t", '<C-w>', [[<C-\><C-n><C-w>]], opts)
      end,
    })

    local Terminal = require("toggleterm.terminal").Terminal
    local k9s = Terminal:new {
      cmd = "k9s",
      dir = "git_dir",
      direction = "float",
      float_opts = {
        border = "rounded",
      },
      -- function to run on opening the terminal
      on_open = function(term)
        vim.cmd "startinsert!"
        vim.api.nvim_buf_set_keymap(term.bufnr, "n", "q", "<cmd>close<CR>", { noremap = true, silent = true })
      end,
      -- function to run on closing the terminal
      on_close = function(_)
        vim.cmd "startinsert!"
      end,
    }

    vim.api.nvim_create_user_command("ToggleK9s", function()
      k9s:toggle()
    end, {})

    vim.api.nvim_set_keymap("n", "<leader>ks", "<cmd>ToggleK9s<CR>", { noremap = true, silent = true })
  end
}
