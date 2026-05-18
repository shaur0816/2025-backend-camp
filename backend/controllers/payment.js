const crypto = require('crypto')
const ECPayAioCheckout = require('ecpay_aio_nodejs')
const { dataSource } = require('../db/data-source')
const ecpayConfig = require('../config/ecpay')
const logger = require('../utils/logger')('PaymentController')

function buildEcpayInstance () {
  return new ECPayAioCheckout({
    OperationMode: ecpayConfig.operationMode,
    MercProfile: {
      MerchantID: ecpayConfig.merchantId,
      HashKey: ecpayConfig.hashKey,
      HashIV: ecpayConfig.hashIV
    },
    IgnorePayment: [],
    IsProjectContractor: false
  })
}

function generateMerchantTradeNo () {
  // 格式：T + 13位毫秒時間戳，共14碼，符合綠界20碼限制
  return `T${Date.now()}`
}

// 驗證綠界回傳的 CheckMacValue
function verifyCheckMacValue (params, hashKey, hashIV) {
  const { CheckMacValue: receivedMac, ...rest } = params

  const sortedStr = Object.keys(rest)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(key => `${key}=${rest[key]}`)
    .join('&')

  let raw = `HashKey=${hashKey}&${sortedStr}&HashIV=${hashIV}`

  raw = encodeURIComponent(raw)
    .toLowerCase()
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')

  const mac = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase()
  return mac === receivedMac
}

class PaymentController {
  /**
   * 建立綠界訂單，回傳 HTML form（前端自動 submit 到綠界）
   */
  static async createOrder (req, res, next) {
    logger.debug('[createOrder] input:', req.body)
    try {
      const { id: userId } = req.user
      const { creditPackageId } = req.body

      if (!creditPackageId) {
        res.status(400).json({ status: 'failed', message: '請提供 creditPackageId' })
        return
      }

      const creditPackageRepo = dataSource.getRepository('CreditPackage')
      const creditPackage = await creditPackageRepo.findOne({ where: { id: creditPackageId } })

      if (!creditPackage) {
        res.status(400).json({ status: 'failed', message: '方案不存在' })
        return
      }

      const merchantTradeNo = generateMerchantTradeNo()
      const tradeDate = new Date().toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(/\//g, '/').replace(',', '')

      // 先建立 pending 的購買紀錄
      const creditPurchaseRepo = dataSource.getRepository('CreditPurchase')
      const newPurchase = creditPurchaseRepo.create({
        user_id: userId,
        credit_package_id: creditPackageId,
        purchased_credits: creditPackage.credit_amount,
        price_paid: creditPackage.price,
        payment_status: 'pending',
        merchant_trade_no: merchantTradeNo,
        purchaseAt: null
      })
      await creditPurchaseRepo.save(newPurchase)

      // 建立綠界付款表單
      const ecpay = buildEcpayInstance()
      const baseParam = {
        MerchantTradeNo: merchantTradeNo,
        MerchantTradeDate: tradeDate,
        TotalAmount: String(Math.round(creditPackage.price)),
        TradeDesc: encodeURIComponent('健身課程點數購買'),
        ItemName: creditPackage.name,
        ReturnURL: ecpayConfig.returnUrl,
        OrderResultURL: ecpayConfig.orderResultUrl,
        ClientBackURL: ecpayConfig.clientBackUrl,
        ChoosePayment: 'Credit',
        EncryptType: '1'
      }

      const html = ecpay.payment_client.aio_check_out_credit_onetime(baseParam, {})
      logger.debug('[createOrder] ECPay form generated for:', merchantTradeNo)

      res.status(200).json({ status: 'success', data: { html } })
    } catch (error) {
      logger.error('[createOrder] error:', error)
      next(error)
    }
  }

  /**
   * 綠界付款完成後的 Server-to-Server 通知
   * 驗證成功後更新 CreditPurchase 狀態為 paid
   */
  static async paymentCallback (req, res, next) {
    logger.debug('[paymentCallback] input:', req.body)
    try {
      const params = req.body

      // 驗證 CheckMacValue 防偽造
      const isValid = verifyCheckMacValue(params, ecpayConfig.hashKey, ecpayConfig.hashIV)
      if (!isValid) {
        logger.warn('[paymentCallback] CheckMacValue 驗證失敗')
        res.send('0|CheckMacValue Error')
        return
      }

      const { RtnCode, MerchantTradeNo } = params

      if (RtnCode === '1') {
        // 付款成功，更新訂單狀態
        const creditPurchaseRepo = dataSource.getRepository('CreditPurchase')
        await creditPurchaseRepo.update(
          { merchant_trade_no: MerchantTradeNo },
          {
            payment_status: 'paid',
            purchaseAt: new Date()
          }
        )
        logger.debug('[paymentCallback] 付款成功，訂單已更新:', MerchantTradeNo)
      } else {
        logger.warn('[paymentCallback] 付款失敗，RtnCode:', RtnCode, 'TradeNo:', MerchantTradeNo)
        const creditPurchaseRepo = dataSource.getRepository('CreditPurchase')
        await creditPurchaseRepo.update(
          { merchant_trade_no: MerchantTradeNo },
          { payment_status: 'failed' }
        )
      }

      // 必須回傳 '1|OK' 給綠界，否則綠界會重複通知
      res.send('1|OK')
    } catch (error) {
      logger.error('[paymentCallback] error:', error)
      res.send('0|Error')
    }
  }
}

module.exports = PaymentController
