import 'dotenv/config';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = require('./netlify/functions/api.cjs');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
