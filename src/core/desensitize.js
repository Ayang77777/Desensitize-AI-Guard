/**
 * src/core/desensitize.js — 脱敏引擎（纯 Node.js，零外部依赖）
 *
 * 覆盖 30+ 类敏感信息：手机号、身份证、护照、港澳台通行证、驾照、社保卡、公积金号、
 * 银行卡、统一社会信用代码、邮箱、IPv4/IPv6、token/密码、URL敏感参数、微信/QQ、
 * 合同编号、订单/流水号、发票号码、姓名、地址、企业/集团/基金名称、金额、比率、
 * 供应商/客户、部门/项目、出生日期、年龄、车牌号、工号
 *
 * 导出：
 *   desensitize(text)               → { result: string, stats: Record<string,number> }
 *   mightContainSensitiveData(text) → boolean
 *   makeCtx()                       → DesensitizeContext
 *   CSV_COLUMN_RULES                → 列名规则表（供 FileFormat 插件复用）
 *   各 mask* 函数                   → 供外部直接调用
 */

import { createHash } from 'crypto'

// ── 上下文工厂 ────────────────────────────────────────────────────────────────

export function makeCtx() {
  return {
    nameMap:     new Map(),
    companyMap:  new Map(),
    vendorMap:   new Map(),
    deptMap:     new Map(),
    projectMap:  new Map(),
    amountScale: Math.round((0.3 + Math.random() * 0.4) * 10000) / 10000,
    stats: {},
  }
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

export function hit(ctx, key) { ctx.stats[key] = (ctx.stats[key] ?? 0) + 1 }
export function sha8(v) { return createHash('sha256').update(v).digest('hex').slice(0, 8) }

// ── 各类脱敏函数（纯函数，无副作用）─────────────────────────────────────────

export function maskPhone(v) {
  const d = v.replace(/[^\d]/g, '')
  if (d.length === 11 && /^1[3-9]/.test(d)) return d.slice(0, 3) + '****' + d.slice(7)
  if (d.length === 10 && /^[2-9]/.test(d))  return d.slice(0, 3) + '****' + d.slice(-4)
  if (d.length >= 7) return d.slice(0, 3) + '*'.repeat(Math.min(d.length - 7, 6)) + d.slice(-4)
  return v
}

export function maskIdCard(v, type = 'cnic') {
  if (type === 'cnic')  return v.slice(0, 3) + '*'.repeat(11) + v.slice(-4)
  if (type === 'hic')   return v.slice(0, 3) + '*'.repeat(6)  + v.slice(-3)
  if (type === 'hk')    return v.slice(0, 1) + '*'.repeat(7)  + v.slice(-2)
  if (type === 'tw')    return v.slice(0, 1) + '*'.repeat(9)
  if (type === 'macau') return v.slice(0, 1) + '*'.repeat(6)
  return v.length >= 7 ? v.slice(0, 3) + '*'.repeat(v.length - 7) + v.slice(-4) : v
}

export function maskEmail(v) {
  const at = v.lastIndexOf('@')
  if (at < 0) return v
  const l = v.slice(0, at), d = v.slice(at + 1)
  if (l.length <= 2) return l[0] + '*@' + d
  return l[0] + '*'.repeat(Math.min(l.length - 2, 8)) + l.slice(-1) + '@' + d
}

export function maskBank(v) {
  if (/^\d+$/.test(v)) return v.length >= 8 ? v.slice(0, 4) + '*'.repeat(v.length - 8) + v.slice(-4) : v
  const d = v.replace(/\D/g, '')
  if (d.length >= 16) return v.slice(0, 4) + '*'.repeat(v.length - 8) + v.slice(-4)
  return v.length >= 8 ? v.slice(0, 4) + '*'.repeat(v.length - 8) + v.slice(-4) : v
}

export function maskTax(v) {
  return v.length >= 4 ? v.slice(0, 2) + '*'.repeat(v.length - 4) + v.slice(-2) : v
}

export function maskName(ctx, v) {
  if (!ctx.nameMap.has(v)) ctx.nameMap.set(v, '用户_' + sha8(v).slice(0, 4))
  return ctx.nameMap.get(v)
}

export function maskCompany(ctx, v) {
  if (!ctx.companyMap.has(v)) ctx.companyMap.set(v, '公司_' + sha8(v).slice(0, 4))
  return ctx.companyMap.get(v)
}

export function maskVendor(ctx, v) {
  if (!ctx.vendorMap.has(v)) {
    const i = ctx.vendorMap.size + 1
    ctx.vendorMap.set(v, '供应商_' + (i <= 26 ? String.fromCharCode(64 + i) : i))
  }
  return ctx.vendorMap.get(v)
}

export function maskDept(ctx, v) {
  if (!ctx.deptMap.has(v)) {
    const i = ctx.deptMap.size + 1
    ctx.deptMap.set(v, '部门_' + (i <= 26 ? String.fromCharCode(64 + i) : i))
  }
  return ctx.deptMap.get(v)
}

export function maskProject(ctx, v) {
  if (!ctx.projectMap.has(v)) ctx.projectMap.set(v, '项目_' + sha8(v).slice(0, 6))
  return ctx.projectMap.get(v)
}

export function maskAddress(v) {
  const m = v.match(/^([\u4e00-\u9fa5]{2,4}(?:省|市|自治区|特别行政区))?([\u4e00-\u9fa5]{2,10}(?:市|区|县|州|旗))?(.*)/)
  if (!m) return v.slice(0, 4) + '*'.repeat(Math.max(0, v.length - 4))
  const p = m[1] || '', c = m[2] || '', r = m[3] || ''
  const pre = p + c
  if (!r.trim()) return v
  return pre + r.trim().slice(0, 20).replace(/[\u4e00-\u9fa5\w]/g, '*')
}

export function maskAmount(ctx, v) {
  const n = parseFloat(v.replace(/[,，¥￥$€£₩]/g, ''))
  if (isNaN(n)) return v
  return String(Math.round(n * ctx.amountScale * 100) / 100)
}

export function maskRatio(v) {
  return v.replace(/(\d+)(\.\d+)?(%?)/, (_, i, d, p) => i + (d ? '.**' : '') + p)
}

export function maskContract(v) { return '合同_' + sha8(v).slice(0, 6) }
export function maskOrder(v)    { return '单号_' + sha8(v) }
export function maskInvoice(v)  {
  return v.length > 6 ? v.slice(0, 4) + '*'.repeat(v.length - 6) + v.slice(-2) : '*'.repeat(v.length)
}
export function maskLicensePlate(v) {
  const m = v.match(/^([\u4e00-\u9fa5])([A-HJ-NP-Z])([\u00b7\u30fb·]?[A-HJ-NP-Z0-9]{4,5})/)
  return m ? m[1] + m[2] + '***' + m[3].slice(-1) : v.slice(0, 2) + '****' + v.slice(-1)
}
export function maskSocialCredit(v)  { return maskTax(v) }
export function maskEmployeeId(v)    { return '工号_' + sha8(v).slice(0, 6) }
export function maskBirthDate()      { return '****-**-**' }
export function maskAge()            { return '**岁' }
export function maskLicenseNo(v)     { return v.slice(0, 2) + '*'.repeat(v.length - 4) + v.slice(-2) }
export function maskHousingFund(v)   { return '公积金_' + sha8(v).slice(0, 6) }
export function maskMedicalRecord(v) { return '病历号_' + sha8(v).slice(0, 6) }
export function maskSocialSecurity(v){ return '社保_' + sha8(v).slice(0, 6) }

// ── CSV 检测 ──────────────────────────────────────────────────────────────────

export function looksLikeCsv(text) {
  const lines = text.split('\n').map(l => l.trimEnd()).filter(Boolean)
  if (lines.length < 2) return false
  const counts = lines.slice(0, 5).map(l => (l.match(/,/g) || []).length)
  if (counts[0] === 0) return false
  // 所有采样行的列数必须完全一致（允许末尾空行差 0）
  const base = counts[0]
  if (!counts.every(c => c === base)) return false
  return /[a-zA-Z\u4e00-\u9fa5]/.test(lines[0])
}

// ── CSV 列名规则表（供 FileFormat 插件复用）──────────────────────────────────

export const CSV_COLUMN_RULES = [
  { keys: ['phone','mobile','tel','cellphone','手机','电话','联系方式','联系电话','移动电话'],
    fn: (ctx, v) => { hit(ctx, '手机号'); return maskPhone(v) } },
  { keys: ['email','mail','邮箱','邮件','电子邮箱'],
    fn: (ctx, v) => { hit(ctx, '邮箱'); return maskEmail(v) } },
  { keys: ['name','realname','username','fullname','nickname','displayname',
           '姓名','名字','用户名','联系人','负责人','收件人','发件人','当事人','客户姓名','乘客姓名'],
    fn: (ctx, v) => { hit(ctx, '姓名'); return maskName(ctx, v) } },
  { keys: ['idcard','id_card','identity','identitycard','身份证','证件号','证件号码','身份证号'],
    fn: (ctx, v) => { hit(ctx, '身份证号'); return maskIdCard(v) } },
  { keys: ['bankcard','bank_card','cardno','card_no','accountno','银行卡','卡号','银行账号','账户','账号'],
    fn: (ctx, v) => { hit(ctx, '银行卡号'); return maskBank(v) } },
  { keys: ['address','addr','street','location','地址','住址','收货地址','详细地址','通讯地址','户籍地址','家庭住址'],
    fn: (ctx, v) => { hit(ctx, '地址'); return maskAddress(v) } },
  { keys: ['company','organization','org','corp','公司','企业','企业名称','集团','集团名称','基金','基金名称','雇主','工作单位'],
    fn: (ctx, v) => { hit(ctx, '企业/集团/基金名称'); return maskCompany(ctx, v) } },
  { keys: ['vendor','supplier','customer','client','merchant','partner','供应商','客户','甲方','乙方','合作方','经销商','代理商','采购方','销售方'],
    fn: (ctx, v) => { hit(ctx, '供应商/客户'); return maskVendor(ctx, v) } },
  { keys: ['department','dept','division','team','businessunit','部门','事业部','业务线','团队','成本中心','科室','分支机构'],
    fn: (ctx, v) => { hit(ctx, '部门'); return maskDept(ctx, v) } },
  { keys: ['amount','price','salary','revenue','profit','income','expense','cost','budget','fee','total','balance','payment',
           '金额','价格','薪资','收入','支出','利润','营收','成本','费用','总价','余额','实付','应收'],
    fn: (ctx, v) => { hit(ctx, '金额'); return maskAmount(ctx, v) } },
  { keys: ['uid','userid','user_id','openid','empid','employeeid','用户ID','员工号','工号','会员ID'],
    fn: (ctx, v) => { hit(ctx, '用户ID'); return 'uid_' + sha8(v) } },
  { keys: ['ip','ipaddress','ip_address','clientip','remoteip','IP地址','服务器IP','服务器地址'],
    fn: (ctx, v) => { hit(ctx, 'IP地址'); const p = v.split('.'); return p.length === 4 ? p[0] + '.' + p[1] + '.*.*' : v } },
  { keys: ['birth','birthday','birthdate','dob','出生日期','生日','出生年月','出生地'],
    fn: (ctx, v) => { hit(ctx, '出生日期'); return maskBirthDate(v) } },
  { keys: ['age','年龄','岁'],
    fn: (ctx, v) => { hit(ctx, '年龄'); return maskAge(v) } },
  { keys: ['plate','license_plate','car_plate','车牌','车牌号','车辆牌照'],
    fn: (ctx, v) => { hit(ctx, '车牌号'); return maskLicensePlate(v) } },
  { keys: ['contract','contract_no','contract_id','合同','合同号','合同编号'],
    fn: (ctx, v) => { hit(ctx, '合同编号'); return maskContract(v) } },
  { keys: ['order','order_id','orderno','订单','订单号','订单编号','流水号','交易号'],
    fn: (ctx, v) => { hit(ctx, '订单/流水号'); return maskOrder(v) } },
  { keys: ['invoice','invoice_no','invoice_id','发票','发票号','发票代码'],
    fn: (ctx, v) => { hit(ctx, '发票号码'); return maskInvoice(v) } },
  { keys: ['tax','tax_id','credit_code','统一社会信用代码','税号','信用代码','营业执照号'],
    fn: (ctx, v) => { hit(ctx, '统一社会信用代码'); return maskSocialCredit(v) } },
  { keys: ['social','social_security','housing_fund','公积金','社保','社保号','社保账号'],
    fn: (ctx, v) => { hit(ctx, '社保/公积金号'); return maskHousingFund(v) } },
  { keys: ['medical','medical_record','record_no','病历','病历号','就诊号','住院号'],
    fn: (ctx, v) => { hit(ctx, '病历号'); return maskMedicalRecord(v) } },
  { keys: ['wechat','wechat_id','wxid','wx_id','微信','微信号','微信公众号'],
    fn: (ctx, v) => { hit(ctx, '微信/QQ号'); return v.length > 6 ? v.slice(0, 2) + '****' + v.slice(-2) : '****' } },
  { keys: ['qq','qq_id','qq号','qqnumber'],
    fn: (ctx, v) => { hit(ctx, '微信/QQ号'); return v.length > 6 ? v.slice(0, 2) + '****' + v.slice(-2) : '****' } },
]

// ── 列名归一化 ────────────────────────────────────────────────────────────────

export function normalizeColName(n) { return n.toLowerCase().replace(/[\s_\-]/g, '') }

export function findColRule(colName) {
  const norm = normalizeColName(colName)
  for (const rule of CSV_COLUMN_RULES) {
    if (rule.keys.some(k => norm.includes(normalizeColName(k)))) return rule
  }
  return null
}

// ── CSV 行解析 ────────────────────────────────────────────────────────────────

export function parseCsvLine(line) {
  const fields = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQ = false
      else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { fields.push(cur); cur = '' }
      else cur += ch
    }
  }
  fields.push(cur)
  return fields
}

