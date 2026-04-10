/**
 * Unified Encryption Guard - 统一加密入口模块
 * 
 * 职责：
 *   1. 统一处理所有输入（HTTP 请求、文件读取、Python/Shell exec）的加密
 *   2. 统一处理所有输出（LLM 响应）的解密
 *   3. 支持两种模式：
 *      - 拦截阻断模式 (block): 检测到敏感数据直接拦截
 *      - 可逆加密模式 (reversible): 加密敏感数据后放行，返回后解密
 * 
 * 架构：
 *   - 所有输入流都经过 encryptInput() 统一入口
 *   - 所有输出流都经过 decryptOutput() 统一出口
 *   - 内部根据配置决定使用传统脱敏还是可逆加密
 * 
 * @module UnifiedEncryptionGuard
 * @version 2.3.0
 */

import { desensitize } from './desensitize.js';
import { ReversibleGuard } from '../../reversible-guard.js';

/**
 * 统一加密守卫
 */
export class UnifiedEncryptionGuard {
  constructor(options = {}) {
    // 模式: 'block' | 'reversible'
    this.mode = options.mode || 'block';
    
    // 阻断模式配置
    this.blockOnFailure = options.blockOnFailure ?? true;
    this.onSensitiveDetected = options.onSensitiveDetected || null;
    
    // 可逆加密配置
    this.reversibleGuard = null;
    if (this.mode === 'reversible') {
      this.reversibleGuard = new ReversibleGuard({
        password: options.encryptionPassword || 'default-password-change-it',
        enabledTypes: options.enabledTypes || ['email', 'phone', 'idCard', 'bankCard', 'ipAddress', 'apiKey'],
        tokenPrefix: options.tokenPrefix || '<ENC>',
        tokenSuffix: options.tokenSuffix || '</ENC>'
      });
    }
    
    // 统计信息
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      encryptedRequests: 0,
      decryptedResponses: 0,
      byType: {}
    };
    
