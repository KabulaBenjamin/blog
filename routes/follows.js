// routes/follows.js
const express = require('express');
const router = express.Router();
// Import your existing supabase client (adjust the path to match where your supabase file is)
const supabase = require('../config/supabaseClient'); 

// 1. Toggle Follow Status
// Endpoint: POST /api/authors/:authorId/follow
router.post('/:authorId/follow', async (req, res) => {
  const { authorId } = req.params;
  const { followerId } = req.body;

  if (!followerId || !authorId) {
    return res.status(400).json({ error: 'Missing followerId or authorId' });
  }

  try {
    // Check if relationship already exists
    const { data: existing } = await supabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('author_id', authorId)
      .single();

    if (existing) {
      // Unfollow action
      await supabase.from('user_follows').delete().eq('id', existing.id);
      return res.json({ following: false });
    } else {
      // Follow action
      await supabase.from('user_follows').insert([{ follower_id: followerId, author_id: authorId }]);
      return res.json({ following: true });
    }
  } catch (err) {
    console.error('Error toggling follow:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Get Follower Count and User Follow Status
// Endpoint: GET /api/authors/:authorId/followers
router.get('/:authorId/followers', async (req, res) => {
  const { authorId } = req.params;
  const { currentUserId } = req.query;

  try {
    const { count } = await supabase
      .from('user_follows')
      .select('*', { count: 'exact', head: true })
      .eq('author_id', authorId);

    let isFollowing = false;
    if (currentUserId) {
      const { data } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', currentUserId)
        .eq('author_id', authorId)
        .single();
      isFollowing = !!data;
    }

    res.json({ count: count || 0, isFollowing });
  } catch (err) {
    console.error('Error getting follower count:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;