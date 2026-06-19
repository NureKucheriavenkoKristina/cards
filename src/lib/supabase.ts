import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const storage = Platform.OS === "web" ? undefined : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    // Persist session on both web and native
    persistSession: true,
    autoRefreshToken: true,
    // On web, detect session from URL (e.g. magic links)
    detectSessionInUrl: Platform.OS === "web",
  },
});