    // 日志器
    this.logger = options.logger || null;
  }

  /**
   * 统一输入加密入口
   * 处理所有输入数据：HTTP 请求体、文件内容、命令参数等
   * 
   * @param {*} data - 输入数据（字符串或对象）
   * @param {object} context - 上下文信息 { source: 'http'|'file'|'python'|'shell', ... }
   * @returns {object} { allowed: boolean, data: *, reason?: string, stats: object }
   */
  encryptInput(data, context = {}) {
    this.stats.totalRequests++;
    const source = context.source || 'unknown';
    
    this._log('info', `[${source}] Processing input encryption...`);
    
    // 根据模式处理
    if (this.mode === 'reversible') {
      return this._encryptReversible(data, context);
    } else {
      return this._encryptBlock(data, context);
    }
  }

  /**
   * 阻断模式：传统脱敏，检测到敏感数据即拦截
   */
  _encryptBlock(data, context) {
    const source = context.source || 'unknown';
    
    // 递归处理数据
    const result = this._processDataRecursive(data, (value) => {
      const { result: desensitized, stats } = desensitize(value);
      return { value: desensitized, stats };
    });
    
    // 统计敏感数据
    const totalSensitive = this._countSensitive(result.stats);
    
    if (totalSensitive > 0) {
      this.stats.blockedRequests++;
      this._accumulateStats(result.stats);
      
      const typesSummary = Object.entries(result.stats || {})
        .map(([k, v]) => `${k}×${v}`)
        .join(', ');
      
      this._log('warn', `[${source}] Blocked: ${totalSensitive} sensitive items detected [${typesSummary}]`);
      
      if (this.blockOnFailure) {
        return {
          allowed: false,
          data: null,
          reason: `Sensitive data detected: ${typesSummary}`,
          stats: result.stats
        };
      }
    }
    
    this._log('info', `[${source}] Passed: no sensitive data detected`);
    return {
      allowed: true,
      data: result.data,
      stats: result.stats
    };
  }

  /**
   * 可逆加密模式：加密敏感数据后放行
   */
  _encryptReversible(data, context) {
    const source = context.source || 'unknown';
    
    // 递归处理数据，使用可逆加密
    const result = this._processDataRecursive(data, (value) => {
      const processed = this.reversibleGuard.preProcess(value);
      return {
        value: processed.text,
        stats: processed.tokenCount > 0 ? { encrypted: processed.tokenCount } : {},
        tokenTable: processed.tokenTable
      };
    });
    
    const totalEncrypted = result.stats?.encrypted || 0;
    
    if (totalEncrypted > 0) {
      this.stats.encryptedRequests++;
      this._accumulateStats({ encrypted: totalEncrypted });
      this._log('info', `[${source}] Encrypted: ${totalEncrypted} sensitive items`);
    } else {
      this._log('info', `[${source}] No sensitive data to encrypt`);
    }
    
    return {
      allowed: true,
      data: result.data,
      stats: result.stats,
      tokenTable: result.tokenTable
    };
  }

  /**
   * 统一输出口——解密
   * 处理所有输出数据：LLM 响应
   * 
   * @param {*} data - 输出数据
   * @param {object} context - 上下文信息
   * @returns {object} { data: *, decryptedCount: number }
   */
  decryptOutput(data, context = {}) {
    const source = context.source || 'unknown';
    
    // 只有可逆加密模式需要解密
    if (this.mode !== 'reversible') {
      return { data, decryptedCount: 0 };
    }
    
    this._log('info', `[${source}] Processing output decryption...`);
    
    // 递归解密
    const result = this._processDataRecursive(data, (value) => {
      const processed = this.reversibleGuard.postProcess(value);
      return {
        value: processed.text,
        decryptedCount: processed.decryptedCount
      };
    });
    
    const totalDecrypted = result.decryptedCount || 0;
    
    if (totalDecrypted > 0) {
      this.stats.decryptedResponses++;
      this._log('info', `[${source}] Decrypted: ${totalDecrypted} tokens`);
    }
    
    return {
      data: result.data,
      decryptedCount: totalDecrypted
    };
  }

  /**
   * 递归处理数据
   * @private
   */
  _processDataRecursive(data, processor) {
    if (typeof data === 'string') {
      const result = processor(data);
      return {
        data: result.value,
        stats: result.stats || {},
        tokenTable: result.tokenTable,
        decryptedCount: result.decryptedCount
      };
    }
    
    if (Array.isArray(data)) {
      const results = data.map(item => this._processDataRecursive(item, processor));
      return {
        data: results.map(r => r.data),
        stats: this._mergeStats(results.map(r => r.stats)),
        tokenTable: results.flatMap(r => r.tokenTable || []),
        decryptedCount: results.reduce((sum, r) => sum + (r.decryptedCount || 0), 0)
      };
    }
    
    if (data !== null && typeof data === 'object') {
      const results = {};
      const allStats = [];
      let allTokens = [];
      let totalDecrypted = 0;
      
      for (const [key, val] of Object.entries(data)) {
        const result = this._processDataRecursive(val, processor);
        results[key] = result.data;
        allStats.push(result.stats);
        if (result.tokenTable) allTokens = allTokens.concat(result.tokenTable);
        totalDecrypted += result.decryptedCount || 0;
      }
      
      return {
        data: results,
        stats: this._mergeStats(allStats),
        tokenTable: allTokens,
        decryptedCount: totalDecrypted
      };
    }
    
    return { data, stats: {} };
  }

  /**
   * 合并统计信息
   * @private
   */
  _mergeStats(statsArray) {
    const merged = {};
    for (const stats of statsArray) {
      for (const [key, val] of Object.entries(stats || {})) {
        merged[key] = (merged[key] || 0) + val;
      }
    }
    return merged;
  }

  /**
   * 统计敏感数据总数
   * @private
   */
  _countSensitive(stats) {
    if (!stats) return 0;
    return Object.values(stats).reduce((a, b) => a + b, 0);
  }

  /**
   * 累积统计信息
   * @private
   */
  _accumulateStats(stats) {
    for (const [key, val] of Object.entries(stats || {})) {
      this.stats.byType[key] = (this.stats.byType[key] || 0) + val;
    }
  }

  /**
   * 日志输出
   * @private
   */
  _log(level, message) {
    if (this.logger && this.logger[level]) {
      this.logger[level](message);
    } else {
      const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [UnifiedEncryptionGuard] ${message}\n`;
      process.stdout.write(line);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      mode: this.mode,
      reversibleGuardStats: this.mode === 'reversible' ? this.reversibleGuard?.getStats() : null
    };
  }

  /**
   * 清理会话（可逆加密模式下清理 token 映射表）
   */
  clearSession() {
    if (this.mode === 'reversible' && this.reversibleGuard) {
      this.reversibleGuard.clearSession();
    }
    this._log('info', 'Session cleared');
  }

  /**
   * 切换模式
   */
  setMode(mode, options = {}) {
    if (mode === this.mode) return;
    
    this.mode = mode;
    
    if (mode === 'reversible') {
      this.reversibleGuard = new ReversibleGuard({
        password: options.encryptionPassword || 'default-password-change-it',
        enabledTypes: options.enabledTypes || ['email', 'phone', 'idCard', 'bankCard', 'ipAddress', 'apiKey'],
        tokenPrefix: options.tokenPrefix || '<ENC>',
        tokenSuffix: options.tokenSuffix || '</ENC>'
      });
    } else {
      this.reversibleGuard = null;
    }
    
    this._log('info', `Mode switched to: ${mode}`);
  }
}

/**
 * 创建统一加密守卫实例（工厂函数）
 */
export function createUnifiedGuard(options = {}) {
  return new UnifiedEncryptionGuard(options);
}

/**
 * 快速加密函数（用于简单场景）
 */
export function encryptData(data, options = {}) {
  const guard = new UnifiedEncryptionGuard({
    mode: 'reversible',
    ...options
  });
  return guard.encryptInput(data, options.context || {});
}

/**
 * 快速解密函数（用于简单场景）
 */
export function decryptData(data, options = {}) {
  const guard = new UnifiedEncryptionGuard({
    mode: 'reversible',
    ...options
  });
  return guard.decryptOutput(data, options.context || {});
}

// 默认导出
export default UnifiedEncryptionGuard;
