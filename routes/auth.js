const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

// Register validation middleware
const registerValidation = [
  body('email')
    .isEmail()
    .withMessage('Por favor ingresa un correo válido')
    .normalizeEmail(),
  body('username')
    .notEmpty()
    .withMessage('El usuario no puede estar vacío')
    .trim()
    .isLength({ min: 3 })
    .withMessage('El usuario debe tener al menos 3 caracteres'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/)
    .withMessage('La contraseña debe contener al menos una letra y un número'),
];

// Register endpoint
router.post('/register', registerValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await db.collection('logs').add({
        type: 'REGISTER',
        timestamp: new Date(),
        level: 'ERROR',
        server: 'server2',
        details: {
          errors: errors.array(),
          email: req.body.email,
          username: req.body.username
        }
      });
      return res.status(400).json({ 
        error: errors.array().map(err => err.msg).join(', ')
      });
    }

    const { email, username, password } = req.body;

    // Check if user already exists
    const existingUser = await db.collection('users')
      .where('email', '==', email)
      .get();

    if (!existingUser.empty) {
      await db.collection('logs').add({
        type: 'REGISTER',
        timestamp: new Date(),
        level: 'WARNING',
        server: 'server2',
        details: {
          email,
          reason: 'El usuario ya existe'
        }
      });
      return res.status(409).json({ error: 'El usuario ya existe' });
    }

    // Log debug for registration attempt
    await db.collection('logs').add({
      type: 'REGISTER',
      timestamp: new Date(),
      level: 'DEBUG',
      server: 'server2',
      details: {
        message: 'intento de registro iniciado',
        email: req.body.email
      }
    });
    
    const secret = speakeasy.generateSecret();
    
    // Save user and generate QR code
    const userRef = db.collection('users').doc();
    await userRef.set({
      email, username, password, 
      mfaSecret: secret.base32,
      createdAt: new Date()
    });

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    // Log successful registration
    await db.collection('logs').add({
      type: 'REGISTER',
      timestamp: new Date(),
      level: 'INFO',
      server: 'server2',
      details: {
        userId: userRef.id,
        email,
        username
      }
    });

    res.json({ message: 'Registration successful', qrCode, userId: userRef.id });
  } catch (error) {
    await db.collection('logs').add({
      type: 'REGISTER',
      timestamp: new Date(),
      level: 'CRITICAL',
      server: 'server2',
      details: {
        error: error.message,
        stack: error.stack
      }
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password, mfaToken } = req.body;

    if (!email || !password || !mfaToken) {
      await db.collection('logs').add({
        type: 'LOGIN',
        timestamp: new Date(),
        level: 'ERROR',
        server: 'server2',
        details: {
          email,
          reason: 'Todos los campos son obligatorios'
        }
      });
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    // Log debug for login attempt
    await db.collection('logs').add({
      type: 'LOGIN',
      timestamp: new Date(),
      level: 'DEBUG',
      server: 'server2',
      details: { email }
    });

    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', email).get();
    
    if (snapshot.empty) {
      await db.collection('logs').add({
        type: 'LOGIN',
        timestamp: new Date(),
        level: 'WARNING',
        server: 'server2',
        details: {
          email,
          reason: 'Usuario no encontrado'
        }
      });
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    const user = snapshot.docs[0].data();
    const userId = snapshot.docs[0].id;

    if (password !== user.password) {
      await db.collection('logs').add({
        type: 'LOGIN',
        timestamp: new Date(),
        level: 'WARNING',
        server: 'server2',
        details: {
          email,
          reason: 'Contraseña incorrecta'
        }
      });
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    // Verify MFA token
    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: mfaToken
    });

    if (!verified) {
      await db.collection('logs').add({
        type: 'LOGIN',
        timestamp: new Date(),
        level: 'ERROR',
        server: 'server2',
        details: {
          email,
          reason: 'Token MFA invalido'
        }
      });
      return res.status(401).json({ error: 'Token MFA invalido' });
    }

    const token = jwt.sign(
      { userId, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Log successful login
    await db.collection('logs').add({
      type: 'LOGIN',
      timestamp: new Date(),
      level: 'INFO',
      server: 'server2',
      details: {
        userId,
        email
      }
    });

    res.json({ token });
  } catch (error) {
    await db.collection('logs').add({
      type: 'LOGIN',
      timestamp: new Date(),
      level: 'CRITICAL',
      server: 'server2',
      details: {
        error: error.message,
        stack: error.stack
      }
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// Add this new endpoint after your existing login route
router.post('/request-qr', async (req, res) => {
  try {
    const { email, password } = req.body;

    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', email).get();
    
    if (snapshot.empty || snapshot.docs[0].data().password !== password) {
      await db.collection('logs').add({
        type: 'QR_REQUEST',
        timestamp: new Date(),
        level: 'WARNING',
        server: 'server2',
        details: {
          email,
          reason: 'Credenciales invalidas'
        }
      });
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    const user = snapshot.docs[0].data();
    const secret = speakeasy.generateSecret();
    
    // Update user's MFA secret
    await snapshot.docs[0].ref.update({
      mfaSecret: secret.base32
    });

    // Generate QR code in the same format as registration
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    await db.collection('logs').add({
      type: 'QR_REQUEST',
      timestamp: new Date(),
      level: 'INFO',
      server: 'server2',
      details: {
        email,
        message: 'Código QR regenerado'
      }
    });

    res.json({ qrCode });
  } catch (error) {
    await db.collection('logs').add({
      type: 'QR_REQUEST',
      timestamp: new Date(),
      level: 'ERROR',
      server: 'server2',
      details: {
        error: error.message,
        stack: error.stack
      }
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// Add this new endpoint for email validation
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    const snapshot = await db.collection('users')
      .where('email', '==', email)
      .get();

    const exists = !snapshot.empty;

    await db.collection('logs').add({
      type: 'EMAIL_CHECK',
      timestamp: new Date(),
      level: exists ? 'INFO' : 'WARNING',
      server: 'server2',
      details: {
        email,
        exists,
        message: exists ? 'Correo encontrado' : 'Correo no encontrado'
      }
    });

    res.json({ exists });
  } catch (error) {
    await db.collection('logs').add({
      type: 'EMAIL_CHECK',
      timestamp: new Date(),
      level: 'ERROR',
      server: 'server2',
      details: {
        error: error.message,
        stack: error.stack
      }
    });
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;