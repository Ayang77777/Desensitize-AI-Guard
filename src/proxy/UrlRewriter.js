/**
 * src/proxy/UrlRewriter.js — 代理层：Provider baseUrl 改写工具
 *
 * 职责：
 *   扫描 openclaw.json 中所有 provider 的 baseUrl，
 *   将真实上游地址改写为本地代理格式：
 *     http://127.0.0.1:<port>/proxy/<base64url(原始URL)>
 *
 * 这样 ProxyServer 就能从路径中解码出真实上游地址并转发。
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'

const PROXY_HOST = '127.0.0.1'

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/**
 * 递归收集 JSON 对象中所有 baseUrl 字段的路径和值
 * @param {object} obj
 * @param {string[]} pathArr
 * @param {Array<{path: string[], url: string}>} result
 * @returns {Array<{path: string[], url: string}>}
 */
function collectProviderBaseUrls(obj, pathArr = [], result = []) {
  if (!obj || typeof obj !== 'object') return result
  for (const [key, val] of Object.entries(obj)) {
    const cur = [...pathArr, key]
    if (key === 'baseUrl' && typeof val === 'string') {
      result.push({ path: pathArr, url: val })
    } else if (typeof val === 'object') {
      collectProviderBaseUrls(val, cur, result)
    }
  }
  return result
}

/**
 * 按路径设置嵌套对象的字段值
 * @param {object} obj
 * @param {string[]} pathArr
 * @param {string} key
 * @param {*} value
 */
function setDeep(obj, pathArr, key, value) {
  let cur = obj
  for (const p of pathArr) {
    if (!cur[p] || typeof cur[p] !== 'object') return
    cur = cur[p]
  }
  cur[key] = value
}

/**
 * 判断 URL 是否已经是代理格式
 * @param {string} url
 * @param {number} port
 * @returns {boolean}
 */
export function isProxyUrl(url, port) {
  return url.startsWith(`http://${PROXY_HOST}:${port}/proxy/`)
}

/**
 * 判断 URL 是否是本地代理（旧版格式兼容）
 * @param {string} url
 * @returns {boolean}
 */
export function isLocalProxy(url) {
  try {
    const u = new URL(url)
    return u.hostname === PROXY_HOST || u.hostname === 'localhost'
  } catch { return false }
}

/**
 * 将原始 URL 编码为代理格式
 * @param {string} originalUrl
 * @param {number} port
 * @returns {string}
 */
export function encodeProxyUrl(originalUrl, port) {
  const encoded = Buffer.from(originalUrl).toString('base64')
  return `http://${PROXY_HOST}:${port}/proxy/${encoded}`
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

/**
 * 扫描并改写 openclaw.json 中所有 provider 的 baseUrl
 *
 * @param {string}  openclawJsonPath  - openclaw.json 文件路径
 * @param {number}  port              - 代理端口
 * @param {object}  [logger]          - 日志对象（可选）
 * @returns {{ changed: number, skipped: number }}
 */
export function syncBaseUrls(openclawJsonPath, port, logger) {
  if (!existsSync(openclawJsonPath)) {
    return { changed: 0, skipped: 0 }
  }

  let config
  try {
    config = JSON.parse(readFileSync(openclawJsonPath, 'utf8'))
  } catch (e) {
    logger?.warn(`[url-rewriter] openclaw.json 解析失败: ${e.message}`)
    return { changed: 0, skipped: 0 }
  }

  const entries = collectProviderBaseUrls(config)
  let changed = 0, skipped = 0

  for (const entry of entries) {
    const url = entry.url

    if (isProxyUrl(url, port)) {
      skipped++
      continue
    }

    if (isLocalProxy(url)) {
      logger?.warn(`[url-rewriter] 发现旧版代理格式 baseUrl，无法自动迁移，请卸载重装插件`)
      skipped++
      continue
    }

    try {
      const proxyUrl = encodeProxyUrl(url, port)
      setDeep(config, entry.path, 'baseUrl', proxyUrl)
      changed++
      logger?.info(`[url-rewriter] baseUrl 已改写为代理格式`)
    } catch (e) {
      logger?.warn(`[url-rewriter] baseUrl 改写失败: ${e.message}`)
    }
  }

  if (changed > 0) {
    try {
      writeFileSync(openclawJsonPath, JSON.stringify(config, null, 2), 'utf8')
      logger?.info(`[url-rewriter] openclaw.json 已更新，共改写 ${changed} 个 provider`)
    } catch (e) {
      logger?.warn(`[url-rewriter] openclaw.json 写入失败: ${e.message}`)
    }
  } else {
    logger?.info(`[url-rewriter] 所有 provider 已就绪，无需改写`)
  }

  return { changed, skipped }
}
