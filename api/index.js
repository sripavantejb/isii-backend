const app = require('../server');
const createLambdaHandler = require('../createLambdaHandler');

module.exports = app;
module.exports.handler = createLambdaHandler(app);



