const { createServiceApp } = require('../../createApp');
const createLambdaHandler = require('../../createLambdaHandler');
const router = require('../../routes/auth');

const app = createServiceApp('/api/auth', router);

module.exports = app;
module.exports.handler = createLambdaHandler(app);
