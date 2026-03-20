return {
  'nvim-mini/mini.surround',
  event = "VeryLazy",
  config = function()
    require('mini.surround').setup({
      highlight_duration = 300,
      silent = true
    })
  end
}
