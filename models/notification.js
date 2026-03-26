const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true },
        fromUserId: { type: String, default: "" },
        type: { type: String, default: "general" },
        message: { type: String, required: true },
        campaignId: { type: String, default: "" },
        campaignTitle: { type: String, default: "" },
        status: { type: String, default: "" },
        read: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
