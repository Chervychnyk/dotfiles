return {
  init_options = {
    enabledFeatures = {
      "documentHighlights",
      "documentSymbols",
      "documentLink",
      "foldingRanges",
      "selectionRanges",
      "semanticHighlighting",
      "formatting",
      "codeActions",
      "inlayHint",
    },
    experimentalFeaturesEnabled = true,
  },
  settings = {
    rubyLsp = {
      -- Use rubocop for formatting
      formatter = "rubocop",
      -- Enable pull diagnostics
      pullDiagnostics = true,
      -- Enable inlay hints
      inlayHint = {
        enableAll = true,
      },
    },
  },
}
