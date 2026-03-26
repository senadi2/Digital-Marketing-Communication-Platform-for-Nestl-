const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        targetAudience: { type: String, default: "" },
        budgetRange: { type: String, default: "" },
        startDate: { type: String, default: "" },
        endDate: { type: String, default: "" },
        description: { type: String, default: "" },
        objectives: { type: String, default: "" },
        attachments: [
            {
                fileName: { type: String, default: "" },
                mimeType: { type: String, default: "" },
                size: { type: Number, default: 0 },
                dataBase64: { type: String, default: "" }
            }
        ],
        agencyId: { type: String, required: true },
        mmId: { type: String, required: true },
        status: {
            type: String,
            enum: ["Pending", "Accepted", "Decline"],
            default: "Pending"
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Campaign", campaignSchema);
