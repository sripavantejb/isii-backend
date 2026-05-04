const { createServiceApp } = require('../../createApp');
const createLambdaHandler = require('../../createLambdaHandler');
const router = require('../../routes/articles');

const app = createServiceApp('/api/articles', router);

module.exports = app;
module.exports.handler = createLambdaHandler(app);
