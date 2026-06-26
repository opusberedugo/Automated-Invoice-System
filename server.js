import 'dotenv/config';
import app from './netlify/functions/api.js';

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
