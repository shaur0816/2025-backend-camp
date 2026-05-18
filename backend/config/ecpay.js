module.exports = {
  operationMode: process.env.ECPAY_OPERATION_MODE || 'Test',
  merchantId: process.env.ECPAY_MERCHANT_ID,
  hashKey: process.env.ECPAY_HASH_KEY,
  hashIV: process.env.ECPAY_HASH_IV,
  returnUrl: process.env.ECPAY_RETURN_URL,
  orderResultUrl: process.env.ECPAY_ORDER_RESULT_URL,
  clientBackUrl: process.env.ECPAY_CLIENT_BACK_URL
}
