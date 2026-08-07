// File Location: services/recommendationService.js
const Post = require('../models/Post'); // Adjust path to match your Post model

/**
 * Calculates dynamic recommendation scores for posts tailored to a user.
 * @param {string} userId - Optional logged-in user ID
 * @param {number} limit - Number of recommendations to return
 */
const getRecommendedPosts = async (userId = null, limit = 10) => {
  try {
    let preferredCategories = [];
    let preferredTags = [];

    // 1. Gather User Preferences (if logged in)
    if (userId) {
      const userInteractions = await Post.find({
        $or: [
          { liked_by_users: userId },
          { 'comments.user_id': userId }
        ]
      }).select('category tags');

      preferredCategories = userInteractions
        .map(p => p.category)
        .filter(Boolean);

      preferredTags = userInteractions
        .flatMap(p => p.tags ? p.tags.split(',').map(t => t.trim().toLowerCase()) : [])
        .filter(Boolean);
    }

    // 2. Fetch Recent Candidates (Fetch top 100 recent posts to score)
    const candidatePosts = await Post.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const now = new Date();

    // 3. Score Each Post Dynamically
    const scoredPosts = candidatePosts.map(post => {
      let score = 0;

      // A. Engagement Metrics
      const likesCount = Array.isArray(post.liked_by_users) 
        ? post.liked_by_users.length 
        : (post.likes || 0);
      
      const commentsCount = Array.isArray(post.comments) 
        ? post.comments.length 
        : (post.comments_count || 0);

      const engagementScore = (likesCount * 3) + (commentsCount * 5);
      score += engagementScore;

      // B. Recency Decay (Exponential decay over hours)
      const postAgeInHours = Math.max(0.1, (now - new Date(post.createdAt || post.updatedAt || now)) / (1000 * 60 * 60));
      const recencyMultiplier = 1 / Math.pow(postAgeInHours + 2, 1.2); // Gravity score
      score *= recencyMultiplier;

      // C. Personalization Boost (Category Match)
      if (preferredCategories.includes(post.category)) {
        score += 15;
      }

      // D. Personalization Boost (Tag Match)
      if (post.tags && preferredTags.length > 0) {
        const postTags = post.tags.split(',').map(t => t.trim().toLowerCase());
        const matchingTags = postTags.filter(t => preferredTags.includes(t));
        score += matchingTags.length * 5;
      }

      return {
        ...post,
        recommendationScore: score
      };
    });

    // 4. Sort Posts by Final Score & Return Top Results
    scoredPosts.sort((a, b) => b.recommendationScore - a.recommendationScore);

    return scoredPosts.slice(0, limit);
  } catch (error) {
    console.error('Error computing recommendations:', error);
    throw error;
  }
};

module.exports = {
  getRecommendedPosts,
};