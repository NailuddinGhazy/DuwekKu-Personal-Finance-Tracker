import { initializeApp, getApp, getApps } from 'firebase/app';
import {
    initializeAuth,
    getAuth,
    getReactNativePersistence,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDbnNXSJEv3GDMUp1wfwvdraF3pPifG0uQ",
    authDomain: "duwekku-ed5eb.firebaseapp.com",
    projectId: "duwekku-ed5eb",
    storageBucket: "duwekku-ed5eb.firebasestorage.app",
    messagingSenderId: "849122642446",
    appId: "1:849122642446:web:dffaf073c85837451f4a5f",
    measurementId: "G-Y0RHXLGJWB"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;

try {
    auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
    });
} catch (error) {
    if (error?.code !== 'auth/already-initialized') {
        throw error;
    }

    auth = getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };