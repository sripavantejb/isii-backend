require('./config/loadEnv');
const { createMainApp } = require('./createApp');

const app = createMainApp();

// Start the server locally when this file is run directly.
// Keep exporting the app so serverless entrypoints can import it.
if (require.main === module) {
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
module.exports = app;
