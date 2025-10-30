module.exports = {
  apps: [
    {
      name: "aqua-backend",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3000
      }
    }
  ]
};
