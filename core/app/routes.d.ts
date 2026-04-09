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
        | `/a/[orgSlug]/calendar`
        | `/a/[orgSlug]/calendar/`
        | `/a/[orgSlug]/contacts`
        | `/a/[orgSlug]/contacts/`
        | `/a/[orgSlug]/contacts/new`
        | `/a/[orgSlug]/docs`
        | `/a/[orgSlug]/docs/`
        | `/a/[orgSlug]/docs/new`
        | `/a/[orgSlug]/drive`
        | `/a/[orgSlug]/drive/`
        | `/a/[orgSlug]/mail`
        | `/a/[orgSlug]/mail/`
        | `/a/[orgSlug]/settings`
        | `/a/[orgSlug]/settings/`
        | `/a/[orgSlug]/settings/members`
        | `/a/[orgSlug]/settings/notifications`
        | `/a/[orgSlug]/settings/organization`
        | `/a/[orgSlug]/settings/profile`
        | `/a/[orgSlug]/sheets`
        | `/a/[orgSlug]/sheets/`
        | `/tabs`
        | `/tabs/`
        | `/tabs/profile`
        | `/tabs/settings`
        | `/test`
      DynamicRoutes: 
        | `/a/${OneRouter.SingleRoutePart<T>}`
        | `/a/${OneRouter.SingleRoutePart<T>}/calendar/${OneRouter.SingleRoutePart<T>}`
        | `/a/${OneRouter.SingleRoutePart<T>}/contacts/${OneRouter.SingleRoutePart<T>}`
        | `/a/${OneRouter.SingleRoutePart<T>}/docs/${OneRouter.SingleRoutePart<T>}`
        | `/a/${OneRouter.SingleRoutePart<T>}/drive/${string}`
        | `/a/${OneRouter.SingleRoutePart<T>}/mail/${OneRouter.SingleRoutePart<T>}`
        | `/a/${OneRouter.SingleRoutePart<T>}/settings/${string}`
        | `/a/${OneRouter.SingleRoutePart<T>}/sheets/${OneRouter.SingleRoutePart<T>}`
      DynamicRouteTemplate: 
        | `/a/[orgSlug]`
        | `/a/[orgSlug]/calendar/[id]`
        | `/a/[orgSlug]/contacts/[id]`
        | `/a/[orgSlug]/docs/[id]`
        | `/a/[orgSlug]/drive/[...path]`
        | `/a/[orgSlug]/mail/[id]`
        | `/a/[orgSlug]/settings/[...section]`
        | `/a/[orgSlug]/sheets/[id]`
      IsTyped: true
      RouteTypes: {
        '/a/[orgSlug]': RouteInfo<{ orgSlug: string }>
        '/a/[orgSlug]/calendar/[id]': RouteInfo<{ orgSlug: string; id: string }>
        '/a/[orgSlug]/contacts/[id]': RouteInfo<{ orgSlug: string; id: string }>
        '/a/[orgSlug]/docs/[id]': RouteInfo<{ orgSlug: string; id: string }>
        '/a/[orgSlug]/drive/[...path]': RouteInfo<{ orgSlug: string; path: string[] }>
        '/a/[orgSlug]/mail/[id]': RouteInfo<{ orgSlug: string; id: string }>
        '/a/[orgSlug]/settings/[...section]': RouteInfo<{ orgSlug: string; section: string[] }>
        '/a/[orgSlug]/sheets/[id]': RouteInfo<{ orgSlug: string; id: string }>
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