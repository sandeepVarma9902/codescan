import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.codescan.mobile",
  appName: "CodeScan",
  webDir: "dist",
  server: {
    androidScheme: "https"
  },
  plugins: {
    // Capacitor plugins config
    Filesystem: {
      iosScheme: "capacitor"
    }
  }
};

export default config;
