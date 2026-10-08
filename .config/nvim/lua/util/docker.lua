local M = {}

-- Per-root memo of the last detect() result.
--
-- detect() shells out to `docker compose config --services`, which is far too
-- expensive to repeat: conform called it once per session and nvim-lint called
-- it on every lint run (BufReadPost, BufWritePost, and InsertLeave). The answer
-- cannot change while Neovim is running, so cache it and let callers keep
-- asking freely.
local cache = {}

-- Accepts any Dockerfile.* (Dockerfile.local, Dockerfile.dev, …)
local function has_dockerfile(root)
  return #vim.fn.glob(root .. "/Dockerfile*", false, true) > 0
end

-- Accepts docker-compose.yml | .yaml
local function get_compose_path(root)
  for _, name in ipairs({ "docker-compose.yml", "docker-compose.yaml" }) do
    local p = root .. "/" .. name
    if vim.fn.filereadable(p) == 1 then
      return p
    end
  end
end

-- Ask docker-compose which services exist
local function list_services(compose_file)
  local cmd = string.format("docker compose -f %s config --services", vim.fn.shellescape(compose_file))
  local services = {}
  local handle = io.popen(cmd .. " 2>/dev/null")
  if handle then
    for line in handle:lines() do
      table.insert(services, line)
    end
    handle:close()
  end
  return services
end

-- Returns boolean, service[string], compose_path[string]
function M.detect(root)
  root = root or vim.fn.getcwd()

  local cached = cache[root]
  if cached then
    return unpack(cached)
  end

  local result = { false, nil, nil }
  local compose = get_compose_path(root)

  if has_dockerfile(root) and compose then
    -- Preferred service order
    local preferred = { rails = 1, web = 2, app = 3 }
    local services = list_services(compose)
    table.sort(services, function(a, b)
      return (preferred[a] or 99) < (preferred[b] or 99)
    end)

    result = { true, services[1] or "rails", compose }
  end

  cache[root] = result
  return unpack(result)
end

return M
