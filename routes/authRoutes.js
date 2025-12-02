
// In /Users/webasebrandings/Downloads/cmp_back-main/routes/authRoutes.js

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Registration = require('../models/user/Registration');
const Counter = require('../models/user/customerId');
const Driver = require('../models/driver/driver');
const { createDriver } = require('../controllers/driver/driverController');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '30d',
  });
};



// In authRoutes.js - Make sure this endpoint exists
router.post('/get-driver-info', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }

    const driver = await Driver.findOne({ phone: phoneNumber });
    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: 'Driver not found' 
      });
    }

    // Generate a simple token for the driver
    const token = jwt.sign(
      { id: driver._id, role: 'driver' }, 
      process.env.JWT_SECRET || 'secret', 
      { expiresIn: '30d' }
    );

    res.json({ 
      success: true,
      message: 'Driver information retrieved successfully',
      token,
      driver: {
        driverId: driver.driverId,
        name: driver.name,
        phone: driver.phone,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        status: driver.status,
        wallet: driver.wallet || 0,
        email: driver.email || '',
        licenseNumber: driver.licenseNumber || ''
      }
    });

  } catch (error) {
    console.error('❌ Error getting driver info:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get driver info', 
      error: error.message 
    });
  }
});






// Test route
router.get('/test', (req, res) => {
  console.log('✅ /api/auth/test route hit!');
  res.json({ 
    message: 'Auth routes are working!',
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'POST /api/auth/verify-phone',
      'POST /api/auth/register',
      'POST /api/auth/request-driver-otp',
      'POST /api/auth/verify-driver-otp',
      'POST /api/auth/drivers/create'
    ]
  });
});

// Phone verification route for users
router.post('/verify-phone', async (req, res) => {
  try {
    console.log('✅ /api/auth/verify-phone route hit!');
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    console.log('📞 Phone verification request for:', phoneNumber);
    
    // Check if user exists
    const user = await Registration.findOne({ phoneNumber });
    
    if (user) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', {
        expiresIn: '30d',
      });
      
      return res.json({ 
        success: true, 
        token,
        user: { 
          name: user.name, 
          phoneNumber: user.phoneNumber, 
          customerId: user.customerId, 
          profilePicture: user.profilePicture 
        }
      });
    }
    
    return res.json({ success: true, newUser: true });
    
  } catch (err) {
    console.error('❌ Error in verify-phone:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper function for customer ID generation
const getNextCustomerId = async () => {
  const counter = await Counter.findOneAndUpdate(
    { _id: 'customerId' },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );
  return (100000 + counter.sequence).toString();
};

// User registration endpoint
router.post('/register', async (req, res) => {
  try {
    const { name, phoneNumber, address } = req.body;

    if (!name || !phoneNumber || !address) {
      return res.status(400).json({ error: 'Name, phone number, and address are required' });
    }

    const existingUser = await Registration.findOne({ phoneNumber });
    if (existingUser) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    const customerId = await getNextCustomerId();

    const newUser = new Registration({
      name,
      phoneNumber,
      address,
      customerId
    });

    await newUser.save();

    const token = generateToken(newUser._id);

    res.status(201).json({
      success: true,
      token,
      user: { 
        name: newUser.name, 
        phoneNumber: newUser.phoneNumber, 
        address: newUser.address, 
        customerId: newUser.customerId 
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DRIVER AUTHENTICATION ROUTES


// In authRoutes.js - Update request-driver-otp
router.post('/request-driver-otp', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    console.log(`📞 Checking driver existence: ${phoneNumber}`);
    
    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }

    // Check if phone number is valid (10-digit Indian number)
    if (!/^[6-9]\d{9}$/.test(phoneNumber)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please enter a valid 10-digit Indian mobile number.' 
      });
    }

    const driver = await Driver.findOne({ phone: phoneNumber });
    if (!driver) {
      console.log(`❌ Driver not found: ${phoneNumber}`);
      return res.status(404).json({ 
        success: false, 
        message: 'This mobile number is not registered in our system. Please contact our admin at eazygo2026@gmail.com' 
      });
    }

    console.log(`✅ Driver found: ${driver.driverId}`);
    
    // IMPORTANT: We DON'T generate OTP here anymore
    // Firebase will handle OTP generation and sending
    
    res.json({ 
      success: true,
      message: 'Driver verified successfully. Please check your phone for OTP.',
      driverId: driver.driverId,
      // No OTP sent from backend anymore
    });

  } catch (error) {
    console.error('❌ Error checking driver:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to check driver', 
      error: error.message 
    });
  }
});




// In authRoutes.js - Optional: Update verify-driver-otp for backward compatibility
router.post('/verify-driver-otp', async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    
    console.log(`⚠️ Backend OTP verification called for ${phoneNumber}`);
    
    // Since we're using Firebase OTP now, this endpoint is deprecated
    res.json({ 
      success: false,
      message: 'This endpoint is deprecated. Please use Firebase OTP verification.',
      shouldUseFirebase: true
    });

  } catch (error) {
    console.error('❌ Error in deprecated OTP verification:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Deprecated endpoint error', 
      error: error.message 
    });
  }
});



