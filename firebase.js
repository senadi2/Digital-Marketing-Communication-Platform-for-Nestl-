require("dotenv").config();

const path = require("path");
const { cert, getApps, initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

function buildFirebaseOptions() {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    const options = {};

    if (serviceAccountJson) {
        options.credential = cert(JSON.parse(serviceAccountJson));
    } else if (serviceAccountPath) {
        const resolvedPath = path.resolve(serviceAccountPath);
        options.credential = cert(require(resolvedPath));
    } else {
        options.credential = applicationDefault();
    }

    if (projectId) {
        options.projectId = projectId;
    }

    return options;
}

function getDb() {
    if (!getApps().length) {
        initializeApp(buildFirebaseOptions());
    }

    return getFirestore();
}

module.exports = { getDb };
