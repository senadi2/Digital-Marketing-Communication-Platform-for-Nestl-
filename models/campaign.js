const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema({
    title: String,
    objective: String,
    agencyId: String,
    status: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Campaign", campaignSchema);
