/**
 * test/output.test.js — 输出层测试
 *
 * 覆盖：
 *   - TempFileManager.track()：记录临时文件
 *   - TempFileManager.cleanupSession()：清理本次会话文件
 *   - TempFileManager.cleanupStale()：清理过期文件
 */

import { suite, test, assert } from './runner.js'
import { writeFileSync, existsSync, mkdirSync, utimesSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { TempFileManager } from '../src/output/TempFileManager.js'

const TEST_DIR = join(tmpdir(), 'dg-output-test-' + process.pid)
mkdirSync(TEST_DIR, { recursive: true })

// ── track() + cleanupSession() ────────────────────────────────────────────────

suite('output › TempFileManager', () => {
  test('track() 记录文件，cleanupSession() 删除', () => {
    const mgr = new TempFileManager(TEST_DIR)
    const f = join(TEST_DIR, 'dg_track_test.csv')
    writeFileSync(f, 'test', 'utf8')
    assert.ok(existsSync(f))

    mgr.track(f)
    const count = mgr.cleanupSession()
    assert.equal(count, 1)
    assert.equal(existsSync(f), false, '文件应被删除')
  })

  test('cleanupSession() 对不存在的文件不报错', () => {
    const mgr = new TempFileManager(TEST_DIR)
    mgr.track('/nonexistent/file.csv')
    const count = mgr.cleanupSession()
    assert.equal(count, 0)
  })

  test('cleanupSession() 后 _created 集合清空', () => {
    const mgr = new TempFileManager(TEST_DIR)
    const f = join(TEST_DIR, 'dg_clear_test.csv')
    writeFileSync(f, 'x', 'utf8')
    mgr.track(f)
    mgr.cleanupSession()
    // 再次调用不应重复删除（集合已清空）
    const count2 = mgr.cleanupSession()
    assert.equal(count2, 0)
  })

  test('cleanupSession() 只删除 track 过的文件', () => {
    const mgr = new TempFileManager(TEST_DIR)
    const tracked   = join(TEST_DIR, 'dg_tracked.csv')
    const untracked = join(TEST_DIR, 'dg_untracked.csv')
    writeFileSync(tracked,   'x', 'utf8')
    writeFileSync(untracked, 'x', 'utf8')

    mgr.track(tracked)
    mgr.cleanupSession()

    assert.equal(existsSync(tracked),   false, 'tracked 文件应被删除')
    assert.ok(existsSync(untracked),          'untracked 文件应保留')

    // 清理
    try { require('fs').unlinkSync(untracked) } catch {}
  })

  test('cleanupStale() 目录不存在时返回 0', () => {
    const mgr = new TempFileManager('/nonexistent/dir')
    const count = mgr.cleanupStale()
    assert.equal(count, 0)
  })

  test('cleanupStale() 只清理 dg_ 前缀的文件', () => {
    const mgr = new TempFileManager(TEST_DIR)
    const staleFile  = join(TEST_DIR, 'dg_stale.csv')
    const normalFile = join(TEST_DIR, 'normal.csv')
    writeFileSync(staleFile,  'x', 'utf8')
    writeFileSync(normalFile, 'x', 'utf8')

    // 手动将 staleFile 的 mtime 设为 25 小时前（超过清理阈值）
    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000)
    try { utimesSync(staleFile, oldTime, oldTime) } catch {}

    mgr.cleanupStale()

    // normalFile 不应被删除（不是 dg_ 前缀）
    assert.ok(existsSync(normalFile), 'normal 文件不应被删除')
    try { unlinkSync(normalFile) } catch {}
  })

  test('多个文件 track 后全部清理', () => {
    const mgr = new TempFileManager(TEST_DIR)
    const files = ['dg_a.csv', 'dg_b.csv', 'dg_c.csv'].map(n => {
      const p = join(TEST_DIR, n)
      writeFileSync(p, 'x', 'utf8')
      mgr.track(p)
      return p
    })
    const count = mgr.cleanupSession()
    assert.equal(count, 3)
    for (const f of files) {
      assert.equal(existsSync(f), false)
    }
  })
})
