#!/bin/bash

echo "📸 Compressing JPG/JPEG files..."

find public -type f \( -iname "*.jpg" -o -iname "*.jpeg" \) | while read file; do
  echo "➡️ Compressing: $file"
  convert "$file" -sampling-factor 4:2:0 -strip -quality 82 -interlace JPEG -colorspace sRGB "$file"
done

echo "✨ JPG compression complete!"