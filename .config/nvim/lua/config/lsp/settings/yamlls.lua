return {
  settings = {
    yaml = {
      schemas = {
        ["https://www.rubyschema.org/rubocop.json"] = ".rubocop.yml",
        ["https://www.rubyschema.org/packwerk/package.json"] = "package.yml",
        ["https://www.rubyschema.org/rails/cable.json"] = "cable.yml",
        ["https://www.rubyschema.org/rails/cache.json"] = "cache. yml",
        ["https://www.rubyschema.org/rails/database.json"] = "database.yml",
        ["https://www.rubyschema.org/rails/queue.json"] = "queue.yml",
        ["https://www.rubyschema.org/rails/recurring.json"] = "recurring.yml",
        ["https://www.rubyschema.org/rails/storage.json"] = "storage.yml",
        ["https://json.schemastore.org/github-workflow.json"] = "/.github/workflows/*.yml",
        ['https://gitlab.com/gitlab-org/gitlab/-/raw/master/app/assets/javascripts/editor/schema/ci.json'] =
        '.gitlab-ci.yml',
        ['https://raw.githubusercontent.com/compose-spec/compose-spec/master/schema/compose-spec.json'] =
        'docker-compose*.yml',
      }
    }
  }
}
