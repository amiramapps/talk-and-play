#!/bin/sh
# Wraps app.html into a standalone index.html you can host anywhere.
cd "$(dirname "$0")"
{
  printf '<!doctype html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  printf '<link rel="manifest" href="manifest.json">\n<link rel="icon" href="icon.svg">\n<link rel="apple-touch-icon" href="icon.svg">\n'
  printf '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n'
  printf '<style>body{margin:0}[hidden]{display:none!important}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:border-box;height:100%%}</style>\n'
  printf '</head>\n<body>\n'
  grep -v 'claude:viewport-fit-sides' app.html
  printf '\n</body>\n</html>\n'
} > index.html
echo "Built index.html"
