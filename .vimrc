" Disable compatibility with vi which can cause unexpected issues.
set nocompatible

" Enable type file detection. Vim will be able to try to detect the type of file in use.
filetype on

" Enable plugins and load plugin for the detected file type.
filetype plugin on

" Load an indent file for the detected file type.
filetype indent on

" Turn syntax highlighting on.
syntax on

" Set utf8 as standard encoding and en_US as the standard language
set encoding=utf8
let $LANG='en'
set langmenu=en

" Add numbers to each line on the left-hand side.
set number

" Set tab width to 2 columns.
set tabstop=2

" Set the background tone.
set background=dark

" Use space characters instead of tabs.
set expandtab

" Do not save backup files.
set nobackup
set nowb
set noswapfile

" Do not let cursor scroll below or above N number of lines when scrolling.
set scrolloff=10

" Do not wrap lines. Allow long lines to extend as far as the line goes.
set nowrap

" While searching though a file incrementally highlight matching characters as you type.
set incsearch

" Ignore capital letters during search.
set ignorecase

" Override the ignorecase option if searching for capital letters.
" This will allow you to search specifically for capital letters.
set smartcase

" Show partial command you type in the last line of the screen.
set showcmd

" Show the mode you are on the last line.
set showmode

" Show matching words during a search.
set showmatch

" Use highlighting when doing a search.
set hlsearch

" Set the commands to save in history default number is 20.
set history=1000

" Enable auto completion menu after pressing TAB.
set wildmenu

" Make wildmenu behave like similar to Bash completion.
set wildmode=list:longest

" There are certain files that we would never want to edit with Vim.
" Wildmenu will ignore files with these extensions.
set wildignore=*.docx,*.jpg,*.png,*.gif,*.pdf,*.pyc,*.exe,*.flv,*.img,*.xlsx

" To allow backspacing over everything in insert mode
set backspace=indent,eol,start
set whichwrap+=<,>,h,l

" :W sudo saves the file
" (useful for handling the permission-denied error)
command! W execute 'w !sudo tee % > /dev/null' <bar> edit!

" PLUGINS  --------------------------------------------------------------- {{{

" Try to load minpac.
packadd minpac

if !exists('g:loaded_minpac')
    " minpac is not available.

    " Settings for plugin-less environment.
else
    " minpac is available.
    " init with verbosity 3 to see minpac work
    call minpac#init({'verbose': 3})
    call minpac#add('k-takata/minpac', {'type': 'opt'})

    call minpac#add('rafi/awesome-vim-colorschemes')
    call minpac#add('itchyny/lightline.vim')
    call minpac#add('tpope/vim-fugitive')

    " minpac utility commands
    command! PackUpdate call minpac#update()
    command! PackClean call minpac#clean()
    command! PackStatus call minpac#status()

    " Plugin settings here.

    " If you have vim >=8.0 or Neovim >= 0.1.5
    if (has("termguicolors"))
      set termguicolors
    endif

    set t_Co=256

    colorscheme parsec
endif
" }}}

" MAPPINGS --------------------------------------------------------------- {{{

" Set the comma as the leader key.
let mapleader = ","

" Type jj to exit insert mode quickly.
inoremap jj <esc>

" Move to beginning/end of line
nnoremap B ^
nnoremap E $

" Yank from cursor to the end of line.
nnoremap Y y$

" Copy the paragraph your cursor is on then paste a copy of it just below
noremap cp yap<S-}>p

" You can split the window in Vim by typing :split or :vsplit.
" Navigate the split view easier by pressing CTRL+j, CTRL+k, CTRL+h, or CTRL+l.
nnoremap <c-j> <c-w>j
nnoremap <c-k> <c-w>k
nnoremap <c-h> <c-w>h
nnoremap <c-l> <c-w>l

" Space open/closes folds
nnoremap <space> za

" Quickly close a file with <leader>q
noremap <leader>q :q<cr>

" Save file with <leader>s
nnoremap <leader>s :w<cr>
inoremap <leader>s <C-c>:w<cr>

" Useful mappings for managing tabs
map <leader>tn :tabnew<cr>
map <leader>to :tabonly<cr>
map <leader>tc :tabclose<cr>
map <leader>tm :tabmove
map <leader>t<leader> :tabnext

" }}}

" VIMSCRIPT -------------------------------------------------------------- {{{

" Enable the marker method of folding.
augroup filetype_vim
    autocmd!
    autocmd FileType vim setlocal foldmethod=marker
augroup END

" If the current file type is HTML, set indentation to 2 spaces.
autocmd Filetype html setlocal tabstop=2 shiftwidth=2 expandtab

" If Vim version is equal to or greater than 7.3 enable undofile.
" This allows you to undo changes to a file even after saving it.
if version >= 703
    set undodir=~/.vim/backup
    set undofile
    set undoreload=10000
endif

" You can split a window into sections by typing `:split` or `:vsplit`.
" Display cursorline and cursorcolumn ONLY in active window.
augroup cursor_off
    autocmd!
    autocmd WinLeave * set nocursorline nocursorcolumn
    autocmd WinEnter * set cursorline cursorcolumn
augroup END

" If GUI version of Vim is running set these options.
if has('gui_running')
    " Set a custom font you have installed on your computer.
    " Syntax: set guifont=<font_name>\ <font_weight>\ <size>
    set guifont=Fira Code\ 14

    " Display more of the file by default.
    " Hide the toolbar.
    set guioptions-=T

    " Hide the the left-side scroll bar.
    set guioptions-=L

    " Hide the the right-side scroll bar.
    set guioptions-=r

    " Hide the the menu bar.
    set guioptions-=m

    " Hide the the bottom scroll bar.
    set guioptions-=b
endif

" }}}

" STATUS LINE ------------------------------------------------------------ {{{

set laststatus=2
set noshowmode

let g:lightline = {
      \ 'colorscheme': 'one',
      \ 'active': {
      \   'left': [ [ 'mode', 'paste' ],
      \             [ 'gitbranch', 'readonly', 'filename', 'modified' ] ]
      \ },
      \ 'component_function': {
      \   'gitbranch': 'FugitiveHead'
      \ },
      \ }

" }}}
