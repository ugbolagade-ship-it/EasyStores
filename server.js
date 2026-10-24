require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Firebase Admin SDK using Base64 encoded Render Secret
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const decodedServiceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
    );

    admin.initializeApp({
      credential: admin.credential.cert(decodedServiceAccount)
    });
    console.log('Firebase Admin SDK initialized successfully via Render Secret');
  } else {
    console.warn('Warning: FIREBASE_SERVICE_ACCOUNT environment variable is missing.');
  }
} catch (error) {
  console.error('Failed to initialize Firebase Admin SDK:', error.message);
}

// Allowed CORS Origins (Configured in Render Environment Variables)
const allowedOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  process.env.FRONTEND_URL // e.g., https://yourusername.github.io
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORS Policy restriction: Origin not allowed.'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Auth Token Verification Middleware
async function verifyAuthToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Unauthorized: Invalid token' });
  }
}

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'EasyStores Backend Running' });
});

// Protected Profile Endpoint
app.get('/api/user/profile', verifyAuthToken, async (req, res) => {
  try {
    const userRecord = await admin.auth().getUser(req.user.uid);
    res.status(200).json({
      success: true,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Protected Orders Endpoint (Firestore)
app.get('/api/orders', verifyAuthToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('orders').where('userId', '==', req.user.uid).get();
    
    const orders = [];
    snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));

    res.status(200).json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
