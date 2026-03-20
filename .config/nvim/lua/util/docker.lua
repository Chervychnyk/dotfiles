local M = {}

-- Accepts any Dockerfile.* (Dockerfile.local, Dockerfile.dev, …)
local function has_dockerfile(root)
  return vim.fn.glob(root .. "/Dockerfile*") ~= ""
end

-- Accepts docker-compose.yml | .yaml
local function get_compose_path(root)
  for _, name in ipairs({ "docker-compose.yml", "docker-compose.yaml" }) do
    local p = root .. "/" .. name
    if vim.fn.filereadable(p) == 1 then return p end
  end
end

-- Get service name from docker-compose file
-- local function get_service_name(compose_file)
--   if not compose_file then return nil end
--
--   local handle = io.open(compose_file, "r")
--   if not handle then return "rails" end
--
--   local content = handle:read("*a")
--   handle:close()
--
--   -- Check for common service names in order of preference
--   local service_patterns = {
--     "%s*rails:", -- rails service
--     "%s*app:",   -- app service
--     "%s*web:",   -- web service
--   }
--
--   for _, pattern in ipairs(service_patterns) do
--     if content:match(pattern) then
--       return pattern:match("%%s%*(.+):")
--     end
--   end
--
--   return "rails" -- Default to 'rails' if no matching service found
-- end


-- Returns boolean, service[string], compose_path[string]
function M.detect(root)
  root = root or vim.fn.getcwd()

  local compose = get_compose_path(root)
  if not (has_dockerfile(root) and compose) then
    return false, nil, nil
  end

  -- Ask docker-compose which services exist
  local cmd = string.format("docker compose -f %s config --services", vim.fn.shellescape(compose))
  local services = {}
  local handle = io.popen(cmd .. " 2>/dev/null")
  if handle then
    for line in handle:lines() do
      table.insert(services, line)
    end
    handle:close()
  end

  -- Preferred service order
  local preferred = { rails = 1, web = 2, app = 3 }
  table.sort(services, function(a, b)
    return (preferred[a] or 99) < (preferred[b] or 99)
  end)

  return true, services[1] or "rails"
end

return M
