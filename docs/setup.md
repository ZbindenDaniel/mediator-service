# Project setup

## Environment configuration

1. Copy `.env.example` to `.env` for local development.
2. Populate the Shopware variables before enabling the integration:
   - `SHOPWARE_BASE_URL` must include the protocol (e.g. `https://shopware.example.com`).
   - Provide either `SHOPWARE_CLIENT_ID` and `SHOPWARE_CLIENT_SECRET`, or set a pre-generated `SHOPWARE_ACCESS_TOKEN`.
   - Set `SHOPWARE_SALES_CHANNEL_ID` to the channel that should receive mediator updates.
   - Adjust `SHOPWARE_REQUEST_TIMEOUT_MS` if the default 10s window is too short for your environment.
3. Flip `SHOPWARE_ENABLED=true` only after all required values are in place. Leaving it as `false` keeps the integration disabled even if credentials are present.

> **Tip:** Variables can also be injected directly via your process manager or deployment platform if you prefer not to use a `.env` file.

## Handling credentials securely

- Never commit populated `.env` files or plaintext credentials to the repository.
- Prefer secret managers (e.g. Doppler, Vault, AWS/GCP/Azure Secrets Manager) or your container orchestration platform to store Shopware credentials.
- When sharing credentials with teammates, use encrypted channels or password managers instead of chat or email.
- Rotate Shopware API keys periodically and immediately after personnel changes.

## Networking note

If the firewall is enabled on your host, remember to open the HTTP port used by the mediator service. For example:

```bash
sudo ufw allow 3000
```