export function toCsvField(v) {
  if (v.includes(',') || v.includes('"') || v.includes('\n'))
    return '"' + v.replace(/"/g, '""') + '"'
  return v
}

// ── CSV 文本脱敏（列名精准模式）──────────────────────────────────────────────

function desensitizeCsv(text, ctx) {
  const lines = text.split('\n')
  const nonEmpty = lines.filter(l => l.trimEnd())
  if (nonEmpty.length < 2) return text
  const headerIdx = lines.findIndex(l => l.trimEnd())
  const headers = parseCsvLine(lines[headerIdx])
  const rules = headers.map(h => findColRule(h.trim()))
  if (rules.every(r => r === null)) return null
  const resultLines = lines.map((line, idx) => {
    if (idx === headerIdx) return line
    if (!line.trimEnd()) return line
    const fields = parseCsvLine(line)
    const masked = fields.map((val, ci) => {
      const rule = rules[ci]
      if (!rule || !val.trim()) return val
      try { return toCsvField(rule.fn(ctx, val.trim())) } catch { return val }
    })
    return masked.join(',')
  })
  return resultLines.join('\n')
}

// ── 正则规则脱敏（兜底层）────────────────────────────────────────────────────

function applyRegexRules(text, ctx) {
  // Token / 密码 / 密钥
  text = text.replace(
    /(?:token|access_?token|refresh_?token|api_?key|api_?secret|secret_?key|sk-|sk_|bearer|password|passwd|pwd|auth_?token|session_?id)[=＝\s:]+["']?([a-zA-Z0-9_\-\.]{6,128})["']?/gi,
    (m, v) => {
      hit(ctx, 'Token/密码/密钥')
      const p = m.match(/^[^(=＝\s:)]+/)[0]
      return p + (v.length > 8 ? v.slice(0, 3) + '****' + v.slice(-3) : '********')
    }
  )

  // 邮箱
  text = text.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, m => {
    hit(ctx, '邮箱'); return maskEmail(m)
  })

  // 手机号 / 座机（加词边界，防止匹配银行卡/身份证等长数字串中的子串）
  text = text.replace(/(?<!\d)(?:\+?86[\- ]?)?1[3-9]\d{9}(?!\d)/g, m => { hit(ctx, '手机号'); return maskPhone(m) })
  text = text.replace(/(?<!\d)0\d{2,3}[\- ]?\d{7,8}(?!\d)/g, m => { hit(ctx, '座机号码'); return maskPhone(m) })

  // 身份证
  text = text.replace(/(?<!\d)\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g,
    m => { hit(ctx, '身份证号'); return maskIdCard(m, 'cnic') })
  text = text.replace(/(?<!\d)\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}(?!\d)/g,
    m => { hit(ctx, '身份证号'); return maskIdCard(m, 'hic') })

  // 港澳台证件
  text = text.replace(/(?<![A-Za-z])[A-Z]\d{6}\([\dA]\)(?![A-Za-z0-9])/g,
    m => { hit(ctx, '港澳通行证/身份证'); return maskIdCard(m, 'hk') })
  text = text.replace(/(?<![A-Za-z])[A-Z]\d{9}(?![A-Za-z0-9])/g,
    m => { hit(ctx, '台湾身份证'); return maskIdCard(m, 'tw') })
  text = text.replace(/(?<!\d)[1-6]\d{6}\([\d]\)(?!\d)/g,
    m => { hit(ctx, '澳门身份证'); return maskIdCard(m, 'macau') })

  // 护照
  text = text.replace(/(?<![A-Za-z])[EeGgDdSsPp]\d{8}(?!\d)/g,
    m => { hit(ctx, '护照号'); return m[0] + '****' + m.slice(-3) })

  // 港澳台通行证
  text = text.replace(/(?<![A-Za-z])[HhMm]\d{10}(?!\d)/g,
    m => { hit(ctx, '港澳台通行证'); return m.slice(0, 2) + '****' + m.slice(-4) })

  // 驾驶证
  text = text.replace(/(?<!\d)\d{12}(?!\d)/g, m => {
    if (/^[1-9]\d{10}\d$/.test(m)) { hit(ctx, '驾驶证号'); return maskLicenseNo(m) }
    return m
  })

  // 社保卡
  text = text.replace(/(?<!\d)([1-9]\d{16,17}|[1-9]\d{10}\d{6})(?<!\d)/g,
    m => { hit(ctx, '社保卡号'); return maskSocialSecurity(m) })

  // 公积金
  text = text.replace(/(?<!\d)\d{10}(?:[\- ]\d{4,6})+(?!\d)/g,
    m => { hit(ctx, '公积金账号'); return maskHousingFund(m) })

  // 统一社会信用代码
  text = text.replace(/(?<![0-9A-Za-z])[0-9A-HJ-NP-RT-Y]{18}(?![0-9A-Za-z])/g,
    m => { hit(ctx, '统一社会信用代码'); return maskTax(m) })

  // 银行卡（Luhn 校验）
  text = text.replace(/(?<!\d)\d{16,19}(?!\d)/g, m => {
    const d = m.replace(/\D/g, '')
    const s = d.split('').reverse().reduce((a, x, i) => {
      let n = parseInt(x)
      if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9 }
      return a + n
    }, 0)
    if (s > 0 && s % 10 === 0) { hit(ctx, '银行卡号'); return maskBank(m) }
    return m
  })

  // IPv4 / IPv6
  text = text.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, m => {
    const p = m.split('.').map(Number)
    if (p.every(o => o <= 255)) { hit(ctx, 'IP地址'); return p[0] + '.' + p[1] + '.*.*' }
    return m
  })
  text = text.replace(/(?<![:\w])(?:[0-9a-fA-F]{1,4}:){3,7}[0-9a-fA-F]{1,4}(?![:\w])/g,
    m => { hit(ctx, 'IPv6地址'); return '****:****:****:****' })

  // KV 对
  const KV_PAIRS = [
    [/(?:phone|mobile|tel|cell)[=：][+\d\- ]{7,15}/gi,
      v => { hit(ctx, '[kv]手机号'); return v.replace(/=.+/, '=****') }],
    [/(?:idcard|id_card|identity|cnic)[=：]\d{17}[\dXx]/gi,
      v => { hit(ctx, '[kv]身份证号'); return v.replace(/=.+/, '=****') }],
    [/(?:email|mail)[=：][a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/gi,
      v => { hit(ctx, '[kv]邮箱'); return v.replace(/=.+/, '=****') }],
    [/(?:name|realname|username)[=：][\u4e00-\u9fa5A-Za-z0-9_\-]{2,20}/gi,
      v => { hit(ctx, '[kv]姓名'); return v.replace(/=(.+)/, (_, x) => '=' + maskName(ctx, x)) }],
    [/(?:uid|user_?id|openid|empid)[=：][A-Za-z0-9_\-]{4,32}/gi,
      v => { hit(ctx, '[kv]用户ID'); return v.replace(/=(.+)/, (_, x) => '=uid_' + sha8(x)) }],
    [/(?:bankcard|bank_card|card_?no|account)[=：]\d{16,19}/gi,
      v => { hit(ctx, '[kv]银行卡号'); return v.replace(/=(.+)/, (_, x) => '=' + maskBank(x)) }],
    [/(?:address|addr)[=：][\u4e00-\u9fa5A-Za-z0-9\-#,\s]{5,50}/gi,
      v => { hit(ctx, '[kv]地址'); return v.replace(/=(.+)/, (_, x) => '=' + maskAddress(x)) }],
    [/(?:company|corp|org)[=：][\u4e00-\u9fa5A-Za-z0-9·\-]{2,20}/gi,
      v => { hit(ctx, '[kv]企业/集团/基金名称'); return v.replace(/=(.+)/, (_, x) => '=' + maskCompany(ctx, x)) }],
    [/(?:salary|amount|price|income|revenue)[=：][\d,]+(?:\.\d{1,2})?/gi,
      v => { hit(ctx, '[kv]金额'); return v.replace(/=(.+)/, (_, x) => '=' + maskAmount(ctx, x)) }],
    [/(?:token|api_?key|api_?secret|secret|pwd)[=：][a-zA-Z0-9_\-\.]{6,}/gi,
      v => { hit(ctx, '[kv]Token/密钥'); return v.replace(/=.+/, '=****') }],
    [/(?:ip_?addr|client_?ip|remote_?ip)[=：]\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/gi,
      v => { hit(ctx, '[kv]IP地址'); return v.replace(/=.+/, '=***.***.*.***') }],
  ]
  for (const [re, fn] of KV_PAIRS) text = text.replace(re, fn)

  // URL 敏感参数
  text = text.replace(
    /([?&](?:phone|mobile|email|uid|user_?id|token|access_?token|id_?card|name|openid|realname|bankcard|card_?no|address|password|auth_?token|refresh_?token|api_?key))=([^&\s"'<>]{1,128})/gi,
    (_, k) => { hit(ctx, 'URL敏感参数'); return k + '=****' }
  )

  // 姓名（中文上下文）
  text = text.replace(
    /(?:姓名|联系人|负责人|经办人|申请人|审批人|收件人|发件人|客户名|用户名|操作人|创建人|提交人|乘客|旅客|当事人|受益人|被保险人|投保人)[：:]\s*([\u4e00-\u9fa5]{2,4})/g,
    (m, v) => { hit(ctx, '姓名'); const sep = m.match(/[：:]/)[0]; return m.slice(0, m.indexOf(sep) + 1) + maskName(ctx, v.trim()) }
  )

  // 微信 / QQ
  text = text.replace(
    /(?:微信号?|微信ID|wechat|wxid|QQ号?|qq)[：:\s]\s*([A-Za-z0-9_\-\.]{4,30})/gi,
    (m, v) => { hit(ctx, '微信/QQ号'); const sep = m.match(/[：:\s]/)[0]; return m.slice(0, m.indexOf(sep) + 1) + (v.length > 6 ? v.slice(0, 2) + '****' + v.slice(-2) : '****') }
  )

  // 供应商 / 客户
  text = text.replace(
    /(?:^|(?<=[\s，,、。；;\n]))(?:供应商|客户|甲方|乙方|合作方|承包商|分包商|经销商|代理商|采购方|销售方)[：:]\s*([\u4e00-\u9fa5A-Za-z0-9·\-]{2,20})/gm,
    (m, v) => { hit(ctx, '供应商/客户'); const sep = m.match(/[：:]/)[0]; return m.slice(0, m.indexOf(sep) + 1) + maskVendor(ctx, v.trim()) }
  )

  // 部门
  text = text.replace(
    /(?:部门|成本中心|事业部|业务线|团队|小组|分部|科室)[：:]\s*([\u4e00-\u9fa5A-Za-z0-9·\-]{2,20})/g,
    (m, v) => { hit(ctx, '部门'); const sep = m.match(/[：:]/)[0]; return m.slice(0, m.indexOf(sep) + 1) + maskDept(ctx, v.trim()) }
  )

  // 项目
  text = text.replace(
    /(?:项目|工程|课题|专项)[：:]\s*([\u4e00-\u9fa5A-Za-z0-9·\-]{2,20})/g,
    (m, v) => { hit(ctx, '项目名称'); const sep = m.match(/[：:]/)[0]; return m.slice(0, m.indexOf(sep) + 1) + maskProject(ctx, v.trim()) }
  )

  // 企业 / 集团 / 基金名称
  const COMPANY_SUFFIXES = '(?:有限公司|股份公司|有限责任公司|集团公司|企业集团|合伙企业|工作室|研究院|基金会|出版社|医院|学校|酒店|商场|超市|农场|养殖场|工厂|矿山|基金管理公司|基金公司|资产管理|投资集团|实业集团|控股公司|科技公司|技术公司|咨询公司|律师事务所|会计师事务所|评估公司|担保公司|租赁公司|融资公司|保理公司|信托公司|证券公司|保险公司|经纪公司|代理公司|进出口公司|电商公司|网络公司|传媒公司|文化公司|旅游公司|建筑公司|工程公司|装修公司|设计公司|农业公司|能源公司|化工公司|机械公司|电子公司|通信公司|软件公司|数据公司|物流公司|供应链公司|贸易公司|外运公司|仓储公司|人力资源|商务咨询|企业咨询|管理咨询|产业发展|产业园区|孵化器|加速器)'
  text = text.replace(
    new RegExp('[\\u4e00-\\u9fa5A-Za-z0-9]{2,20}' + COMPANY_SUFFIXES, 'g'),
    m => { hit(ctx, '企业/集团/基金名称'); return maskCompany(ctx, m) }
  )
  text = text.replace(
    /(?:^|(?<=[\s,、。；;\n]))(?:企业|集团|基金)[：:]\s*([\u4e00-\u9fa5A-Za-z0-9·\-]{2,20})/gm,
    (m, v) => { hit(ctx, '企业/集团/基金名称'); const sep = m.match(/[：:]/)[0]; return m.slice(0, m.indexOf(sep) + 1) + maskCompany(ctx, v.trim()) }
  )

  // 地址
  const ADDR_BODY = '([\\u4e00-\\u9fa5A-Za-z0-9\\-#号楼室栋层弄巷路街道镇乡县市区省\\s]{4,50})'
  text = text.replace(
    new RegExp('(?:收货地址|发货地址|详细地址|通讯地址|注册地址|办公地址)[：:]\\s*' + ADDR_BODY, 'g'),
    (m, v) => { hit(ctx, '地址'); const sep = m.match(/[：:]/)[0]; return m.slice(0, m.indexOf(sep) + 1) + maskAddress(v.trim()) }
  )
  text = text.replace(
    new RegExp('(?:^|(?<=[\\s，,、。；;\\n]))(?:住址|地址)[：:]\\s*' + ADDR_BODY, 'gm'),
    (m, v) => { hit(ctx, '地址'); const sep = m.match(/[：:]/)[0]; return m.slice(0, m.indexOf(sep) + 1) + maskAddress(v.trim()) }
  )

  // 出生日期
  text = text.replace(
    /(?:出生日期|生日|出生年月)[：:]\s*(\d{4}[年\-/.]\d{1,2}[月\-/.]\d{1,2}[日]?)/g,
    (_, k) => { hit(ctx, '出生日期'); return k + '：****-**-**' }
  )
  text = text.replace(
    /(?<!\d)(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?!\d)/g,
    m => { hit(ctx, '出生日期'); return maskBirthDate(m) }
  )

  // 年龄
  text = text.replace(
    /(?:年龄|岁)[：:]\s*(\d{1,3})/g,
    (_, k) => { hit(ctx, '年龄'); return k + '：**' }
  )

  // 金额（货币符号）
  text = text.replace(/([¥￥$€£₩])\s*([\d,]+(?:\.\d{1,2})?)/g, (_, s, num) => {
    hit(ctx, '金额')
    const n = parseFloat(num.replace(/,/g, ''))
    if (isNaN(n)) return _
    return s + Math.round(n * ctx.amountScale * 100) / 100
  })
  text = text.replace(/\b(?:USD|CNY|EUR|GBP|JPY|HKD|RMB)\s*([\d,]+(?:\.\d{1,2})?)/gi, (_, cur, num) => {
    hit(ctx, '金额')
    const n = parseFloat(num.replace(/,/g, ''))
    if (isNaN(n)) return _
    return cur + ' ' + Math.round(n * ctx.amountScale * 100) / 100
  })
  text = text.replace(
    /(?:金额|收入|支出|利润|营收|成本|税额|应付|应收|实付|实收|余额|薪资|报销|费用|价格|单价|总价|售价|定价)[：:]\s*([\d,]+(?:\.\d+)?)/g,
    (_, k, v) => { hit(ctx, '金额'); return k + '：' + maskAmount(ctx, v) }
  )

  // 比率
  text = text.replace(
    /(?:增长率|毛利率|净利率|利润率|折扣率|税率|占比|比率|转化率|完成率|达成率|覆盖率)[：:]\s*([\d.]+%?)/g,
    (_, k, v) => { hit(ctx, '比率/增长率'); return k + '：' + maskRatio(v) }
  )

  // 合同编号
  text = text.replace(/(?<![A-Za-z0-9])[A-Z]{2,6}-\d{4,8}(?:[-\.]\d{2,8})?(?![A-Za-z0-9])/g,
    m => { hit(ctx, '合同编号'); return maskContract(m) })

  // 订单 / 流水号
  text = text.replace(/(?<!\d)\d{14,25}(?!\d)/g, m => {
    if (!/^1[3-9]\d{13}$/.test(m) &&
        !/^\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]?$/.test(m)) {
      hit(ctx, '订单/流水号'); return maskOrder(m)
    }
    return m
  })

  // 发票号码
  text = text.replace(/(?<!\d)\d{8,12}(?!\d)/g, m => { hit(ctx, '发票号码'); return maskInvoice(m) })

  // 工号
  text = text.replace(
    /(?:工号|员工号|员工编号)[：:]\s*([A-Za-z0-9\-]{4,20})/gi,
    (_, k, v) => { hit(ctx, '工号'); return k + '：' + maskEmployeeId(v) }
  )

  return text
}

// ── 快速检测模式 ──────────────────────────────────────────────────────────────

const QUICK_PATTERNS = [
  /(?<!\d)(\+?86[\- ]?)?1[3-9]\d{9}(?!\d)/,
  /\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/,
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/,
  /(?<!\d)\d{16,19}(?!\d)/,
  /[EeGgDdSsPp]\d{8}/,
  /[HhMm]\d{10}/,
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  /(?:token|access_?token|api_?key|secret|password|passwd|pwd)\s*[=＝]\s*\S{6,}/i,
  /[?&](?:phone|mobile|email|uid|user_?id|token|id_?card|openid)=/i,
  /(?:微信号?|wxid|QQ号?)[：:\s]\s*[A-Za-z0-9_.\-]{4,}/i,
  /[A-Z]{2,6}-\d{4,8}/,
  /(?<!\d)\d{14,25}(?!\d)/,
  /(?:姓名|手机|身份证|邮箱|地址|银行卡|税号|发票|合同|订单|流水|账户|供应商|客户|金额|收入|支出|利润|营收|成本|薪资|部门|项目|车牌|护照|公司|用户名|联系人|出生|年龄)/,
  /(?:name|username|company|vendor|supplier|customer|address|salary|revenue|profit|department)\s*[=:]\s*\S/i,
]

export function mightContainSensitiveData(text) {
  if (looksLikeCsv(text)) return true
  return QUICK_PATTERNS.some(p => p.test(text))
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

export function desensitize(text) {
  const ctx = makeCtx()
  if (looksLikeCsv(text)) {
    const r = desensitizeCsv(text, ctx)
    if (r !== null) return { result: applyRegexRules(r, ctx), stats: ctx.stats }
  }
  return { result: applyRegexRules(text, ctx), stats: ctx.stats }
}
