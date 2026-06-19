/**
 * IDE: TypeScript does not understand the `jsr:` specifier. The Edge runtime loads the package from JSR.
 * Types match `@supabase/supabase-js` in the repo root `node_modules`.
 */
declare module "jsr:@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}
