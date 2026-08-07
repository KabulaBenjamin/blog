const express = require('express');
const router = express.Router();
const { getRelatedPosts, getTrendingPosts } = require('../services/recommendationService');

// GET /api/recommendations/trending
router.get('/trending', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const trending = await getTrendingPosts(limit);
  res.json(trending);
});

// GET /api/recommendations/related/:postId
router.get('/related/:postId', async (req, res) => {
  const { postId } = req.params;
  const limit = parseInt(req.query.limit, 10) || 5;
  const related = await getRelatedPosts(postId, limit);
  res.json(related);
});

module.exports = router;