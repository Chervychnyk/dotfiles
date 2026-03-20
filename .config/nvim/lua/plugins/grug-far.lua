return {
  "MagicDuck/grug-far.nvim",
  cmd = "GrugFar",
  opts = {
    headerMaxWidth = 80,
  },
  keys = {
    {
      "<leader>fg",
      function()
        require("grug-far").open()
      end,
      desc = "Find/Replace in Project",
    },
    {
      "<leader>fG",
      function()
        require("grug-far").open({ prefills = { search = vim.fn.expand("<cword>") } })
      end,
      desc = "Find current word (GrugFar)",
    },
  },
}
