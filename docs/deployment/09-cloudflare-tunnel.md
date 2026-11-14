# 9. The Cloudflare Tunnel alternative

A Cloudflare Tunnel suits a server that must not open ports 80 and 443. The program `cloudflared` on the server connects out to Cloudflare, and Cloudflare sends the visitors' requests back through that connection. The firewall then allows SSH only, and the server needs no origin certificate.

```
visitor --HTTPS--> Cloudflare ==tunnel==> cloudflared (server) --HTTP--> Caddy (127.0.0.1:8080) --HTTP--> Bun (127.0.0.1:3000)
```

Keep Caddy between `cloudflared` and the game server. Cloudflare adds to an `X-Forwarded-For` that the visitor sends, so without Caddy the first entry is text that the visitor chose, and the sign-in limits do not work. In this setup every request reaches Caddy from `cloudflared` on the same server, so Caddy trusts `127.0.0.1` and reads `CF-Connecting-IP`.

Cloudflare Tunnel buffers a response unless its type is `text/event-stream` ([Tunnel troubleshooting](https://developers.cloudflare.com/tunnel/troubleshooting/)). The event stream has that type, so it streams.

This page was tested on Ubuntu 24.04 with `cloudflared` 2026.11.0 on 14 November 2026, on a VPS that shares its public address with other customers (SSH on a forwarded port, no ports 80 and 443 of its own). A tunnel suits such a VPS, because it needs no inbound port.

## Procedure

Do sections A, C and D of `02-first-deploy.md`. Skip sections B, E and F, because this procedure replaces them. Do section G after step 10.

1. Allow SSH only, and enable the firewall.

   ```sh
   sudo ufw allow OpenSSH && sudo ufw default deny incoming && sudo ufw enable
   ```

2. Install `cloudflared` from Cloudflare's repository ([Create a locally-managed tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/local-management/create-local-tunnel/)).

   ```sh
   sudo mkdir -p --mode=0755 /usr/share/keyrings
   curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
   echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
   sudo apt-get update && sudo apt-get install -y cloudflared
   ```

3. Log in to Cloudflare. The command shows a link. Open it in a browser, and select the domain.

   ```sh
   sudo cloudflared tunnel login
   ```

   If the command still shows "Waiting for login..." after you authorize, the browser downloaded the certificate as `cert.pem` instead. Copy that file to the server, and stop the waiting command. Then delete the file on your computer, because it can make and route tunnels on your Cloudflare account.

   ```sh
   scp cert.pem root@203.0.113.10:/root/.cloudflared/cert.pem
   sudo chmod 600 /root/.cloudflared/cert.pem
   ```

4. Make the tunnel. The output shows the tunnel's ID and the path of its credentials file. Write both down.

   ```sh
   sudo cloudflared tunnel create algotank
   ```

5. Make the DNS record for the tunnel. If a record for `game.example.com` exists already, delete it in Cloudflare first.

   ```sh
   sudo cloudflared tunnel route dns algotank game.example.com
   ```

6. Write the tunnel's settings. Use the tunnel ID from step 4 in place of `<tunnel-id>`. The last rule answers 404 for any other host, and Cloudflare requires such a last rule ([Configuration file](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/local-management/configuration-file/)).

   ```sh
   sudo mkdir -p /etc/cloudflared && sudo tee /etc/cloudflared/config.yml >/dev/null <<'EOF'
   tunnel: <tunnel-id>
   credentials-file: /root/.cloudflared/<tunnel-id>.json
   ingress:
     - hostname: game.example.com
       service: http://127.0.0.1:8080
     - service: http_status:404
   EOF
   ```

7. Check the rules.

   ```sh
   sudo cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
   ```

8. Write the Caddyfile for the tunnel. Caddy listens on `127.0.0.1:8080` without TLS, trusts `cloudflared` on the same server, and sets the host to the domain, because `cloudflared` can send another `Host`. It also sends a visit over plain `http://` to `https://`, because the sign-in cookie works over HTTPS only. Cloudflare marks such a visit with `X-Forwarded-Proto: http`. This redirect works also when "Always Use HTTPS" in Cloudflare is off.

   ```sh
   sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
   {
   	servers {
   		trusted_proxies static 127.0.0.1/32 ::1/128
   		client_ip_headers CF-Connecting-IP
   	}
   }

   http://:8080 {
   	bind 127.0.0.1
   	log
   	@plainhttp header X-Forwarded-Proto http
   	redir @plainhttp https://game.example.com{uri} 308
   	reverse_proxy 127.0.0.1:3000 {
   		header_up X-Forwarded-For {client_ip}
   		header_up X-Forwarded-Host game.example.com
   	}
   }
   EOF
   ```

9. Check and load the Caddyfile.

   ```sh
   sudo -u caddy caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
   ```

10. Install `cloudflared` as a service that reads `/etc/cloudflared/config.yml`, and start it ([Run as a service on Linux](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/local-management/as-a-service/linux/)).

    ```sh
    sudo cloudflared --config /etc/cloudflared/config.yml service install
    sudo systemctl enable --now cloudflared
    ```

11. In Cloudflare, do steps 4 and 5 of `03-cloudflare.md`, and keep the settings in "Settings that must stay off" off. You do not need an Origin CA certificate.

12. Do the checks in `02-first-deploy.md`, section H, except step H5. Step H9 must show your own address, not `127.0.0.1`.

> **CAUTION:** In this setup any program on the server that connects to `127.0.0.1:8080` can choose its address with `CF-Connecting-IP`. Run no other public service on the server that forwards requests to that port.
