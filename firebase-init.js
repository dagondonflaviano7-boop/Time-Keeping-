// js/firebase-init.js
// Firebase SDK initialization. Load after config.js and Firebase CDN scripts.

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const fbFunctions = firebase.functions();
