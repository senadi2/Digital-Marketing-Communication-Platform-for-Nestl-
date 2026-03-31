const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("./models/user");

mongoose.connect("mongodb://127.0.0.1:27017/nestleDB")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

async function seed() {

    const hashedPassword = await bcrypt.hash("manager123", 10);

    await User.create({
        username: "manager@mmnestle.com",
        password: hashedPassword,
        role: "MarketingManager"
    });

    console.log("Seed data added!");
    mongoose.connection.close();
}

seed();
