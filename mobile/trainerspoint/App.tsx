import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClientPreview } from "./src/preview/ClientPreview";
import { WelcomeScreen } from "./src/screens/WelcomeScreen";
import AccountApp from "./src/AccountApp";

export default function App() {
  const [screen, setScreen] = useState<"welcome" | "account" | "demo">("welcome");
  return <SafeAreaProvider><StatusBar style="dark" />
    {screen === "welcome" && <WelcomeScreen onLogin={() => setScreen("account")} onDemo={() => setScreen("demo")} />}
    {screen === "account" && <AccountApp onBack={() => setScreen("welcome")} />}
    {screen === "demo" && <ClientPreview onExit={() => setScreen("welcome")} />}
  </SafeAreaProvider>;
}
