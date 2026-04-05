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
        | `/a/[orgSlug]/contacts`
        | `/a/[orgSlug]/contacts/`
        | `/a/[orgSlug]/contacts/new`
        | `/a/[orgSlug]/mail`
        | `/a/[orgSlug]/mail/`
        | `/a/[orgSlug]/settings`
        | `/a/[orgSlug]/settings/`
        | `/a/[orgSlug]/settings/members`
        | `/a/[orgSlug]/settings/organization`
        | `/a/[orgSlug]/settings/profile`
        | `/tabs`
        | `/tabs/`
        | `/tabs/profile`
        | `/tabs/settings`
        | `/test`
      DynamicRoutes: 
        | `/a/${OneRouter.SingleRoutePart<T>}`
        | `/a/${OneRouter.SingleRoutePart<T>}/contacts/${OneRouter.SingleRoutePart<T>}`
        | `/a/${OneRouter.SingleRoutePart<T>}/mail/${OneRouter.SingleRoutePart<T>}`
        | `/a/${OneRouter.SingleRoutePart<T>}/settings/${string}`
      DynamicRouteTemplate: 
        | `/a/[orgSlug]`
        | `/a/[orgSlug]/contacts/[id]`
        | `/a/[orgSlug]/mail/[id]`
        | `/a/[orgSlug]/settings/[...section]`
      IsTyped: true
      RouteTypes: {
        '/a/[orgSlug]': RouteInfo<{ orgSlug: string }>
        '/a/[orgSlug]/contacts/[id]': RouteInfo<{ orgSlug: string; id: string }>
        '/a/[orgSlug]/mail/[id]': RouteInfo<{ orgSlug: string; id: string }>
        '/a/[orgSlug]/settings/[...section]': RouteInfo<{ orgSlug: string; section: string[] }>
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