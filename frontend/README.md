This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Generate Session Secret and Internal API Secret

Run once (PowerShell or VPS):

```bash
node -e "const c=require('crypto'); console.log('SESSION_SECRET=' + c.randomBytes(32).toString('base64')); console.log('INTERNAL_API_SECRET=' + c.randomBytes(32).toString('base64'))"
```

## Rate limiting

Public BFF routes (`/api/steam`, `/api/faceit`, `/api/leetify`, `/api/v1`, Valve link, profiles) are rate-limited per client IP (in-memory). Over limit returns **429** with `Retry-After`.

Toggle with `RATE_LIMIT_ENABLED=true|false` in `.env.local`. See `.env.example` for per-bucket overrides.

This is **API abuse protection**, not full DDoS mitigation (use Cloudflare / edge for that).
