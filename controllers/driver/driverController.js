const Driver = require("../../models/driver/driver");
const Ride = require("../../models/ride");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const {
  sendNotificationToDriver,
  sendNotificationToMultipleDrivers,
} = require("../../services/firebaseService");

const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";




const createDriver = async (req, res) => {
  console.log('🚗 Creating driver with data:', req.body);
  console.log('🚗 Files:', req.files);
  
  try {
    // Check if we have the required fields
    const { name, phone, vehicleType, vehicleNumber, licenseNumber, aadharNumber } = req.body;
    
    if (!name || !phone || !vehicleType || !vehicleNumber || !licenseNumber || !aadharNumber) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, phone, vehicleType, vehicleNumber, licenseNumber, aadharNumber'
      });
    }
    
    // Check if driver already exists
    const existingDriver = await Driver.findOne({
      $or: [
        { phone },
        { licenseNumber },
        { aadharNumber }
      ]
    });

    if (existingDriver) {
      console.log('❌ Driver already exists with phone:', phone);
      return res.status(400).json({
        success: false,
        message: 'Driver with this phone, license number, or Aadhar number already exists'
      });
    }

    // Generate driver ID
    const driverId = await Driver.generateDriverId();
    console.log('✅ Generated driverId:', driverId);

    // Create driver without passwordHash
    const driver = new Driver({
      driverId,
      name,
      phone,
      vehicleType,
      vehicleNumber,
      licenseNumber,
      aadharNumber,
      email: req.body.email || '',
      dob: req.body.dob || null,
      panNumber: req.body.panNumber || '',
      bankAccountNumber: req.body.bankAccountNumber || '',
      ifscCode: req.body.ifscCode || '',
      location: {
        type: "Point",
        coordinates: [0, 0]  // Default coordinates
      },
      status: "Offline",
      active: true,
      wallet: parseFloat(req.body.minWalletAmount) || 1000,
      workingHours: req.body.workingHours || '12'
    });

    await driver.save();
    console.log('✅ Driver saved to MongoDB:', driverId);

    // Process uploaded files if any
    if (req.files) {
      const fileTypes = ['licenseFiles', 'aadhaarFiles', 'panFiles', 'rcFiles'];
      const documentPaths = {};
      
      for (const fileType of fileTypes) {
        if (req.files[fileType] && req.files[fileType].length > 0) {
          documentPaths[fileType] = req.files[fileType].map(file => `/uploads/drivers/${file.filename}`);
        }
      }
      
      // Update driver with document paths
      if (Object.keys(documentPaths).length > 0) {
        await Driver.findOneAndUpdate(
          { driverId },
          { $set: documentPaths },
          { new: true }
        );
      }
    }

    res.status(201).json({
      success: true,
      message: 'Driver created successfully',
      data: {
        driverId: driver.driverId,
        name: driver.name,
        phone: driver.phone,
        wallet: driver.wallet,
        status: driver.status
      }
    });
  } catch (err) {
    console.error('❌ Error creating driver:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};




/* -------------------------------------------------------------
   UPLOAD DOCUMENTS
------------------------------------------------------------- */
const uploadDriverDocuments = async (req, res) => {
  try {
    const { driverId } = req.params;
    const files = req.files;

    const driver = await Driver.findOne({ driverId });
    if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });

    const updates = {};

    if (files.licenseDocument) {
      const file = files.licenseDocument[0];
      const savePath = `/uploads/drivers/${driverId}/license_${Date.now()}${path.extname(file.originalname)}`;

      const fullDir = path.dirname(path.join(__dirname, "../../", savePath));
      if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });

      fs.renameSync(file.path, path.join(__dirname, "../../", savePath));
      updates.licenseDocument = savePath;
    }

    if (files.aadharDocument) {
      const file = files.aadharDocument[0];
      const savePath = `/uploads/drivers/${driverId}/aadhar_${Date.now()}${path.extname(file.originalname)}`;

      const fullDir = path.dirname(path.join(__dirname, "../../", savePath));
      if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });

      fs.renameSync(file.path, path.join(__dirname, "../../", savePath));
      updates.aadharDocument = savePath;
    }

    await Driver.findOneAndUpdate({ driverId }, updates, { new: true });

    res.json({ success: true, message: "Documents uploaded", data: updates });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to upload documents", error: err.message });
  }
};