// Admin create driver
router.post('/drivers/create', async (req, res) => {
  console.log('🚗 Creating driver with data:', req.body);
  try {
    await createDriver(req, res);
  } catch (err) {
    console.error('❌ Error in admin create driver:', err);
    res.status(500).json({ success: false, message: 'Failed to create driver', error: err.message });
  }
});

module.exports = router;







// // In /Users/webasebrandings/Downloads/cmp_back-main/routes/authRoutes.js

// const express = require('express');
// const router = express.Router();
// const jwt = require('jsonwebtoken');
// const Registration = require('../models/user/Registration');
// const Counter = require('../models/user/customerId');

// const generateToken = (userId) => {
//   return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'secret', {
//     expiresIn: '30d',
//   });
// };




// router.get('/test', (req, res) => {
//   console.log('✅ /api/auth/test route hit!');
//   res.json({ 
//     message: 'Auth routes are working!',
//     timestamp: new Date().toISOString()
//   });
// });

// // Phone verification route
// router.post('/verify-phone', async (req, res) => {
//   try {
//     console.log('✅ /api/auth/verify-phone route hit!');
//     const { phoneNumber } = req.body;
    
//     if (!phoneNumber) {
//       return res.status(400).json({ error: 'Phone number is required' });
//     }

//     console.log('📞 Phone verification request for:', phoneNumber);
    
//     // Your existing verification logic here...
//     const Registration = require('../models/user/Registration');
//     const user = await Registration.findOne({ phoneNumber });
    
//     if (user) {
//       const jwt = require('jsonwebtoken');
//       const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', {
//         expiresIn: '30d',
//       });
      
//       return res.json({ 
//         success: true, 
//         token,
//         user: { 
//           name: user.name, 
//           phoneNumber: user.phoneNumber, 
//           customerId: user.customerId, 
//           profilePicture: user.profilePicture 
//         }
//       });
//     }
    
//     return res.json({ success: true, newUser: true });
    
//   } catch (err) {
//     console.error('❌ Error in verify-phone:', err);
//     res.status(500).json({ error: err.message });
//   }
// });



// const getNextCustomerId = async () => {
//   const counter = await Counter.findOneAndUpdate(
//     { _id: 'customerId' },
//     { $inc: { sequence: 1 } },
//     { new: true, upsert: true }
//   );
//   return (100000 + counter.sequence).toString();
// };

// // ✅ ADD THIS TEST ENDPOINT
// router.get('/test', (req, res) => {
//   res.json({ 
//     message: 'Auth routes are working!',
//     availableEndpoints: [
//       'POST /api/auth/verify-phone',
//       'POST /api/auth/register'
//     ]
//   });
// });

// // Phone number verification endpoint
// router.post('/verify-phone', async (req, res) => {
//   try {
//     const { phoneNumber } = req.body;
//     if (!phoneNumber) {
//       return res.status(400).json({ error: 'Phone number is required' });
//     }

//     const user = await Registration.findOne({ phoneNumber });
//     if (user) {
//       const token = generateToken(user._id);
//       return res.json({ 
//         success: true, 
//         token,
//         user: { 
//           name: user.name, 
//           phoneNumber: user.phoneNumber, 
//           customerId: user.customerId, 
//           profilePicture: user.profilePicture 
//         }
//       });
//     }
//     return res.json({ success: true, newUser: true });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // ✅ ADD THE MISSING REGISTER ENDPOINT
// router.post('/register', async (req, res) => {
//   try {
//     const { name, phoneNumber, address } = req.body;

//     if (!name || !phoneNumber || !address) {
//       return res.status(400).json({ error: 'Name, phone number, and address are required' });
//     }

//     const existingUser = await Registration.findOne({ phoneNumber });
//     if (existingUser) {
//       return res.status(400).json({ error: 'Phone number already registered' });
//     }

//     const customerId = await getNextCustomerId();

//     const newUser = new Registration({
//       name,
//       phoneNumber,
//       address,
//       customerId
//     });

//     await newUser.save();

//     const token = generateToken(newUser._id);

//     res.status(201).json({
//       success: true,
//       token,
//       user: { 
//         name: newUser.name, 
//         phoneNumber: newUser.phoneNumber, 
//         address: newUser.address, 
//         customerId: newUser.customerId 
//       }
//     });
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// module.exports = router;
