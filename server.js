require('dotenv').config();
console.log(process.env.FIREBASE_SERVICE_ACCOUNT); // Add this line to debug

const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const app = express();

// Initialize Firebase
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/info', require('./routes/info'));
app.use('/api/logs', require('./routes/logs'));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});