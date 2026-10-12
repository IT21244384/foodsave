const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.MONGODB_URI = '';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `foodsave-test-uploads-${process.pid}`);
