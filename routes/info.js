const express = require('express');
const router = express.Router();
const { getFirestore } = require('firebase-admin/firestore');

router.get('/getInfo', async (req, res) => {
  try {
    const info = {
      nodeVersion: process.version,
      student: {
        fullName: "Lizet Jazmin Olvera González",
        group: "IDGS-011", 
        grado: "Octavo cuatrimestre" 
      }
    };

    const db = getFirestore();
    await db.collection('logs').add({
      type: 'GET_INFO',
      timestamp: new Date(),
      level: 'INFO',
      server: 'server2',
      details: info
    });

    res.json(info);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;