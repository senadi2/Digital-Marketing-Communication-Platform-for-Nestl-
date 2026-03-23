const mongoose = require("mongoose");

const agencySchema = new mongoose.Schema({
    name: String,
    email: String,
    username: String,
    contactPerson: String
});

module.exports = mongoose.model("Agency", agencySchema);