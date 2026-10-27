import {
    GoogleSignin,
    isErrorWithCode,
    statusCodes,
} from '@react-native-google-signin/google-signin';

import {
    GoogleAuthProvider,
    signInWithCredential,
    signOut as firebaseSignOut,
} from 'firebase/auth';

import { auth } from './firebaseConfig';

// Ganti dengan Web Client ID milik project DuwekKu.
GoogleSignin.configure({
    webClientId: '849122642446-n81gn1uhfgcp1eplgs635ul9qfroikkk.apps.googleusercontent.com',
});

export async function loginDenganGoogle() {
    try {
        await GoogleSignin.hasPlayServices();

        const response = await GoogleSignin.signIn();

        if (response.type !== 'success') {
            return null;
        }

        const idToken = response.data.idToken;

        if (!idToken) {
            throw new Error('ID Token Google tidak ditemukan.');
        }

        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);

        return result.user;
    } catch (error) {
        if (
            isErrorWithCode(error) &&
            error.code === statusCodes.SIGN_IN_CANCELLED
        ) {
            return null;
        }

        throw error;
    }
}

export async function logoutDuwekKu() {
    await firebaseSignOut(auth);
    await GoogleSignin.signOut();
}