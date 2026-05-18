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

// 使用官方 SDK 驗證綠界回傳的 CheckMacValue
function verifyCheckMacValue (params) {
  const { CheckMacValue: receivedMac, ...rest } = params
  const ecpay = buildEcpayInstance()
  const expectedMac = ecpay.payment_client.helper.gen_chk_mac_value(rest).toUpperCase()
  return expectedMac === receivedMac.toUpperCase()
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
      const now = new Date()
      const pad = n => String(n).padStart(2, '0')
      const tradeDate = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

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
   * 綠界 OrderResultURL：瀏覽器端付款結果接收
   * 接收綠界 form POST，轉址到前端結果頁
   */
  static async orderResult (req, res, next) {
    try {
      const { RtnCode, MerchantTradeNo, RtnMsg } = req.body
      const frontendUrl = ecpayConfig.clientBackUrl.replace('/fitness-plans', '')
      const params = new URLSearchParams({
        RtnCode: RtnCode || '',
        MerchantTradeNo: MerchantTradeNo || '',
        RtnMsg: RtnMsg || ''
      })
      res.redirect(`${frontendUrl}/payment/result?${params.toString()}`)
    } catch (error) {
      logger.error('[orderResult] error:', error)
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
      const isValid = verifyCheckMacValue(params)
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
