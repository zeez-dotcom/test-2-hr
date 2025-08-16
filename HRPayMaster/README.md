# HRPayMaster

## Neon Database Setup

1. **Get a connection string**
   - Sign in to the [Neon](https://neon.tech) dashboard and copy the connection string for your project.
2. **Configure environment variables**
   - Create a `.env` file in this directory or add secrets via your hosting platform's UI.
   - Define the following variables:

     ```bash
     DATABASE_URL="<your Neon connection string>"
     SESSION_SECRET="<random session secret>"
     ```

   > [!IMPORTANT]
   > `SESSION_SECRET` must be set in production. The server will refuse to
   > start without it to ensure session data remains secure.

3. **Install dependencies**

   ```bash
   npm install
   ```

4. **Run migrations**

   ```bash
   npm run db:push
   ```

   - Requires the `DATABASE_URL` environment variable.
   - Run this step whenever you pull changes that modify the database schema.

5. **Start the application**
   - Development: `npm run dev`
   - Production: `npm run build` followed by `npm run start`

