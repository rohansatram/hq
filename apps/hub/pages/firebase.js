import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyBVo2cKLC123TYeGDUxm3J77C0NltqQL6Y",
  authDomain: "rohansatram-770ee.firebaseapp.com",
  projectId: "rohansatram-770ee",
  storageBucket: "rohansatram-770ee.firebasestorage.app",
  messagingSenderId: "257017993935",
  appId: "1:257017993935:web:4bd728bc8b284b80daf5ba",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
