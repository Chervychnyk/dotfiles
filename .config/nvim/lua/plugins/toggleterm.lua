return {
  "akinsho/toggleterm.nvim",
  event = "VeryLazy",
  config = function()
    require("toggleterm").setup({
      size = 20,
      open_mapping = [[<c-t>]],
      on_open = function(_term)
        vim.cmd("startinsert!")
      end,
      on_close = function(_term)
        vim.cmd("startinsert!")
      end,
      hide_numbers = true, -- hide the number column in toggleterm buffers
      shade_filetypes = {},
      shade_terminals = true,
      shading_factor = 2,     -- the degree by which to darken to terminal colour, default: 1 for dark backgrounds, 3 for light
      start_in_insert = true,
      insert_mappings = true, -- whether or not the open mapping applies in insert mode
      persist_size = false,
      direction = "float",
      float_opts = {
        border = "rounded",
        winblend = 0,
        highlights = {
          border = "Normal",
          background = "Normal",
        },
      },
      winbar = {
        enabled = true,
        name_formatter = function(term) --  term: Terminal
          return term.count
        end,
      },
    })

    vim.api.nvim_create_autocmd({ "TermEnter" }, {
      pattern = { "*" },
      callback = function()
        vim.cmd "startinsert"
        _G.set_terminal_keymaps()
      end,
    })

    local opts = { noremap = true, silent = true }
    function _G.set_terminal_keymaps()
      vim.api.nvim_buf_set_keymap(0, "t", '<esc>', [[<C-\><C-n>]], opts)
      vim.api.nvim_buf_set_keymap(0, "t", 'jk', [[<C-\><C-n>]], opts)
    end

    -- abstract to function
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
      on_close = function(_term)
        vim.cmd "startinsert!"
      end,
    }

    function _k9s_toggle()
      k9s:toggle()
    end

    vim.api.nvim_set_keymap("n", "<leader>ks", "<cmd>lua _k9s_toggle()<CR>", { noremap = true, silent = true })
  end
}
