const express = require('express');
const router = express.Router();
const { getFirestore } = require('firebase-admin/firestore');

router.get('/', async (req, res) => {
  try {
    const db = getFirestore();
    const logsSnapshot = await db.collection('logs').get();
    const logs = [];
    
    logsSnapshot.forEach(doc => {
      logs.push({ id: doc.id, ...doc.data() });
    });

    res.json(logs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

module.exports = router;