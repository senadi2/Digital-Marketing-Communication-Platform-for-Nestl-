const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("./models/user");

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log("MongoDB Error:", err));


async function seed() {

    const hashedPassword = await bcrypt.hash("Manager@123", 10);

    await User.create({
        username: "manager@mmnestle.com",
        password: hashedPassword,
        role: "MarketingManager"
    });

    console.log("Seed data added!");
    mongoose.connection.close();
}

seed();
