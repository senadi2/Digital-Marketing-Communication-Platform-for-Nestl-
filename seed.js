const bcrypt = require("bcrypt");
const { getDb } = require("./firebase");

async function seed() {
    const db = getDb();
    const username = "manager@mmnestle.com";
    const existingUserSnapshot = await db.collection("users").where("username", "==", username).limit(1).get();

    if (!existingUserSnapshot.empty) {
        console.log("Seed user already exists.");
        return;
    }

    const hashedPassword = await bcrypt.hash("manager123", 10);
    const timestamp = new Date().toISOString();

    await db.collection("users").add({
        username,
        password: hashedPassword,
        role: "MarketingManager",
        agencyId: null,
        createdAt: timestamp,
        updatedAt: timestamp
    });

    console.log("Seed data added!");
}

seed().catch((err) => {
    console.error("Seed failed:", err.message || err);
    process.exitCode = 1;
});
