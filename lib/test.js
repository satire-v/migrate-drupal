const { SDK } = require('@directus/sdk-js');

const test = async () => {
  const options = {
    url: 'http://api.satirev.org',
    project: 'satire-v',
    token: 'letmeinyoubitch' };

  const sdk = new SDK(options);
};
test();
//# sourceMappingURL=test.js.map