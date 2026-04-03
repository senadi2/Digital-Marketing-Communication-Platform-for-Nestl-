const bcrypt = require("bcrypt");
const { getDb } = require("./firebase");

const seedUsers = [
    {
        username: "manager@mmnestle.com",
        password: "manager123",
        role: "MarketingManager"
    },
    {
        username: "brandmanager@bmnestle.com",
        password: "brandmanager123",
        role: "BrandManager"
    }
];

async function seed() {
    const db = getDb();
    let createdCount = 0;

    for (const user of seedUsers) {
        const existingUserSnapshot = await db.collection("users").where("username", "==", user.username).limit(1).get();
        if (!existingUserSnapshot.empty) {
            console.log(`Seed user already exists: ${user.username}`);
            continue;
        }

        const hashedPassword = await bcrypt.hash(user.password, 10);
        const timestamp = new Date().toISOString();

        await db.collection("users").add({
            username: user.username,
            password: hashedPassword,
            role: user.role,
            agencyId: null,
            createdAt: timestamp,
            updatedAt: timestamp
        });

        createdCount += 1;
        console.log(`Seed user added: ${user.username}`);
    }

    if (!createdCount) {
        console.log("No new seed users were added.");
    }
}

seed().catch((err) => {
    console.error("Seed failed:", err.message || err);
    process.exitCode = 1;
});
