import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  domain: process.env.DOMAIN || '',
  email: process.env.EMAIL || '',
  apiToken: process.env.API_TOKEN || '',
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  dataDir: path.resolve(__dirname, '../../data'),
  logsDir: path.resolve(__dirname, '../../logs'),
  clientDir: path.resolve(__dirname, '../../dist/client'),
};

export function validateConfig(): void {
  const required = ['domain', 'email', 'apiToken'] as const;
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    console.warn(
      `Warning: Missing environment variables: ${missing.join(', ')}`
    );
    console.warn('Please copy .env.template to .env and fill in your credentials.');
  }
}
