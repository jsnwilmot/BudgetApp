// Vite accepts extensionless application imports. Give Node tests the same resolution.
import { register } from 'node:module';
register('./extension-loader.mjs', import.meta.url);
