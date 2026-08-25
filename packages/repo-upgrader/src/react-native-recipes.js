export const NATIVE_RECIPES = {
  'native-primitives': { title: 'Native primitives', solution: 'Convert structural HTML to View/Text and interactive controls to Pressable, TextInput, Image, Link, or Picker.', packages: ['@react-native-picker/picker'] },
  'nativewind-styling': { title: 'NativeWind styling bridge', solution: 'Preserve className contracts with NativeWind and flag stylesheet rules that need token-by-token review.', packages: ['nativewind'], devPackages: ['tailwindcss'] },
  'async-storage': { title: 'Persistent storage adapter', solution: 'Replace localStorage/sessionStorage with an asynchronous AsyncStorage adapter.', packages: ['@react-native-async-storage/async-storage'] },
  'expo-linking': { title: 'Navigation and URL adapter', solution: 'Replace window.location and popup navigation with Expo Router and Expo Linking.', packages: ['expo-linking'] },
  'platform-adapter': { title: 'Platform boundary adapter', solution: 'Move window/document access behind a typed Platform adapter and implement native behavior per platform.', packages: [] },
  'gesture-handler': { title: 'Touch and gesture adapter', solution: 'Map mouse, drag, wheel, and context-menu behavior to press and gesture interactions.', packages: ['react-native-gesture-handler', 'react-native-reanimated'] },
  'expo-document-picker': { title: 'File selection adapter', solution: 'Replace browser file inputs with Expo Document Picker and FileSystem.', packages: ['expo-document-picker', 'expo-file-system'] },
  'expo-image': { title: 'Image and SVG adapter', solution: 'Use Expo Image for raster assets and react-native-svg for SVG components.', packages: ['expo-image', 'react-native-svg'] },
  'expo-location': { title: 'Location adapter', solution: 'Replace navigator.geolocation with Expo Location and explicit permissions.', packages: ['expo-location'] },
  'expo-notifications': { title: 'Notification adapter', solution: 'Replace browser notifications and service-worker delivery with Expo Notifications.', packages: ['expo-notifications'] },
  'expo-auth-session': { title: 'Authentication adapter', solution: 'Replace popup/cookie redirect flows with Expo AuthSession and SecureStore.', packages: ['expo-auth-session', 'expo-secure-store'] },
  'native-maps': { title: 'Native maps adapter', solution: 'Replace web map components with react-native-maps and platform API keys.', packages: ['react-native-maps'] },
  'native-charts': { title: 'Native chart adapter', solution: 'Replace DOM/canvas chart rendering with victory-native and react-native-svg.', packages: ['victory-native', 'react-native-svg'] },
  'native-paper': { title: 'Component-system adapter', solution: 'Replace Material UI or Ant Design components incrementally with React Native Paper.', packages: ['react-native-paper'] },
  'expo-router': { title: 'Expo Router navigation', solution: 'Map React Router paths and links to file-based Expo Router screens.', packages: ['expo-router'] },
  'manual-native-component': { title: 'Generated native component boundary', solution: 'Preserve the component contract, generate a review item, and replace the unsupported renderer behind a native component boundary.', packages: [] }
};

export function recipe(id) { return { id, ...NATIVE_RECIPES[id] }; }
