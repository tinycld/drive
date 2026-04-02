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
        | `/app/[orgSlug]/contacts`
        | `/app/[orgSlug]/contacts/`
        | `/app/[orgSlug]/contacts/new`
        | `/tabs`
        | `/tabs/`
        | `/tabs/profile`
        | `/tabs/settings`
        | `/test`
      DynamicRoutes: 
        | `/app/${OneRouter.SingleRoutePart<T>}`
        | `/app/${OneRouter.SingleRoutePart<T>}/contacts/${OneRouter.SingleRoutePart<T>}`
      DynamicRouteTemplate: 
        | `/app/[orgSlug]`
        | `/app/[orgSlug]/contacts/[id]`
      IsTyped: true
      RouteTypes: {
        '/app/[orgSlug]': RouteInfo<{ orgSlug: string }>
        '/app/[orgSlug]/contacts/[id]': RouteInfo<{ orgSlug: string; id: string }>
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