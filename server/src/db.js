const path = require('path');
const mongoose = require('mongoose');

let memoryServer = null;

// Connects to MONGODB_URI, or starts a throwaway in-memory MongoDB when no URI is given.
async function connect(uri) {
  let target = uri;
  if (!target) {
    // One fixed folder, so starting from the project root or from /server reuses the same download.
    process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(__dirname, '..', 'node_modules', '.cache', 'mongodb-memory-server');
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    target = memoryServer.getUri();
  }
  await mongoose.connect(target);
  return { inMemory: Boolean(memoryServer) };
}

async function disconnect() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
  memoryServer = null;
}

module.exports = { connect, disconnect };
