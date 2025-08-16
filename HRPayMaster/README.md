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

3. **Install dependencies and push the database schema**

   ```bash
   npm install
   npm run db:push
   ```

4. **Start the application**
   - Development: `npm run dev`
   - Production: `npm run build` followed by `npm run start`

