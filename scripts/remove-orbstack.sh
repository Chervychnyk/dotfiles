#!/bin/bash

echo "🛑 Stopping OrbStack..."
osascript -e 'quit app "OrbStack"' 2>/dev/null
sleep 2
pkill -9 OrbStack 2>/dev/null

echo "🗑️  Removing OrbStack application..."
brew uninstall --cask orbstack 2>/dev/null || sudo rm -rf /Applications/OrbStack.app

echo "💾 Removing OrbStack data (images, volumes, VMs)..."
rm -rf ~/Library/Application\ Support/OrbStack
rm -rf ~/.orbstack

echo "🧹 Removing OrbStack caches and preferences..."
rm -rf ~/Library/Caches/dev.kdrag0n.orbstack*
rm -rf ~/Library/Preferences/dev.kdrag0n.orbstack.plist
rm -rf ~/Library/HTTPStorages/dev.kdrag0n.orbstack
rm -rf ~/Library/Logs/OrbStack
rm -rf ~/Library/Saved\ Application\ State/dev.kdrag0n.orbstack.savedState

echo "🔧 Removing CLI tools..."
sudo rm -f /usr/local/bin/orbctl
sudo rm -f /usr/local/bin/orb

echo "✅ OrbStack removed completely!"
echo ""
echo "📊 Checking for remaining files..."
remaining=$(find ~ -iname "*orbstack*" 2>/dev/null | wc -l)
if [ $remaining -eq 0 ]; then
    echo "✨ All clean! No OrbStack files found."
else
    echo "⚠️  Found $remaining remaining files:"
    find ~ -iname "*orbstack*" 2>/dev/null
fi

echo ""
echo "🚀 Ready to use Colima:"
echo "   colima start --cpu 4 --memory 8 --disk 60"
