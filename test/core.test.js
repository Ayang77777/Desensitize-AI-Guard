/**
 * test/core.test.js — 核心脱敏引擎测试
 *
 * 覆盖：
 *   - desensitize()：各类敏感信息的脱敏正确性
 *   - mightContainSensitiveData()：快速检测准确性（不漏报、不误报）
 *   - makeCtx()：上下文隔离（同名实体在同一 ctx 内映射一致）
 *   - 各 mask* 函数：边界值
 *   - CSV 列名规则：findColRule 匹配逻辑
 */

import { suite, test, assert } from './runner.js'
import {
  desensitize,
  mightContainSensitiveData,
  makeCtx,
  maskPhone, maskEmail, maskIdCard, maskBank,
  maskName, maskCompany, maskVendor, maskDept,
  maskAddress, maskAmount, maskLicensePlate,
  maskContract, maskOrder, maskInvoice,
  looksLikeCsv, findColRule, CSV_COLUMN_RULES,
} from '../src/core/desensitize.js'

import {
  SENSITIVE_TEXT, CLEAN_TEXTS,
  CSV_WITH_SENSITIVE_COLS, CSV_CLEAN,
} from './fixtures/index.js'

// ── 手机号脱敏 ────────────────────────────────────────────────────────────────

suite('core › maskPhone', () => {
  test('11位大陆手机号', () => {
    const r = maskPhone('13812345678')
    assert.equal(r, '138****5678')
  })
  test('带+86前缀', () => {
    const r = maskPhone('+8613812345678')
    assert.match(r, /\*{4}/)
  })
  test('7位以下不脱敏', () => {
    assert.equal(maskPhone('123456'), '123456')
  })
  test('脱敏后不含原始中间4位', () => {
    const r = maskPhone('13812345678')
    assert.notIncludes(r, '2345')
  })
})

// ── 邮箱脱敏 ──────────────────────────────────────────────────────────────────

suite('core › maskEmail', () => {
  test('标准邮箱', () => {
    const r = maskEmail('user@example.com')
    assert.includes(r, '@example.com')
    assert.match(r, /\*/)
    assert.notIncludes(r, 'user')
  })
  test('短用户名（2字符）', () => {
    const r = maskEmail('ab@test.com')
    assert.includes(r, '@test.com')
  })
  test('无@符号原样返回', () => {
    assert.equal(maskEmail('notanemail'), 'notanemail')
  })
  test('脱敏后仍是合法邮箱格式', () => {
    const r = maskEmail('hello.world@company.org')
    assert.match(r, /@company\.org$/)
  })
})

// ── 身份证脱敏 ────────────────────────────────────────────────────────────────

suite('core › maskIdCard', () => {
  test('18位身份证（cnic）', () => {
    const r = maskIdCard('110101199001011234', 'cnic')
    assert.equal(r.length, 18)
    assert.match(r, /\*{11}/)
    assert.equal(r.slice(0, 3), '110')
    assert.equal(r.slice(-4), '1234')
  })
  test('默认类型为 cnic', () => {
    const r = maskIdCard('110101199001011234')
    assert.match(r, /\*{11}/)
  })
  test('香港身份证（hk）', () => {
    const r = maskIdCard('A123456(7)', 'hk')
    assert.match(r, /\*{7}/)
  })
})

// ── 银行卡脱敏 ────────────────────────────────────────────────────────────────

suite('core › maskBank', () => {
  test('16位银行卡', () => {
    const r = maskBank('6222021234567890')
    assert.equal(r.slice(0, 4), '6222')
    assert.equal(r.slice(-4), '7890')
    assert.match(r, /\*+/)
  })
  test('19位银行卡', () => {
    const r = maskBank('6222021234567890123')
    assert.match(r, /\*+/)
    assert.equal(r.slice(-4), '0123')
  })
  test('8位以下原样返回', () => {
    assert.equal(maskBank('1234567'), '1234567')
  })
})

// ── 地址脱敏 ──────────────────────────────────────────────────────────────────

suite('core › maskAddress', () => {
  test('含省市的地址保留省市', () => {
    const r = maskAddress('北京市朝阳区建国路88号')
    assert.includes(r, '北京市')
    assert.match(r, /\*+/)
  })
  test('无省市前缀的地址', () => {
    const r = maskAddress('建国路88号')
    assert.match(r, /\*+/)
  })
})

