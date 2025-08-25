# test 2 hr
test2hr

To push database changes for the `HRPayMaster` project, run the following command from the repository root:

```
npm run db:push
```

## Start development server

Before starting the server, install dependencies and configure environment variables:

1. Install packages:

   ```bash
   npm install --prefix HRPayMaster
   ```

2. Create an `.env` file in `HRPayMaster` with at least:

   ```bash
   DATABASE_URL="<your Neon connection string>"
   SESSION_SECRET="<random session secret>"
   ```

Then start the development server:

```bash
npm run dev --prefix HRPayMaster
```

Alternatively, run `cd HRPayMaster && npm run dev`.

