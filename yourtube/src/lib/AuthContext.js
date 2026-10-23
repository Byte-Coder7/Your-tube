import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { useState } from "react";
import { createContext } from "react";
import { provider, auth } from "./firebase";
import axiosInstance from "./axiosinstance";
import { useEffect, useContext } from "react";

const UserContext = createContext();
const pendingSignIns = new Map();
provider.setCustomParameters({ prompt: "select_account" });

const getDeviceId = () => {
  let deviceId = localStorage.getItem("yourtube-device-id");
  if (!deviceId) {
    const randomBytes = new Uint8Array(32);
    window.crypto.getRandomValues(randomBytes);
    deviceId = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("yourtube-device-id", deviceId);
  }
  return deviceId;
};

const getFirebaseHeaders = async (firebaseUser) => ({
  Authorization: `Bearer ${await firebaseUser.getIdToken()}`,
});

const getAutoTheme = () => {
  const hour = Number(new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    hourCycle: "h23",
  }).format(new Date()));
  return hour >= 10 && hour < 12 ? "light" : "dark";
};

const getSignInResponse = (firebaseUser) => {
  const existingRequest = pendingSignIns.get(firebaseUser.uid);
  if (existingRequest) return existingRequest;
  const request = (async () => {
    const headers = await getFirebaseHeaders(firebaseUser);
    return axiosInstance.post("/user/login", {
      deviceId: getDeviceId(),
    }, { headers });
  })().finally(() => pendingSignIns.delete(firebaseUser.uid));
  pendingSignIns.set(firebaseUser.uid, request);
  return request;
};

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [pendingVerification, setPendingVerification] = useState(null);
  const [authError, setAuthError] = useState("");
  const [themeMode, setThemeModeState] = useState("auto");
  const [resolvedTheme, setResolvedTheme] = useState("light");

  const login = (userdata) => {
    setUser(userdata);
    if (userdata?.themeMode) {
      setThemeModeState(userdata.themeMode);
      localStorage.setItem("yourtube-theme-mode", userdata.themeMode);
    }
  };

  const completeLogin = (response) => {
    setUser(response.data.result);
    setPendingVerification(null);
    setAuthError("");
    const preference = response.data.result.themeMode || "auto";
    setThemeModeState(preference);
    localStorage.setItem("yourtube-theme-mode", preference);
  };

  const applyLoginResponse = (response) => {
    if (response.data.requiresOtp) {
      setUser(null);
      setPendingVerification({
        challengeId: response.data.challengeId,
        email: response.data.email,
      });
      return;
    }
    completeLogin(response);
  };

  const logout = async () => {
    setUser(null);
    setPendingVerification(null);
    try {
      await axiosInstance.post("/user/logout");
      await signOut(auth);
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  };
  const handlegooglesignin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      applyLoginResponse(await getSignInResponse(result.user));
    } catch (error) {
      const firebaseMessages = {
        "auth/unauthorized-domain": "This address is not authorized for Google sign-in. Open the app at http://localhost:3000 or add this hostname to Firebase Authentication's authorized domains.",
        "auth/operation-not-allowed": "Google sign-in is disabled for this Firebase project. Enable the Google provider in Firebase Authentication.",
        "auth/popup-blocked": "The browser blocked the Google sign-in popup. Allow popups for this site and try again.",
        "auth/popup-closed-by-user": "The Google sign-in window closed before authentication finished. Try again.",
        "auth/network-request-failed": "Firebase could not reach Google sign-in. Check your network and try again.",
      };
      setAuthError(firebaseMessages[error.code] || error.response?.data?.message || error.message || "Google sign-in could not be completed.");
    }
  };

  const verifyOtp = async (code) => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !pendingVerification) throw new Error("Please sign in again to verify this device.");
    const response = await axiosInstance.post("/user/otp/verify", {
      challengeId: pendingVerification.challengeId,
      code,
      deviceId: getDeviceId(),
    }, { headers: await getFirebaseHeaders(firebaseUser) });
    completeLogin(response);
  };

  const resendOtp = async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !pendingVerification) throw new Error("Please sign in again to request another code.");
    const response = await axiosInstance.post("/user/otp/resend", {
      challengeId: pendingVerification.challengeId,
      deviceId: getDeviceId(),
    }, { headers: await getFirebaseHeaders(firebaseUser) });
    return response.data.message;
  };

  const setThemeMode = async (nextMode) => {
    setThemeModeState(nextMode);
    localStorage.setItem("yourtube-theme-mode", nextMode);
    if (user) {
      try {
        await axiosInstance.patch("/user/theme", { themeMode: nextMode });
        setUser((currentUser) => currentUser ? { ...currentUser, themeMode: nextMode } : currentUser);
      } catch (error) {
        setAuthError(error.response?.data?.message || "Theme preference could not be saved.");
      }
    }
  };

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setPendingVerification(null);
        return;
      }
      try {
        const response = await getSignInResponse(firebaseUser);
        if (active) applyLoginResponse(response);
      } catch (error) {
        if (active) {
          setUser(null);
          setAuthError(error.response?.data?.message || "Sign-in verification could not be started.");
        }
      }
    });
    const savedTheme = localStorage.getItem("yourtube-theme-mode");
    if (["auto", "light", "dark"].includes(savedTheme)) setThemeModeState(savedTheme);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const updateResolvedTheme = () => {
      setResolvedTheme(themeMode === "auto" ? getAutoTheme() : themeMode);
    };
    updateResolvedTheme();
    const interval = window.setInterval(updateResolvedTheme, 60 * 1000);
    return () => window.clearInterval(interval);
  }, [themeMode]);

  return (
    <UserContext.Provider value={{
      user,
      login,
      logout,
      handlegooglesignin,
      pendingVerification,
      verifyOtp,
      resendOtp,
      authError,
      clearAuthError: () => setAuthError(""),
      themeMode,
      resolvedTheme,
      setThemeMode,
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
