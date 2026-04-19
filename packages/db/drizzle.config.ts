import { defineConfig } from 'drizzle-kit';
import * as path from 'path';

export default defineConfig({
  schema: path.resolve(__dirname, './src/schema.ts'),
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data.db',
  },
});
