return {
  {
    "dmtrKovalenko/fff.nvim",
    commit = "1c2c0633cdb933a9b4111d9e6dfa4a476a35ff9f",
    build = function()
      require("fff.download").download_or_build_binary()
    end,
    lazy = false,
    keys = {
      {
        "<leader>ff",
        function()
          require("fff").find_files()
        end,
        desc = "Find Files",
      },
      {
        "<leader>ft",
        function()
          require("fff").live_grep()
        end,
        desc = "Grep",
      },
      {
        "<leader>fs",
        function()
          require("fff").live_grep({ query = vim.fn.expand("<cword>") })
        end,
        desc = "Search current word",
      },
    },
    opts = {
      base_path = vim.fn.getcwd(),
      lazy_sync = true,
      prompt = " ",
      title = "Find Files",
      max_results = 100,
      keymaps = {
        close = "<C-c>",
      },
      layout = {
        height = 0.8,
        width = 0.8,
        prompt_position = "bottom",
        preview_position = "right",
        preview_size = 0.5,
        flex = {
          size = 130,
          wrap = "top",
        },
        show_scrollbar = true,
      },
      preview = {
        enabled = true,
        line_numbers = false,
        wrap_lines = false,
      },
    },
    config = function(_, opts)
      require("fff").setup(opts)
    end,
  },
}
