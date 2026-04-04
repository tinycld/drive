// deno-lint-ignore-file
/* eslint-disable */
// biome-ignore: needed import
import type { OneRouter } from 'one'

declare module 'one' {
  export namespace OneRouter {
    export interface __routes<T extends string = string> extends Record<string, unknown> {
      StaticRoutes: 
        | `/`
        | `/_sitemap`
        | `/app`
        | `/app/contacts`
        | `/app/contacts/`
        | `/app/contacts/new`
        | `/tabs`
        | `/tabs/`
        | `/tabs/profile`
        | `/tabs/settings`
        | `/test`
      DynamicRoutes: `/app/contacts/${OneRouter.SingleRoutePart<T>}`
      DynamicRouteTemplate: `/app/contacts/[id]`
      IsTyped: true
      RouteTypes: {
        '/app/contacts/[id]': RouteInfo<{ id: string }>
      }
    }
  }
}

/**
 * Helper type for route information
 */
type RouteInfo<Params = Record<string, never>> = {
  Params: Params
  LoaderProps: { path: string; search?: string; subdomain?: string; params: Params; request?: Request }
}