// ── 车牌号脱敏 ────────────────────────────────────────────────────────────────

suite('core › maskLicensePlate', () => {
  test('标准车牌', () => {
    const r = maskLicensePlate('京A12345')
    assert.includes(r, '京A')
    assert.match(r, /\*{3}/)
  })
})

// ── 上下文隔离 ────────────────────────────────────────────────────────────────

suite('core › makeCtx 上下文隔离', () => {
  test('同一 ctx 内同名映射一致', () => {
    const ctx = makeCtx()
    const r1 = maskName(ctx, '张三')
    const r2 = maskName(ctx, '张三')
    assert.equal(r1, r2, '同名应映射到同一假名')
  })
  test('不同 ctx 之间互不影响', () => {
    const ctx1 = makeCtx()
    const ctx2 = makeCtx()
    maskName(ctx1, '张三')
    // ctx2 中没有张三，应该是新映射
    const r2 = maskName(ctx2, '张三')
    assert.ok(r2.startsWith('用户_'), '应生成用户_前缀的假名')
  })
  test('供应商按字母顺序编号', () => {
    const ctx = makeCtx()
    const a = maskVendor(ctx, '甲公司')
    const b = maskVendor(ctx, '乙公司')
    assert.includes(a, '供应商_A')
    assert.includes(b, '供应商_B')
  })
  test('部门按字母顺序编号', () => {
    const ctx = makeCtx()
    const a = maskDept(ctx, '研发部')
    const b = maskDept(ctx, '市场部')
    assert.includes(a, '部门_A')
    assert.includes(b, '部门_B')
  })
})

// ── desensitize() 主函数 ──────────────────────────────────────────────────────

suite('core › desensitize() 各类敏感信息', () => {
  test('手机号被脱敏', () => {
    const { result, stats } = desensitize(SENSITIVE_TEXT.phone)
    assert.notIncludes(result, '13812345678')
    assert.hasKey(stats, '手机号')
  })
  test('邮箱被脱敏', () => {
    const { result, stats } = desensitize(SENSITIVE_TEXT.email)
    assert.notIncludes(result, 'user@example.com')
    assert.hasKey(stats, '邮箱')
  })
  test('身份证被脱敏', () => {
    const { result, stats } = desensitize(SENSITIVE_TEXT.idCard)
    assert.notIncludes(result, '110101200001011234')
    assert.hasKey(stats, '身份证号')
  })
  test('银行卡被脱敏', () => {
    const { result, stats } = desensitize(SENSITIVE_TEXT.bankCard)
    assert.notIncludes(result, '4532015112830366')
    assert.hasKey(stats, '银行卡号')
  })
  test('IP地址被脱敏', () => {
    const { result, stats } = desensitize(SENSITIVE_TEXT.ip)
    assert.notIncludes(result, '192.168.1.100')
    assert.hasKey(stats, 'IP地址')
  })
  test('Token/密钥被脱敏', () => {
    const { result, stats } = desensitize(SENSITIVE_TEXT.token)
    assert.notIncludes(result, 'sk-abcdefghijklmnop123456')
    assert.hasKey(stats, 'Token/密码/密钥')
  })
  test('URL敏感参数被脱敏', () => {
    const { result, stats } = desensitize(SENSITIVE_TEXT.urlParam)
    assert.notIncludes(result, '13812345678')
    assert.hasKey(stats, 'URL敏感参数')
  })
  test('混合敏感信息全部被脱敏', () => {
    const { result, stats } = desensitize(SENSITIVE_TEXT.mixed)
    assert.notIncludes(result, '13812345678')
    assert.notIncludes(result, 'zhang@corp.com')
    assert.notIncludes(result, '110101199001011234')
    assert.ok(Object.keys(stats).length >= 2, '应有多类脱敏统计')
  })
  test('干净文本不被修改', () => {
    const { result, stats } = desensitize(SENSITIVE_TEXT.clean)
    assert.equal(result, SENSITIVE_TEXT.clean)
    assert.equal(Object.keys(stats).length, 0)
  })
  test('金额被脱敏（数值缩放）', () => {
    const { result, stats } = desensitize(SENSITIVE_TEXT.amount)
    assert.hasKey(stats, '金额')
    assert.notIncludes(result, '128,888.00')
  })
  test('地址被脱敏', () => {
    const { result, stats } = desensitize(SENSITIVE_TEXT.address)
    assert.hasKey(stats, '地址')
    assert.notIncludes(result, '建国路88号')
  })
  test('企业名称被脱敏', () => {
    const { result, stats } = desensitize(SENSITIVE_TEXT.company)
    assert.hasKey(stats, '企业/集团/基金名称')
  })
  test('CSV 格式文本走列名精准脱敏', () => {
    const { result, stats } = desensitize(CSV_WITH_SENSITIVE_COLS)
    assert.notIncludes(result, '13812345678')
    assert.notIncludes(result, 'zhang@example.com')
  })
  test('干净 CSV 不被修改', () => {
    const { result, stats } = desensitize(CSV_CLEAN)
    assert.equal(Object.keys(stats).length, 0)
  })
})

