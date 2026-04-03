/**
 * src/plugins/tool/formats/index.js — 文件格式注册入口
 *
 * 将所有内置格式处理器注册到全局 registry。
 * 开发者若要添加新格式，在此文件中 import 并 register 即可。
 *
 * 示例（添加自定义格式）：
 *   import { MyFormat } from './MyFormat.js'
 *   registry.register(new MyFormat())
 */

import { registry } from './FileFormat.js'
import { CsvFormat } from './CsvFormat.js'
import { XlsxFormat } from './XlsxFormat.js'
import { XlsFormat } from './XlsFormat.js'

// 注册所有内置格式
registry
  .register(new CsvFormat())
  .register(new XlsxFormat())
  .register(new XlsFormat())

export { registry }
export { FileFormat, FileFormatRegistry } from './FileFormat.js'
export { CsvFormat, parseCsvLine, toCsvField } from './CsvFormat.js'
export { XlsxFormat } from './XlsxFormat.js'
export { XlsFormat } from './XlsFormat.js'
