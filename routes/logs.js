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

// Updated endpoint to get response time data
router.get('/response-time', async (req, res) => {
  try {
    const db = getFirestore();
    console.log('Fetching response time data from Firestore');
    
    const logsSnapshot = await db.collection('logs')
      .orderBy('timestamp', 'desc')
      .limit(50) // Increased limit to get more data points
      .get();
    
    const responseTimes = [];
    
    logsSnapshot.forEach(doc => {
      const data = doc.data();
      
      // More robust check for responseTime
      if (data.responseTime !== undefined) {
        // Parse responseTime properly
        let responseTimeValue;
        
        if (typeof data.responseTime === 'number') {
          responseTimeValue = data.responseTime;
        } else if (typeof data.responseTime === 'string') {
          // Handle cases like "123ms" by removing non-numeric characters
          responseTimeValue = parseInt(data.responseTime.replace(/[^0-9]/g, ''));
        } else {
          responseTimeValue = 0;
        }
        
        // Format timestamp consistently
        let timestamp;
        if (data.timestamp && typeof data.timestamp === 'object' && data.timestamp.toDate) {
          // Handle Firestore Timestamp objects
          timestamp = data.timestamp.toDate().toISOString();
        } else if (data.timestamp && typeof data.timestamp === 'object' && data.timestamp.seconds) {
          // Handle Firestore Timestamp-like objects
          timestamp = new Date(data.timestamp.seconds * 1000).toISOString();
        } else if (typeof data.timestamp === 'string') {
          // Already a string, ensure it's a valid date
          try {
            timestamp = new Date(data.timestamp).toISOString();
          } catch (e) {
            timestamp = new Date().toISOString();
          }
        } else {
          // Fallback
          timestamp = new Date().toISOString();
        }
        
        // Always explicitly set server to server2 for this server's logs
        responseTimes.push({
          timestamp: timestamp,
          responseTime: responseTimeValue,
          server: 'server2', // Explicitly set server to server2
          endpoint: data.path || data.url || 'unknown'
        });
      }
    });

    console.log(`Returning ${responseTimes.length} response time records`);
    console.log('Sample response time data:', responseTimes.slice(0, 2));
    
    res.json(responseTimes);
  } catch (error) {
    console.error('Error fetching response times:', error);
    res.status(500).json({ error: 'Failed to fetch response times', details: error.message });
  }
});

// New endpoint to get request counts by endpoint
router.get('/request-count', async (req, res) => {
  try {
    const db = getFirestore();
    const logsSnapshot = await db.collection('logs').get();
    
    const endpointCounts = {};
    
    logsSnapshot.forEach(doc => {
      const data = doc.data();
      const endpoint = data.path || data.url || 'unknown';
      const server = data.server || 'server2';
      
      if (!endpointCounts[endpoint]) {
        endpointCounts[endpoint] = { server1: 0, server2: 0 };
      }
      
      endpointCounts[endpoint][server]++;
    });
    
    const result = Object.keys(endpointCounts).map(endpoint => ({
      endpoint,
      server1Count: endpointCounts[endpoint].server1,
      server2Count: endpointCounts[endpoint].server2
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching request counts:', error);
    res.status(500).json({ error: 'Failed to fetch request counts' });
  }
});

module.exports = router;