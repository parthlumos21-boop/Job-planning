module.exports = {
  apps: [
    {
      name: "job-planning-system",
      script: "./server.js",
      cwd: "./server",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3005
      }
    }
  ]
};
