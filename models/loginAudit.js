const mongoose = require("mongoose");

const loginAuditSchema = new mongoose.Schema(
    {
        username: { type: String, default: "" },
        ip: { type: String, default: "" },
        attempts: { type: Number, required: true, default: 0 },
        eventType: { type: String, required: true, default: "failed_login_threshold" }
    },
    { timestamps: true }
);

module.exports = mongoose.model("LoginAudit", loginAuditSchema);
