require("config.options")
require("config.mappings")
require("config.autocmds")
require("config.lazy")
-- No explicit colorscheme apply here: the everforest spec is lazy=false with
-- priority=1000, so it has already run during lazy.setup. Re-applying
-- :colorscheme cleared and redefined every highlight group for nothing.
require("util")
