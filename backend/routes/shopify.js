const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify');

// 获取所有 Shopify 商品
router.get('/products', async (req, res) => {
  try {
    const { search } = req.query;
    let products;

    if (search) {
      products = await shopifyService.searchProducts(search);
    } else {
      products = await shopifyService.getAllProducts();
    }

    res.json({ success: true, data: products, total: products.length });
  } catch (err) {
    console.error('获取 Shopify 商品失败:', err.message);
    res.status(500).json({
      success: false,
      message: '获取 Shopify 商品失败: ' + err.message,
    });
  }
});

// 获取单个 Shopify 商品
router.get('/products/:id', async (req, res) => {
  try {
    const product = await shopifyService.getProduct(req.params.id);
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
