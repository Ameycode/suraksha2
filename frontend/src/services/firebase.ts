
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, onValue, set, update, push, runTransaction, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCf3O1HMf5cQdqNxkGOnrzkoA1EyZPn5eU",
  authDomain: "rakshak-fe4b7.firebaseapp.com",
  databaseURL: "https://rakshak-fe4b7-default-rtdb.firebaseio.com",
  projectId: "rakshak-fe4b7",
  storageBucket: "rakshak-fe4b7.firebasestorage.app",
  messagingSenderId: "544603352364",
  appId: "1:544603352364:web:31000f971f42793bee5089"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

export { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged, 
  signOut,
  ref, 
  onValue, 
  set, 
  get,
  update, 
  push, 
  runTransaction
};
