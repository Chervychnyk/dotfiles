local snip_status_ok, luasnip = pcall(require, "luasnip")
local loader_status_ok, loader = pcall(require, "luasnip/loaders/from_vscode")

if not (snip_status_ok and loader_status_ok) then return end

loader.lazy_load()

luasnip.filetype_extend("ruby", { "rails" })

