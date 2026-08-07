// File Location: routes/recommendations.js
const express = require('express');
const router = express.Router();
const { getRecommendedPosts } = require('../services/recommendationService');

router.get('/', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null; // Extract user if auth middleware is present
    const limit = parseInt(req.query.limit, 10) || 10;
    
    const recommendations = await getRecommendedPosts(userId, limit);
    res.json(recommendations);
  } catch (err) {
    console.error('Failed to get recommendations:', err);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

module.exports = router;