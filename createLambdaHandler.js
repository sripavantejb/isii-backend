const serverless = require('serverless-http');

const createLambdaHandler = (app) => {
  return serverless(app);
};

module.exports = createLambdaHandler;
