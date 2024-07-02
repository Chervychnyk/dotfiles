return {
  "David-Kunz/gen.nvim",
  cmd = "Gen",
  opts = {
    model = "deepseek-coder-v2", -- The default model to use.
    host = "localhost",                   -- The host running the Ollama service.
    port = "11434",                       -- The port on which the Ollama service is listening.
    quit_map = "q",                       -- set keymap for close the response window
    retry_map = "<C-r>",                  -- set keymap to re-send the current prompt
    init = nil,
    -- Function to initialize Ollama
    command = function(options)
      local body = { model = options.model, stream = true }

      return "curl --silent --no-buffer -X POST http://"
          .. options.host
          .. ":"
          .. options.port
          .. "/api/chat -d $body"
    end,
    -- The command for the Ollama service. You can use placeholders $prompt, $model and $body (shellescaped).
    -- This can also be a command string.
    -- The executed command must return a JSON object with { response, context }
    -- (context property is optional).
    -- list_models = '<omitted lua function>', -- Retrieves a list of model names
    display_mode = "split", -- The display mode. Can be "float" or "split".
    show_prompt = true,     -- Shows the prompt submitted to Ollama.
    show_model = true,      -- Displays which model you are using at the beginning of your chat session.
    no_auto_close = true,   -- Never closes the window automatically.
    debug = false           -- Prints errors and the command which is run.
  },
  config = function(_, opts)
    require("gen").setup(opts)

    require("gen").prompts["Fix_Code"] = {
      prompt =
      "Fix the following code. Only ouput the result in format ```$filetype\n...\n```:\n```$filetype\n$text\n```",
      replace = true,
      extract = "```$filetype\n(.-)```",
    }

    require("gen").prompts["Create_Regex"] = {
      prompt =
      "Create a regular expression for $filetype language that matches the following pattern:\n```$filetype\n$text\n```",
      replace = true,
      no_auto_close = false,
      extract = "```$filetype\n(.-)```"
    }

    require("gen").prompts["Explain_Regex"] = {
      prompt =
      "Explain the following regular expression:\n```$filetype\n$text\n```",
      extract = "```$filetype\n(.-)```"
    }

    require("gen").prompts["Write_Tests"] = {
      prompt =
      "Write unit tests for the following code:\n```$filetype\n$text\n``` using the RSpec framework. If you encounter requests to 3rd party APIs, mock them out using the WebMock gem.",
      extract = "```$filetype\n(.-)```"
    }
  end,
  keys = {
    { '<leader>af', ':Gen Fix_Code<CR>',    mode = { 'n', 'v' }, desc = 'Fix Code' },
    {
      "<leader>ai",
      function()
        local input = vim.fn.input("Ask AI: ")
        if input ~= "" then
          require('gen').exec({ prompt = input })
        end
      end,
      desc = "Ask AI",
    },
    {
      '<leader>am',
      function()
        require('gen').select_model()
      end,
      mode = { 'n', 'v' },
      desc = 'Select AI model',
    },
    { '<leader>at', ':Gen Write_Tests<CR>', mode = { 'n', 'v' }, desc = 'Write Tests' },
  },
}
