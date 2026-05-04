const { createServiceApp } = require('../../createApp');
const createLambdaHandler = require('../../createLambdaHandler');
const router = require('../../routes/upload');

const app = createServiceApp('/api/upload', router);

module.exports = app;
module.exports.handler = createLambdaHandler(app);
