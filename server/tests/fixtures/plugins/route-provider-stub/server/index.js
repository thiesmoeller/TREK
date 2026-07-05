const { definePlugin } = require('trek-plugin-sdk');

/** Deterministic straight-line geometry for integration tests. */
function stubRouteLeg(req) {
  const { from, to } = req;
  return Promise.resolve({
    coords: [
      [from.lat, from.lng],
      [(from.lat + to.lat) / 2, (from.lng + to.lng) / 2],
      [to.lat, to.lng],
    ],
    distanceM: 1000,
    durationS: 120,
    isApproximate: false,
  });
}

module.exports = definePlugin({
  hooks: {
    routeProvider: {
      modes() {
        return ['stub'];
      },
      routeLeg(req) {
        return stubRouteLeg(req);
      },
    },
  },
});
