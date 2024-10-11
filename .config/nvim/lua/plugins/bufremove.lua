return {
  "echasnovski/mini.bufremove",
  event = "BufEnter",
  version = "*",
  config = function()
    require("mini.bufremove").setup({
      silent = true,
    })
  end,
}
