const express = require('express')
const router = express.Router()
const config = require('../config/index')
const { dataSource } = require('../db/data-source')
const paymentController = require('../controllers/payment')
const logger = require('../utils/logger')('Payment')
const auth = require('../middlewares/auth')({
  secret: config.get('secret').jwtSecret,
  userRepository: dataSource.getRepository('User'),
  logger
})

// 建立訂單（需登入）
router.post('/create', auth, paymentController.createOrder)

// 綠界付款完成通知（Server-to-Server，不需驗證 JWT）
router.post('/callback', paymentController.paymentCallback)

// 綠界 OrderResultURL：瀏覽器端付款結果，轉址到前端
router.post('/order-result', paymentController.orderResult)

module.exports = router
