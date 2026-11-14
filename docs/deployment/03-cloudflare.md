# 3. Cloudflare settings

Cloudflare sits in front of the server. It answers DNS for the domain, gives the visitor TLS, keeps copies of the page files, and blocks attacks. The menu names are from Cloudflare's documentation on 2026-11-12. Cloudflare can move them.

## Procedure

1. Add a DNS record for the game, and set it to "Proxied" (the orange cloud). Cloudflare then answers DNS with its own addresses, and the server's address stays hidden ([Proxy status](https://developers.cloudflare.com/dns/proxy-status/)).

   | Type | Name | Content | Proxy status |
   |------|------|---------|--------------|
   | A | `game` (for `game.example.com`) | `203.0.113.10` | Proxied |

   If the server has a public IPv6 address, add an `AAAA` record with the same settings.

2. Go to **SSL/TLS** > **Overview**, and set the encryption mode to **Full (strict)**. In this mode Cloudflare accepts the origin certificate only when it is valid, unexpired, issued by a public authority or by Cloudflare's Origin CA, and names the host ([Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)).

3. Go to **SSL/TLS** > **Origin Server** > **Origin Certificates**, and select **Create Certificate**. Keep "Generate private key and CSR with Cloudflare". Make sure that the host list includes `game.example.com`. Select **Create**. Copy the certificate and the private key into two files on your computer, because Cloudflare does not show the key again ([Origin CA certificates](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)). Continue with `02-first-deploy.md`, section E, step 2.

   Note: Only Cloudflare trusts an Origin CA certificate. If you set the record to "DNS only" or pause Cloudflare, browsers show a certificate error.

4. Go to **SSL/TLS** > **Edge Certificates**, and turn on **Always Use HTTPS**. Cloudflare then sends every `http://` visitor to `https://` ([Always Use HTTPS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/)).

5. Go to **Caching** > **Cache Rules**, and select **Create rule** ([Create a cache rule](https://developers.cloudflare.com/cache/how-to/cache-rules/create-dashboard/)).
   1. Set **Rule name** to `API bypass`.
   2. Select **Custom filter expression**, and enter this expression with **Edit expression**:

      ```
      starts_with(http.request.uri.path, "/api/")
      ```

   3. Under **Cache eligibility**, select **Bypass cache**.
   4. Select **Deploy**.

   Note: Cloudflare does not keep HTML or JSON by default, and it obeys the server's `Cache-Control` ([Default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)). The server sends `Cache-Control: public, max-age=31536000, immutable` for `/assets/*` and `no-cache` for `index.html` (`apps/server/src/static.ts`). The rule makes sure that a later rule never keeps an API answer or the event stream.

6. Make sure that the settings in the next table are off.

## Settings that must stay off

| Setting | Why | Source |
|---------|-----|--------|
| **Rocket Loader** (Speed > Optimization) | It changes how the page loads its JavaScript. Cloudflare tells you to turn it off when scripts fail. The client is one JavaScript module, so the page can stay empty. | [Rocket Loader](https://developers.cloudflare.com/speed/optimization/content/rocket-loader/) |
| **Bot Fight Mode** (Security > Bots) | It "may challenge API or mobile app traffic", and no rule can skip it. A challenged `/api/` request or event stream fails in the game. | [Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/) |
| **I'm Under Attack Mode**, and any rule that challenges `/api/*` | Inference, not from a Cloudflare page: a challenge answers with an HTML page, and the game's `fetch` calls and event stream cannot show or solve it. | none |
| A cache rule that makes HTML or `/api/*` "Eligible for cache" | Inference: an update removes the old `/assets/*` files, so a kept old `index.html` loads files that do not exist. A kept API answer shows another player's state. | none |

## Event streams and timeouts

Each player holds one event stream (`GET /api/arenas/<CODE>/events`, `text/event-stream`). Cloudflare closes a connection when the server sends nothing for 125 seconds and shows error 524. Only Enterprise plans can change this time ([Connection limits](https://developers.cloudflare.com/fundamentals/reference/connection-limits/), [Error 524](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/), both read on 2026-11-12). Older pages and other sources give 100 seconds.

The server sends the comment `: keep-alive` on each stream every 15 seconds (`DEFAULT_HEARTBEAT_MS` in `apps/server/src/server.ts`, `HEARTBEAT` in `apps/server/src/stream.ts`). The stream is therefore never silent long enough for either limit.

Caddy sends a `text/event-stream` answer to the client at once, without a setting ([reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), `flush_interval`).

Cloudflare has a "response body buffering" setting in Configuration Rules. Its default, "Standard", lets Cloudflare inspect the start of a response body ([changelog, 2026-01-27](https://developers.cloudflare.com/changelog/post/2026-01-27-body-buffering-settings/)). The page does not say how "Standard" treats an event stream. If turns arrive in bursts instead of one by one, add a Configuration Rule for `/api/arenas/*/events` with response body buffering "None". That setting turns off WAF inspection for those requests.

## The visitor's address

Cloudflare sends the visitor's address to the server in `CF-Connecting-IP`. When the visitor sends their own `X-Forwarded-For`, Cloudflare adds its value to the end of that header ([Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/)). The first entry is then text that the visitor chose. `deploy/Caddyfile` therefore replaces `X-Forwarded-For` with `CF-Connecting-IP`, and only for requests from Cloudflare's address ranges. Cloudflare's own Caddy example uses the same header ([Restoring original visitor IPs](https://developers.cloudflare.com/support/troubleshooting/restoring-visitor-ips/restoring-original-visitor-ips/)). `02-first-deploy.md`, steps H7 to H10, checks it on the live server.
