// /models/driver/driver.js

const mongoose = require("mongoose");

// Counter Collection for Driver ID
const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, default: 10000 }
});
const Counter = mongoose.model("DriverCounter", counterSchema);

const driverSchema = new mongoose.Schema(
  {
    driverId: { 
      type: String, 
      required: true, 
      unique: true,
      index: true
    },
    name: { type: String, required: true },
    phone: { 
      type: String, 
      required: true, 
      unique: true,
      index: true
    },
    email: { type: String, default: '' },
    dob: { type: Date, default: null },
    licenseNumber: { 
      type: String, 
      required: true, 
      unique: true,
      index: true
    },
    aadharNumber: { 
      type: String, 
      required: true, 
      unique: true,
      index: true
    },
    bankAccountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    licenseDocument: { type: String, default: '' },
    aadharDocument: { type: String, default: '' },
    status: { 
      type: String, 
      enum: ["Live", "Offline"], 
      default: "Offline" 
    },
    vehicleType: { type: String, required: true },
    vehicleNumber: { 
      type: String, 
      required: true, 
      unique: true,
      index: true
    },
    location: {
      type: { 
        type: String, 
        enum: ["Point"], 
        default: "Point" 
      },
      coordinates: { 
        type: [Number], 
        required: true 
      }
    },
    fcmToken: { type: String, default: null, index: true },
    fcmTokenUpdatedAt: { type: Date, default: null },
    platform: { type: String, enum: ["android", "ios"], default: "android" },
    notificationEnabled: { type: Boolean, default: true },
    active: { type: Boolean, default: false },
    totalPayment: { type: Number, default: 0 },
    settlement: { type: Number, default: 0 },
    hoursLive: { type: Number, default: 0 },
    dailyHours: { type: Number, default: 0 },
    dailyRides: { type: Number, default: 0 },
    totalRides: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    loginTime: { type: String, default: null },
    logoutTime: { type: String, default: null },
    earnings: { type: Number, default: 0 },
    wallet: { type: Number, default: 0 },
    otp: { type: String, default: null },
    otpExpiresAt: { type: Date, default: null },
    lastUpdate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Enable geo queries
driverSchema.index({ location: "2dsphere" });


// In driver.js, make sure this method is properly defined:
driverSchema.statics.generateDriverId = async function () {
  let counter = await Counter.findOne({ key: "driverId" });
  if (!counter) {
    counter = await Counter.create({ key: "driverId", value: 10000 });
  }
  counter.value += 1;
  await counter.save();
  return `dri${counter.value}`;
};


// Rating update
driverSchema.methods.updateRating = function (newRating) {
  this.totalRatings += 1;
  this.rating = (this.rating * (this.totalRatings - 1) + newRating) / this.totalRatings;
};

module.exports = mongoose.model("Driver", driverSchema);
