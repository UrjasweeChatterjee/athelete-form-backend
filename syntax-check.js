try {
  require('./utils/certificateGenerator');
  require('./utils/receiptGenerator');
  require('./utils/notificationService');
  console.log('SYNTAX CHECK SUCCESSFUL! All utility modules load without syntax errors.');
} catch (err) {
  console.error('SYNTAX CHECK FAILED:', err);
  process.exit(1);
}
