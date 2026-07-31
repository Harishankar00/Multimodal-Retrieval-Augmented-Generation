import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB2YW1N7I4vVTk6gNC3cxr2Ok_0Sus2BoM",
  authDomain: "multimodel-rag-project.firebaseapp.com",
  projectId: "multimodel-rag-project",
  storageBucket: "multimodel-rag-project.firebasestorage.app",
  messagingSenderId: "277672926588",
  appId: "1:277672926588:web:f5579003bd14d71287d8f9",
  measurementId: "G-H3WNH4Q9MY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth and Firestore database
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
