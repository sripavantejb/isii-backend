const { createServiceApp } = require('../../createApp');
const createLambdaHandler = require('../../createLambdaHandler');
const router = require('../../routes/sitemap');

const app = createServiceApp('/sitemap.xml', router);

module.exports = app;
module.exports.handler = createLambdaHandler(app);
