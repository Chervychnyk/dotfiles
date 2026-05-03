local function visual_selection_or_cword()
  local mode = vim.fn.mode()

  if mode == "v" or mode == "V" or mode == "\22" then
    local lines = vim.fn.getregion(vim.fn.getpos("v"), vim.fn.getpos("."), { type = mode })
    return table.concat(lines, "\n")
  end

  return vim.fn.expand("<cword>")
end

return {
  "dmtrKovalenko/fff.nvim",
  build = function()
    require("fff.download").download_or_build_binary()
  end,
  lazy = false,
  opts = {
    lazy_sync = true,
    layout = {
      prompt_position = "bottom",
      preview_position = "right",
    },
    preview = {
      max_size = 100 * 1024,
    },
  },
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
        require("fff").live_grep({ query = visual_selection_or_cword() })
      end,
      desc = "Visual selection or word",
      mode = { "n", "x" },
    },
  },
}
