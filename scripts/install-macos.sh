#!/bin/bash

set -euo pipefail

readonly DOWNLOAD_URL="${RUIJIE_HARNESS_DMG_URL:-https://gptauth.ruijie.com.cn/harness/api/downloads/mac}"
readonly INSTALL_ROOT="${RUIJIE_HARNESS_INSTALL_ROOT:-/Applications}"
readonly APP_NAME='锐捷 Harness.app'
readonly BUNDLE_ID='cn.com.ruijie.dsh.desktop'

if [[ "$(uname -s)" != 'Darwin' ]]; then
  echo '错误：此安装命令只能在 macOS 上运行。' >&2
  exit 1
fi

for command_name in curl hdiutil ditto; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "错误：系统缺少命令：$command_name" >&2
    exit 1
  fi
done

if [[ ! -d "$INSTALL_ROOT" ]]; then
  echo "错误：安装目录不存在：$INSTALL_ROOT" >&2
  exit 1
fi

if pgrep -f "/${APP_NAME}/Contents/MacOS/" >/dev/null 2>&1; then
  echo '错误：锐捷 Harness 正在运行。请先正常退出应用，再重新执行安装命令。' >&2
  exit 1
fi

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/ruijie-harness-install.XXXXXX")"
dmg_path="$work_dir/Ruijie-Harness.dmg"
mount_point=''

cleanup() {
  if [[ -n "$mount_point" && -d "$mount_point" ]]; then
    hdiutil detach "$mount_point" -quiet >/dev/null 2>&1 || true
  fi
  rm -rf -- "$work_dir"
}
trap cleanup EXIT INT TERM

echo '正在下载锐捷 Harness…'
curl --fail --location --show-error --silent --output "$dmg_path" "$DOWNLOAD_URL"
hdiutil verify "$dmg_path" >/dev/null

attach_output="$(hdiutil attach "$dmg_path" -nobrowse -readonly)"
mount_point="$(printf '%s\n' "$attach_output" | sed -n 's|^.*\(/Volumes/.*\)$|\1|p' | tail -n 1)"
if [[ -z "$mount_point" || ! -d "$mount_point" ]]; then
  echo '错误：无法确定 DMG 挂载目录。' >&2
  exit 1
fi

source_app="$mount_point/$APP_NAME"
if [[ ! -d "$source_app" ]]; then
  echo "错误：DMG 中没有找到 $APP_NAME。" >&2
  exit 1
fi

actual_bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$source_app/Contents/Info.plist" 2>/dev/null || true)"
if [[ "$actual_bundle_id" != "$BUNDLE_ID" ]]; then
  echo "错误：应用标识不匹配，拒绝安装：$actual_bundle_id" >&2
  exit 1
fi

target_app="$INSTALL_ROOT/$APP_NAME"
staging_app="$INSTALL_ROOT/.${APP_NAME}.new.$$"
backup_app="$INSTALL_ROOT/.${APP_NAME}.backup.$$"

if [[ -L "$target_app" ]]; then
  echo "错误：目标应用是符号链接，拒绝覆盖：$target_app" >&2
  exit 1
fi

install_app() {
  local runner=("$@")
  "${runner[@]}" rm -rf -- "$staging_app" "$backup_app"
  "${runner[@]}" ditto "$source_app" "$staging_app"
  if [[ -e "$target_app" ]]; then
    "${runner[@]}" mv -- "$target_app" "$backup_app"
  fi
  if ! "${runner[@]}" mv -- "$staging_app" "$target_app"; then
    if [[ -e "$backup_app" && ! -e "$target_app" ]]; then
      "${runner[@]}" mv -- "$backup_app" "$target_app"
    fi
    return 1
  fi
  "${runner[@]}" rm -rf -- "$backup_app"
}

if [[ -w "$INSTALL_ROOT" ]]; then
  install_app
else
  echo '安装到 /Applications 需要管理员密码。'
  install_app sudo
fi

echo "安装完成：$target_app"
echo '首次打开未签名内部版时，请在 Finder 中右键应用并选择“打开”。'
