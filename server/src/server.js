const config = require('./config');
const { connect } = require('./db');
const { createApp } = require('./app');
const { seed } = require('./seed/seed');

async function main() {
  const { inMemory } = await connect(config.mongoUri);
  if (inMemory || process.env.SEED_ON_START === 'true') {
    await seed();
    console.log(inMemory
      ? 'Using an in-memory MongoDB with demo data (resets on restart). Demo accounts are listed in README.md.'
      : 'Demo data loaded.');
  }
  createApp().listen(config.port, () => console.log(`FoodSave API on http://localhost:${config.port}`));
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
