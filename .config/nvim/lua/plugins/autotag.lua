return {
  "windwp/nvim-ts-autotag",
  event = "InsertEnter",
  config = function()
    require("nvim-ts-autotag").setup {
      opts = {
        enable_close = false,          -- Auto close tags
        enable_close_on_slash = false, -- Auto close on trailing </
        enable_rename = true,          -- Auto rename pairs of tags
      },
    }
  end
}
