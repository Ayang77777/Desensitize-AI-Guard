/**
 * src/plugins/base/Plugin.js — Plugin 抽象基类
 *
 * 所有插件都应继承此类，并实现 register(api) 方法。
 *
 * 设计原则：
 *   - 每个插件只做一件事（单一职责）
 *   - 插件之间通过 api 对象通信，不直接相互依赖
 *   - 插件可以声明自己的配置 schema，由框架统一注入
 *
 * 使用示例：
 *   class MyPlugin extends Plugin {
 *     get id()          { return 'my-plugin' }
 *     get name()        { return 'My Plugin' }
 *     get description() { return '...' }
 *
 *     register(api) {
 *       // 注册 hooks、服务等
 *     }
 *   }
 */

export class Plugin {
  /**
   * 插件唯一 ID（子类必须实现）
   * @returns {string}
   */
  get id() { throw new Error(`Plugin.id must be implemented by ${this.constructor.name}`) }

  /**
   * 插件显示名称（子类必须实现）
   * @returns {string}
   */
  get name() { throw new Error(`Plugin.name must be implemented by ${this.constructor.name}`) }

  /**
   * 插件描述（子类可选覆盖）
   * @returns {string}
   */
  get description() { return '' }

  /**
   * 插件版本（子类可选覆盖）
   * @returns {string}
   */
  get version() { return '1.0.0' }

  /**
   * 注册插件到 OpenClaw API（子类必须实现）
   *
   * @param {object} api         - OpenClaw 插件 API 对象
   * @param {object} config      - 插件配置（从 openclaw.json 读取）
   * @param {object} [logger]    - 日志对象（可选）
   */
  register(api, config, logger) {
    throw new Error(`Plugin.register() must be implemented by ${this.constructor.name}`)
  }

  /**
   * 从 api.config 中提取本插件的配置
   * @param {object} api
   * @param {string} [pluginId]  - 默认使用 this.id
   * @returns {object}
   */
  extractConfig(api, pluginId) {
    const id = pluginId ?? this.id
    return api.config?.plugins?.entries?.[id]?.config ?? {}
  }

  /**
   * 记录 info 日志（统一前缀格式）
   * @param {object} logger
   * @param {string} msg
   */
  log(logger, msg) {
    logger?.info(`[${this.id}] ${msg}`)
  }

  /**
   * 记录 warn 日志
   * @param {object} logger
   * @param {string} msg
   */
  warn(logger, msg) {
    logger?.warn(`[${this.id}] ${msg}`)
  }

  /**
   * 记录 error 日志
   * @param {object} logger
   * @param {string} msg
   */
  error(logger, msg) {
    logger?.error(`[${this.id}] ${msg}`)
  }
}
