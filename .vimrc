" Minimal Vim configuration.
" Theme dependency (no plugin manager):
"   git clone https://github.com/sainnhe/everforest.git ~/.vim/pack/themes/start/everforest

set nocompatible
filetype plugin indent on
syntax enable

set encoding=utf-8
set number
set ruler
set showcmd
set wildmenu
set wildmode=list:longest
set history=1000

set tabstop=2
set shiftwidth=2
set softtabstop=2
set expandtab
set smartindent

set nowrap
set scrolloff=8
set backspace=indent,eol,start
set hidden
set updatetime=300

set ignorecase
set smartcase
set incsearch
set hlsearch
set showmatch

set splitbelow
set splitright
set laststatus=2

set nobackup
set nowritebackup
set noswapfile
if isdirectory(expand('~/.vim/undo'))
  set undofile
  set undodir=~/.vim/undo//
endif

set background=dark
if has('termguicolors')
  set termguicolors
endif
set t_Co=256

" Everforest Dark Hard, matching the rest of the dotfiles.
let g:everforest_background = 'hard'
let g:everforest_better_performance = 1
silent! colorscheme everforest

let mapleader=","

inoremap jj <Esc>
nnoremap Y y$
nnoremap B ^
nnoremap E $
nnoremap <leader>s :write<CR>
nnoremap <leader>q :quit<CR>
nnoremap <silent> <leader>h :nohlsearch<CR>

nnoremap <C-h> <C-w>h
nnoremap <C-j> <C-w>j
nnoremap <C-k> <C-w>k
nnoremap <C-l> <C-w>l

nnoremap <leader>tn :tabnew<CR>
nnoremap <leader>tc :tabclose<CR>
nnoremap <leader>to :tabonly<CR>
nnoremap <leader>tl :tabnext<CR>
nnoremap <leader>th :tabprevious<CR>

" :W sudo-saves the current file.
command! W execute 'write !sudo tee % > /dev/null' <bar> edit!

augroup vimrc
  autocmd!
  autocmd FileType vim setlocal foldmethod=marker
  autocmd FileType html,css,javascript,typescript,json,yaml setlocal tabstop=2 shiftwidth=2 softtabstop=2 expandtab
augroup END

if has('gui_running')
  set guifont=Fira\ Code\ 14
  set guioptions-=T
  set guioptions-=L
  set guioptions-=r
  set guioptions-=m
  set guioptions-=b
endif
