/**
 * test/runner.js — 轻量测试框架
 *
 * 零外部依赖，纯 Node.js 实现。提供：
 *   - suite(name, fn)   分组
 *   - test(name, fn)    单个测试（支持 async）
 *   - assert.*          断言集合
 *   - run()             执行并打印报告，失败时 process.exit(1)
 */

// ── ANSI 颜色 ─────────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
}

const isTTY = process.stdout.isTTY
const c = (code, str) => isTTY ? `${code}${str}${C.reset}` : str

// ── 断言集合 ──────────────────────────────────────────────────────────────────

export const assert = {
  /** 值为真 */
  ok(val, msg) {
    if (!val) throw new AssertionError(msg ?? `期望为真，实际为: ${JSON.stringify(val)}`)
  },

  /** 严格相等 */
  equal(actual, expected, msg) {
    if (actual !== expected)
      throw new AssertionError(msg ?? `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  },

  /** 严格不等 */
  notEqual(actual, expected, msg) {
    if (actual === expected)
      throw new AssertionError(msg ?? `期望不等于 ${JSON.stringify(expected)}，但实际相等`)
  },

  /** 深度相等（JSON 序列化比较） */
  deepEqual(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected)
    if (a !== e)
      throw new AssertionError(msg ?? `深度不等\n  期望: ${e}\n  实际: ${a}`)
  },

  /** 字符串包含子串 */
  includes(str, sub, msg) {
    if (!String(str).includes(sub))
      throw new AssertionError(msg ?? `期望包含 ${JSON.stringify(sub)}，实际: ${JSON.stringify(str)}`)
  },

  /** 字符串不包含子串 */
  notIncludes(str, sub, msg) {
    if (String(str).includes(sub))
      throw new AssertionError(msg ?? `期望不包含 ${JSON.stringify(sub)}，但实际包含`)
  },

  /** 匹配正则 */
  match(str, re, msg) {
    if (!re.test(String(str)))
      throw new AssertionError(msg ?? `期望匹配 ${re}，实际: ${JSON.stringify(str)}`)
  },

  /** 不匹配正则 */
  notMatch(str, re, msg) {
    if (re.test(String(str)))
      throw new AssertionError(msg ?? `期望不匹配 ${re}，但实际匹配: ${JSON.stringify(str)}`)
  },

  /** 值为 null 或 undefined */
  nullish(val, msg) {
    if (val != null)
      throw new AssertionError(msg ?? `期望为 null/undefined，实际为: ${JSON.stringify(val)}`)
  },

  /** 值不为 null 或 undefined */
  notNullish(val, msg) {
    if (val == null)
      throw new AssertionError(msg ?? `期望不为 null/undefined`)
  },

  /** 期望抛出异常 */
  throws(fn, msgOrRe, msg) {
    let threw = false
    try { fn() } catch (e) {
      threw = true
      if (msgOrRe instanceof RegExp && !msgOrRe.test(e.message))
        throw new AssertionError(msg ?? `异常消息不匹配 ${msgOrRe}，实际: ${e.message}`)
      if (typeof msgOrRe === 'string' && !e.message.includes(msgOrRe))
        throw new AssertionError(msg ?? `异常消息不包含 ${JSON.stringify(msgOrRe)}，实际: ${e.message}`)
    }
    if (!threw) throw new AssertionError(msg ?? '期望抛出异常，但未抛出')
  },

  /** 期望 Promise reject */
  async rejects(fn, msgOrRe, msg) {
    let threw = false
    try { await fn() } catch (e) {
      threw = true
      if (msgOrRe instanceof RegExp && !msgOrRe.test(e.message))
        throw new AssertionError(msg ?? `reject 消息不匹配 ${msgOrRe}，实际: ${e.message}`)
    }
    if (!threw) throw new AssertionError(msg ?? '期望 Promise reject，但未 reject')
  },

  /** 数值在范围内 [min, max] */
  inRange(val, min, max, msg) {
    if (val < min || val > max)
      throw new AssertionError(msg ?? `期望 ${val} 在 [${min}, ${max}] 范围内`)
  },

  /** 对象拥有指定 key */
  hasKey(obj, key, msg) {
    if (!(key in Object(obj)))
      throw new AssertionError(msg ?? `期望对象包含 key "${key}"`)
  },
}

class AssertionError extends Error {
  constructor(msg) { super(msg); this.name = 'AssertionError' }
}

// ── 测试注册表 ────────────────────────────────────────────────────────────────

const _suites = []   // [{ name, tests: [{ name, fn }] }]
let   _current = null

/**
 * 定义一个测试分组
 * @param {string} name
 * @param {() => void} fn  - 同步函数，内部调用 test()
 */
export function suite(name, fn) {
  _current = { name, tests: [] }
  _suites.push(_current)
  fn()
  _current = null
}

/**
 * 定义一个测试用例
 * @param {string} name
 * @param {() => void | Promise<void>} fn
 */
export function test(name, fn) {
  if (!_current) throw new Error('test() 必须在 suite() 内部调用')
  _current.tests.push({ name, fn })
}

// ── 执行引擎 ──────────────────────────────────────────────────────────────────

/**
 * 执行所有已注册的测试，打印报告
 * @param {{ bail?: boolean }} [opts]  bail=true 时第一个失败立即退出
 * @returns {Promise<{ passed: number, failed: number, skipped: number }>}
 */
export async function run(opts = {}) {
  const { bail = false } = opts
  let passed = 0, failed = 0
  const failures = []

  const startAll = Date.now()

  for (const s of _suites) {
    console.log(`\n${c(C.bold + C.cyan, `▶ ${s.name}`)}`)

    for (const t of s.tests) {
      const start = Date.now()
      try {
        await t.fn()
        const ms = Date.now() - start
        passed++
        console.log(`  ${c(C.green, '✓')} ${c(C.dim, t.name)} ${c(C.gray, `(${ms}ms)`)}`)
      } catch (err) {
        const ms = Date.now() - start
        failed++
        failures.push({ suite: s.name, test: t.name, err })
        console.log(`  ${c(C.red, '✗')} ${c(C.bold, t.name)} ${c(C.gray, `(${ms}ms)`)}`)
        console.log(`    ${c(C.red, err.message.split('\n').join('\n    '))}`)
        if (bail) break
      }
    }
    if (bail && failed > 0) break
  }

  const totalMs = Date.now() - startAll
  const total   = passed + failed

  console.log('\n' + '─'.repeat(60))
  console.log(
    `${c(C.bold, '结果')}  ` +
    `${c(C.green, `${passed} 通过`)}  ` +
    (failed > 0 ? `${c(C.red, `${failed} 失败`)}  ` : '') +
    `${c(C.gray, `共 ${total} 个，耗时 ${totalMs}ms`)}`
  )

  if (failures.length > 0) {
    console.log(`\n${c(C.bold + C.red, '失败详情：')}`)
    failures.forEach(({ suite: s, test: t, err }, i) => {
      console.log(`  ${i + 1}. ${c(C.cyan, s)} › ${c(C.bold, t)}`)
      console.log(`     ${c(C.red, err.stack ?? err.message)}`)
    })
  }

  console.log('')

  if (failed > 0) process.exit(1)
  return { passed, failed }
}
