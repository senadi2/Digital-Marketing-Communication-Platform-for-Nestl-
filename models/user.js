const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    role: String // MarketingManager or Agency
});

module.exports = mongoose.model("User", userSchema);