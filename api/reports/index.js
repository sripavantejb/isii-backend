const { createServiceApp } = require('../../createApp');
const createLambdaHandler = require('../../createLambdaHandler');
const router = require('../../routes/reports');

const app = createServiceApp('/api/reports', router);

module.exports = app;
module.exports.handler = createLambdaHandler(app);
