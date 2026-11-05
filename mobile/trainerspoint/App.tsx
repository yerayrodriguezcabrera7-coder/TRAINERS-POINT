import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClientPreview } from "./src/preview/ClientPreview";

export default function App() {
  return <SafeAreaProvider><StatusBar style="dark" /><ClientPreview /></SafeAreaProvider>;
}
