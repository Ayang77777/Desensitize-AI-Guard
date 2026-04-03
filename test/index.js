/**
 * test/index.js — 统一测试入口
 *
 * 按层次顺序加载并执行所有测试：
 *   1. core      — 脱敏引擎（最底层，无依赖）
 *   2. formats   — 文件格式插件（依赖 core）
 *   3. input     — 输入层（依赖 core + formats）
 *   4. output    — 输出层（独立）
 *   5. proxy     — 代理层（依赖 core）
 *   6. plugins   — 插件层（依赖所有层）
 *
 * 用法：
 *   node test/index.js              # 运行全部测试
 *   node test/index.js --only core  # 只运行指定层
 *   node test/index.js --bail       # 第一个失败立即退出
 */

import { run } from './runner.js'

// ── 解析命令行参数 ─────────────────────────────────────────────────────────────

const args   = process.argv.slice(2)
const bail   = args.includes('--bail')
const onlyIdx = args.indexOf('--only')
const only   = onlyIdx !== -1 ? args[onlyIdx + 1]?.split(',') : null

// ── 按层次加载测试 ─────────────────────────────────────────────────────────────

const LAYERS = [
  { name: 'core',    file: './core.test.js'    },
  { name: 'formats', file: './formats.test.js' },
  { name: 'input',   file: './input.test.js'   },
  { name: 'output',  file: './output.test.js'  },
  { name: 'proxy',   file: './proxy.test.js'   },
  { name: 'plugins', file: './plugins.test.js' },
]

const toLoad = only
  ? LAYERS.filter(l => only.includes(l.name))
  : LAYERS

if (toLoad.length === 0) {
  console.error(`未找到匹配的层：${only?.join(', ')}`)
  console.error(`可用层：${LAYERS.map(l => l.name).join(', ')}`)
  process.exit(1)
}

// 打印标题
const title = only ? `Data Guard 测试 [${toLoad.map(l => l.name).join(', ')}]` : 'Data Guard 测试（全量）'
console.log(`\n${'═'.repeat(60)}`)
console.log(` ${title}`)
console.log(`${'═'.repeat(60)}`)

// 动态 import 各层测试文件（import 时 suite/test 调用自动注册）
for (const layer of toLoad) {
  await import(layer.file)
}

// 执行所有已注册的测试
await run({ bail })
