#!/bin/bash

echo "🖼 Compressing PNG files..."

find public -type f -iname "*.png" | while read file; do
  echo "➡️ Compressing: $file"
  pngquant --force --ext .png --quality=70-95 "$file"
done

echo "✨ PNG compression complete!"