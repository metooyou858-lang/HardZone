module.exports = {
  apps: [
    {
      name: 'inventory-backend',
      script: './src/app.js',
      cwd: '/srv/app',
      instances: 1,
      exec_mode: 'fork',
      env_file: '/srv/app/.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
