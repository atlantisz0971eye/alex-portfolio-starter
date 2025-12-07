#!/bin/bash

echo "🔄 Starting replace-with-web process..."

find public -type f -name "*-web.mp4" | while read webfile; do
  original="${webfile/-web.mp4/.mp4}"

  echo "➡️ Processing:"
  echo "   WEB: $webfile"
  echo "   ORG: $original"

  # 删除原始文件
  if [ -f "$original" ]; then
    echo "   🗑 Removing original file..."
    rm "$original"
  fi

  # 移动 web 文件覆盖
  echo "   🔁 Renaming web → original..."
  mv "$webfile" "$original"

  echo "   ✅ Done: $original"
  echo "-----------------------------"
done

echo "✨ All files replaced!"