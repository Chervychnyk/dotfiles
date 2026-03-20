return {
  settings = {
    basedpyright = {
      analysis = {
        autoSearchPaths = true,
        diagnosticMode = "openFilesOnly",
        typeCheckingMode = "standard", -- Changed from basic to standard for better type checking
        useLibraryCodeForTypes = true,
        autoImportCompletions = true,
      }
    }
  },
}
