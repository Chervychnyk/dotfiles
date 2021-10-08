echo "Installing xcode-stuff"
xcode-select --install

# Check for Homebrew, and then install it
if test ! "$(which brew)"; then
    echo "Installing homebrew..."
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    echo "Homebrew installed successfully"
else
    echo "Homebrew already installed!"
fi

# Update Homebrew recipes
brew update

# Install all our dependencies with bundle (See Brewfile)
echo "Installing packages..."
brew tap homebrew/bundle
brew bundle

echo "Cleaning up Homebrew"
brew cleanup

echo "Git config"

git config --global user.name "Artem Chervychnyk"
git config --global user.email artem@themindstudios.com

# Update the Terminal
# Install oh-my-zsh
echo "Installing oh-my-zsh..."
curl -fsSL https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh

echo "Setting up Zsh plugins..."
cd $HOME/.oh-my-zsh/custom/plugins
git clone https://github.com/zsh-users/zsh-autosuggestions
git clone https://github.com/zsh-users/zsh-syntax-highlighting.git

# Removes .zshrc from $HOME (if it exists) and symlinks the .zshrc file from the .dotfiles
rm -rf $HOME/.zshrc
ln -s $HOME/.dotfiles/.zshrc $HOME/.zshrc
source $HOME/.zshrc

if [ -x nvm ]; then
	echo "Installing NVM…"
	curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
	echo "NVM installed!"
	echo "Installing latest Node…"
	nvm install node
	nvm use node
	nvm run node --version
	nodev=$(node -v)
	echo "Using Node $nodev!"
else
	echo "NVM/Node already installed. Skipping."
fi

echo "Setting some Mac settings..."

#"Disabling OS X Gate Keeper"
#"(You'll be able to install any app you want from here on, not just Mac App Store apps)"
sudo spctl --master-disable

# Create a Sites directory
mkdir $HOME/Sites

echo "Done!"
