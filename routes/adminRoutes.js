const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const Driver = require('../models/driver/driver');
const AdminUser = require('../models/adminUser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { createDriver } = require('../controllers/driver/driverController');

// MULTER CONFIGURATION
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/documents/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// ✅ ADMIN LOGIN ROUTE - ADD THIS AT THE TOP
router.post('/login', adminController.adminLogin);

// Create driver route
router.post('/drivers/create', async (req, res) => {
  try {
    console.log('📝 Creating driver via admin route');
    await createDriver(req, res);
  } catch (error) {
    console.error('❌ Error in admin driver creation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create driver',
      error: error.message 
    });
  }
});

// Get all drivers
router.get('/drivers', async (req, res) => {
  try {
    const drivers = await Driver.find().sort({ createdAt: -1 });
    res.json({ success: true, data: drivers });
  } catch (error) {
    console.error('❌ Error fetching drivers:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch drivers',
      error: error.message 
    });
  }
});

router.put('/driver/:id/wallet', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    
    if (!amount || isNaN(amount)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid amount is required' 
      });
    }
    
    const driver = await Driver.findById(id);
    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: 'Driver not found' 
      });
    }
    
    // Update wallet
    driver.wallet += parseFloat(amount);
    await driver.save();
    
    res.json({ 
      success: true, 
      message: 'Wallet updated successfully', 
      data: {
        driverId: driver.driverId,
        wallet: driver.wallet
      }
    });
    
    console.log(`✅ Wallet updated for driver ${driver.driverId}: ${driver.wallet}`);
  } catch (error) {
    console.error('❌ Error updating wallet:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Add this route for getting driver details
router.get('/driver/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const driver = await Driver.findById(id);
    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: 'Driver not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: driver 
    });
  } catch (error) {
    console.error('❌ Error fetching driver details:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;






// // /Users/webasebrandings/Downloads/wsback-main/routes/adminRoutes.js

// const express = require('express');
// const router = express.Router();
// const adminController = require('../controllers/adminController');
// const Driver = require('../models/driver/driver');
// const AdminUser = require('../models/adminUser');
// const jwt = require('jsonwebtoken');
// const multer = require('multer');
// const path = require('path');
// const { createDriver } = require('../controllers/driver/driverController');

// // MULTER CONFIGURATION
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, 'uploads/documents/');
//   },
//   filename: function (req, file, cb) {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
//   }
// });


// router.post('/login', adminLogin);


// const upload = multer({ 
//   storage: storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024 // 5MB limit
//   }
// });

// // Create driver route - FIXED
// router.post('/drivers/create', async (req, res) => {
//   try {
//     console.log('📝 Creating driver via admin route');
//     await createDriver(req, res);
//   } catch (error) {
//     console.error('❌ Error in admin driver creation:', error);
//     res.status(500).json({ 
//       success: false, 
//       message: 'Failed to create driver',
//       error: error.message 
//     });
//   }
// });

// // Get all drivers
// router.get('/drivers', async (req, res) => {
//   try {
//     const drivers = await Driver.find().sort({ createdAt: -1 });
//     res.json({ success: true, data: drivers });
//   } catch (error) {
//     console.error('❌ Error fetching drivers:', error);
//     res.status(500).json({ 
//       success: false, 
//       message: 'Failed to fetch drivers',
//       error: error.message 
//     });
//   }
// });

// router.put('/driver/:id/wallet', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { amount } = req.body;
    
//     if (!amount || isNaN(amount)) {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'Valid amount is required' 
//       });
//     }
    
//     const driver = await Driver.findById(id);
//     if (!driver) {
//       return res.status(404).json({ 
//         success: false, 
//         message: 'Driver not found' 
//       });
//     }
    
//     // Update wallet
//     driver.wallet += parseFloat(amount);
//     await driver.save();
    
//     res.json({ 
//       success: true, 
//       message: 'Wallet updated successfully', 
//       data: {
//         driverId: driver.driverId,
//         wallet: driver.wallet
//       }
//     });
    
//     console.log(`✅ Wallet updated for driver ${driver.driverId}: ${driver.wallet}`);
//   } catch (error) {
//     console.error('❌ Error updating wallet:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: error.message 
//     });
//   }
// });

// // Add this route for getting driver details
// router.get('/driver/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
    
//     const driver = await Driver.findById(id);
//     if (!driver) {
//       return res.status(404).json({ 
//         success: false, 
//         message: 'Driver not found' 
//       });
//     }
    
//     res.json({ 
//       success: true, 
//       data: driver 
//     });
//   } catch (error) {
//     console.error('❌ Error fetching driver details:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: error.message 
//     });
//   }
// });

// module.exports = router;