// A small router: a route is a method and a path with :name segments.

export interface RouteContext {
  readonly req: Request;
  /** Parsed once, where the request enters. */
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly server: Bun.Server<undefined>;
}

export type Handler = (ctx: RouteContext) => Response | Promise<Response>;

interface Route {
  readonly method: string;
  readonly pattern: RegExp;
  readonly paramNames: readonly string[];
  readonly handler: Handler;
}

export type Match =
  | { readonly kind: "found"; readonly handler: Handler; readonly params: Readonly<Record<string, string>> }
  | { readonly kind: "wrongMethod"; readonly allow: readonly string[] }
  | { readonly kind: "none" };

export class Router {
  private readonly routes: Route[] = [];

  add(method: string, path: string, handler: Handler): void {
    const paramNames: string[] = [];
    const source = path.replace(/:(\w+)/g, (_, name: string) => {
      paramNames.push(name);
      return "([^/]+)";
    });
    this.routes.push({ method, pattern: new RegExp(`^${source}$`), paramNames, handler });
  }

  match(method: string, pathname: string): Match {
    const allow: string[] = [];
    for (const route of this.routes) {
      const found = route.pattern.exec(pathname);
      if (found === null) continue;
      if (route.method !== method) {
        allow.push(route.method);
        continue;
      }
      const params: Record<string, string> = {};
      for (const [i, name] of route.paramNames.entries()) {
        const value = found[i + 1];
        if (value === undefined) throw new Error(`Route ${route.method} ${route.pattern} has no value for :${name}.`);
        params[name] = value;
      }
      return { kind: "found", handler: route.handler, params };
    }
    return allow.length > 0 ? { kind: "wrongMethod", allow } : { kind: "none" };
  }
}
