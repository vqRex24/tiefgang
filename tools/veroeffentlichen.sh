#!/bin/zsh
# Stellt den aktuellen Commit online: Der Ordner app/ wird zum Zweig gh-pages,
# den GitHub Pages ausliefert.
set -e
cd "$(dirname "$0")/.."
git subtree push --prefix app origin gh-pages
