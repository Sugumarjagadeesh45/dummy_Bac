require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const multer = require('multer');

// ✅ INITIALIZE APP
const app = express();

// Make sure this is correctly configured
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ FIXED CORS CONFIGURATION - Add this BEFORE other middleware
console.log("🔧 Setting up CORS...");
app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:3001", "*"],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  exposedHeaders: ["Content-Length", "Content-Type", "Authorization"]
}));

// ✅ Add manual CORS headers for all requests
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.url} from ${req.headers.origin || 'unknown origin'}`);
  
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token");
  res.header("Access-Control-Allow-Credentials", "true");
  
  if (req.method === "OPTIONS") {
    console.log("🔄 Handling OPTIONS preflight request");
    return res.status(200).end();
  }
  
  next();
});

// ✅ MIDDLEWARE
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ UPLOADS DIRECTORY & STATIC SERVING
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("Created uploads directory:", uploadsDir);
}

app.use("/uploads", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  express.static(uploadsDir)(req, res, next);
});

console.log("📂 Static files served from /uploads");

// ✅ ADD THE DRIVER ROUTE AT THE TOP
app.get('/api/admin/drivers', async (req, res) => {
  try {
    const Driver = require('./models/driver/driver');
    const drivers = await Driver.find().sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: drivers,
      count: drivers.length
    });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch drivers',
      details: error.message
    });
  }
});

// ✅ ORDER ROUTES
console.log("📦 Loading order routes...");

// ✅ SIMPLE TEST ENDPOINT
app.get('/api/orders/test-connection', (req, res) => {
  console.log('🧪 Test connection endpoint hit');
  res.json({ 
    success: true, 
    message: 'Orders API is connected!',
    timestamp: new Date().toISOString(),
    backend: 'http://localhost:5001',
    proxyWorking: true
  });
});

// ✅ TEST PUBLIC ENDPOINT
app.get('/api/orders/test-public', (req, res) => {
  console.log('🌐 Public test endpoint hit');
  res.json({
    success: true,
    message: 'Public orders endpoint is working!',
    timestamp: new Date().toISOString()
  });
});

// ✅ ADMIN ORDER ROUTES
app.get('/api/orders/admin/orders', async (req, res) => {
  try {
    console.log('📦 Admin: Fetching all orders');
    
    const Order = require('./models/Order');
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalOrders = await Order.countDocuments(query);

    const cleanOrders = orders.map(order => ({
      _id: order._id,
      orderId: order.orderId,
      customerId: order.customerId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      customerAddress: order.customerAddress,
      products: order.products.map(product => ({
        name: product.name,
        price: product.price,
        quantity: product.quantity,
        total: product.price * product.quantity,
        category: product.category
      })),
      totalAmount: order.totalAmount,
      status: order.status,
      paymentMethod: order.paymentMethod,
      orderDate: order.orderDate,
      deliveryAddress: order.deliveryAddress,
      createdAt: order.createdAt
    }));

    console.log(`✅ Admin: Returning ${cleanOrders.length} orders`);

    res.json({
      success: true,
      data: cleanOrders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
        hasNextPage: page < Math.ceil(totalOrders / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('❌ Admin orders error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
});

// ✅ ADMIN ORDER STATS
app.get('/api/orders/admin/order-stats', async (req, res) => {
  try {
    console.log('📊 Admin: Fetching order stats');
    
    const Order = require('./models/Order');
    const Registration = require('./models/user/Registration');
    
    const totalOrders = await Order.countDocuments();
    const deliveredOrders = await Order.countDocuments({ status: 'delivered' });
    const pendingOrders = await Order.countDocuments({ 
      status: { $in: ['order_confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery'] } 
    });
    
    const revenueResult = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
    ]);
    
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const customerCount = await Registration.countDocuments();

    console.log(`📊 Stats: ${totalOrders} orders, ${customerCount} customers, ₹${totalRevenue} revenue`);

    res.json({
      success: true,
      data: {
        totalOrders,
        deliveredOrders,
        pendingOrders,
        totalRevenue,
        avgOrderValue,
        customerCount
      }
    });

  } catch (error) {
    console.error('❌ Order stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch order statistics',
      details: error.message 
    });
  }
});

// ✅ UPDATE ORDER STATUS
app.put('/api/orders/admin/orders/update/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    console.log(`🔄 Admin: Updating order ${orderId} to ${status}`);

    const Order = require('./models/Order');
    
    let order;
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId);
    }
    
    if (!order) {
      order = await Order.findOne({ orderId });
    }
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        error: 'Order not found' 
      });
    }

    order.status = status;
    await order.save();

    console.log(`✅ Order ${orderId} status updated to ${status}`);

    const io = req.app.get('io');
    if (io) {
      io.emit('orderStatusUpdate', {
        orderId: order.orderId,
        customerId: order.customerId,
        status,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: {
        orderId: order.orderId,
        status: order.status
      }
    });

  } catch (error) {
    console.error('❌ Order update error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update order status',
      details: error.message 
    });
  }
});

// ✅ GET ORDER BY MONGODB _id
app.get('/api/orders/admin/order/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 Admin: Fetching order by ID:', id);

    const Order = require('./models/Order');
    
    let order;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      order = await Order.findById(id);
    }
    
    if (!order) {
      order = await Order.findOne({ orderId: id });
    }

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        error: 'Order not found' 
      });
    }

    const cleanOrder = {
      _id: order._id,
      orderId: order.orderId,
      customerId: order.customerId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      customerAddress: order.customerAddress,
      products: order.products.map(product => ({
        name: product.name,
        price: product.price,
        quantity: product.quantity,
        total: product.price * product.quantity,
        category: product.category
      })),
      totalAmount: order.totalAmount,
      status: order.status,
      paymentMethod: order.paymentMethod,
      orderDate: order.orderDate,
      deliveryAddress: order.deliveryAddress,
      createdAt: order.createdAt,
      subtotal: order.subtotal || order.totalAmount,
      shipping: order.shipping || 0,
      tax: order.tax || 0
    };

    console.log(`✅ Admin: Returning order ${cleanOrder.orderId}`);

    res.json({
      success: true,
      data: cleanOrder
    });

  } catch (error) {
    console.error('❌ Admin order by ID error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch order',
      details: error.message 
    });
  }
});

// ✅ UPDATE ORDER BY MONGODB _id
app.put('/api/orders/admin/order/update-by-id/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentMethod, deliveryAddress } = req.body;

    console.log(`🔄 Admin: Updating order ID ${id}`, { status, paymentMethod });

    const Order = require('./models/Order');
    
    let order;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      order = await Order.findById(id);
    }
    
    if (!order) {
      order = await Order.findOne({ orderId: id });
    }
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        error: 'Order not found' 
      });
    }

    if (status) order.status = status;
    if (paymentMethod) order.paymentMethod = paymentMethod;
    if (deliveryAddress) order.deliveryAddress = deliveryAddress;
    
    await order.save();

    console.log(`✅ Order ${order.orderId} updated successfully`);

    const io = req.app.get('io');
    if (io) {
      io.emit('orderStatusUpdate', {
        orderId: order.orderId,
        customerId: order.customerId,
        status: order.status,
        timestamp: new Date().toISOString()
      });
    }

    const updatedOrder = {
      _id: order._id,
      orderId: order.orderId,
      customerId: order.customerId,
      customerName: order.customerName,
      status: order.status,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt,
      deliveryAddress: order.deliveryAddress
    };

    res.json({
      success: true,
      message: 'Order updated successfully',
      data: updatedOrder
    });

  } catch (error) {
    console.error('❌ Order update error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update order',
      details: error.message 
    });
  }
});

// ✅ UPDATE ORDER STATUS BY MONGODB _id
app.put('/api/orders/admin/update-status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    console.log(`🔄 Admin: Updating status for order ID ${id} to ${status}`);

    const Order = require('./models/Order');
    
    let order;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      order = await Order.findById(id);
    }
    
    if (!order) {
      order = await Order.findOne({ orderId: id });
    }
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        error: 'Order not found' 
      });
    }

    const validStatuses = [
      'pending',
      'order_confirmed', 
      'processing',
      'preparing',
      'packed',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'returned',
      'refunded'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    order.status = status;
    await order.save();

    console.log(`✅ Status updated: ${order.orderId} → ${status}`);

    const io = req.app.get('io');
    if (io) {
      io.emit('orderStatusUpdate', {
        orderId: order.orderId,
        customerId: order.customerId,
        status: order.status,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: {
        _id: order._id,
        orderId: order.orderId,
        status: order.status,
        customerId: order.customerId
      }
    });

  } catch (error) {
    console.error('❌ Status update error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update order status',
      details: error.message 
    });
  }
});

// ✅ BULK UPDATE ORDERS
app.put('/api/orders/admin/bulk-update', async (req, res) => {
  try {
    const { orderIds, status } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Order IDs array is required' 
      });
    }

    if (!status) {
      return res.status(400).json({ 
        success: false, 
        error: 'Status is required' 
      });
    }

    console.log(`🔄 Admin: Bulk updating ${orderIds.length} orders to ${status}`);

    const Order = require('./models/Order');
    const validStatuses = [
      'pending',
      'order_confirmed', 
      'processing',
      'preparing',
      'packed',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'returned',
      'refunded'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const updateResult = await Order.updateMany(
      { 
        $or: [
          { _id: { $in: orderIds } },
          { orderId: { $in: orderIds } }
        ]
      },
      { $set: { status: status } }
    );

    console.log(`✅ Bulk update completed: ${updateResult.modifiedCount} orders updated`);

    const updatedOrders = await Order.find({
      $or: [
        { _id: { $in: orderIds } },
        { orderId: { $in: orderIds } }
      ]
    });

    const io = req.app.get('io');
    if (io) {
      updatedOrders.forEach(order => {
        io.emit('orderStatusUpdate', {
          orderId: order.orderId,
          customerId: order.customerId,
          status: order.status,
          timestamp: new Date().toISOString()
        });
      });
    }

    res.json({
      success: true,
      message: `Successfully updated ${updateResult.modifiedCount} orders`,
      data: {
        modifiedCount: updateResult.modifiedCount,
        orders: updatedOrders.map(order => ({
          _id: order._id,
          orderId: order.orderId,
          status: order.status
        }))
      }
    });

  } catch (error) {
    console.error('❌ Bulk update error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to bulk update orders',
      details: error.message 
    });
  }
});

// ✅ PROXY ENDPOINT FOR REACT
app.get('/api/admin/proxy/orders', async (req, res) => {
  console.log('🔀 Proxy endpoint hit, forwarding to orders endpoint');
  
  try {
    const Order = require('./models/Order');
    const orders = await Order.find({}).sort({ createdAt: -1 }).limit(50);
    
    const cleanOrders = orders.map(order => ({
      _id: order._id,
      orderId: order.orderId,
      customerId: order.customerId,
      customerName: order.customerName,
      status: order.status,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt
    }));
    
    res.json({
      success: true,
      data: cleanOrders,
      message: 'Via proxy endpoint',
      count: orders.length
    });
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ MODELS
const Registration = require("./models/user/Registration");
const Counter = require("./models/user/customerId");
const Driver = require("./models/driver/driver");
const Ride = require("./models/ride");

// ✅ DIRECT AUTH ROUTES
app.post("/api/auth/verify-phone", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number is required" });

    const user = await Registration.findOne({ phoneNumber });
    if (user) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "secret", { expiresIn: "30d" });
      return res.json({
        success: true,
        token,
        user: {
          name: user.name,
          phoneNumber: user.phoneNumber,
          customerId: user.customerId,
          profilePicture: user.profilePicture || ""
        }
      });
    }
    res.json({ success: true, newUser: true });
  } catch (err) {
    console.error("verify-phone error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, phoneNumber, address } = req.body;
    if (!name || !phoneNumber || !address)
      return res.status(400).json({ error: "Name, phone number, and address are required" });

    const existing = await Registration.findOne({ phoneNumber });
    if (existing) return res.status(400).json({ error: "Phone number already registered" });

    const counter = await Counter.findOneAndUpdate(
      { _id: "customerId" },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true }
    );
    const customerId = (100000 + counter.sequence).toString();

    const newUser = new Registration({ name, phoneNumber, address, customerId });
    await newUser.save();

    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET || "secret", { expiresIn: "30d" });

    res.status(201).json({
      success: true,
      token,
      user: { name, phoneNumber, address, customerId }
    });
  } catch (err) {
    console.error("register error:", err);
    res.status(400).json({ error: err.message });
  }
});

// ✅ WALLET & PROFILE (Protected)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET || "secret", (err, decoded) => {
    if (err) return res.status(401).json({ error: "Invalid token" });
    req.userId = decoded.id;
    next();
  });
};

app.get("/api/wallet", authenticateToken, async (req, res) => {
  try {
    const user = await Registration.findById(req.userId);
    res.json({ success: true, wallet: user?.wallet || 0, balance: user?.wallet || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/users/profile", authenticateToken, async (req, res) => {
  try {
    const user = await Registration.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    const backendUrl = process.env.BACKEND_URL || "http://localhost:5001";
    const profilePicture = user.profilePicture
      ? user.profilePicture.startsWith("http")
        ? user.profilePicture
        : `${backendUrl}${user.profilePicture}`
      : "";

    res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name || "",
        phoneNumber: user.phoneNumber || "",
        customerId: user.customerId || "",
        email: user.email || "",
        address: user.address || "",
        profilePicture,
        gender: user.gender || "",
        dob: user.dob || "",
        altMobile: user.altMobile || "",
        wallet: user.wallet || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ FCM TOKEN UPDATE
app.post(["/drivers/update-fcm-token", "/register-fcm-token", "/api/drivers/update-fcm-token"], async (req, res) => {
  try {
    const { driverId, fcmToken, platform = "android" } = req.body;
    if (!driverId || !fcmToken) return res.status(400).json({ success: false, error: "driverId & fcmToken required" });

    const updated = await Driver.findOneAndUpdate(
      { driverId },
      { fcmToken, platform, lastUpdate: new Date(), notificationEnabled: true, status: "Live" },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, error: "Driver not found" });

    res.json({
      success: true,
      message: "FCM token updated",
      driverId,
      name: updated.name
    });
  } catch (err) {
    console.error("FCM update error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ TEST ENDPOINTS
app.get("/api/test-connection", (req, res) => res.json({ success: true, message: "API is live!", timestamp: new Date() }));

app.get("/api/auth/test", (req, res) => res.json({ success: true, message: "Direct auth routes working!" }));

app.post("/api/test/accept-ride", async (req, res) => {
  try {
    const { rideId, driverId = "dri123", driverName = "Test Driver" } = req.body;
    const ride = await Ride.findOne({ RAID_ID: rideId });
    if (!ride) return res.status(404).json({ error: "Ride not found" });

    const io = req.app.get("io");
    if (!io) return res.status(500).json({ error: "Socket.io not initialized" });

    const testData = {
      rideId,
      driverId,
      driverName,
      driverMobile: "9876543210",
      driverLat: 11.331288,
      driverLng: 77.716728,
      vehicleType: "taxi",
      timestamp: new Date().toISOString(),
      _isTest: true
    };

    io.to(ride.user.toString()).emit("rideAccepted", testData);
    res.json({ success: true, message: "Test ride acceptance sent", userId: ride.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/test-driver-status", async (req, res) => {
  const driver = await Driver.findOne({ driverId: "dri123" });
  res.json({
    driverExists: !!driver,
    hasFcmToken: !!driver?.fcmToken,
    isOnline: driver?.isOnline,
    driverInfo: driver ? { name: driver.name, status: driver.status } : null
  });
});

app.get("/api/test-uploads", (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    res.json({ success: true, uploadsDir, files: files.slice(0, 10), count: files.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ ADMIN DASHBOARD (Mock Data)
app.get("/api/admin/dashboard-data", (req, res) => {
  res.json({
    success: true,
    data: {
      stats: { totalUsers: 63154, usersChange: "+12.5%", drivers: 1842, driversChange: "+8.2%", totalRides: 24563, ridesChange: "+15.3%", productSales: 48254, salesChange: "+22.1%" },
      weeklyPerformance: [
        { name: "Mon", rides: 45, orders: 32 }, { name: "Tue", rides: 52, orders: 38 },
        { name: "Wed", rides: 48, orders: 41 }, { name: "Thu", rides: 60, orders: 45 },
        { name: "Fri", rides: 75, orders: 52 }, { name: "Sat", rides: 82, orders: 61 },
        { name: "Sun", rides: 68, orders: 48 }
      ],
      serviceDistribution: [{ name: "Rides", value: 65 }, { name: "Grocery", value: 35 }]
    }
  });
});


// ✅ MULTER CONFIGURATION FOR FILE UPLOADS
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'uploads/drivers/';
    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});




// Add this after the driver creation route
app.put('/api/admin/driver/:driverId/wallet', async (req, res) => {
  try {
    const { driverId } = req.params;
    const { amount } = req.body;

    console.log(`💰 Updating wallet for driver: ${driverId} with amount: ${amount}`);

    if (!amount || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    const Driver = require('./models/driver/driver');
    const driver = await Driver.findOne({ driverId });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Get current wallet amount and add the new amount
    const currentWallet = driver.wallet || 0;
    const amountToAdd = parseFloat(amount);
    const newWalletAmount = currentWallet + amountToAdd;
    
    driver.wallet = newWalletAmount;
    await driver.save();

    console.log(`✅ Wallet updated successfully for driver: ${driverId}, old amount: ${currentWallet}, added: ${amountToAdd}, new amount: ${newWalletAmount}`);

    res.json({
      success: true,
      message: 'Wallet updated successfully',
      data: {
        driverId: driver.driverId,
        wallet: driver.wallet,
        previousAmount: currentWallet,
        addedAmount: amountToAdd
      }
    });
  } catch (error) {
    console.error('Error updating wallet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update wallet',
      error: error.message
    });
  }
});





// ✅ DIRECT DRIVER CREATION ROUTE (FIXED)
app.post('/api/admin/drivers/create', upload.fields([
  { name: 'licenseFiles', maxCount: 2 },
  { name: 'aadhaarFiles', maxCount: 2 },
  { name: 'panFiles', maxCount: 2 },
  { name: 'rcFiles', maxCount: 7 },
  { name: 'bankFile', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('🚗 Direct driver creation route hit');
    
    // Combine body and files data
    const driverData = {
      ...req.body,
      files: req.files
    };
    
    console.log('📤 Received driver data:', {
      name: req.body.name,
      phone: req.body.phone,
      vehicleNumber: req.body.vehicleNumber,
      files: req.files ? Object.keys(req.files).map(key => ({
        field: key,
        count: req.files[key].length
      })) : []
    });
    
    const { createDriver } = require('./controllers/driver/driverController');
    
    // Modify req object to pass combined data
    const modifiedReq = {
      ...req,
      body: driverData
    };
    
    await createDriver(modifiedReq, res);
  } catch (error) {
    console.error('❌ Error in direct driver creation route:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ✅ FIXED DIRECT ADMIN REGISTRATION
app.post('/api/admin/direct-register', async (req, res) => {
  try {
    console.log('🚀 Direct register attempt');
    
    const mongoose = require('mongoose');
    const bcrypt = require('bcrypt');
    
    const { username, password, role = 'superadmin', email } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username and password required' 
      });
    }
    
    let AdminUser;
    try {
      AdminUser = mongoose.model('AdminUser');
    } catch (error) {
      const adminUserSchema = new mongoose.Schema({
        username: { type: String, required: true, unique: true },
        email: { type: String, required: false },
        passwordHash: { type: String, required: true },
        role: { type: String, enum: ['admin', 'manager', 'superadmin'], default: 'admin' }
      }, { timestamps: true });
      
      AdminUser = mongoose.model('AdminUser', adminUserSchema);
    }
    
    const existingAdmin = await AdminUser.findOne({ 
      $or: [
        { username },
        ...(email ? [{ email }] : [])
      ]
    });
    
    if (existingAdmin) {
      return res.json({ 
        success: true, 
        message: 'Admin already exists',
        username: existingAdmin.username,
        email: existingAdmin.email
      });
    }
    
    const admin = new AdminUser({
      username,
      email: email || username,
      role
    });
    
    const salt = await bcrypt.genSalt(10);
    admin.passwordHash = await bcrypt.hash(password, salt);
    
    await admin.save();
    
    console.log('✅ Direct admin registration successful');
    
    res.json({
      success: true,
      message: 'Admin registered successfully (direct)',
      username,
      email: admin.email,
      role
    });
    
  } catch (error) {
    console.error('❌ Direct register error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      code: error.code
    });
  }
});

// ✅ FIXED ADMIN LOGIN ROUTE
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Admin login attempt:', { email });
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password are required' 
      });
    }
    
    const mongoose = require('mongoose');
    
    let AdminUser;
    try {
      AdminUser = mongoose.model('AdminUser');
    } catch (error) {
      const adminUserSchema = new mongoose.Schema({
        username: { type: String, required: true, unique: true },
        email: { type: String, required: false },
        passwordHash: { type: String, required: true },
        role: { type: String, enum: ['admin', 'manager', 'superadmin'], default: 'admin' }
      }, { timestamps: true });
      
      const bcrypt = require('bcrypt');
      adminUserSchema.methods.validatePassword = async function(password) {
        return bcrypt.compare(password, this.passwordHash);
      };
      
      AdminUser = mongoose.model('AdminUser', adminUserSchema);
    }
    
    const admin = await AdminUser.findOne({ email });
    if (!admin) {
      console.log('❌ Admin not found:', email);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }
    
    const isValidPassword = await admin.validatePassword(password);
    if (!isValidPassword) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }
    
    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );
    
    console.log('✅ Admin login successful:', email);
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
    
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Login failed',
      details: error.message 
    });
  }
});

// ✅ HELPER: Safe Route Loader
function safeRequireRoute(relPath, name = "Route") {
  const fullPath = path.join(__dirname, relPath);
  console.log(`Loading ${name} route from: ${fullPath}`);

  const candidates = [
    `${fullPath}.js`,
    fullPath,
    path.join(fullPath, "index.js"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      console.log(`Found ${name} route: ${c}`);
      try {
        const module = require(c);
        if (typeof module === "function" || module instanceof express.Router) return module;
        if (module && module.router) return module.router;
        if (module && module.default) return module.default;
      } catch (err) {
        console.error(`Failed to load ${name} route:`, err.message);
      }
      break;
    }
  }

  console.warn(`'${name}' route not found or invalid → skipping`);
  return express.Router();
}

// ✅ LOAD & MOUNT ROUTES
console.log("Loading and mounting routes...");

const adminRoutes = safeRequireRoute("./routes/adminRoutes", "Admin");
const driverRoutes = safeRequireRoute("./routes/driverRoutes", "Driver");
const rideRoutes = safeRequireRoute("./routes/rideRoutes", "Ride");
const groceryRoutes = safeRequireRoute("./routes/groceryRoutes", "Grocery");
const authRoutes = safeRequireRoute("./routes/authRoutes", "Auth");
const userRoutes = safeRequireRoute("./routes/userRoutes", "User");
const walletRoutes = safeRequireRoute("./routes/walletRoutes", "Wallet");
const routeRoutes = safeRequireRoute("./routes/routeRoutes", "Route");
const ridePriceRoutes = safeRequireRoute("./routes/ridePriceRoutes", "Ride Price");
const driverLocationHistoryRoutes = safeRequireRoute("./routes/driverLocationHistoryRoutes", "Driver Location History");
const testRoutes = safeRequireRoute("./routes/testRoutes", "Test");
const notificationRoutes = safeRequireRoute("./routes/notificationRoutes", "Notification");
const bannerRoutes = safeRequireRoute("./routes/Banner", "Banner");

// ✅ ORDER ROUTES
const orderRoutes = safeRequireRoute("./routes/orderRoutes", "Order");
console.log('🔍 Order routes loaded:', orderRoutes ? 'Yes' : 'No');

// ✅ Mount all routes
app.use("/api/admin", adminRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/groceries", groceryRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/admin/ride-prices", ridePriceRoutes);
app.use("/api", driverLocationHistoryRoutes);
app.use("/api/test", testRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/banners", bannerRoutes);

// ✅ Mount order routes
app.use("/api/orders", orderRoutes);

console.log("✅ All routes mounted successfully!");

// ✅ DEBUG ENDPOINT - List all routes
app.get('/api/debug-routes', (req, res) => {
  const routes = [];
  
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      if (middleware.handle && middleware.handle.stack) {
        middleware.handle.stack.forEach((handler) => {
          if (handler.route) {
            const path = middleware.regexp.toString().replace(/\\/g, '').replace(/\^|\$|\(|\)|\?/g, '') + handler.route.path;
            routes.push({
              path: path,
              methods: Object.keys(handler.route.methods)
            });
          }
        });
      }
    }
  });
  
  res.json({
    success: true,
    totalRoutes: routes.length,
    routes: routes.filter(r => r.path.includes('/api/orders')).slice(0, 20)
  });
});

// ✅ SIMPLE ORDER CREATION ENDPOINT
app.post('/api/orders/simple-create', async (req, res) => {
  console.log('🛒 SIMPLE ORDER CREATION ENDPOINT HIT');
  
  try {
    const Order = require('./models/Order');
    const Registration = require('./models/user/Registration');
    
    const { 
      customerId, 
      phoneNumber, 
      name,
      products, 
      deliveryAddress, 
      paymentMethod = 'card'
    } = req.body;
    
    console.log('📦 Simple order for:', { customerId, phoneNumber, name });
    
    let user;
    if (customerId) {
      user = await Registration.findOne({ customerId });
    }
    
    if (!user && phoneNumber) {
      user = await Registration.findOne({ phoneNumber });
    }
    
    if (!user) {
      const Counter = require('./models/user/customerId');
      const counter = await Counter.findOneAndUpdate(
        { _id: 'customerId' },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true }
      );
      const newCustomerId = customerId || (100000 + counter.sequence).toString();
      
      user = new Registration({
        name: name || 'Customer',
        phoneNumber: phoneNumber || '9876543210',
        customerId: newCustomerId,
        address: deliveryAddress?.addressLine1 || ''
      });
      await user.save();
      console.log(`✅ Created temp user: ${newCustomerId}`);
    }
    
    const subtotal = products.reduce((total, item) => total + (item.price || 0) * (item.quantity || 1), 0);
    const tax = subtotal * 0.08;
    const shipping = subtotal > 499 ? 0 : 5.99;
    const totalAmount = subtotal + tax + shipping;
    
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const orderId = `ORD${timestamp}${random}`;
    
    const order = new Order({
      orderId: orderId,
      user: user._id,
      customerId: user.customerId,
      customerName: user.name,
      customerPhone: user.phoneNumber,
      customerAddress: user.address,
      products: products.map(p => ({
        productId: p._id,
        name: p.name,
        price: p.price,
        quantity: p.quantity,
        images: p.images || [],
        category: p.category || 'General'
      })),
      totalAmount: totalAmount,
      subtotal: subtotal,
      tax: tax,
      shipping: shipping,
      deliveryAddress: deliveryAddress,
      paymentMethod: paymentMethod,
      status: 'order_confirmed'
    });
    
    await order.save();
    
    console.log(`✅ SIMPLE ORDER CREATED: ${orderId} for ${user.customerId}`);
    
    res.json({
      success: true,
      message: 'Order placed successfully (simple)',
      data: {
        orderId: order.orderId,
        customerId: order.customerId,
        totalAmount: order.totalAmount,
        status: order.status
      }
    });
    
  } catch (error) {
    console.error('❌ Simple order error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Order creation failed',
      details: error.message 
    });
  }
});

// ✅ TEST ORDER ENDPOINT
app.post('/api/orders/test-order', async (req, res) => {
  console.log('🧪 Test order endpoint hit');
  console.log('Request body:', req.body);
  
  try {
    const Order = require('./models/Order');
    const Registration = require('./models/user/Registration');
    
    res.json({
      success: true,
      message: 'Order endpoint is working!',
      receivedData: req.body,
      modelsLoaded: {
        Order: typeof Order,
        Registration: typeof Registration
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({
      success: false,
      error: 'Model loading error',
      details: error.message
    });
  }
});

// ✅ NOTIFICATION ENDPOINT
app.post('/api/notify-order-update', async (req, res) => {
  try {
    const { orderId, customerId, status } = req.body;
    
    const io = req.app.get('io');
    
    if (io) {
      io.emit('orderStatusUpdate', {
        orderId,
        customerId,
        status,
        timestamp: new Date().toISOString()
      });
      
      console.log(`📡 Emitted order update for ${orderId} to status ${status}`);
    }
    
    res.json({ success: true, message: 'Notification sent' });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ success: false, error: 'Failed to send notification' });
  }
});

// ✅ DEBUG ORDER ENDPOINT
app.get('/api/orders/debug/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    console.log('🔍 Debug: Fetching orders for customer:', customerId);
    
    const Order = require('./models/Order');
    const orders = await Order.find({ customerId }).sort({ createdAt: -1 });
    
    console.log(`🔍 Debug: Found ${orders.length} orders for ${customerId}`);
    
    res.json({
      success: true,
      customerId,
      orderCount: orders.length,
      orders: orders.map(o => ({
        orderId: o.orderId,
        status: o.status,
        totalAmount: o.totalAmount,
        createdAt: o.createdAt
      }))
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ CUSTOMER ORDERS BY ID
app.get('/api/orders/customer-id/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    console.log('📦 DIRECT: Fetching orders for customer ID:', customerId);
    
    let Order;
    try {
      Order = require('./models/Order');
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Order model not available'
      });
    }
    
    const orders = await Order.find({ customerId }).sort({ createdAt: -1 });
    
    console.log(`✅ DIRECT: Found ${orders.length} orders for customer ${customerId}`);
    
    res.json({
      success: true,
      data: orders,
      message: `Found ${orders.length} orders`
    });
    
  } catch (error) {
    console.error('❌ DIRECT customerId endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders',
      details: error.message
    });
  }
});

// ✅ DIRECT ORDER CREATION
app.post('/api/orders/create-direct', async (req, res) => {
  console.log('🛒 DIRECT ORDER CREATION ENDPOINT HIT');
  
  try {
    const Order = require('./models/Order');
    const Registration = require('./models/user/Registration');
    
    const { 
      userId, 
      products, 
      deliveryAddress, 
      paymentMethod,
      useWallet = false 
    } = req.body;

    console.log('📦 Direct order creation for user:', userId);

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User ID is required' 
      });
    }

    if (!products || products.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Products are required' 
      });
    }

    const user = await Registration.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const subtotal = products.reduce((total, item) => total + (item.price * item.quantity), 0);
    const tax = subtotal * 0.08;
    const shipping = subtotal > 499 ? 0 : 5.99;
    const totalAmount = subtotal + tax + shipping;

    const timestamp = Date.now();
    const orderData = {
      orderId: `ORD${timestamp}`,
      user: userId,
      customerId: user.customerId,
      customerName: user.name,
      customerPhone: user.phoneNumber,
      customerEmail: user.email || '',
      customerAddress: user.address,
      products: products.map(item => ({
        productId: item._id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        images: item.images || [],
        category: item.category || 'General'
      })),
      totalAmount,
      subtotal,
      tax,
      shipping,
      deliveryAddress: deliveryAddress || {
        name: user.name,
        phone: user.phoneNumber,
        addressLine1: user.address,
        city: 'City',
        state: 'State', 
        pincode: '000000',
        country: 'India'
      },
      paymentMethod: useWallet ? 'wallet' : paymentMethod,
      status: 'order_confirmed'
    };

    console.log('💾 Saving order directly...');
    const order = new Order(orderData);
    await order.save();

    console.log('✅ DIRECT ORDER CREATED SUCCESSFULLY!');
    
    res.status(201).json({
      success: true,
      message: 'Order placed successfully (direct)',
      data: {
        orderId: order.orderId,
        totalAmount: order.totalAmount,
        status: order.status,
        orderDate: order.orderDate
      }
    });

  } catch (error) {
    console.error('❌ Direct order creation failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create order',
      details: error.message 
    });
  }
});

// ✅ ADMIN DEBUG MODEL
app.get('/api/admin/debug-model', async (req, res) => {
  try {
    const AdminUser = require('./models/adminUser');
    
    console.log('🔍 AdminUser model type:', typeof AdminUser);
    
    const adminCount = await AdminUser.countDocuments();
    
    res.json({
      success: true,
      modelType: typeof AdminUser,
      adminCount: adminCount,
      isModel: AdminUser && typeof AdminUser === 'function',
      hasFindOne: typeof AdminUser.findOne === 'function'
    });
  } catch (error) {
    console.error('❌ Debug model error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// ✅ ROOT & HEALTH
app.get("/", (req, res) => {
  res.json({ 
    message: "Taxi + Grocery App API Running", 
    uptime: process.uptime(), 
    timestamp: new Date().toISOString(),
    endpoints: {
      orders: {
        test: "/api/orders/test-connection",
        admin: "/api/orders/admin/orders",
        stats: "/api/orders/admin/order-stats"
      }
    }
  });
});

// ✅ ERROR HANDLER
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(err.status || 500).json({
    error: { 
      message: err.message || "Internal Server Error",
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// ✅ EXPORT
module.exports = app;






// require("dotenv").config();

// const express = require("express");
// const cors = require("cors");
// const path = require("path");
// const fs = require("fs");
// const morgan = require("morgan");
// const jwt = require("jsonwebtoken");


// const multer = require('multer');

// // ✅ INITIALIZE APP
// const app = express();

// // Make sure this is correctly configured
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// // ✅ FIXED CORS CONFIGURATION - Add this BEFORE other middleware
// console.log("🔧 Setting up CORS...");
// app.use(cors({
//   origin: ["http://localhost:3000", "http://localhost:3001", "*"], // Allow both frontend ports
//   methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
//   credentials: true,
//   exposedHeaders: ["Content-Length", "Content-Type", "Authorization"]
// }));

// // ✅ Add manual CORS headers for all requests
// app.use((req, res, next) => {
//   console.log(`🌐 ${req.method} ${req.url} from ${req.headers.origin || 'unknown origin'}`);
  
//   res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
//   res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
//   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token");
//   res.header("Access-Control-Allow-Credentials", "true");
  
//   if (req.method === "OPTIONS") {
//     console.log("🔄 Handling OPTIONS preflight request");
//     return res.status(200).end();
//   }
  
//   next();
// });

// // ✅ MIDDLEWARE
// app.use(morgan("dev"));
// app.use(express.json({ limit: "10mb" }));
// app.use(express.urlencoded({ extended: true }));

// // ✅ UPLOADS DIRECTORY & STATIC SERVING
// const uploadsDir = path.join(__dirname, "uploads");
// if (!fs.existsSync(uploadsDir)) {
//   fs.mkdirSync(uploadsDir, { recursive: true });
//   console.log("Created uploads directory:", uploadsDir);
// }

// app.use("/uploads", (req, res, next) => {
//   res.setHeader("Access-Control-Allow-Origin", "*");
//   express.static(uploadsDir)(req, res, next);
// });

// console.log("📂 Static files served from /uploads");

// // ✅ ORDER ROUTES - ADD THESE AT THE TOP FOR EASY ACCESS
// console.log("📦 Loading order routes...");

// // ✅ SIMPLE TEST ENDPOINT - Works with proxy
// app.get('/api/orders/test-connection', (req, res) => {
//   console.log('🧪 Test connection endpoint hit');
//   res.json({ 
//     success: true, 
//     message: 'Orders API is connected!',
//     timestamp: new Date().toISOString(),
//     backend: 'http://localhost:5001',
//     proxyWorking: true
//   });
// });

// // ✅ TEST PUBLIC ENDPOINT
// app.get('/api/orders/test-public', (req, res) => {
//   console.log('🌐 Public test endpoint hit');
//   res.json({
//     success: true,
//     message: 'Public orders endpoint is working!',
//     timestamp: new Date().toISOString()
//   });
// });

// // ✅ ADMIN ORDER ROUTES - FIXED WITH PROPER CORS
// app.get('/api/orders/admin/orders', async (req, res) => {
//   try {
//     console.log('📦 Admin: Fetching all orders');
    
//     const Order = require('./models/Order');
//     const { page = 1, limit = 10, status } = req.query;
//     const skip = (page - 1) * limit;

//     let query = {};
//     if (status && status !== 'all') {
//       query.status = status;
//     }

//     const orders = await Order.find(query)
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(parseInt(limit));

//     const totalOrders = await Order.countDocuments(query);

//     // Format orders for admin panel
//     const cleanOrders = orders.map(order => ({
//       _id: order._id,
//       orderId: order.orderId,
//       customerId: order.customerId,
//       customerName: order.customerName,
//       customerPhone: order.customerPhone,
//       customerEmail: order.customerEmail,
//       customerAddress: order.customerAddress,
//       products: order.products.map(product => ({
//         name: product.name,
//         price: product.price,
//         quantity: product.quantity,
//         total: product.price * product.quantity,
//         category: product.category
//       })),
//       totalAmount: order.totalAmount,
//       status: order.status,
//       paymentMethod: order.paymentMethod,
//       orderDate: order.orderDate,
//       deliveryAddress: order.deliveryAddress,
//       createdAt: order.createdAt
//     }));

//     console.log(`✅ Admin: Returning ${cleanOrders.length} orders`);

//     res.json({
//       success: true,
//       data: cleanOrders,
//       pagination: {
//         currentPage: parseInt(page),
//         totalPages: Math.ceil(totalOrders / limit),
//         totalOrders,
//         hasNextPage: page < Math.ceil(totalOrders / limit),
//         hasPrevPage: page > 1
//       }
//     });

//   } catch (error) {
//     console.error('❌ Admin orders error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to fetch orders',
//       details: error.message 
//     });
//   }
// });

// // ✅ ADMIN ORDER STATS
// app.get('/api/orders/admin/order-stats', async (req, res) => {
//   try {
//     console.log('📊 Admin: Fetching order stats');
    
//     const Order = require('./models/Order');
//     const Registration = require('./models/user/Registration');
    
//     const totalOrders = await Order.countDocuments();
//     const deliveredOrders = await Order.countDocuments({ status: 'delivered' });
//     const pendingOrders = await Order.countDocuments({ 
//       status: { $in: ['order_confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery'] } 
//     });
    
//     // Calculate total revenue
//     const revenueResult = await Order.aggregate([
//       { $match: { status: 'delivered' } },
//       { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
//     ]);
    
//     const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
//     const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

//     // Get customer count
//     const customerCount = await Registration.countDocuments();

//     console.log(`📊 Stats: ${totalOrders} orders, ${customerCount} customers, ₹${totalRevenue} revenue`);

//     res.json({
//       success: true,
//       data: {
//         totalOrders,
//         deliveredOrders,
//         pendingOrders,
//         totalRevenue,
//         avgOrderValue,
//         customerCount
//       }
//     });

//   } catch (error) {
//     console.error('❌ Order stats error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to fetch order statistics',
//       details: error.message 
//     });
//   }
// });


// // In app.js, replace the existing order update endpoint with this:

// // ✅ UPDATE ORDER STATUS - FIXED
// app.put('/api/orders/admin/orders/update/:orderId', async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const { status } = req.body;

//     console.log(`🔄 Admin: Updating order ${orderId} to ${status}`);

//     const Order = require('./models/Order');
    
//     // Try to find by _id (MongoDB ObjectId) first, then by orderId
//     let order;
//     if (mongoose.Types.ObjectId.isValid(orderId)) {
//       order = await Order.findById(orderId);
//     }
    
//     if (!order) {
//       order = await Order.findOne({ orderId });
//     }
    
//     if (!order) {
//       return res.status(404).json({ 
//         success: false, 
//         error: 'Order not found' 
//       });
//     }

//     order.status = status;
//     await order.save();

//     console.log(`✅ Order ${orderId} status updated to ${status}`);

//     // Emit socket event if needed
//     const io = req.app.get('io');
//     if (io) {
//       io.emit('orderStatusUpdate', {
//         orderId: order.orderId,
//         customerId: order.customerId,
//         status,
//         timestamp: new Date().toISOString()
//       });
//     }

//     res.json({
//       success: true,
//       message: 'Order status updated successfully',
//       data: {
//         orderId: order.orderId,
//         status: order.status
//       }
//     });

//   } catch (error) {
//     console.error('❌ Order update error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to update order status',
//       details: error.message 
//     });
//   }
// });


// // Add this after the other admin routes
// app.get('/api/admin/drivers', async (req, res) => {
//   try {
//     const Driver = require('./models/driver/driver');
//     const drivers = await Driver.find().sort({ createdAt: -1 });
    
//     res.json({
//       success: true,
//       data: drivers,
//       count: drivers.length
//     });
//   } catch (error) {
//     console.error('Error fetching drivers:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to fetch drivers',
//       details: error.message
//     });
//   }
// });


// // ✅ GET ORDER BY MONGODB _id (for admin panel)
// app.get('/api/orders/admin/order/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     console.log('🔍 Admin: Fetching order by ID:', id);

//     const Order = require('./models/Order');
    
//     let order;
//     // Try to find by MongoDB _id first
//     if (id.match(/^[0-9a-fA-F]{24}$/)) {
//       order = await Order.findById(id);
//     }
    
//     // If not found by _id, try by orderId
//     if (!order) {
//       order = await Order.findOne({ orderId: id });
//     }

//     if (!order) {
//       return res.status(404).json({ 
//         success: false, 
//         error: 'Order not found' 
//       });
//     }

//     // Format order for admin panel
//     const cleanOrder = {
//       _id: order._id,
//       orderId: order.orderId,
//       customerId: order.customerId,
//       customerName: order.customerName,
//       customerPhone: order.customerPhone,
//       customerEmail: order.customerEmail,
//       customerAddress: order.customerAddress,
//       products: order.products.map(product => ({
//         name: product.name,
//         price: product.price,
//         quantity: product.quantity,
//         total: product.price * product.quantity,
//         category: product.category
//       })),
//       totalAmount: order.totalAmount,
//       status: order.status,
//       paymentMethod: order.paymentMethod,
//       orderDate: order.orderDate,
//       deliveryAddress: order.deliveryAddress,
//       createdAt: order.createdAt,
//       subtotal: order.subtotal || order.totalAmount,
//       shipping: order.shipping || 0,
//       tax: order.tax || 0
//     };

//     console.log(`✅ Admin: Returning order ${cleanOrder.orderId}`);

//     res.json({
//       success: true,
//       data: cleanOrder
//     });

//   } catch (error) {
//     console.error('❌ Admin order by ID error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to fetch order',
//       details: error.message 
//     });
//   }
// });

// // ✅ UPDATE ORDER BY MONGODB _id (for admin panel)
// app.put('/api/orders/admin/order/update-by-id/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { status, paymentMethod, deliveryAddress } = req.body;

//     console.log(`🔄 Admin: Updating order ID ${id}`, { status, paymentMethod });

//     const Order = require('./models/Order');
    
//     let order;
//     // Try to find by MongoDB _id first
//     if (id.match(/^[0-9a-fA-F]{24}$/)) {
//       order = await Order.findById(id);
//     }
    
//     // If not found by _id, try by orderId
//     if (!order) {
//       order = await Order.findOne({ orderId: id });
//     }
    
//     if (!order) {
//       return res.status(404).json({ 
//         success: false, 
//         error: 'Order not found' 
//       });
//     }

//     // Update fields
//     if (status) order.status = status;
//     if (paymentMethod) order.paymentMethod = paymentMethod;
//     if (deliveryAddress) order.deliveryAddress = deliveryAddress;
    
//     await order.save();

//     console.log(`✅ Order ${order.orderId} updated successfully`);

//     // Emit socket event if needed
//     const io = req.app.get('io');
//     if (io) {
//       io.emit('orderStatusUpdate', {
//         orderId: order.orderId,
//         customerId: order.customerId,
//         status: order.status,
//         timestamp: new Date().toISOString()
//       });
//     }

//     // Format response
//     const updatedOrder = {
//       _id: order._id,
//       orderId: order.orderId,
//       customerId: order.customerId,
//       customerName: order.customerName,
//       status: order.status,
//       totalAmount: order.totalAmount,
//       paymentMethod: order.paymentMethod,
//       createdAt: order.createdAt,
//       deliveryAddress: order.deliveryAddress
//     };

//     res.json({
//       success: true,
//       message: 'Order updated successfully',
//       data: updatedOrder
//     });

//   } catch (error) {
//     console.error('❌ Order update error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to update order',
//       details: error.message 
//     });
//   }
// });

// // ✅ UPDATE ORDER STATUS BY MONGODB _id (Simplified version)
// app.put('/api/orders/admin/update-status/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { status } = req.body;

//     console.log(`🔄 Admin: Updating status for order ID ${id} to ${status}`);

//     const Order = require('./models/Order');
    
//     let order;
//     // Try to find by MongoDB _id first
//     if (id.match(/^[0-9a-fA-F]{24}$/)) {
//       order = await Order.findById(id);
//     }
    
//     // If not found by _id, try by orderId
//     if (!order) {
//       order = await Order.findOne({ orderId: id });
//     }
    
//     if (!order) {
//       return res.status(404).json({ 
//         success: false, 
//         error: 'Order not found' 
//       });
//     }

//     // Validate status
//     const validStatuses = [
//       'pending',
//       'order_confirmed', 
//       'processing',
//       'preparing',
//       'packed',
//       'shipped',
//       'out_for_delivery',
//       'delivered',
//       'cancelled',
//       'returned',
//       'refunded'
//     ];

//     if (!validStatuses.includes(status)) {
//       return res.status(400).json({
//         success: false,
//         error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
//       });
//     }

//     order.status = status;
//     await order.save();

//     console.log(`✅ Status updated: ${order.orderId} → ${status}`);

//     // Emit socket event
//     const io = req.app.get('io');
//     if (io) {
//       io.emit('orderStatusUpdate', {
//         orderId: order.orderId,
//         customerId: order.customerId,
//         status: order.status,
//         timestamp: new Date().toISOString()
//       });
//     }

//     res.json({
//       success: true,
//       message: 'Order status updated successfully',
//       data: {
//         _id: order._id,
//         orderId: order.orderId,
//         status: order.status,
//         customerId: order.customerId
//       }
//     });

//   } catch (error) {
//     console.error('❌ Status update error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to update order status',
//       details: error.message 
//     });
//   }
// });

// // ✅ BULK UPDATE ORDERS
// app.put('/api/orders/admin/bulk-update', async (req, res) => {
//   try {
//     const { orderIds, status } = req.body;

//     if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'Order IDs array is required' 
//       });
//     }

//     if (!status) {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'Status is required' 
//       });
//     }

//     console.log(`🔄 Admin: Bulk updating ${orderIds.length} orders to ${status}`);

//     const Order = require('./models/Order');
//     const validStatuses = [
//       'pending',
//       'order_confirmed', 
//       'processing',
//       'preparing',
//       'packed',
//       'shipped',
//       'out_for_delivery',
//       'delivered',
//       'cancelled',
//       'returned',
//       'refunded'
//     ];

//     if (!validStatuses.includes(status)) {
//       return res.status(400).json({
//         success: false,
//         error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
//       });
//     }

//     // Update all orders
//     const updateResult = await Order.updateMany(
//       { 
//         $or: [
//           { _id: { $in: orderIds } },
//           { orderId: { $in: orderIds } }
//         ]
//       },
//       { $set: { status: status } }
//     );

//     console.log(`✅ Bulk update completed: ${updateResult.modifiedCount} orders updated`);

//     // Get updated orders
//     const updatedOrders = await Order.find({
//       $or: [
//         { _id: { $in: orderIds } },
//         { orderId: { $in: orderIds } }
//       ]
//     });

//     // Emit socket events
//     const io = req.app.get('io');
//     if (io) {
//       updatedOrders.forEach(order => {
//         io.emit('orderStatusUpdate', {
//           orderId: order.orderId,
//           customerId: order.customerId,
//           status: order.status,
//           timestamp: new Date().toISOString()
//         });
//       });
//     }

//     res.json({
//       success: true,
//       message: `Successfully updated ${updateResult.modifiedCount} orders`,
//       data: {
//         modifiedCount: updateResult.modifiedCount,
//         orders: updatedOrders.map(order => ({
//           _id: order._id,
//           orderId: order.orderId,
//           status: order.status
//         }))
//       }
//     });

//   } catch (error) {
//     console.error('❌ Bulk update error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to bulk update orders',
//       details: error.message 
//     });
//   }
// });





// // ✅ PROXY ENDPOINT FOR REACT (in case proxy doesn't work)
// app.get('/api/admin/proxy/orders', async (req, res) => {
//   console.log('🔀 Proxy endpoint hit, forwarding to orders endpoint');
  
//   // This acts as a proxy - just call the actual endpoint
//   try {
//     const Order = require('./models/Order');
//     const orders = await Order.find({}).sort({ createdAt: -1 }).limit(50);
    
//     const cleanOrders = orders.map(order => ({
//       _id: order._id,
//       orderId: order.orderId,
//       customerId: order.customerId,
//       customerName: order.customerName,
//       status: order.status,
//       totalAmount: order.totalAmount,
//       paymentMethod: order.paymentMethod,
//       createdAt: order.createdAt
//     }));
    
//     res.json({
//       success: true,
//       data: cleanOrders,
//       message: 'Via proxy endpoint',
//       count: orders.length
//     });
//   } catch (error) {
//     console.error('Proxy error:', error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// // ✅ MODELS
// const Registration = require("./models/user/Registration");
// const Counter = require("./models/user/customerId");
// const Driver = require("./models/driver/driver");
// const Ride = require("./models/ride");

// // ✅ DIRECT AUTH ROUTES
// app.post("/api/auth/verify-phone", async (req, res) => {
//   try {
//     const { phoneNumber } = req.body;
//     if (!phoneNumber) return res.status(400).json({ error: "Phone number is required" });

//     const user = await Registration.findOne({ phoneNumber });
//     if (user) {
//       const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "secret", { expiresIn: "30d" });
//       return res.json({
//         success: true,
//         token,
//         user: {
//           name: user.name,
//           phoneNumber: user.phoneNumber,
//           customerId: user.customerId,
//           profilePicture: user.profilePicture || ""
//         }
//       });
//     }
//     res.json({ success: true, newUser: true });
//   } catch (err) {
//     console.error("verify-phone error:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

// app.post("/api/auth/register", async (req, res) => {
//   try {
//     const { name, phoneNumber, address } = req.body;
//     if (!name || !phoneNumber || !address)
//       return res.status(400).json({ error: "Name, phone number, and address are required" });

//     const existing = await Registration.findOne({ phoneNumber });
//     if (existing) return res.status(400).json({ error: "Phone number already registered" });

//     const counter = await Counter.findOneAndUpdate(
//       { _id: "customerId" },
//       { $inc: { sequence: 1 } },
//       { new: true, upsert: true }
//     );
//     const customerId = (100000 + counter.sequence).toString();

//     const newUser = new Registration({ name, phoneNumber, address, customerId });
//     await newUser.save();

//     const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET || "secret", { expiresIn: "30d" });

//     res.status(201).json({
//       success: true,
//       token,
//       user: { name, phoneNumber, address, customerId }
//     });
//   } catch (err) {
//     console.error("register error:", err);
//     res.status(400).json({ error: err.message });
//   }
// });

// // ✅ WALLET & PROFILE (Protected)
// const authenticateToken = (req, res, next) => {
//   const authHeader = req.headers.authorization;
//   if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "No token provided" });

//   const token = authHeader.split(" ")[1];
//   jwt.verify(token, process.env.JWT_SECRET || "secret", (err, decoded) => {
//     if (err) return res.status(401).json({ error: "Invalid token" });
//     req.userId = decoded.id;
//     next();
//   });
// };

// app.get("/api/wallet", authenticateToken, async (req, res) => {
//   try {
//     const user = await Registration.findById(req.userId);
//     res.json({ success: true, wallet: user?.wallet || 0, balance: user?.wallet || 0 });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// app.get("/api/users/profile", authenticateToken, async (req, res) => {
//   try {
//     const user = await Registration.findById(req.userId);
//     if (!user) return res.status(404).json({ success: false, error: "User not found" });

//     const backendUrl = process.env.BACKEND_URL || "http://localhost:5001";
//     const profilePicture = user.profilePicture
//       ? user.profilePicture.startsWith("http")
//         ? user.profilePicture
//         : `${backendUrl}${user.profilePicture}`
//       : "";

//     res.json({
//       success: true,
//       user: {
//         _id: user._id,
//         name: user.name || "",
//         phoneNumber: user.phoneNumber || "",
//         customerId: user.customerId || "",
//         email: user.email || "",
//         address: user.address || "",
//         profilePicture,
//         gender: user.gender || "",
//         dob: user.dob || "",
//         altMobile: user.altMobile || "",
//         wallet: user.wallet || 0
//       }
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // ✅ FCM TOKEN UPDATE
// app.post(["/drivers/update-fcm-token", "/register-fcm-token", "/api/drivers/update-fcm-token"], async (req, res) => {
//   try {
//     const { driverId, fcmToken, platform = "android" } = req.body;
//     if (!driverId || !fcmToken) return res.status(400).json({ success: false, error: "driverId & fcmToken required" });

//     const updated = await Driver.findOneAndUpdate(
//       { driverId },
//       { fcmToken, platform, lastUpdate: new Date(), notificationEnabled: true, status: "Live" },
//       { new: true }
//     );

//     if (!updated) return res.status(404).json({ success: false, error: "Driver not found" });

//     res.json({
//       success: true,
//       message: "FCM token updated",
//       driverId,
//       name: updated.name
//     });
//   } catch (err) {
//     console.error("FCM update error:", err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// });

// // ✅ TEST ENDPOINTS
// app.get("/api/test-connection", (req, res) => res.json({ success: true, message: "API is live!", timestamp: new Date() }));

// app.get("/api/auth/test", (req, res) => res.json({ success: true, message: "Direct auth routes working!" }));

// app.post("/api/test/accept-ride", async (req, res) => {
//   try {
//     const { rideId, driverId = "dri123", driverName = "Test Driver" } = req.body;
//     const ride = await Ride.findOne({ RAID_ID: rideId });
//     if (!ride) return res.status(404).json({ error: "Ride not found" });

//     const io = req.app.get("io");
//     if (!io) return res.status(500).json({ error: "Socket.io not initialized" });

//     const testData = {
//       rideId,
//       driverId,
//       driverName,
//       driverMobile: "9876543210",
//       driverLat: 11.331288,
//       driverLng: 77.716728,
//       vehicleType: "taxi",
//       timestamp: new Date().toISOString(),
//       _isTest: true
//     };

//     io.to(ride.user.toString()).emit("rideAccepted", testData);
//     res.json({ success: true, message: "Test ride acceptance sent", userId: ride.user });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// app.get("/api/test-driver-status", async (req, res) => {
//   const driver = await Driver.findOne({ driverId: "dri123" });
//   res.json({
//     driverExists: !!driver,
//     hasFcmToken: !!driver?.fcmToken,
//     isOnline: driver?.isOnline,
//     driverInfo: driver ? { name: driver.name, status: driver.status } : null
//   });
// });

// app.get("/api/test-uploads", (req, res) => {
//   try {
//     const files = fs.readdirSync(uploadsDir);
//     res.json({ success: true, uploadsDir, files: files.slice(0, 10), count: files.length });
//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message });
//   }
// });

// // ✅ ADMIN DASHBOARD (Mock Data)
// app.get("/api/admin/dashboard-data", (req, res) => {
//   res.json({
//     success: true,
//     data: {
//       stats: { totalUsers: 63154, usersChange: "+12.5%", drivers: 1842, driversChange: "+8.2%", totalRides: 24563, ridesChange: "+15.3%", productSales: 48254, salesChange: "+22.1%" },
//       weeklyPerformance: [
//         { name: "Mon", rides: 45, orders: 32 }, { name: "Tue", rides: 52, orders: 38 },
//         { name: "Wed", rides: 48, orders: 41 }, { name: "Thu", rides: 60, orders: 45 },
//         { name: "Fri", rides: 75, orders: 52 }, { name: "Sat", rides: 82, orders: 61 },
//         { name: "Sun", rides: 68, orders: 48 }
//       ],
//       serviceDistribution: [{ name: "Rides", value: 65 }, { name: "Grocery", value: 35 }]
//     }
//   });
// });

// // ✅ HELPER: Safe Route Loader
// function safeRequireRoute(relPath, name = "Route") {
//   const fullPath = path.join(__dirname, relPath);
//   console.log(`Loading ${name} route from: ${fullPath}`);

//   const candidates = [
//     `${fullPath}.js`,
//     fullPath,
//     path.join(fullPath, "index.js"),
//   ];

//   for (const c of candidates) {
//     if (fs.existsSync(c)) {
//       console.log(`Found ${name} route: ${c}`);
//       try {
//         const module = require(c);
//         if (typeof module === "function" || module instanceof express.Router) return module;
//         if (module && module.router) return module.router;
//         if (module && module.default) return module.default;
//       } catch (err) {
//         console.error(`Failed to load ${name} route:`, err.message);
//       }
//       break;
//     }
//   }

//   console.warn(`'${name}' route not found or invalid → skipping`);
//   return express.Router();
// }

// // ✅ LOAD & MOUNT ROUTES
// console.log("Loading and mounting routes...");

// const adminRoutes = safeRequireRoute("./routes/adminRoutes", "Admin");
// const driverRoutes = safeRequireRoute("./routes/driverRoutes", "Driver");
// const rideRoutes = safeRequireRoute("./routes/rideRoutes", "Ride");
// const groceryRoutes = safeRequireRoute("./routes/groceryRoutes", "Grocery");
// const authRoutes = safeRequireRoute("./routes/authRoutes", "Auth");
// const userRoutes = safeRequireRoute("./routes/userRoutes", "User");
// const walletRoutes = safeRequireRoute("./routes/walletRoutes", "Wallet");
// const routeRoutes = safeRequireRoute("./routes/routeRoutes", "Route");
// const ridePriceRoutes = safeRequireRoute("./routes/ridePriceRoutes", "Ride Price");
// const driverLocationHistoryRoutes = safeRequireRoute("./routes/driverLocationHistoryRoutes", "Driver Location History");
// const testRoutes = safeRequireRoute("./routes/testRoutes", "Test");
// const notificationRoutes = safeRequireRoute("./routes/notificationRoutes", "Notification");
// const bannerRoutes = safeRequireRoute("./routes/Banner", "Banner");

// // ✅ ORDER ROUTES
// const orderRoutes = safeRequireRoute("./routes/orderRoutes", "Order");
// console.log('🔍 Order routes loaded:', orderRoutes ? 'Yes' : 'No');

// // ✅ Mount all routes
// app.use("/api/admin", adminRoutes);
// app.use("/api/drivers", driverRoutes);
// app.use("/api/rides", rideRoutes);
// app.use("/api/groceries", groceryRoutes);
// app.use("/api/auth", authRoutes);
// app.use("/api/users", userRoutes);
// app.use("/api/wallet", walletRoutes);
// app.use("/api/routes", routeRoutes);
// app.use("/api/admin/ride-prices", ridePriceRoutes);
// app.use("/api", driverLocationHistoryRoutes);
// app.use("/api/test", testRoutes);
// app.use("/api/notifications", notificationRoutes);
// app.use("/api/banners", bannerRoutes);

// // ✅ Mount order routes
// app.use("/api/orders", orderRoutes);

// console.log("✅ All routes mounted successfully!");

// // ✅ DEBUG ENDPOINT - List all routes
// app.get('/api/debug-routes', (req, res) => {
//   const routes = [];
  
//   app._router.stack.forEach((middleware) => {
//     if (middleware.route) {
//       routes.push({
//         path: middleware.route.path,
//         methods: Object.keys(middleware.route.methods)
//       });
//     } else if (middleware.name === 'router') {
//       if (middleware.handle && middleware.handle.stack) {
//         middleware.handle.stack.forEach((handler) => {
//           if (handler.route) {
//             const path = middleware.regexp.toString().replace(/\\/g, '').replace(/\^|\$|\(|\)|\?/g, '') + handler.route.path;
//             routes.push({
//               path: path,
//               methods: Object.keys(handler.route.methods)
//             });
//           }
//         });
//       }
//     }
//   });
  
//   res.json({
//     success: true,
//     totalRoutes: routes.length,
//     routes: routes.filter(r => r.path.includes('/api/orders')).slice(0, 20)
//   });
// });

// // ✅ SIMPLE ORDER CREATION ENDPOINT
// app.post('/api/orders/simple-create', async (req, res) => {
//   console.log('🛒 SIMPLE ORDER CREATION ENDPOINT HIT');
  
//   try {
//     const Order = require('./models/Order');
//     const Registration = require('./models/user/Registration');
    
//     const { 
//       customerId, 
//       phoneNumber, 
//       name,
//       products, 
//       deliveryAddress, 
//       paymentMethod = 'card'
//     } = req.body;
    
//     console.log('📦 Simple order for:', { customerId, phoneNumber, name });
    
//     // Find user
//     let user;
//     if (customerId) {
//       user = await Registration.findOne({ customerId });
//     }
    
//     if (!user && phoneNumber) {
//       user = await Registration.findOne({ phoneNumber });
//     }
    
//     if (!user) {
//       const Counter = require('./models/user/customerId');
//       const counter = await Counter.findOneAndUpdate(
//         { _id: 'customerId' },
//         { $inc: { sequence: 1 } },
//         { new: true, upsert: true }
//       );
//       const newCustomerId = customerId || (100000 + counter.sequence).toString();
      
//       user = new Registration({
//         name: name || 'Customer',
//         phoneNumber: phoneNumber || '9876543210',
//         customerId: newCustomerId,
//         address: deliveryAddress?.addressLine1 || ''
//       });
//       await user.save();
//       console.log(`✅ Created temp user: ${newCustomerId}`);
//     }
    
//     // Calculate totals
//     const subtotal = products.reduce((total, item) => total + (item.price || 0) * (item.quantity || 1), 0);
//     const tax = subtotal * 0.08;
//     const shipping = subtotal > 499 ? 0 : 5.99;
//     const totalAmount = subtotal + tax + shipping;
    
//     // Create order
//     const timestamp = Date.now();
//     const random = Math.floor(Math.random() * 1000);
//     const orderId = `ORD${timestamp}${random}`;
    
//     const order = new Order({
//       orderId: orderId,
//       user: user._id,
//       customerId: user.customerId,
//       customerName: user.name,
//       customerPhone: user.phoneNumber,
//       customerAddress: user.address,
//       products: products.map(p => ({
//         productId: p._id,
//         name: p.name,
//         price: p.price,
//         quantity: p.quantity,
//         images: p.images || [],
//         category: p.category || 'General'
//       })),
//       totalAmount: totalAmount,
//       subtotal: subtotal,
//       tax: tax,
//       shipping: shipping,
//       deliveryAddress: deliveryAddress,
//       paymentMethod: paymentMethod,
//       status: 'order_confirmed'
//     });
    
//     await order.save();
    
//     console.log(`✅ SIMPLE ORDER CREATED: ${orderId} for ${user.customerId}`);
    
//     res.json({
//       success: true,
//       message: 'Order placed successfully (simple)',
//       data: {
//         orderId: order.orderId,
//         customerId: order.customerId,
//         totalAmount: order.totalAmount,
//         status: order.status
//       }
//     });
    
//   } catch (error) {
//     console.error('❌ Simple order error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Order creation failed',
//       details: error.message 
//     });
//   }
// });

// // ✅ TEST ORDER ENDPOINT
// app.post('/api/orders/test-order', async (req, res) => {
//   console.log('🧪 Test order endpoint hit');
//   console.log('Request body:', req.body);
  
//   try {
//     const Order = require('./models/Order');
//     const Registration = require('./models/user/Registration');
    
//     res.json({
//       success: true,
//       message: 'Order endpoint is working!',
//       receivedData: req.body,
//       modelsLoaded: {
//         Order: typeof Order,
//         Registration: typeof Registration
//       },
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     console.error('Test error:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Model loading error',
//       details: error.message
//     });
//   }
// });

// // ✅ NOTIFICATION ENDPOINT
// app.post('/api/notify-order-update', async (req, res) => {
//   try {
//     const { orderId, customerId, status } = req.body;
    
//     const io = req.app.get('io');
    
//     if (io) {
//       io.emit('orderStatusUpdate', {
//         orderId,
//         customerId,
//         status,
//         timestamp: new Date().toISOString()
//       });
      
//       console.log(`📡 Emitted order update for ${orderId} to status ${status}`);
//     }
    
//     res.json({ success: true, message: 'Notification sent' });
//   } catch (error) {
//     console.error('Error sending notification:', error);
//     res.status(500).json({ success: false, error: 'Failed to send notification' });
//   }
// });

// // ✅ DEBUG ORDER ENDPOINT
// app.get('/api/orders/debug/:customerId', async (req, res) => {
//   try {
//     const { customerId } = req.params;
//     console.log('🔍 Debug: Fetching orders for customer:', customerId);
    
//     const Order = require('./models/Order');
//     const orders = await Order.find({ customerId }).sort({ createdAt: -1 });
    
//     console.log(`🔍 Debug: Found ${orders.length} orders for ${customerId}`);
    
//     res.json({
//       success: true,
//       customerId,
//       orderCount: orders.length,
//       orders: orders.map(o => ({
//         orderId: o.orderId,
//         status: o.status,
//         totalAmount: o.totalAmount,
//         createdAt: o.createdAt
//       }))
//     });
//   } catch (error) {
//     console.error('Debug error:', error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// // ✅ CUSTOMER ORDERS BY ID
// app.get('/api/orders/customer-id/:customerId', async (req, res) => {
//   try {
//     const { customerId } = req.params;
//     console.log('📦 DIRECT: Fetching orders for customer ID:', customerId);
    
//     let Order;
//     try {
//       Order = require('./models/Order');
//     } catch (error) {
//       return res.status(500).json({
//         success: false,
//         error: 'Order model not available'
//       });
//     }
    
//     const orders = await Order.find({ customerId }).sort({ createdAt: -1 });
    
//     console.log(`✅ DIRECT: Found ${orders.length} orders for customer ${customerId}`);
    
//     res.json({
//       success: true,
//       data: orders,
//       message: `Found ${orders.length} orders`
//     });
    
//   } catch (error) {
//     console.error('❌ DIRECT customerId endpoint error:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to fetch orders',
//       details: error.message
//     });
//   }
// });

// // ✅ DIRECT ORDER CREATION
// app.post('/api/orders/create-direct', async (req, res) => {
//   console.log('🛒 DIRECT ORDER CREATION ENDPOINT HIT');
  
//   try {
//     const Order = require('./models/Order');
//     const Registration = require('./models/user/Registration');
    
//     const { 
//       userId, 
//       products, 
//       deliveryAddress, 
//       paymentMethod,
//       useWallet = false 
//     } = req.body;

//     console.log('📦 Direct order creation for user:', userId);

//     if (!userId) {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'User ID is required' 
//       });
//     }

//     if (!products || products.length === 0) {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'Products are required' 
//       });
//     }

//     const user = await Registration.findById(userId);
//     if (!user) {
//       return res.status(404).json({ 
//         success: false, 
//         error: 'User not found' 
//       });
//     }

//     const subtotal = products.reduce((total, item) => total + (item.price * item.quantity), 0);
//     const tax = subtotal * 0.08;
//     const shipping = subtotal > 499 ? 0 : 5.99;
//     const totalAmount = subtotal + tax + shipping;

//     const timestamp = Date.now();
//     const orderData = {
//       orderId: `ORD${timestamp}`,
//       user: userId,
//       customerId: user.customerId,
//       customerName: user.name,
//       customerPhone: user.phoneNumber,
//       customerEmail: user.email || '',
//       customerAddress: user.address,
//       products: products.map(item => ({
//         productId: item._id,
//         name: item.name,
//         price: item.price,
//         quantity: item.quantity,
//         images: item.images || [],
//         category: item.category || 'General'
//       })),
//       totalAmount,
//       subtotal,
//       tax,
//       shipping,
//       deliveryAddress: deliveryAddress || {
//         name: user.name,
//         phone: user.phoneNumber,
//         addressLine1: user.address,
//         city: 'City',
//         state: 'State', 
//         pincode: '000000',
//         country: 'India'
//       },
//       paymentMethod: useWallet ? 'wallet' : paymentMethod,
//       status: 'order_confirmed'
//     };

//     console.log('💾 Saving order directly...');
//     const order = new Order(orderData);
//     await order.save();

//     console.log('✅ DIRECT ORDER CREATED SUCCESSFULLY!');
    
//     res.status(201).json({
//       success: true,
//       message: 'Order placed successfully (direct)',
//       data: {
//         orderId: order.orderId,
//         totalAmount: order.totalAmount,
//         status: order.status,
//         orderDate: order.orderDate
//       }
//     });

//   } catch (error) {
//     console.error('❌ Direct order creation failed:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Failed to create order',
//       details: error.message 
//     });
//   }
// });

// // ✅ ADMIN DEBUG MODEL
// app.get('/api/admin/debug-model', async (req, res) => {
//   try {
//     const AdminUser = require('./models/adminUser');
    
//     console.log('🔍 AdminUser model type:', typeof AdminUser);
    
//     const adminCount = await AdminUser.countDocuments();
    
//     res.json({
//       success: true,
//       modelType: typeof AdminUser,
//       adminCount: adminCount,
//       isModel: AdminUser && typeof AdminUser === 'function',
//       hasFindOne: typeof AdminUser.findOne === 'function'
//     });
//   } catch (error) {
//     console.error('❌ Debug model error:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       stack: error.stack
//     });
//   }
// });



// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, 'uploads/drivers/');
//   },
//   filename: function (req, file, cb) {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
//   }
// });

// const upload = multer({ 
//   storage: storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024 // 5MB limit
//   }
// });

// // Add this middleware before your routes
// app.use('/api/admin/drivers/create', upload.single('licenseFiles'), (req, res) => {
//   try {
//     console.log('🚗 Driver creation route hit');
//     console.log('🚗 Request files:', req.files);
    
//     // Create a new object to hold all form data
//     const driverData = {};
    
//     // Copy all non-file fields from req.body
//     Object.keys(req.body).forEach(key => {
//       if (key !== 'licenseFiles') {
//         driverData[key] = req.body[key];
//       }
//     });
    
//     // Add file information
//     if (req.files && req.files.licenseFiles) {
//       driverData.licenseFiles = req.files.licenseFiles;
//     }
    
//     if (req.files && req.files.aadhaarFiles) {
//       driverData.aadhaarFiles = req.files.aadhaarFiles;
//     }
    
//     if (req.files && req.files.panFiles) {
//       driverData.panFiles = req.files.panFiles;
//     }
    
//     if (req.files && req.files.rcFiles) {
//       driverData.rcFiles = req.files.rcFiles;
//     }
    
//     if (req.files && req.files.bankFile) {
//       driverData.bankFile = req.files.bankFile;
//     }
    
//     console.log('🚗 Driver data after processing:', driverData);
    
//     const { createDriver } = require('./controllers/driver/driverController');
//     await createDriver(req, res);
//   } catch (error) {
//     console.error('❌ Error in driver creation route:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: error.message 
//     });
//   }
// });

// // Update the direct driver creation route
// app.post('/api/admin/drivers/create', async (req, res) => {
//   try {
//     console.log('🚗 Direct driver creation route hit');
//     const { createDriver } = require('./controllers/driver/driverController');
//     await createDriver(req, res);
//   } catch (error) {
//     console.error('❌ Error in direct driver creation route:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: error.message 
//     });
//   }
// });

// // ✅ FIXED DIRECT ADMIN REGISTRATION
// app.post('/api/admin/direct-register', async (req, res) => {
//   try {
//     console.log('🚀 Direct register attempt');
    
//     const mongoose = require('mongoose');
//     const bcrypt = require('bcrypt');
    
//     const { username, password, role = 'superadmin', email } = req.body;
    
//     if (!username || !password) {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'Username and password required' 
//       });
//     }
    
//     // ✅ FIXED: Define schema inline if model doesn't exist
//     let AdminUser;
//     try {
//       AdminUser = mongoose.model('AdminUser');
//     } catch (error) {
//       // Model not registered, create it
//       const adminUserSchema = new mongoose.Schema({
//         username: { type: String, required: true, unique: true },
//         email: { type: String, required: false, unique: false },
//         passwordHash: { type: String, required: true },
//         role: { type: String, enum: ['admin', 'manager', 'superadmin'], default: 'admin' }
//       }, { timestamps: true });
      
//       adminUserSchema.methods.validatePassword = async function(password) {
//         return bcrypt.compare(password, this.passwordHash);
//       };
      
//       AdminUser = mongoose.model('AdminUser', adminUserSchema);
//     }
    
//     const existingAdmin = await AdminUser.findOne({ 
//       $or: [
//         { username },
//         ...(email ? [{ email }] : [])
//       ]
//     });
    
//     if (existingAdmin) {
//       return res.json({ 
//         success: true, 
//         message: 'Admin already exists',
//         username: existingAdmin.username,
//         email: existingAdmin.email
//       });
//     }
    
//     const admin = new AdminUser({
//       username,
//       email: email || username,
//       role
//     });
    
//     const salt = await bcrypt.genSalt(10);
//     admin.passwordHash = await bcrypt.hash(password, salt);
    
//     await admin.save();
    
//     console.log('✅ Direct admin registration successful');
    
//     res.json({
//       success: true,
//       message: 'Admin registered successfully (direct)',
//       username,
//       email: admin.email,
//       role
//     });
    
//   } catch (error) {
//     console.error('❌ Direct register error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: error.message,
//       code: error.code
//     });
//   }
// });



// // ✅ FIXED ADMIN LOGIN ROUTE
// app.post('/api/admin/login', async (req, res) => {
//   try {
//     const { email, password } = req.body;
    
//     console.log('🔐 Admin login attempt:', { email });
    
//     if (!email || !password) {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'Email and password are required' 
//       });
//     }
    
//     // ✅ FIXED: Import mongoose properly
//     const mongoose = require('mongoose');
    
//     // Get or create AdminUser model
//     let AdminUser;
//     try {
//       AdminUser = mongoose.model('AdminUser');
//     } catch (error) {
//       const adminUserSchema = new mongoose.Schema({
//         username: { type: String, required: true, unique: true },
//         email: { type: String, required: false, unique: false },
//         passwordHash: { type: String, required: true },
//         role: { type: String, enum: ['admin', 'manager', 'superadmin'], default: 'admin' }
//       }, { timestamps: true });
      
//       const bcrypt = require('bcrypt');
//       adminUserSchema.methods.validatePassword = async function(password) {
//         return bcrypt.compare(password, this.passwordHash);
//       };
      
//       AdminUser = mongoose.model('AdminUser', adminUserSchema);
//     }
    
//     // Find admin by email
//     const admin = await AdminUser.findOne({ email });
//     if (!admin) {
//       console.log('❌ Admin not found:', email);
//       return res.status(401).json({ 
//         success: false, 
//         error: 'Invalid credentials' 
//       });
//     }
    
//     // Validate password
//     const isValidPassword = await admin.validatePassword(password);
//     if (!isValidPassword) {
//       console.log('❌ Invalid password for:', email);
//       return res.status(401).json({ 
//         success: false, 
//         error: 'Invalid credentials' 
//       });
//     }
    
//     // Generate JWT token
//     const jwt = require('jsonwebtoken');
//     const token = jwt.sign(
//       { id: admin._id, role: admin.role },
//       process.env.JWT_SECRET || 'secret',
//       { expiresIn: '7d' }
//     );
    
//     console.log('✅ Admin login successful:', email);
    
//     res.json({
//       success: true,
//       message: 'Login successful',
//       token,
//       admin: {
//         id: admin._id,
//         username: admin.username,
//         email: admin.email,
//         role: admin.role
//       }
//     });
    
//   } catch (error) {
//     console.error('Admin login error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Login failed',
//       details: error.message 
//     });
//   }
// });




// // ✅ ROOT & HEALTH
// app.get("/", (req, res) => {
//   res.json({ 
//     message: "Taxi + Grocery App API Running", 
//     uptime: process.uptime(), 
//     timestamp: new Date().toISOString(),
//     endpoints: {
//       orders: {
//         test: "/api/orders/test-connection",
//         admin: "/api/orders/admin/orders",
//         stats: "/api/orders/admin/order-stats"
//       }
//     }
//   });
// });

// // ✅ ERROR HANDLER
// app.use((err, req, res, next) => {
//   console.error("Unhandled Error:", err);
//   res.status(err.status || 500).json({
//     error: { 
//       message: err.message || "Internal Server Error",
//       ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
//     }
//   });
// });

// // ✅ EXPORT
// module.exports = app;