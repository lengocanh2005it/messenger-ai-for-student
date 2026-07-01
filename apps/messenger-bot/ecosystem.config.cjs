/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: 'messenger-bot',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      merge_logs: true,
      time: true,
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
    },
  ],
};
