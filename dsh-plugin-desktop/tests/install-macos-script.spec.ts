import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const installer = readFileSync(
  new URL('../../scripts/install-macos.sh', import.meta.url),
  'utf8',
)

describe('macOS curl installer', () => {
  it('does not expand an empty command-prefix array under macOS Bash 3.2 nounset mode', () => {
    expect(installer).not.toContain('local runner=("$@")')
    expect(installer).not.toContain('"${runner[@]}"')
    expect(installer).toContain('run_install_command()')
  })

  it('shows download progress and reports the failing installation stage', () => {
    expect(installer).toContain('--progress-bar')
    expect(installer).not.toContain('--silent')
    expect(installer).toContain('--continue-at -')
    expect(installer).toContain('连接中断，2 秒后继续下载（第 ${download_attempt}/3 次）…')
    expect(installer).toContain('错误：下载失败（已尝试 ${download_attempt} 次，错误码：${download_status}）')
    expect(installer).toContain("current_step='下载安装包'")
    expect(installer).toContain("current_step='校验安装包'")
    expect(installer).toContain('hdiutil verify "$dmg_path" >/dev/null 2>&1')
    expect(installer).toContain("current_step='挂载安装包'")
    expect(installer).toContain("current_step='安装应用'")
    expect(installer).not.toContain('$current_step，')
    expect(installer).not.toContain('$status）。')
    expect(installer).not.toContain('$APP_NAME。')
    expect(installer).toContain('错误：安装失败（步骤：${current_step}，错误码：${status}）。')
    expect(installer).toContain('安装完成：$target_app')
  })
})
