const express = require('express');
const router = express.Router();
// Import your Supabase client instance
const { supabase } = require('../utils/supabase'); // adjust path if needed

// 📩 GET /notifications?user_id=123
router.get('/notifications', async (req, res) => {
  try {
    const userId = req.query.user_id;

    if (!userId || userId === 'undefined') {
      return res.status(400).json({ error: 'Valid user_id parameter is required.' });
    }

    // Fetch user notifications ordered by newest first
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ error: 'Failed to fetch notifications.' });
    }

    res.status(200).json(data || []);
  } catch (err) {
    console.error('Notification server error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 👁️ PATCH /notifications/:id/read (Mark single notification as read)
router.patch('/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select();

    if (error) throw error;

    res.status(200).json({ message: 'Notification marked as read', data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notification status.' });
  }
});

module.exports = router;