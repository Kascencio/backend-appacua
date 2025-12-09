const path = require('path');

module.exports = {
  apps: [
    {
      name: "aqua-backend",
      script: "npm",
      args: "start",
      cwd: path.resolve(__dirname, '..'), // Ensure PM2 runs from the root directory
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3300,
        HOST: process.env.HOST || '0.0.0.0'
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 3300,
        HOST: '0.0.0.0'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
