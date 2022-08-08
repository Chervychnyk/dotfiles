local status_ok, tzen = pcall(require, "true-zen")
if not status_ok then
  return
end

local lualine_ok, lualine = pcall(require, "lualine")

local function open_cb()
  if lualine_ok then
    lualine.hide()
  end
end

local function close_cb()
  if lualine_ok then
    lualine.hide { unhide = true }
  end
end

local config = {
  modes = {
    ataraxis = {
      shade = "dark", -- if `dark` then dim the padding windows, otherwise if it's `light` it'll brighten said windows
      backdrop = 0, -- percentage by which padding windows should be dimmed/brightened. Must be a number between 0 and 1. Set to 0 to keep the same background color
      minimum_writing_area = { -- minimum size of main window
        width = 70,
        height = 44,
      },
      quit_untoggles = true, -- type :q or :qa to quit Ataraxis mode
      padding = { -- padding windows
        left = 30,
        right = 30,
        top = 0,
        bottom = 0,
      },
      open_callback = open_cb,
      close_callback = close_cb, focus = {
        margin_of_error = 5,
        focus_method = "experimental",
      },
    },
  },
}

tzen.setup(config)