// ── mightContainSensitiveData() ───────────────────────────────────────────────

suite('core › mightContainSensitiveData() 快速检测', () => {
  test('手机号 → true', () => {
    assert.ok(mightContainSensitiveData('13812345678'))
  })
  test('身份证 → true', () => {
    assert.ok(mightContainSensitiveData('110101199001011234'))
  })
  test('邮箱 → true', () => {
    assert.ok(mightContainSensitiveData('user@example.com'))
  })
  test('IP地址 → true', () => {
    assert.ok(mightContainSensitiveData('192.168.1.1'))
  })
  test('Token → true', () => {
    assert.ok(mightContainSensitiveData('api_key=abc123xyz'))
  })
  test('CSV 格式 → true', () => {
    assert.ok(mightContainSensitiveData(CSV_WITH_SENSITIVE_COLS))
  })
  for (const text of CLEAN_TEXTS) {
    test(`干净文本不误报: "${text.slice(0, 10)}"`, () => {
      assert.equal(mightContainSensitiveData(text), false)
    })
  }
})

// ── looksLikeCsv() ────────────────────────────────────────────────────────────

suite('core › looksLikeCsv() CSV 检测', () => {
  test('标准 CSV → true', () => {
    assert.ok(looksLikeCsv(CSV_WITH_SENSITIVE_COLS))
  })
  test('单行文本 → false', () => {
    assert.equal(looksLikeCsv('hello world'), false)
  })
  test('无逗号多行 → false', () => {
    assert.equal(looksLikeCsv('第一行\n第二行\n第三行'), false)
  })
  test('列数不一致 → false', () => {
    assert.equal(looksLikeCsv('a,b,c\n1,2\n3,4,5,6'), false)
  })
})

// ── findColRule() CSV 列名匹配 ────────────────────────────────────────────────

suite('core › findColRule() 列名匹配', () => {
  const cases = [
    ['手机',     '手机号'],
    ['mobile',   '手机号'],
    ['phone',    '手机号'],
    ['邮箱',     '邮箱'],
    ['email',    '邮箱'],
    ['姓名',     '姓名'],
    ['name',     '姓名'],
    ['身份证号', '身份证号'],
    ['idcard',   '身份证号'],
    ['银行卡',   '银行卡号'],
    ['bankcard', '银行卡号'],
    ['地址',     '地址'],
    ['address',  '地址'],
    ['金额',     '金额'],
    ['amount',   '金额'],
    ['IP地址',   'IP地址'],
    ['ip',       'IP地址'],
  ]
  for (const [colName, expectedType] of cases) {
    test(`"${colName}" → ${expectedType}`, () => {
      const rule = findColRule(colName)
      assert.notNullish(rule, `列名 "${colName}" 应匹配到规则`)
      // 验证规则能正确执行
      const ctx = makeCtx()
      const result = rule.fn(ctx, 'test_value')
      assert.ok(typeof result === 'string', '规则函数应返回字符串')
    })
  }
  test('无关列名 → null', () => {
    assert.nullish(findColRule('产品名称'))
    assert.nullish(findColRule('数量'))
    assert.nullish(findColRule('备注'))
  })
  test('列名大小写不敏感', () => {
    assert.notNullish(findColRule('PHONE'))
    assert.notNullish(findColRule('Email'))
    assert.notNullish(findColRule('BANKCARD'))
  })
  test('列名含空格/下划线/连字符', () => {
    assert.notNullish(findColRule('bank card'))
    assert.notNullish(findColRule('bank_card'))
    assert.notNullish(findColRule('bank-card'))
  })
})
