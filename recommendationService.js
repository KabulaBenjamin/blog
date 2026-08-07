const pool = require('../config/db');

/**
 * Phase 1: Rule-Based Recommendation Engine
 * Scores candidate posts based on category match, tag overlap, same author, and recency.
 */
async function getRelatedPosts(currentPostId, limit = 5) {
  try {
    // 1. Fetch current post details
    const currentPostRes = await pool.query(
      'SELECT id, user_id, category, tags FROM posts WHERE id = $1',
      [currentPostId]
    );

    if (currentPostRes.rows.length === 0) return [];

    const { user_id, category, tags: currentTagsRaw } = currentPostRes.rows[0];
    const currentTags = currentTagsRaw
      ? currentTagsRaw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [];

    // 2. Fetch candidate posts (exclude current post)
    const candidateRes = await pool.query(`
      SELECT posts.*, users.username 
      FROM posts 
      LEFT JOIN users ON posts.user_id = users.id 
      WHERE posts.id != $1 
      ORDER BY posts.created_at DESC 
      LIMIT 50
    `, [currentPostId]);

    const candidates = candidateRes.rows;

    // 3. Score each candidate
    const scoredCandidates = candidates.map((post) => {
      let score = 0;

      // Category match (+40)
      if (category && post.category && post.category.toLowerCase() === category.toLowerCase()) {
        score += 40;
      }

      // Same Author (+10)
      if (post.user_id === user_id) {
        score += 10;
      }

      // Shared Tags (+15 per overlap)
      if (post.tags && currentTags.length > 0) {
        const postTags = post.tags.split(',').map((t) => t.trim().toLowerCase());
        const sharedTagsCount = postTags.filter((tag) => currentTags.includes(tag)).length;
        score += sharedTagsCount * 15;
      }

      // Popularity boost (+0 to +30 based on views)
      const postViews = post.views || 0;
      score += Math.min(30, Math.floor(postViews / 10));

      // Recency decay (+0 to +20)
      const ageInDays = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 3600 * 24);
      const recencyBoost = Math.max(0, 20 - Math.floor(ageInDays));
      score += recencyBoost;

      return { ...post, recommendationScore: score };
    });

    // 4. Sort by score descending and return top matches
    return scoredCandidates
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, limit);
  } catch (err) {
    console.error('Error computing related posts:', err);
    return [];
  }
}

/**
 * Phase 4: Trending Algorithm
 * Trending Score = (Views * 0.5) + (Likes * 3) - Age Penalty (Hours)
 */
async function getTrendingPosts(limit = 10) {
  try {
    const result = await pool.query(`
      SELECT posts.*, users.username,
        (
          (COALESCE(posts.views, 0) * 0.5) + 
          (COALESCE(posts.likes, 0) * 3.0) - 
          (EXTRACT(EPOCH FROM (NOW() - posts.created_at)) / 3600.0 * 0.5)
        ) AS trending_score
      FROM posts
      LEFT JOIN users ON posts.user_id = users.id
      ORDER BY trending_score DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  } catch (err) {
    console.error('Error fetching trending posts:', err);
    return [];
  }
}

module.exports = {
  getRelatedPosts,
  getTrendingPosts,
};
