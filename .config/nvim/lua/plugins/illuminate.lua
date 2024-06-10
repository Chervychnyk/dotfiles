return {
  "RRethy/vim-illuminate",
  event = "VeryLazy",
  config = function()
    require("illuminate").configure {
      filetypes_denylist = {
        "mason",
        "harpoon",
        "DressingInput",
        "NeogitCommitMessage",
        "qf",
        "alpha",
        "NvimTree",
        "lazy",
        "NeogitStatus",
        "Trouble",
        "netrw",
        "lir",
        "DiffviewFiles",
        "Outline",
        "toggleterm",
        "DressingSelect",
        "TelescopePrompt",
      },
    }
  end
}
