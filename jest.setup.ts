(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { package: "com.cardly.app" },
      ios: { bundleIdentifier: "com.cardly.app" },
    },
  },
}));

jest.mock("react-native", () => ({
  Platform: { OS: "web" },
  AppState: {
    currentState: "active",
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock("react-native-url-polyfill/auto", () => ({}));

jest.mock("@/src/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
  },
}));
