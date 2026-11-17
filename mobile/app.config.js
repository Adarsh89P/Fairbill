// Set EXPO_BASE_URL (e.g. "/Fairbill") to build the web app for a sub-path such as GitHub Pages.
module.exports = ({ config }) =>
  process.env.EXPO_BASE_URL
    ? { ...config, experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL } }
    : config;