const loginDriver = async (req, res) => {
  try {
    const { driverId, password, latitude, longitude, fcmToken } = req.body;

    console.log(`🔑 Login attempt for driver: ${driverId}`);

    const driver = await Driver.findOne({ driverId });
    if (!driver) {
      console.log(`❌ Driver not found: ${driverId}`);
      return res.status(404).json({ 
        success: false, 
        msg: "Driver not found" 
      });
    }

    const match = await bcrypt.compare(password, driver.passwordHash);
    if (!match) {
      console.log(`❌ Invalid password for driver: ${driverId}`);
      return res.status(401).json({ 
        success: false, 
        msg: "Invalid password" 
      });
    }

    if (latitude && longitude) {
      driver.location = { 
        type: "Point", 
        coordinates: [longitude, latitude] 
      };
      driver.status = "Live";
      driver.lastUpdate = new Date();
    }

    if (fcmToken) {
      driver.fcmToken = fcmToken;
      console.log(`✅ Updated FCM token for driver: ${driverId}`);
    }

    await driver.save();

    const token = jwt.sign({ 
      sub: driver._id, 
      driverId: driver.driverId 
    }, JWT_SECRET, {
      expiresIn: "1h" 
    });

    res.json({
      success: true, 
      token,
      mustChangePassword: driver.mustChangePassword,
      driver: {
        driverId: driver.driverId,
        name: driver.name,
        status: driver.status,
        vehicleType: driver.vehicleType,
        location: driver.location,
        wallet: driver.wallet || 0
      }
    });
  } catch (err) {
    console.error("❌ Error in loginDriver:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};

// Update the updateFCMToken function
const updateFCMToken = async (req, res) => {
  try {
    const { driverId } = req.user;
    const { fcmToken, platform } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'FCM token is required' 
      });
    }

    const driver = await Driver.findOne({ driverId });
    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: 'Driver not found' 
      });
    }

    driver.fcmToken = fcmToken;
    driver.fcmTokenUpdatedAt = new Date();
    driver.platform = platform || "android";
    driver.lastUpdate = new Date();

    await driver.save();

    console.log(`✅ FCM token updated for driver: ${driverId}`);

    res.json({ 
      success: true, 
      message: 'FCM token updated successfully',
      driverId: driver.driverId 
    });
  } catch (err) {
    console.error("❌ Error updating FCM token:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};

/* -------------------------------------------------------------
   SEND NOTIFICATION
------------------------------------------------------------- */
const sendTestNotification = async (req, res) => {
  try {
    const { driverId } = req.user;

    const driver = await Driver.findOne({ driverId });
    if (!driver || !driver.fcmToken) {
      return res.status(404).json({ success: false, message: "Driver not found or no FCM token" });
    }

    const data = {
      type: "test_notification",
      message: "Test notification",
      timestamp: new Date().toISOString(),
      driverId,
    };

    const result = await sendNotificationToMultipleDrivers(
      [driver.fcmToken],
      "Test Notification",
      "This is a test message",
      data
    );

    res.json({
      success: true,
      message: "Notification sent",
      result,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to send notification" });
  }
};

/* -------------------------------------------------------------
   CHANGE PASSWORD
------------------------------------------------------------- */
const changePassword = async (req, res) => {
  try {
    const { driverId, oldPassword, newPassword } = req.body;

    const driver = await Driver.findOne({ driverId });
    if (!driver) return res.status(404).json({ msg: "Driver not found" });

    const match = await bcrypt.compare(oldPassword, driver.passwordHash);
    if (!match) return res.status(400).json({ msg: "Old password incorrect" });

    driver.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    driver.mustChangePassword = false;
    await driver.save();

    res.json({ msg: "Password changed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* -------------------------------------------------------------
   GET ALL DRIVERS (FIXED)
------------------------------------------------------------- */
const getDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find().sort({ createdAt: -1 });
    res.json({ success: true, data: drivers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/* -------------------------------------------------------------
   UPDATE DRIVER GENERAL (PUT)
------------------------------------------------------------- */
const updateDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const update = { ...req.body };

    if (update.password || update.passwordHash) {
      delete update.password;
      delete update.passwordHash;
    }

    if (update.latitude && update.longitude) {
      update.location = {
        type: "Point",
        coordinates: [update.longitude, update.latitude],
      };
      delete update.latitude;
      delete update.longitude;
    }

    const driver = await Driver.findOneAndUpdate({ driverId }, update, { new: true });

    if (!driver) return res.status(404).json({ msg: "Driver not found" });

    res.json({ success: true, data: driver });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


const updateDriverWallet = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { amount } = req.body;

    console.log(`💰 Controller: Updating wallet for driver: ${driverId} with amount: ${amount}`);

    if (amount === undefined || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
      });
    }

    const driver = await Driver.findOne({ driverId });
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    // Get current wallet amount and add the new amount
    const currentWallet = driver.wallet || 0;
    const amountToAdd = parseFloat(amount);
    const newWalletAmount = currentWallet + amountToAdd;
    
    driver.wallet = newWalletAmount;
    await driver.save();

    console.log(`✅ Controller: Wallet updated successfully for driver: ${driverId}, old amount: ${currentWallet}, added: ${amountToAdd}, new amount: ${newWalletAmount}`);

    res.json({
      success: true,
      message: "Wallet updated successfully",
      data: {
        driverId: driver.driverId,
        wallet: driver.wallet,
        previousAmount: currentWallet,
        addedAmount: amountToAdd
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update wallet",
      error: error.message,
    });
  }
};

/* -------------------------------------------------------------
   DELETE DRIVER
------------------------------------------------------------- */
const deleteDriver = async (req, res) => {
  try {
    const { driverId } = req.params;

    const deleted = await Driver.findOneAndDelete({ driverId });
    if (!deleted) return res.status(404).json({ msg: "Driver not found" });

    res.json({ msg: "Driver deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* -------------------------------------------------------------
   NEAREST DRIVERS
------------------------------------------------------------- */
const getNearestDrivers = async (req, res) => {
  try {
    const { latitude, longitude, maxDistance = 5000 } = req.query;

    const drivers = await Driver.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(longitude), parseFloat(latitude)] },
          $maxDistance: parseInt(maxDistance),
        },
      },
    });

    res.json(drivers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* -------------------------------------------------------------
   UPDATE LOCATION
------------------------------------------------------------- */
const updateLocation = async (req, res) => {
  try {
    const { driverId } = req.user;
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ msg: "Latitude & longitude required" });
    }

    const driver = await Driver.findOneAndUpdate(
      { driverId },
      {
        location: { type: "Point", coordinates: [longitude, latitude] },
        status: "Live",
        lastUpdate: new Date(),
      },
      { new: true }
    );

    if (!driver) return res.status(404).json({ msg: "Driver not found" });

    res.json({ msg: "Location updated", location: driver.location, status: driver.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* -------------------------------------------------------------
   LOGOUT DRIVER
------------------------------------------------------------- */
const logoutDriver = async (req, res) => {
  try {
    const { driverId } = req.user;

    const driver = await Driver.findOneAndUpdate(
      { driverId },
      { status: "Offline", logoutTime: new Date() },
      { new: true }
    );

    res.json({ msg: "Driver logged out", driver });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* -------------------------------------------------------------
   GET RIDE DETAILS
------------------------------------------------------------- */
const getRideById = async (req, res) => {
  try {
    const { rideId } = req.params;

    const ride = await Ride.findOne({ RAID_ID: rideId })
      .populate("user", "name customerId phone")
      .populate("driver", "driverId name phone vehicleType");

    if (!ride) return res.status(404).json({ msg: "Ride not found" });

    res.json(ride);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* -------------------------------------------------------------
   UPDATE RIDE STATUS
------------------------------------------------------------- */
const updateRideStatus = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { status } = req.body;
    const { driverId } = req.user;

    if (!["Accepted", "Completed", "Cancelled"].includes(status)) {
      return res.status(400).json({ msg: "Invalid status" });
    }

    const ride = await Ride.findOne({ RAID_ID: rideId }).populate("user");
    if (!ride) return res.status(404).json({ msg: "Ride not found" });

    if (status === "Accepted") {
      if (ride.status !== "pending") {
        return res.status(400).json({ msg: "Ride already taken or completed" });
      }
      ride.driver = driverId;
    }

    if (status === "Cancelled") {
      ride.driver = null;
    }

    ride.status = status.toLowerCase();
    await ride.save();

    const io = req.app.get("io");
    if (io && ride.user) {
      io.to(ride.user._id.toString()).emit("rideStatusUpdate", {
        rideId: ride.RAID_ID,
        status: ride.status,
        driverId,
      });
    }

    res.json({ msg: "Ride updated", ride });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// In driverController.js, make sure this is at the bottom of the file:
module.exports = {
  createDriver,
  uploadDriverDocuments,
  loginDriver,
  updateFCMToken,
  sendTestNotification,
  changePassword,
  getDrivers,
  updateDriver,
  updateDriverWallet,
  deleteDriver,
  getNearestDrivers,
  updateLocation,
  logoutDriver,
  getRideById,
  updateRideStatus,
};
