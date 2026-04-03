/**
 * src/output/TempFileManager.js — 输出层：临时文件生命周期管理
 *
 * 职责：
 *   1. 跟踪所有由 data-guard 创建的临时文件
 *   2. 提供清理接口（手动清理 / 进程退出时自动清理）
 *   3. 提供临时文件目录的路径解析
 *
 * 设计说明：
 *   临时文件在 AI 读取完成后理论上可以删除，但由于 OpenClaw 的工具调用
 *   是异步的，我们无法精确知道 AI 何时读完。因此采用"会话级"策略：
 *   - 每次插件启动时清理上次遗留的临时文件
 *   - 进程退出时清理本次创建的临时文件
 */

import { existsSync, unlinkSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

export class TempFileManager {
  /**
   * @param {string} tempDir  - 临时文件目录路径
   */
  constructor(tempDir) {
    this.tempDir = tempDir
    /** @type {Set<string>} 本次会话创建的临时文件 */
    this._created = new Set()
    /** @type {boolean} 是否已注册退出钩子 */
    this._exitHookRegistered = false
  }

  /**
   * 记录一个新创建的临时文件
   * @param {string} filePath
   */
  track(filePath) {
    this._created.add(filePath)
    if (!this._exitHookRegistered) {
      this._registerExitHook()
    }
  }

  /**
   * 清理本次会话创建的所有临时文件
   * @returns {number} 清理的文件数量
   */
  cleanupSession() {
    let count = 0
    for (const f of this._created) {
      if (existsSync(f)) {
        try { unlinkSync(f); count++ } catch {}
      }
    }
    this._created.clear()
    return count
  }

  /**
   * 清理临时目录中所有 data-guard 遗留文件（dg_* 前缀）
   * 通常在插件启动时调用，清理上次遗留的临时文件。
   * @returns {number} 清理的文件数量
   */
  cleanupStale() {
    if (!existsSync(this.tempDir)) return 0
    let count = 0
    try {
      const files = readdirSync(this.tempDir)
      for (const f of files) {
        if (!f.startsWith('dg_')) continue
        const fullPath = join(this.tempDir, f)
        try {
          const stat = statSync(fullPath)
          // 清理超过 24 小时的文件
          if (Date.now() - stat.mtimeMs > 24 * 60 * 60 * 1000) {
            unlinkSync(fullPath)
            count++
          }
        } catch {}
      }
    } catch {}
    return count
  }

  /**
   * 注册进程退出时的清理钩子
   * @private
   */
  _registerExitHook() {
    this._exitHookRegistered = true
    const cleanup = () => this.cleanupSession()
    process.on('exit', cleanup)
    process.on('SIGTERM', cleanup)
    process.on('SIGINT', cleanup)
  }
}
