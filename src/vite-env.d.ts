/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
  readonly VITE_VAULT_ADDRESS?: string;
  readonly VITE_PROXY_ADDRESSES?: string;
  readonly VITE_CHAIN?: string;
  readonly VITE_TIMELOCK_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
