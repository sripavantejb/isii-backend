const { createServiceApp } = require('../../createApp');
const createLambdaHandler = require('../../createLambdaHandler');
const router = require('../../routes/news');

const app = createServiceApp('/api/news', router);

module.exports = app;
module.exports.handler = createLambdaHandler(app);

// sample