const mongoose = require("mongoose");

const agencySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        username: { type: String, required: true, trim: true },
        contactPerson: { type: String, required: true, trim: true },
        phoneNumber: { type: String, default: "" },
        description: { type: String, default: "" },
        imageUrl: { type: String, default: "" }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Agency", agencySchema);
